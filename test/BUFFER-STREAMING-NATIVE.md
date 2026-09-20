# Native buffer upload validation

`GEA_WEBGL_BUFFER_STREAMING=9` is an experimental alternative to Windows's
default mode 8. It keeps the same three-buffer vertex staging ring and dynamic
index uploads, but writes complete small vertex staging buffers through
`UNIFORM_BUFFER` before copying them into the original vertex buffer.

The deployed Windows ANGLE source (`C:/gea/src/libANGLE/renderer/d3d/d3d11/Buffer11.cpp`)
selects constant-buffer storage for a complete uniform-buffer write no larger
than `MAX_UNIFORM_BLOCK_SIZE`. `GetD3DMapTypeFromBits` maps this storage with
`D3D11_MAP_WRITE_DISCARD`; ordinary staging storage uses `D3D11_MAP_WRITE`.
This makes discardable staging available without changing the destination
vertex buffer to dynamic storage or invalidating its VAO references. It does
not promise a CPU speedup until measured on the target device.

The candidate queries the actual uniform-block limit. Larger writes and an
unavailable limit retain mode 8's staging path. Partial writes retain ordinary
subdata. `UNIFORM_BUFFER_BINDING` is queried/restored per upload, including when
an indexed binding operation changed it. Copy bindings are also restored.
The original vertex buffer size and usage are preserved, including sizes that
are not a multiple of 16 bytes.

Run the exact host policy contracts from the workspace root:

```sh
node native-webgl-angle/test/buffer-streaming-contract.test.mjs
```

All ten policies pass ASan/UBSan in normal, allocation-profile, and frame-profile
configurations. Coverage includes complete/partial/zero writes, resized rings,
ring reuse and deletion, non-aligned sizes, oversized uniform fallback, indexed
UBO binding side effects, missing copy capability, and an unavailable uniform
limit.

The Windows test exercises the corresponding API sequence through actual
ANGLE D3D11 and reads the copied bytes back. It runs independently of the Gea
compiler and consumes existing ANGLE DLLs:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File buffer-streaming-angle.ps1 `
  -AngleDirectory C:/gea/out/<app>/AppPackages/<AppPackage>_x64_Test
```

The test adds the installed x64 UWP C++ runtime to its process DLL search path.
It calls the `EGL_*` exports in `libGLESv2.dll`, which are the implementation
entry points used by the packaged `libEGL.dll` forwarding layer. The forwarding
layer itself assumes a packaged process and cannot initialize this standalone
probe.

Validated on 2026-09-10 with the existing packaged v64 DLLs, ANGLE D3D11 on
NVIDIA RTX 5080: sizes 1, 2, 3, 4, 15, 17, 5,280, 65,536, and 65,537 bytes,
seven rotating copies each, exact readback, exact destination sizes, no GL
errors, and restored bindings. The queried uniform limit was 65,536 bytes;
65,537 bytes exercised the original staging fallback. These checks establish
correctness on that backend; device performance measurement remains separate.
