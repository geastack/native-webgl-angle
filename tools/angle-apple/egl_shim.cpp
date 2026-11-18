// SPDX-License-Identifier: Apache-2.0
// WebKit's ANGLE names its entry points EGL_* and GL_*. The native WebGL host built with
// GEA_WEBGL_STATIC_GLES resolves every EGL and GLES function through eglGetProcAddress, which
// ANGLE answers for both egl* and gl* names, so this one symbol is the whole bridge.
extern "C" void *EGL_GetProcAddress(const char *name);
extern "C" void *eglGetProcAddress(const char *name) { return EGL_GetProcAddress(name); }
