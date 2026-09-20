# Native WebGL ANGLE

`@geastack/native-webgl-angle` owns the native WebGL compatibility layer used by
the real Three.js macOS path.

## Installation

Install `@geastack/native-webgl-angle` and its Three.js peer. The package
requires compiler 1.0.9 or later within the 1.x line and Three.js 0.185.x, and
resolves Apple bindings from npm; it does not require a sibling Apple
checkout.

```sh
npm install @geastack/native-webgl-angle three
```

The exports intentionally contain TypeScript sources for geatsc compilation,
not precompiled browser JavaScript. Load the compiler plugin from
`@geastack/native-webgl-angle/geatsc-plugin`. Native source files ship under
`native/` and can be located with, for example,
`require.resolve('@geastack/native-webgl-angle/native/angle_webgl_host.mm')`.
The platform build still supplies the generated host headers, platform SDK,
and ANGLE libraries; this package does not bundle those binaries.

The experimental BatchedMesh plugin is excluded from the npm archive.
Packaging validation loads the plugin and all of its eager imports directly
from the npm archive in memory, without falling back to the source checkout.
Run it with `npm run test:package -- <archive.tgz>`.

```text
upstream three
  -> WebGLRenderingContext / WebGL2RenderingContext facade
  -> geatsc host shims
  -> native ANGLE host
  -> Metal
```

This package is infrastructure. Examples should consume it; they should not
define their own ANGLE/WebGL bridge.

## Contents

```text
src/nativeWebGL.ts       current TS WebGL facade used by Three.WebGLRenderer
src/nativeWebGLHost.ts   typed declarations for geatsc native host functions
geatsc-plugin.mjs        host shim metadata for geatsc
native/angle_webgl_host.mm
                         Objective-C++ ANGLE/Metal host implementation
```

## Current Compromise

Gea app manifests currently accept only app-relative `nativeSources`. Until
that resolver can consume package native sources directly, app consumers keep a
small app-local `.mm` wrapper that includes this package's native implementation.

The bridge implementation itself lives here.

## Direction

The current TS facade still routes many WebGL calls through transitional
opcode-style host functions. The intended end state is direct typed native
methods and typed WebGL handles, with no `gea_cpp_value`/`gea_cpp_key` in the
bridge hot path.


### Synchronous numeric uploads

GL upload functions opt into `hostShims.hostNativeArrayFunctions`. The compiler
preserves their native array carriers; the plugin owns the physical element
format and buffer/texture dispatch in `geatsc-plugin-uploads.mjs`.

`HostNumericArgument<E>` converts ordinary arrays directly to the requested
float/integer format, using inline storage through 16 elements and one heap
allocation beyond that. Matching typed arrays retain and borrow their backing
storage, preserving view offsets. Shared views use synchronized reads into an
owned copy. Uniform arrays and buffer subranges no longer pass through a
JavaScript number-array temporary. Sparse arrays fail closed.

These hosts must consume the input synchronously without reentering JavaScript
or retaining pointers. Reentrant hosts must use the compiler's separate owned
snapshot protocol. Rebuild generated declarations and native objects together
when changing this ABI; unmarked hosts retain their original vector ABI.

Profiling builds (`GEA_PROFILE_ALLOCATIONS` or `GEA_PROFILE_NATIVE_FRAMES`)
aggregate native GL call scopes and scene-transform markers. The frame-only
option requires defining the macro only for `angle_webgl_host.mm` and avoids
allocation instrumentation. Their elapsed times include instrumentation and
any driver wait; they are attribution data, not uninstrumented CPU speedups.

`GEA_WEBGL_TRAP`, `GEA_WEBGL_BLEND_DEBUG`, and `GEA_WEBGL_SHADOW_COLOR_AUDIT`
are launch settings, cached on first use to avoid environment lookups in draw
and uniform paths. Set them before the first host call and restart the process
to change them. Any present value, including an empty string, enables them.

### Validation

`npm run test:host-effects` checks 85 direct GL/input declarations and 15 audio
declarations against the compiler's host-mutation census. Their
`@gea-host-inert` contracts permit native state changes while excluding script
reference retention, script object mutation and script callbacks. The native
implementations in `angle_webgl_host.mm` and `audio_host.mm` were audited for
those effects; audio channel uploads copy samples synchronously into native
storage. Removing a scalar or typed-array contract must restore conservative
prototype taint in the test.

