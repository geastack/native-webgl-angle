# Native instancing and generic renderer experiment

`NativeWebGL2RenderingContext` forwards `vertexAttribDivisor`,
`drawElementsInstanced`, and `drawArraysInstanced` to real GLES entry points.
The previous shim discarded the divisor and instance count, silently drawing
only one ordinary mesh. Instanced draws now retain indexed byte offsets and
zero counts through the same typed numeric host ABI as ordinary draws.

The generic automatic batching experiment is enabled at generation time with
`GEA_WEBGL_AUTO_INSTANCE=1`. It is off by default pending end-to-end validation
and device measurements. This setting must be included in generation cache keys.
The plugin contains no application-specific geometry, names, or materials.

The renderer considers only contiguous entries in its already sorted and
culled render list. A run must share geometry, material, group order, render
order and shadow reception. It creates a renderer-owned InstancedMesh with
matrices relative to the camera’s world translation and submits that one
draw. The batch carries that translation in its ordinary matrixWorld; subtracting
it before conversion to Float32 preserves nearby positions in distant scenes,
including a nearby instance that follows a distant first instance. Original scene objects and
parent links are unchanged; their public camera matrices are still updated.
Instance buffers are reused, resized only when necessary, uploaded for every
render view, and disposed with their renderer. Slots unused by a completed
top-level render are released, so switching scenes does not retain their old
geometry and materials. Nested views and opaque/transmissive/transparent passes
share the current render’s usage accounting. The ordinary shadow pass is
unchanged.

The initial eligibility contract deliberately falls back for custom callbacks
or shader hooks (including hooks installed specifically on InstancedMesh), physical/custom materials, transparency, disabled depth
writes/tests, unusual blending, wireframe, stencil writes, object-space normal maps, clipping, probe
volumes, morph targets, skinning/batching flags, existing instances or instanced vertex attributes, geometry groups, incompatible
layers, singular/reflected transforms, non-affine matrices and shear. Positive orthogonal column
transforms match the built-in instancing normal transform. Only the built-in
Basic, Lambert, Phong and Standard material types are eligible; shader, raw
shader and node-material flags still exclude a material whose type string was
manually changed. Canonical
callback identities are captured by the original Object3D and Material modules,
so prototype changes before renderer construction also trigger fallback. These
snapshots read the defining prototypes directly, without allocating objects,
advancing object/material IDs or consuming UUID randomness.

Validation entry points:

- `node test/instancing-transport-contract.test.mjs`: actual TypeScript facade
  and host bridge argument forwarding, including zero counts.
- `node test/automatic-instancing-contract.test.mjs`: real Three objects and
  the transformed render-list function; draw consolidation, exclusions,
  transforms, repeated views, order, pooled buffer growth and disposal.
- `node test/native-instancing-render.test.mjs`: extracted shipping host
  functions on an actual ANGLE/Metal context, comparing indexed/array instance
  pixels, offsets, zero counts, divisor changes and reset.
- `node test/instanced-mesh-native.test.mjs`: canonical compiler plus native
  ASan/UBSan execution of Three's instance matrix storage and callback identity.
- `node test/run-batched-render.mjs --auto-instance`: the existing shipping
  macOS app shell renders ordinary reference meshes with observable callbacks,
  eligible ordinary meshes automatically instanced, and a hidden instance.
  Phong vertex normals, quarter-turn rotation and nonuniform positive scale
  exercise normal transforms; flat shading is disabled so derivatives cannot
  mask a missing per-instance normal transform.

The host pixel fixture validates the GLES bridge. It does not substitute for
the full Three renderer fixture or establish a performance improvement.
