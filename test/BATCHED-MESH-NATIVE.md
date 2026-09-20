# Native BatchedMesh experiment

An experimental, generic Three.js `BatchedMesh` adaptation. It contains no
application-specific scene changes and is excluded from the published plugin:
the standard plugin's unsupported guard stays in place.

## What is validated

The complete native fixture emits, compiles and runs under Clang C++20 `-O1`
with AddressSanitizer and UndefinedBehaviorSanitizer (`halt_on_error=1`), with
no sanitizer diagnostics. It covers:

- **Data behaviour** — visibility changes, resize, preserved matrix data and
  independent clone colour mutation.
- **Render callbacks** — `onBeforeRender`/`onBeforeShadow` reached through an
  `Object3D` reference: a real orthographic shadow camera and depth material,
  frustum exclusion, an empty visible list, custom-sort receiver and camera
  identity, and wireframe index counts.
- **Upstream parity in JavaScript** — all nine numeric storage formats,
  nonzero-offset views, interleaved sources, normalized conversions, differing
  source/destination formats, and recycled geometry/instance IDs. Formats
  upstream cannot normalize are tested without normalization.
- **Real rendered pixels** — `examples/apps/three-batched-mesh` runs the
  shipping ANGLE Metal AppKit shell. At 2560x1600 the ordinary meshes and the
  BatchedMesh produce **zero differing pixels**. Hiding instance zero changes
  exactly 95,082 pixels: red falls from 95,082 to zero while blue stays at
  95,082. Draw counts are 2/2/1.

## What is not claimed

The pixel equality above validates the generic rendering **fallback**. Three
falls back to one GL draw per visible instance while `WEBGL_multi_draw` is
unadvertised, so none of these checks demonstrate fewer draw calls, a rendering
speedup, or a device deployment result.

## Commands

From `native-webgl-angle`:

```sh
node test/math-array-contract.test.mjs --native
node test/batched-mesh-contract.test.mjs
node test/frustum-array-contract.test.mjs
node test/batched-mesh-native.test.mjs
node test/batched-mesh-native.test.mjs --callbacks
node test/run-batched-render.mjs
```

`--emit-only` explicitly skips native execution and does not report a native
pass. Generated C++ is kept as the compiler's `dist/batched-mesh-contract-test.cpp`
output for reproducible native debugging.
