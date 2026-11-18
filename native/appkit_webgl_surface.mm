// SPDX-License-Identifier: Apache-2.0
// The WebGL surface of a macOS build: the native WebGL host attaches to the
// window's root view before the program's top level runs, the AppKit
// counterpart of uikit_webgl_surface.mm. With it a program needs no macOS-only
// code to get its context, so the program that runs on tvOS runs on macOS as is.
// (A program may still attach to a view of its own with attachNativeWebGL;
// the host attaches once.)
#include "gea_appkit_host.h"

extern "C" bool gea_three_webgl_attach_appkit(void *view, double width, double height, double devicePixelRatio);

namespace {

int attach(void *rootView, double width, double height, double scale)
{
	return gea_three_webgl_attach_appkit(rootView, width, height, scale > 0 ? scale : 1.0) ? 1 : 0;
}

const gea_appkit_host_extension kSurface = {GEA_APPKIT_HOST_EXTENSION_VERSION, "native-webgl-angle", attach, nullptr};
const bool kRegistered = (gea_appkit_register_host_extension(&kSurface), true);

}  // namespace
