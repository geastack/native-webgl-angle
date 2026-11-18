#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Builds ANGLE (EGL + OpenGL ES 3 on Metal) as one static archive for an Apple platform, from
# WebKit's copy of ANGLE at a pinned commit. iOS and tvOS apps link it in place of a dynamic
# ANGLE (they cannot load one), with GEA_WEBGL_STATIC_GLES defined for the native WebGL host.
#
# The GeaStack iOS/tvOS target runs this itself, once, through this package's gea-native.json
# ("build"), and caches the result; nobody needs to call it by hand.
#
#   build.sh <platform> --out <dir>
#
#   platform  tvos | tvos-simulator | ios | ios-simulator | macos
#   --out     where libGeaANGLE.a and ANGLE-NOTICES.txt go
#
# Needs macOS with Xcode. The WebKit sources (ANGLE and the build configuration it includes,
# about 150 MB) are fetched once into ~/.geastack/cache/webkit-angle-<commit> (GEA_ANGLE_CACHE
# overrides it) and shared by every app and platform; the first build of a platform takes
# 10-15 minutes, a rebuild only relinks.
set -euo pipefail

WEBKIT_COMMIT=6b38ac371289a9183a0a4a51f86b752a07032677
WEBKIT_REPOSITORY=https://github.com/WebKit/WebKit.git
TVOS_MIN=17.0
IOS_MIN=17.0
MACOS_MIN=13.0

here="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
platform="${1:-}"
out="build/native"
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) out="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

case "$platform" in
  tvos)           sdk=appletvos;        minflag="-mtvos-version-min=$TVOS_MIN" ;;
  tvos-simulator) sdk=appletvsimulator; minflag="-mtvos-simulator-version-min=$TVOS_MIN" ;;
  ios)            sdk=iphoneos;         minflag="-mios-version-min=$IOS_MIN" ;;
  ios-simulator)  sdk=iphonesimulator;  minflag="-mios-simulator-version-min=$IOS_MIN" ;;
  macos)          sdk=macosx;           minflag="-mmacosx-version-min=$MACOS_MIN" ;;
  *) echo "usage: build.sh <tvos|tvos-simulator|ios|ios-simulator|macos> --out <dir>" >&2; exit 2 ;;
esac
[[ "$(uname)" == Darwin ]] || { echo "building ANGLE needs macOS with Xcode" >&2; exit 1; }
command -v xcodebuild >/dev/null || { echo "xcodebuild not found: install Xcode" >&2; exit 1; }

cache="${GEA_ANGLE_CACHE:-$HOME/.geastack/cache}/webkit-angle-${WEBKIT_COMMIT:0:12}"
angle="$cache/Source/ThirdParty/ANGLE"

# Sources: a sparse, shallow checkout of the pinned commit, patched once.
if [[ ! -f "$cache/.gea-ready" ]]; then
  echo "[angle] fetching WebKit's ANGLE at ${WEBKIT_COMMIT:0:12} into $cache"
  rm -rf "$cache"
  mkdir -p "$cache"
  git -C "$cache" init -q
  git -C "$cache" remote add origin "$WEBKIT_REPOSITORY"
  git -C "$cache" sparse-checkout set --cone Source/ThirdParty/ANGLE Configurations Tools/ccache
  git -C "$cache" fetch -q --depth 1 --filter=blob:none origin "$WEBKIT_COMMIT"
  git -C "$cache" checkout -q FETCH_HEAD
  # Internal shaders compile from source at run time, so the build needs no Metal toolchain, and
  # the Metal backend's availability guards name tvOS alongside iOS.
  git -C "$cache" apply "$here/webkit-angle.patch"
  touch "$cache/.gea-ready"
fi

# The static ANGLE target. WebKit's availability overlay is a WebKit build artifact ANGLE does not
# need; the deployment targets replace WebKit's (the newest OS) with the ones apps support.
echo "[angle] building ANGLE for $platform (the first build takes 10-15 minutes)"
log="$cache/build-$platform.log"
if ! xcodebuild -project "$angle/ANGLE.xcodeproj" -target "ANGLE (static)" -configuration Release -sdk "$sdk" \
  SYMROOT="$cache/build" OBJROOT="$cache/build/obj" ONLY_ACTIVE_ARCH=NO ARCHS=arm64 \
  TVOS_DEPLOYMENT_TARGET="$TVOS_MIN" IPHONEOS_DEPLOYMENT_TARGET="$IOS_MIN" MACOSX_DEPLOYMENT_TARGET="$MACOS_MIN" \
  WK_AVAILABILITY_OVERLAY_FLAGS= WK_AVAILABILITY_OVERLAY_SWIFT_FLAGS= >"$log" 2>&1; then
  grep -E " error:|^error:" "$log" | sort -u | head -20 >&2 || true
  echo "[angle] the ANGLE build failed; full log: $log" >&2
  exit 1
fi

products="$cache/build/Release-$sdk"
mkdir -p "$out"
xcrun -sdk "$sdk" clang++ -std=c++17 -O2 -arch arm64 "$minflag" -c "$here/egl_shim.cpp" -o "$products/egl_shim.o"
libtool -static -no_warning_for_no_symbols -o "$out/libGeaANGLE.a" "$products/libANGLE.a" "$products/libtranslator.a" "$products/egl_shim.o" 2>/dev/null
{
  echo "libGeaANGLE.a contains ANGLE (https://chromium.googlesource.com/angle/angle), built from"
  echo "WebKit's copy at commit $WEBKIT_COMMIT. Distribute this notice with any binary that links it."
  echo
  cat "$angle/LICENSE"
} >"$out/ANGLE-NOTICES.txt"
echo "[angle] wrote $out/libGeaANGLE.a and $out/ANGLE-NOTICES.txt"