View attachment, size synchronization and presentation remain outside that
contract pending a separate lifecycle/reentry audit. A native function's name
or numeric return type alone does not establish its effects. These contracts
remove false opaque-call edges; they do not establish zero boxing for an
application as a whole.

`npm test` includes the native void-call regression. Three.js comes from this
package's own `three` devDependency, so `npm install` here is enough; the
compiler comes from a checkout of
[geastack/compiler](https://github.com/geastack/compiler) with `dist/` built.
`clang++` (or `CXX`) supplies ASan/UBSan. `GEATSC_COMPILER_ROOT` and
`GEASTACK_ROOT` point at that checkout when it is not beside this repo.

The test extracts Three.js's actual `bindVertexArrayObject` function before
and after the plugin transform, then compiles each against the real native
WebGL facade and host bridge. It checks certified direct calls, physical void
results, absence of executable boxing, nullable handle forwarding, and the
observable `undefined` return. Only the external GL functions are mocked for
execution. Source fixtures stay in memory; the test executable uses the
compiler's existing ignored build output. No archived compiler APIs or scratch
directories are needed.

### Streaming diagnostics and uniform names

Windows builds can select `GEA_WEBGL_BUFFER_STREAMING=0..9` to compare original
subdata, orphaning, replacement, dynamic usage, and a three-buffer staging ring.
Modes 1–4 qualify complete ARRAY_BUFFER updates. Modes 5/6 extend dynamic
replacement/staging rotation to complete ELEMENT_ARRAY_BUFFER updates; mode 7
streams indices alone; mode 8 combines vertex staging with dynamic indices.
Mode 9 uses uniform-buffer staging for eligible small full vertex updates.
Although its measured upload wait is shorter, total CPU cost increased;
it remains a diagnostic option and mode 8 remains the default.
Partial writes always preserve existing storage.
Windows defaults to the hybrid policy (8); mode 0 keeps the original path and
bypasses streaming bookkeeping in normal builds. Other platforms retain the
original path. Per-upload timing rows compile only with allocation or native
frame profiling.

Common renderer uniforms use fixed-name typed setters that still read the map
on every call. Replacing/deleting entries remains observable. Shadow-map
setters also forward the texture allocator so sampler ordering is preserved.
General uploads classify built-in long names once when the program's uniform
nodes are created, then read the current material value cell through a named
lookup. Custom names retain dynamic dictionary lookup. No material value cell
is cached; replacement, deletion and `needsUpdate` remain observable.

`GEA_WEBGL_UNIFORM_BINDINGS=baseline` disables the new name classification and
shadow setters for comparison with the previous implementation.
`GEA_WEBGL_UNIFORM_NAMES=baseline` disables fixed-name renderer setters.
An earlier explicit local ID snapshot increased allocations by discarding
reusable native string capacity; this implementation does not repeat it.
`npm run test:allocation-contracts` covers streaming, fixed uniforms and live
uniform bindings. `node test/uniform-binding-native.test.mjs` additionally
executes the actual lookup helpers under ASan/UBSan and requires no emitted
boxing.

The experimental BatchedMesh adaptation remains separate from the standard
plugin. `node test/batched-mesh-contract.test.mjs` checks its generic geometry,
transform, color, resize and clone behavior. Clones receive independent texture
sources and arrays. Native callback, clone and visibility checks now pass;
the full ANGLE comparison also matches ordinary mesh pixels exactly. Without
`WEBGL_multi_draw`, its fallback retains separate draw calls. See
[the native validation record](test/BATCHED-MESH-NATIVE.md) for evidence.

The separate `GEA_WEBGL_AUTO_INSTANCE=1` experiment groups adjacent compatible
opaque meshes into actual instanced draws. It is disabled by default while
end-to-end validation and platform measurements continue. Its eligibility rules,
fallbacks and validation commands are documented in
[the instancing contract](test/INSTANCING.md). Both experiments are generic;
the plugin contains no application-specific batching logic.

## License

Apache-2.0 (see `LICENSE`). Use it, change it, ship closed-source products on
it, no strings attached. The only GeaStack code under a different license is
the embedded board support (`targets` and `@geastack/chips`, GPL-3.0-only):
shipping closed-source firmware through those needs a commercial license.
Contact [contact@geastack.com](mailto:contact@geastack.com) for commercial terms, support and hosted builds.
