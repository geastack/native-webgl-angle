#if defined(_WIN32)
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#else
#include "gea/apple/native_bridge.h"

#import <AppKit/AppKit.h>
#import <QuartzCore/QuartzCore.h>
#import <dispatch/dispatch.h>

#include <dlfcn.h>
#endif
// Typed uniform arguments use the compiler runtime on both native platforms.
#include "gea_runtime.h"
#include <algorithm>
#include <chrono>
#include <cstdarg>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <span>
#include <unordered_map>

static void geaTrapCheck(const char *where);

using EGLBoolean = unsigned int;
using EGLenum = unsigned int;
using EGLint = int;
using EGLDisplay = void *;
using EGLConfig = void *;
using EGLContext = void *;
using EGLSurface = void *;
using EGLNativeDisplayType = void *;
using EGLNativeWindowType = void *;

using GLenum = unsigned int;
using GLboolean = unsigned char;
using GLbitfield = unsigned int;
using GLchar = char;
using GLint = int;
using GLsizei = int;
using GLsizeiptr = std::ptrdiff_t;
using GLintptr = std::ptrdiff_t;
using GLuint = unsigned int;
using GLfloat = float;

// Keyboard state for the native host. macOS delivers key events to the first
// responder; the host view records the pressed state of each hardware key code
// (0-127 macOS virtual key codes) into this table, and the game reads it through
// the `gea_three_key_pressed` intrinsic. This is what makes the native build
// PLAYABLE — the TS game's `window`-based listeners are inert off the web.
static bool gGeaKeyState[256] = {false};

// Pointer state for the native host. The host view tracks the mouse through an
// NSTrackingArea (mouseMoved: is only delivered with one — hover without a
// button press produces no events on a plain NSView) and records the latest
// position in view coordinates with a TOP-LEFT origin (the web's
// clientX/clientY convention; AppKit's default view space is bottom-left).
// The game polls it through `gea_three_pointer_state`, mirroring the keyboard's
// `gea_three_key_pressed` bridge — this is what makes the plane FOLLOW THE
// MOUSE natively like the original web game.
static double gGeaPointerX = 0.0; // view coords, points, top-left origin
static double gGeaPointerY = 0.0;
static double gGeaPointerW = 0.0; // view size at the last pointer event
static double gGeaPointerH = 0.0;
static double gGeaPointerSeq = 0.0; // increments on every pointer event
static bool gGeaPointerDown = false; // primary button

// gea_three_pointer_state(channel): 0=x, 1=y (top-left origin), 2=view width,
// 3=view height (same units as x/y), 4=move sequence (0 = pointer never
// seen; changes on every pointer event), 5=primary button (1 = down).
//
// GEA_THREE_SYNTH_POINTER="<x0>,<y0>:<x1>,<y1>:<startMs>:<endMs>" — perf/CI
// hook, the pointer twin of GEA_THREE_SYNTH_KEY: report a pointer sweeping
// linearly from (x0,y0) to (x1,y1) during [startMs, endMs) after process
// start, then hold the end position. Coordinates are NORMALIZED [0,1]
// fractions of the view (top-left origin), reported with width=height=1, so
// the sweep is resolution-independent. Combine with GEA_THREE_SYNTH_KEY
// (Space=49) to start the game headlessly and steer the plane without
// Accessibility permission for real event injection.
extern "C" double gea_three_pointer_state(double channel) {
  static bool synthParsed = false;
  static bool synthActive = false;
  static bool synthLatched = false;
  static double sx0 = 0.0, sy0 = 0.0, sx1 = 0.0, sy1 = 0.0;
  static long long synthStartMs = 0, synthEndMs = 0;
  static std::chrono::steady_clock::time_point processStart = std::chrono::steady_clock::now();
  if (!synthParsed) {
    synthParsed = true;
    if (const char *spec = std::getenv("GEA_THREE_SYNTH_POINTER")) {
      double x0 = 0.0, y0 = 0.0, x1 = 0.0, y1 = 0.0;
      long long s = 0, e = 0;
      if (std::sscanf(spec, "%lf,%lf:%lf,%lf:%lld:%lld", &x0, &y0, &x1, &y1, &s, &e) == 6 && e > s) {
        sx0 = x0; sy0 = y0; sx1 = x1; sy1 = y1;
        synthStartMs = s;
        synthEndMs = e;
        synthActive = true;
      }
    }
  }
  if (synthActive) {
    const long long elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                                  std::chrono::steady_clock::now() - processStart)
                                  .count();
    if (elapsed >= synthStartMs && (elapsed < synthEndMs || !synthLatched)) {
      const double t = std::min(1.0, static_cast<double>(elapsed - synthStartMs) /
                                         static_cast<double>(synthEndMs - synthStartMs));
      gGeaPointerX = sx0 + (sx1 - sx0) * t;
      gGeaPointerY = sy0 + (sy1 - sy0) * t;
      gGeaPointerW = 1.0;
      gGeaPointerH = 1.0;
      // Monotonic per-millisecond sequence: a fresh value each frame during
      // the sweep, one final tick to latch the end position.
      gGeaPointerSeq = 1.0 + static_cast<double>(elapsed - synthStartMs);
      if (elapsed >= synthEndMs) synthLatched = true;
    }
  }
  switch (static_cast<int>(channel)) {
    case 0: return gGeaPointerX;
    case 1: return gGeaPointerY;
    case 2: return gGeaPointerW;
    case 3: return gGeaPointerH;
    case 4: return gGeaPointerSeq;
    case 5: return gGeaPointerDown ? 1.0 : 0.0;
  }
  return 0.0;
}

// Forward declaration for geaInstallPointerMonitor (defined after the state
// struct; it needs gWebGL.hostView).
static void geaInstallPointerMonitor(void);

extern "C" bool gea_three_key_pressed(double code) {
  const int c = static_cast<int>(code);
  if (c < 0 || c >= 256) return false;
  // GEA_THREE_SYNTH_KEY="<vk>:<startMs>:<endMs>" — perf/CI hook: report the
  // key held during [startMs, endMs) after process start. Drives game-state
  // transitions (e.g. Space=49 to leave the splash) in headless runs where
  // no Accessibility permission is available for real event injection.
  static int synthKey = -1;
  static long long synthStartMs = 0, synthEndMs = 0;
  static std::chrono::steady_clock::time_point processStart = std::chrono::steady_clock::now();
  static bool synthParsed = false;
  if (!synthParsed) {
    synthParsed = true;
    if (const char *spec = std::getenv("GEA_THREE_SYNTH_KEY")) {
      long long k = -1, s = 0, e = 0;
      if (std::sscanf(spec, "%lld:%lld:%lld", &k, &s, &e) == 3) {
        synthKey = static_cast<int>(k);
        synthStartMs = s;
        synthEndMs = e;
      }
    }
  }
  if (c == synthKey) {
    const long long elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                                  std::chrono::steady_clock::now() - processStart)
                                  .count();
    if (elapsed >= synthStartMs && elapsed < synthEndMs) return true;
  }
  return gGeaKeyState[c];
}

#if !defined(_WIN32)
@interface GeaAngleWebGLHostView : NSView
@end

@implementation GeaAngleWebGLHostView
- (instancetype)initWithFrame:(NSRect)frame {
  self = [super initWithFrame:frame];
  if (self) {
    self.wantsLayer = YES;
    self.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  }
  return self;
}

// Accept key events (become first responder) so keyDown:/keyUp: fire.
- (BOOL)acceptsFirstResponder { return YES; }

- (void)viewDidMoveToWindow {
  [super viewDidMoveToWindow];
  if (self.window) {
    [self.window makeFirstResponder:self];
    // Mouse-move events (no button held) are only delivered when the window
    // accepts them; the NSTrackingArea below scopes them to this view.
    self.window.acceptsMouseMovedEvents = YES;
  }
}

// Track mouse movement over the view without requiring a button press.
// NSTrackingInVisibleRect keeps the area glued to the view's visible bounds
// across resizes (the rect argument is ignored).
- (void)updateTrackingAreas {
  [super updateTrackingAreas];
  for (NSTrackingArea *area in [self.trackingAreas copy]) [self removeTrackingArea:area];
  [self addTrackingArea:[[NSTrackingArea alloc]
      initWithRect:NSZeroRect
           options:NSTrackingMouseMoved | NSTrackingActiveInKeyWindow | NSTrackingInVisibleRect
             owner:self
          userInfo:nil]];
}

// Pointer RECORDING lives in a window-level NSEvent local monitor (see
// geaInstallPointerMonitor, installed from gea_three_webgl_attach), NOT in
// per-view mouseMoved:/mouseDown: overrides: AppKit delivers mouse events to
// the TOPMOST hit-tested view, so any sibling/overlay view above this one
// would carve pointer dead zones out of the game surface. The local monitor
// observes every mouse event dispatched to the window regardless of which
// view hit-tests it. The tracking area above (plus acceptsMouseMovedEvents)
// is still required — it is what makes AppKit GENERATE mouse-moved events for
// the window at all; NSView's default mouseMoved: then simply does nothing.

- (void)keyDown:(NSEvent *)event {
  unsigned short code = event.keyCode;
  if (code < 256) gGeaKeyState[code] = true;
  // Swallow the event (no super) so AppKit doesn't emit the system "funk" beep
  // for keys with no menu/command binding.
}

- (void)keyUp:(NSEvent *)event {
  unsigned short code = event.keyCode;
  if (code < 256) gGeaKeyState[code] = false;
}

- (void)flagsChanged:(NSEvent *)event {
  // Track modifier keys as their own key codes too (Shift/Ctrl/etc.), pressed
  // while the corresponding mask bit is set.
  unsigned short code = event.keyCode;
  if (code < 256) gGeaKeyState[code] = (event.modifierFlags & NSEventModifierFlagDeviceIndependentFlagsMask) != 0;
}

- (CALayer *)makeBackingLayer {
  CAMetalLayer *layer = [CAMetalLayer layer];
  layer.opaque = YES;
  layer.backgroundColor = NSColor.blackColor.CGColor;
  layer.autoresizingMask = kCALayerWidthSizable | kCALayerHeightSizable;
  layer.needsDisplayOnBoundsChange = YES;
  layer.presentsWithTransaction = NO;
  layer.displaySyncEnabled = YES;
  // Block on nextDrawable instead of dropping the frame. With the default
  // allowsNextDrawableTimeout=YES, [layer nextDrawable] returns nil while the
  // layer is still being realized on-screen at startup (and immediately after a
  // surface rebind); ANGLE then presents nothing and the opaque black
  // backgroundColor shows through — an intermittent black window for the first
  // stretch of frames. Waiting for the drawable keeps rendered content on
  // screen from the first frame.
  layer.allowsNextDrawableTimeout = NO;
  layer.maximumDrawableCount = 3;
  return layer;
}
@end
#endif

static constexpr EGLDisplay EGL_NO_DISPLAY = nullptr;
static constexpr EGLSurface EGL_NO_SURFACE = nullptr;
static constexpr EGLContext EGL_NO_CONTEXT = nullptr;
static constexpr EGLNativeDisplayType EGL_DEFAULT_DISPLAY = nullptr;
static constexpr EGLBoolean EGL_FALSE_VALUE = 0;

static constexpr EGLint EGL_NONE = 0x3038;
static constexpr EGLint EGL_WIDTH = 0x3057;
static constexpr EGLint EGL_HEIGHT = 0x3056;
static constexpr EGLint EGL_SURFACE_TYPE = 0x3033;
static constexpr EGLint EGL_WINDOW_BIT = 0x0004;
static constexpr EGLint EGL_PBUFFER_BIT = 0x0001;
static constexpr EGLint EGL_RENDERABLE_TYPE = 0x3040;
static constexpr EGLint EGL_OPENGL_ES2_BIT = 0x0004;
static constexpr EGLint EGL_OPENGL_ES3_BIT = 0x0040;
static constexpr EGLint EGL_RED_SIZE = 0x3024;
static constexpr EGLint EGL_GREEN_SIZE = 0x3023;
static constexpr EGLint EGL_BLUE_SIZE = 0x3022;
static constexpr EGLint EGL_ALPHA_SIZE = 0x3021;
static constexpr EGLint EGL_DEPTH_SIZE = 0x3025;
static constexpr EGLint EGL_STENCIL_SIZE = 0x3026;
static constexpr EGLint EGL_CONTEXT_CLIENT_VERSION = 0x3098;
static constexpr EGLenum EGL_OPENGL_ES_API = 0x30A0;
static constexpr EGLenum EGL_PLATFORM_ANGLE_ANGLE = 0x3202;
static constexpr EGLint EGL_PLATFORM_ANGLE_TYPE_ANGLE = 0x3203;
static constexpr EGLint EGL_PLATFORM_ANGLE_TYPE_METAL_ANGLE = 0x3489;

static constexpr GLboolean GL_FALSE_VALUE = 0;
static constexpr GLboolean GL_TRUE_VALUE = 1;
static constexpr GLenum GL_FLOAT = 0x1406;
static constexpr GLenum GL_UNSIGNED_BYTE = 0x1401;
static constexpr GLenum GL_UNSIGNED_SHORT = 0x1403;
static constexpr GLenum GL_UNSIGNED_INT = 0x1405;
static constexpr GLenum GL_RGBA_VALUE = 0x1908;
static constexpr GLenum GL_VIEWPORT_VALUE = 0x0BA2;
static constexpr GLenum GL_FRAMEBUFFER_BINDING_VALUE = 0x8CA6;

using PFNEGLGETPROCADDRESS = void *(*)(const char *);
using PFNEGLGETPLATFORMDISPLAYEXTPROC = EGLDisplay (*)(EGLenum, void *, const EGLint *);
using PFNEGLGETERRORPROC = EGLint (*)();
using PFNEGLINITIALIZEPROC = EGLBoolean (*)(EGLDisplay, EGLint *, EGLint *);
using PFNEGLBINDAPIPROC = EGLBoolean (*)(EGLenum);
using PFNEGLCHOOSECONFIGPROC = EGLBoolean (*)(EGLDisplay, const EGLint *, EGLConfig *, EGLint, EGLint *);
using PFNEGLCREATEWINDOWSURFACEPROC = EGLSurface (*)(EGLDisplay, EGLConfig, EGLNativeWindowType, const EGLint *);
using PFNEGLCREATEPBUFFERSURFACEPROC = EGLSurface (*)(EGLDisplay, EGLConfig, const EGLint *);
using PFNEGLCREATECONTEXTPROC = EGLContext (*)(EGLDisplay, EGLConfig, EGLContext, const EGLint *);
using PFNEGLDESTROYSURFACEPROC = EGLBoolean (*)(EGLDisplay, EGLSurface);
using PFNEGLMAKECURRENTPROC = EGLBoolean (*)(EGLDisplay, EGLSurface, EGLSurface, EGLContext);
using PFNEGLSWAPBUFFERSPROC = EGLBoolean (*)(EGLDisplay, EGLSurface);
using PFNEGLSWAPINTERVALPROC = EGLBoolean (*)(EGLDisplay, EGLint);

using PFNGLACTIVETEXTUREPROC = void (*)(GLenum);
using PFNGLATTACHSHADERPROC = void (*)(GLuint, GLuint);
using PFNGLBINDBUFFERPROC = void (*)(GLenum, GLuint);
using PFNGLBINDFRAMEBUFFERPROC = void (*)(GLenum, GLuint);
using PFNGLBINDRENDERBUFFERPROC = void (*)(GLenum, GLuint);
using PFNGLBINDTEXTUREPROC = void (*)(GLenum, GLuint);
using PFNGLBINDVERTEXARRAYPROC = void (*)(GLuint);
using PFNGLBLENDEQUATIONPROC = void (*)(GLenum);
using PFNGLBLENDEQUATIONSEPARATEPROC = void (*)(GLenum, GLenum);
using PFNGLBLENDFUNCPROC = void (*)(GLenum, GLenum);
using PFNGLBLENDFUNCSEPARATEPROC = void (*)(GLenum, GLenum, GLenum, GLenum);
using PFNGLBUFFERDATAPROC = void (*)(GLenum, GLsizeiptr, const void *, GLenum);
using PFNGLCOPYBUFFERSUBDATAPROC = void (*)(GLenum, GLenum, GLintptr, GLintptr, GLsizeiptr);
using PFNGLBUFFERSUBDATAPROC = void (*)(GLenum, GLintptr, GLsizeiptr, const void *);
using PFNGLCHECKFRAMEBUFFERSTATUSPROC = GLenum (*)(GLenum);
using PFNGLCLEARPROC = void (*)(GLbitfield);
using PFNGLCLEARCOLORPROC = void (*)(GLfloat, GLfloat, GLfloat, GLfloat);
using PFNGLCLEARDEPTHFPROC = void (*)(GLfloat);
using PFNGLCLEARSTENCILPROC = void (*)(GLint);
using PFNGLCOLORMASKPROC = void (*)(GLboolean, GLboolean, GLboolean, GLboolean);
using PFNGLCOMPILESHADERPROC = void (*)(GLuint);
using PFNGLCREATEPROGRAMPROC = GLuint (*)();
using PFNGLCREATESHADERPROC = GLuint (*)(GLenum);
using PFNGLCULLFACEPROC = void (*)(GLenum);
using PFNGLDELETEBUFFERSPROC = void (*)(GLsizei, const GLuint *);
using PFNGLDELETEFRAMEBUFFERSPROC = void (*)(GLsizei, const GLuint *);
using PFNGLDELETEPROGRAMPROC = void (*)(GLuint);
using PFNGLDELETERENDERBUFFERSPROC = void (*)(GLsizei, const GLuint *);
using PFNGLDELETESHADERPROC = void (*)(GLuint);
using PFNGLDELETETEXTURESPROC = void (*)(GLsizei, const GLuint *);
using PFNGLDELETEVERTEXARRAYSPROC = void (*)(GLsizei, const GLuint *);
using PFNGLDEPTHFUNCPROC = void (*)(GLenum);
using PFNGLDEPTHMASKPROC = void (*)(GLboolean);
using PFNGLDISABLEPROC = void (*)(GLenum);
using PFNGLDISABLEVERTEXATTRIBARRAYPROC = void (*)(GLuint);
using PFNGLDRAWARRAYSPROC = void (*)(GLenum, GLint, GLsizei);
using PFNGLDRAWARRAYSINSTANCEDPROC = void (*)(GLenum, GLint, GLsizei, GLsizei);
using PFNGLDRAWBUFFERSPROC = void (*)(GLsizei, const GLenum *);
using PFNGLDRAWELEMENTSPROC = void (*)(GLenum, GLsizei, GLenum, const void *);
using PFNGLDRAWELEMENTSINSTANCEDPROC = void (*)(GLenum, GLsizei, GLenum, const void *, GLsizei);
using PFNGLENABLEPROC = void (*)(GLenum);
using PFNGLENABLEVERTEXATTRIBARRAYPROC = void (*)(GLuint);
using PFNGLFRAMEBUFFERRENDERBUFFERPROC = void (*)(GLenum, GLenum, GLenum, GLuint);
using PFNGLFRAMEBUFFERTEXTURE2DPROC = void (*)(GLenum, GLenum, GLenum, GLuint, GLint);
using PFNGLFRONTFACEPROC = void (*)(GLenum);
using PFNGLGENBUFFERSPROC = void (*)(GLsizei, GLuint *);
using PFNGLGENFRAMEBUFFERSPROC = void (*)(GLsizei, GLuint *);
using PFNGLGENRENDERBUFFERSPROC = void (*)(GLsizei, GLuint *);
using PFNGLGENTEXTURESPROC = void (*)(GLsizei, GLuint *);
using PFNGLGENVERTEXARRAYSPROC = void (*)(GLsizei, GLuint *);
using PFNGLGENERATEMIPMAPPROC = void (*)(GLenum);
using PFNGLGETACTIVEATTRIBPROC = void (*)(GLuint, GLuint, GLsizei, GLsizei *, GLint *, GLenum *, GLchar *);
using PFNGLGETACTIVEUNIFORMPROC = void (*)(GLuint, GLuint, GLsizei, GLsizei *, GLint *, GLenum *, GLchar *);
using PFNGLGETATTRIBLOCATIONPROC = GLint (*)(GLuint, const GLchar *);
using PFNGLGETERRORPROC = GLenum (*)();
using PFNGLGETINTEGERVPROC = void (*)(GLenum, GLint *);
using PFNGLGETPROGRAMIVPROC = void (*)(GLuint, GLenum, GLint *);
using PFNGLGETSHADERIVPROC = void (*)(GLuint, GLenum, GLint *);
using PFNGLGETSHADERINFOLOGPROC = void (*)(GLuint, GLsizei, GLsizei *, GLchar *);
using PFNGLGETSTRINGPROC = const unsigned char *(*)(GLenum);
using PFNGLGETUNIFORMLOCATIONPROC = GLint (*)(GLuint, const GLchar *);
using PFNGLLINEWIDTHPROC = void (*)(GLfloat);
using PFNGLLINKPROGRAMPROC = void (*)(GLuint);
using PFNGLPIXELSTOREIPROC = void (*)(GLenum, GLint);
using PFNGLPOLYGONOFFSETPROC = void (*)(GLfloat, GLfloat);
using PFNGLREADPIXELSPROC = void (*)(GLint, GLint, GLsizei, GLsizei, GLenum, GLenum, void *);
using PFNGLRENDERBUFFERSTORAGEPROC = void (*)(GLenum, GLenum, GLsizei, GLsizei);
using PFNGLSCISSORPROC = void (*)(GLint, GLint, GLsizei, GLsizei);
using PFNGLSHADERSOURCEPROC = void (*)(GLuint, GLsizei, const GLchar *const *, const GLint *);
using PFNGLSTENCILFUNCPROC = void (*)(GLenum, GLint, GLuint);
using PFNGLSTENCILFUNCSEPARATEPROC = void (*)(GLenum, GLenum, GLint, GLuint);
using PFNGLSTENCILMASKPROC = void (*)(GLuint);
using PFNGLSTENCILMASKSEPARATEPROC = void (*)(GLenum, GLuint);
using PFNGLSTENCILOPPROC = void (*)(GLenum, GLenum, GLenum);
using PFNGLSTENCILOPSEPARATEPROC = void (*)(GLenum, GLenum, GLenum, GLenum);
using PFNGLTEXIMAGE2DPROC = void (*)(GLenum, GLint, GLint, GLsizei, GLsizei, GLint, GLenum, GLenum, const void *);
using PFNGLTEXPARAMETERFPROC = void (*)(GLenum, GLenum, GLfloat);
using PFNGLTEXPARAMETERIPROC = void (*)(GLenum, GLenum, GLint);
using PFNGLTEXSUBIMAGE2DPROC = void (*)(GLenum, GLint, GLint, GLint, GLsizei, GLsizei, GLenum, GLenum, const void *);
using PFNGLTEXSTORAGE2DPROC = void (*)(GLenum, GLsizei, GLenum, GLsizei, GLsizei);
using PFNGLUNIFORM1FPROC = void (*)(GLint, GLfloat);
using PFNGLUNIFORM1FVPROC = void (*)(GLint, GLsizei, const GLfloat *);
using PFNGLUNIFORM1IPROC = void (*)(GLint, GLint);
using PFNGLUNIFORM1IVPROC = void (*)(GLint, GLsizei, const GLint *);
using PFNGLUNIFORM1UIPROC = void (*)(GLint, GLuint);
using PFNGLUNIFORM1UIVPROC = void (*)(GLint, GLsizei, const GLuint *);
using PFNGLUNIFORM2FPROC = void (*)(GLint, GLfloat, GLfloat);
using PFNGLUNIFORM2FVPROC = void (*)(GLint, GLsizei, const GLfloat *);
using PFNGLUNIFORM2IPROC = void (*)(GLint, GLint, GLint);
using PFNGLUNIFORM2IVPROC = void (*)(GLint, GLsizei, const GLint *);
using PFNGLUNIFORM2UIPROC = void (*)(GLint, GLuint, GLuint);
using PFNGLUNIFORM2UIVPROC = void (*)(GLint, GLsizei, const GLuint *);
using PFNGLUNIFORM3FPROC = void (*)(GLint, GLfloat, GLfloat, GLfloat);
using PFNGLUNIFORM3FVPROC = void (*)(GLint, GLsizei, const GLfloat *);
using PFNGLUNIFORM3IPROC = void (*)(GLint, GLint, GLint, GLint);
using PFNGLUNIFORM3IVPROC = void (*)(GLint, GLsizei, const GLint *);
using PFNGLUNIFORM3UIPROC = void (*)(GLint, GLuint, GLuint, GLuint);
using PFNGLUNIFORM3UIVPROC = void (*)(GLint, GLsizei, const GLuint *);
using PFNGLUNIFORM4FPROC = void (*)(GLint, GLfloat, GLfloat, GLfloat, GLfloat);
using PFNGLUNIFORM4FVPROC = void (*)(GLint, GLsizei, const GLfloat *);
using PFNGLUNIFORM4IPROC = void (*)(GLint, GLint, GLint, GLint, GLint);
using PFNGLUNIFORM4IVPROC = void (*)(GLint, GLsizei, const GLint *);
using PFNGLUNIFORM4UIPROC = void (*)(GLint, GLuint, GLuint, GLuint, GLuint);
using PFNGLUNIFORM4UIVPROC = void (*)(GLint, GLsizei, const GLuint *);
using PFNGLUNIFORMMATRIX2FVPROC = void (*)(GLint, GLsizei, GLboolean, const GLfloat *);
using PFNGLUNIFORMMATRIX3FVPROC = void (*)(GLint, GLsizei, GLboolean, const GLfloat *);
using PFNGLUNIFORMMATRIX4FVPROC = void (*)(GLint, GLsizei, GLboolean, const GLfloat *);
using PFNGLUSEPROGRAMPROC = void (*)(GLuint);
using PFNGLVERTEXATTRIBDIVISORPROC = void (*)(GLuint, GLuint);
using PFNGLVERTEXATTRIBPOINTERPROC = void (*)(GLuint, GLint, GLenum, GLboolean, GLsizei, const void *);
using PFNGLVIEWPORTPROC = void (*)(GLint, GLint, GLsizei, GLsizei);

struct AngleWebGLState {
  void *egl = nullptr;
  void *gles = nullptr;
  EGLDisplay display = EGL_NO_DISPLAY;
  EGLConfig config = nullptr;
  EGLSurface surface = EGL_NO_SURFACE;
  EGLContext context = EGL_NO_CONTEXT;
  PFNEGLGETPROCADDRESS eglGetProcAddress = nullptr;
  PFNEGLGETERRORPROC eglGetError = nullptr;
  PFNEGLCREATEWINDOWSURFACEPROC eglCreateWindowSurface = nullptr;
  PFNEGLCREATEPBUFFERSURFACEPROC eglCreatePbufferSurface = nullptr;
  PFNEGLDESTROYSURFACEPROC eglDestroySurface = nullptr;
  PFNEGLMAKECURRENTPROC eglMakeCurrent = nullptr;
  PFNEGLSWAPBUFFERSPROC eglSwapBuffers = nullptr;
  PFNEGLSWAPINTERVALPROC eglSwapInterval = nullptr;

  PFNGLACTIVETEXTUREPROC glActiveTexture = nullptr;
  PFNGLATTACHSHADERPROC glAttachShader = nullptr;
  PFNGLBINDBUFFERPROC glBindBuffer = nullptr;
  PFNGLBINDFRAMEBUFFERPROC glBindFramebuffer = nullptr;
  PFNGLBINDRENDERBUFFERPROC glBindRenderbuffer = nullptr;
  PFNGLBINDTEXTUREPROC glBindTexture = nullptr;
  PFNGLBINDVERTEXARRAYPROC glBindVertexArray = nullptr;
  PFNGLBLENDEQUATIONPROC glBlendEquation = nullptr;
  PFNGLBLENDEQUATIONSEPARATEPROC glBlendEquationSeparate = nullptr;
  PFNGLBLENDFUNCPROC glBlendFunc = nullptr;
  PFNGLBLENDFUNCSEPARATEPROC glBlendFuncSeparate = nullptr;
  PFNGLBUFFERDATAPROC glBufferData = nullptr;
  PFNGLBUFFERSUBDATAPROC glBufferSubData = nullptr;
  PFNGLCOPYBUFFERSUBDATAPROC glCopyBufferSubData = nullptr;
  PFNGLCHECKFRAMEBUFFERSTATUSPROC glCheckFramebufferStatus = nullptr;
  PFNGLCLEARPROC glClear = nullptr;
  PFNGLCLEARCOLORPROC glClearColor = nullptr;
  PFNGLCLEARDEPTHFPROC glClearDepthf = nullptr;
  PFNGLCLEARSTENCILPROC glClearStencil = nullptr;
  PFNGLCOLORMASKPROC glColorMask = nullptr;
  PFNGLCOMPILESHADERPROC glCompileShader = nullptr;
  PFNGLCREATEPROGRAMPROC glCreateProgram = nullptr;
  PFNGLCREATESHADERPROC glCreateShader = nullptr;
  PFNGLCULLFACEPROC glCullFace = nullptr;
  PFNGLDELETEBUFFERSPROC glDeleteBuffers = nullptr;
  PFNGLDELETEFRAMEBUFFERSPROC glDeleteFramebuffers = nullptr;
  PFNGLDELETEPROGRAMPROC glDeleteProgram = nullptr;
  PFNGLDELETERENDERBUFFERSPROC glDeleteRenderbuffers = nullptr;
  PFNGLDELETESHADERPROC glDeleteShader = nullptr;
  PFNGLDELETETEXTURESPROC glDeleteTextures = nullptr;
  PFNGLDELETEVERTEXARRAYSPROC glDeleteVertexArrays = nullptr;
  PFNGLDEPTHFUNCPROC glDepthFunc = nullptr;
  PFNGLDEPTHMASKPROC glDepthMask = nullptr;
  PFNGLDISABLEPROC glDisable = nullptr;
  PFNGLDISABLEVERTEXATTRIBARRAYPROC glDisableVertexAttribArray = nullptr;
  PFNGLDRAWARRAYSPROC glDrawArrays = nullptr;
  PFNGLDRAWARRAYSINSTANCEDPROC glDrawArraysInstanced = nullptr;
  PFNGLDRAWBUFFERSPROC glDrawBuffers = nullptr;
  PFNGLDRAWELEMENTSPROC glDrawElements = nullptr;
  PFNGLDRAWELEMENTSINSTANCEDPROC glDrawElementsInstanced = nullptr;
  PFNGLENABLEPROC glEnable = nullptr;
  PFNGLENABLEVERTEXATTRIBARRAYPROC glEnableVertexAttribArray = nullptr;
  PFNGLFRAMEBUFFERRENDERBUFFERPROC glFramebufferRenderbuffer = nullptr;
  PFNGLFRAMEBUFFERTEXTURE2DPROC glFramebufferTexture2D = nullptr;
  PFNGLFRONTFACEPROC glFrontFace = nullptr;
  PFNGLGENBUFFERSPROC glGenBuffers = nullptr;
  PFNGLGENFRAMEBUFFERSPROC glGenFramebuffers = nullptr;
  PFNGLGENRENDERBUFFERSPROC glGenRenderbuffers = nullptr;
  PFNGLGENTEXTURESPROC glGenTextures = nullptr;
  PFNGLGENVERTEXARRAYSPROC glGenVertexArrays = nullptr;
  PFNGLGENERATEMIPMAPPROC glGenerateMipmap = nullptr;
  PFNGLGETACTIVEATTRIBPROC glGetActiveAttrib = nullptr;
  PFNGLGETACTIVEUNIFORMPROC glGetActiveUniform = nullptr;
  PFNGLGETATTRIBLOCATIONPROC glGetAttribLocation = nullptr;
  PFNGLGETERRORPROC glGetError = nullptr;
  PFNGLGETINTEGERVPROC glGetIntegerv = nullptr;
  PFNGLGETPROGRAMIVPROC glGetProgramiv = nullptr;
  PFNGLGETSHADERIVPROC glGetShaderiv = nullptr;
  PFNGLGETSHADERINFOLOGPROC glGetShaderInfoLog = nullptr;
  PFNGLGETSTRINGPROC glGetString = nullptr;
  PFNGLGETUNIFORMLOCATIONPROC glGetUniformLocation = nullptr;
  PFNGLLINEWIDTHPROC glLineWidth = nullptr;
  PFNGLLINKPROGRAMPROC glLinkProgram = nullptr;
  PFNGLPIXELSTOREIPROC glPixelStorei = nullptr;
  PFNGLPOLYGONOFFSETPROC glPolygonOffset = nullptr;
  PFNGLREADPIXELSPROC glReadPixels = nullptr;
  PFNGLRENDERBUFFERSTORAGEPROC glRenderbufferStorage = nullptr;
  PFNGLSCISSORPROC glScissor = nullptr;
  PFNGLSHADERSOURCEPROC glShaderSource = nullptr;
  PFNGLSTENCILFUNCPROC glStencilFunc = nullptr;
  PFNGLSTENCILFUNCSEPARATEPROC glStencilFuncSeparate = nullptr;
  PFNGLSTENCILMASKPROC glStencilMask = nullptr;
  PFNGLSTENCILMASKSEPARATEPROC glStencilMaskSeparate = nullptr;
  PFNGLSTENCILOPPROC glStencilOp = nullptr;
  PFNGLSTENCILOPSEPARATEPROC glStencilOpSeparate = nullptr;
  PFNGLTEXIMAGE2DPROC glTexImage2D = nullptr;
  PFNGLTEXPARAMETERFPROC glTexParameterf = nullptr;
  PFNGLTEXPARAMETERIPROC glTexParameteri = nullptr;
  PFNGLTEXSUBIMAGE2DPROC glTexSubImage2D = nullptr;
  PFNGLTEXSTORAGE2DPROC glTexStorage2D = nullptr;
  PFNGLUNIFORM1FPROC glUniform1f = nullptr;
  PFNGLUNIFORM1FVPROC glUniform1fv = nullptr;
  PFNGLUNIFORM1IPROC glUniform1i = nullptr;
  PFNGLUNIFORM1IVPROC glUniform1iv = nullptr;
  PFNGLUNIFORM1UIPROC glUniform1ui = nullptr;
  PFNGLUNIFORM1UIVPROC glUniform1uiv = nullptr;
  PFNGLUNIFORM2FPROC glUniform2f = nullptr;
  PFNGLUNIFORM2FVPROC glUniform2fv = nullptr;
  PFNGLUNIFORM2IPROC glUniform2i = nullptr;
  PFNGLUNIFORM2IVPROC glUniform2iv = nullptr;
  PFNGLUNIFORM2UIPROC glUniform2ui = nullptr;
  PFNGLUNIFORM2UIVPROC glUniform2uiv = nullptr;
  PFNGLUNIFORM3FPROC glUniform3f = nullptr;
  PFNGLUNIFORM3FVPROC glUniform3fv = nullptr;
  PFNGLUNIFORM3IPROC glUniform3i = nullptr;
  PFNGLUNIFORM3IVPROC glUniform3iv = nullptr;
  PFNGLUNIFORM3UIPROC glUniform3ui = nullptr;
  PFNGLUNIFORM3UIVPROC glUniform3uiv = nullptr;
  PFNGLUNIFORM4FPROC glUniform4f = nullptr;
  PFNGLUNIFORM4FVPROC glUniform4fv = nullptr;
  PFNGLUNIFORM4IPROC glUniform4i = nullptr;
  PFNGLUNIFORM4IVPROC glUniform4iv = nullptr;
  PFNGLUNIFORM4UIPROC glUniform4ui = nullptr;
  PFNGLUNIFORM4UIVPROC glUniform4uiv = nullptr;
  PFNGLUNIFORMMATRIX2FVPROC glUniformMatrix2fv = nullptr;
  PFNGLUNIFORMMATRIX3FVPROC glUniformMatrix3fv = nullptr;
  PFNGLUNIFORMMATRIX4FVPROC glUniformMatrix4fv = nullptr;
  PFNGLUSEPROGRAMPROC glUseProgram = nullptr;
  PFNGLVERTEXATTRIBDIVISORPROC glVertexAttribDivisor = nullptr;
  PFNGLVERTEXATTRIBPOINTERPROC glVertexAttribPointer = nullptr;
  PFNGLVIEWPORTPROC glViewport = nullptr;

#if defined(_WIN32)
  void *nativeWindow = nullptr;
#else
  NSView *hostView = nil;
  CAMetalLayer *metalLayer = nil;
#endif
  int widthPx = 1;
  int heightPx = 1;
  double devicePixelRatio = 1.0;
  bool ready = false;
};

static AngleWebGLState gWebGL;
static std::chrono::steady_clock::time_point gProfileSizeSync;
static bool gProfileSizeSyncPending = false;
static bool nativeFrameProfileEnabled() {
  static const bool enabled = std::getenv("GEA_NATIVE_FRAME_PROFILE") != nullptr;
  return enabled;
}

// Diagnostic switches are launch settings, like nativeFrameProfileEnabled.
// Cache them lazily, after UWP has applied its launch configuration: repeated
// getenv calls acquire the CRT environment lock in per-draw uniform/state paths.
static bool nativeWebGLTrapEnabled() {
  static const bool enabled = std::getenv("GEA_WEBGL_TRAP") != nullptr;
  return enabled;
}
static bool nativeBlendDebugEnabled() {
  static const bool enabled = std::getenv("GEA_WEBGL_BLEND_DEBUG") != nullptr;
  return enabled;
}
static bool nativeShadowColorAuditEnabled() {
  static const bool enabled = std::getenv("GEA_WEBGL_SHADOW_COLOR_AUDIT") != nullptr;
  return enabled;
}

static void smokeLog(const char *format, ...) {
  char message[1024] = {};
  va_list args;
  va_start(args, format);
  std::vsnprintf(message, sizeof(message), format, args);
  va_end(args);

  const char *path = std::getenv("GEA_THREE_ANGLE_SMOKE_LOG");
#if defined(_WIN32)
  OutputDebugStringA(message);
  OutputDebugStringA("\n");
  if (!path || path[0] == '\0') {
    std::fprintf(stderr, "%s\n", message);
    return;
  }
#else
  if (!path || path[0] == '\0') path = "/tmp/three-angle-metal-smoke.log";
#endif
  if (FILE *file = std::fopen(path, "a")) {
    std::fprintf(file, "%s\n", message);
    std::fclose(file);
  }
  std::fprintf(stderr, "%s\n", message);
}

extern "C" void gea_three_angle_smoke_log(std::string message) {
  smokeLog("[three-angle-metal] %s", message.c_str());
}

// Window-level pointer capture: a local NSEvent monitor sees EVERY mouse
// event dispatched to this app before window/view routing, so pointer
// tracking cannot be blocked by whatever view AppKit hit-tests topmost
// (overlay labels etc. would otherwise carve dead zones — per-view
// mouseMoved: overrides only fire when THAT view wins hit-testing). The
// handler records the position in the host view's coordinate space with the
// same top-left-origin flip the per-view path used. Returning the event
// unmodified keeps normal dispatch (clicks, first responder) intact.
#if !defined(_WIN32)
static id gGeaPointerMonitor = nil;
static void geaInstallPointerMonitor(void) {
  if (gGeaPointerMonitor) return;
  const NSEventMask mask = NSEventMaskMouseMoved | NSEventMaskLeftMouseDragged |
                           NSEventMaskLeftMouseDown | NSEventMaskLeftMouseUp;
  gGeaPointerMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:mask
                                                             handler:^NSEvent *(NSEvent *event) {
    NSView *host = gWebGL.hostView;
    if (host && host.window && event.window == host.window) {
      if (event.type == NSEventTypeLeftMouseDown) gGeaPointerDown = true;
      else if (event.type == NSEventTypeLeftMouseUp) gGeaPointerDown = false;
      const NSPoint p = [host convertPoint:event.locationInWindow fromView:nil];
      gGeaPointerX = p.x;
      gGeaPointerY = host.bounds.size.height - p.y; // clientY: top-left origin
      gGeaPointerW = host.bounds.size.width;
      gGeaPointerH = host.bounds.size.height;
      gGeaPointerSeq += 1.0;
    }
    return event;
  }];
  smokeLog("[three-angle-metal] pointer monitor installed (window-level)");
}

static void *openFirst(const char *envName, const char *const *paths) {
  if (const char *overridePath = std::getenv(envName)) {
    if (void *handle = dlopen(overridePath, RTLD_NOW | RTLD_LOCAL)) {
      std::fprintf(stderr, "[three-angle-metal] loaded %s from %s\n", envName, overridePath);
      return handle;
    }
    std::fprintf(stderr, "[three-angle-metal] failed to load %s from %s: %s\n", envName, overridePath, dlerror());
  }
  for (int i = 0; paths[i] != nullptr; i++) {
    if (void *handle = dlopen(paths[i], RTLD_NOW | RTLD_LOCAL)) {
      std::fprintf(stderr, "[three-angle-metal] loaded %s\n", paths[i]);
      return handle;
    }
  }
  return nullptr;
}

#endif

template <typename Fn>
static Fn loadSymbol(void *library, const char *name) {
#if defined(_WIN32)
  return reinterpret_cast<Fn>(GetProcAddress(static_cast<HMODULE>(library), name));
#else
  return reinterpret_cast<Fn>(dlsym(library, name));
#endif
}

template <typename Fn>
static Fn loadGl(const char *name) {
  if (gWebGL.eglGetProcAddress) {
    if (void *symbol = gWebGL.eglGetProcAddress(name)) return reinterpret_cast<Fn>(symbol);
  }
  return loadSymbol<Fn>(gWebGL.gles, name);
}

static EGLint lastEglError() {
  return gWebGL.eglGetError ? gWebGL.eglGetError() : 0;
}

// Optional asynchronous GPU timings. Never wait for a result or insert a
// glFinish: an unavailable ring slot simply skips that frame's measurement.
// The single host context owns these query names until context destruction.
struct GpuFrameProfile {
  void (*gen)(GLsizei, GLuint *) = nullptr;
  void (*begin)(GLenum, GLuint) = nullptr;
  void (*end)(GLenum) = nullptr;
  void (*available)(GLuint, GLenum, GLuint *) = nullptr;
  void (*result)(GLuint, GLenum, std::uint64_t *) = nullptr;
  GLuint queries[8]{};
  bool pending[8]{}, valid[8]{};
  bool initialized = false, enabled = false, active = false;
  unsigned slot = 0, count = 0;
  double total = 0, maximum = 0;
  std::chrono::steady_clock::time_point window = std::chrono::steady_clock::now();

  void start() {
    if (!nativeFrameProfileEnabled() || !gWebGL.ready || active) return;
    if (!initialized) {
      initialized = true;
      const auto extensions = reinterpret_cast<const char *>(gWebGL.glGetString(0x1F03));
      const std::string list = " " + std::string(extensions ? extensions : "") + " ";
      if (list.find(" GL_EXT_disjoint_timer_query ") != std::string::npos) {
        gen = loadGl<decltype(gen)>("glGenQueriesEXT");
        begin = loadGl<decltype(begin)>("glBeginQueryEXT");
        end = loadGl<decltype(end)>("glEndQueryEXT");
        available = loadGl<decltype(available)>("glGetQueryObjectuivEXT");
        result = loadGl<decltype(result)>("glGetQueryObjectui64vEXT");
        auto bits = loadGl<void (*)(GLenum, GLenum, GLint *)>("glGetQueryivEXT");
        GLint counterBits = 0;
        if (bits) bits(0x88BF, 0x8864, &counterBits);
        enabled = gen && begin && end && available && result && counterBits > 0;
      }
      smokeLog("[gea.gpu-profile] timer_supported=%d", enabled ? 1 : 0);
      if (enabled) gen(8, queries);
    }
    if (!enabled) return;
    GLint disjoint = 0;
    gWebGL.glGetIntegerv(0x8FBB, &disjoint);
    if (disjoint) {
      for (auto &value : valid) value = false;
      total = maximum = 0; count = 0;
    }
    for (unsigned i = 0; i < 8; ++i) {
      if (!pending[i]) continue;
      GLuint ready = 0;
      available(queries[i], 0x8867, &ready);
      if (!ready) continue;
      if (valid[i]) {
        std::uint64_t ns = 0;
        result(queries[i], 0x8866, &ns);
        const double ms = static_cast<double>(ns) / 1000000.0;
        total += ms; maximum = std::max(maximum, ms); ++count;
      }
      pending[i] = false;
    }
    const auto now = std::chrono::steady_clock::now();
    if (std::chrono::duration<double>(now - window).count() >= 1.0) {
      if (count) smokeLog("[gea.gpu-profile] mean_ms=%.3f max_ms=%.3f samples=%u", total / count, maximum, count);
      total = maximum = 0; count = 0; window = now;
    }
    if (!pending[slot]) {
      begin(0x88BF, queries[slot]);
      active = true;
    }
  }
  void finish() {
    if (!active) return;
    end(0x88BF);
    pending[slot] = valid[slot] = true;
    slot = (slot + 1) % 8;
    active = false;
  }
};
static GpuFrameProfile gGpuFrameProfile;

static void logEglFailure(const char *step) {
  std::fprintf(stderr, "[three-angle-metal] %s failed, EGL error 0x%04x\n", step, lastEglError());
}

#if !defined(_WIN32)
static CGFloat backingScaleForHostView(NSView *nativeView) {
  CGFloat scale = nativeView.window ? nativeView.window.backingScaleFactor : 0.0;
  if (scale <= 0.0 && nativeView.window.screen) scale = nativeView.window.screen.backingScaleFactor;
  if (scale <= 0.0 && NSScreen.mainScreen) scale = NSScreen.mainScreen.backingScaleFactor;
  if (scale <= 0.0) scale = static_cast<CGFloat>(gWebGL.devicePixelRatio > 0.0 ? gWebGL.devicePixelRatio : 1.0);
  return std::max<CGFloat>(1.0, scale);
}

static NSRect resolvedHostBounds(NSView *nativeView) {
  if (NSView *contentView = nativeView.window.contentView) [contentView layoutSubtreeIfNeeded];
  NSView *containerView = nativeView.superview;
  if (containerView) [containerView layoutSubtreeIfNeeded];
  NSRect targetBounds = containerView ? containerView.bounds : nativeView.bounds;
  if ((targetBounds.size.width <= 0.0 || targetBounds.size.height <= 0.0) && nativeView.window.contentView) {
    targetBounds = nativeView.window.contentView.bounds;
  }
  return targetBounds;
}

static double syncHostViewSize(double fallbackAspect) {
  NSView *nativeView = gWebGL.hostView;
  if (!nativeView) return fallbackAspect > 0.0 ? fallbackAspect : 1.0;
  NSRect targetBounds = resolvedHostBounds(nativeView);
  if (targetBounds.size.width <= 0.0 || targetBounds.size.height <= 0.0) {
    return fallbackAspect > 0.0 ? fallbackAspect : 1.0;
  }

  [CATransaction begin];
  [CATransaction setDisableActions:YES];
  nativeView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  NSRect targetFrame = NSMakeRect(0.0, 0.0, targetBounds.size.width, targetBounds.size.height);
  nativeView.frame = targetFrame;
  nativeView.bounds = targetFrame;
  [nativeView layoutSubtreeIfNeeded];

  CGFloat scale = backingScaleForHostView(nativeView);
  gWebGL.widthPx = std::max(1, static_cast<int>(std::round(targetBounds.size.width * scale)));
  gWebGL.heightPx = std::max(1, static_cast<int>(std::round(targetBounds.size.height * scale)));
  gWebGL.devicePixelRatio = static_cast<double>(scale);

  if ([nativeView.layer isKindOfClass:CAMetalLayer.class]) {
    CAMetalLayer *metalLayer = (CAMetalLayer *)nativeView.layer;
    metalLayer.frame = nativeView.bounds;
    metalLayer.bounds = nativeView.bounds;
    metalLayer.contentsScale = scale;
    metalLayer.drawableSize = CGSizeMake(gWebGL.widthPx, gWebGL.heightPx);
    metalLayer.needsDisplayOnBoundsChange = YES;
  }
  [CATransaction commit];
  return static_cast<double>(targetBounds.size.width) / static_cast<double>(targetBounds.size.height);
}

// Re-assert the presentation properties ANGLE may reset when it adopts the
// CAMetalLayer as its window surface, so nextDrawable keeps blocking (never
// drops a frame to black) for the surface ANGLE actually renders into.
static void configureMetalLayerForPresentation(CAMetalLayer *layer) {
  if (!layer) return;
  layer.allowsNextDrawableTimeout = NO;
  layer.maximumDrawableCount = 3;
}

#else
static double syncHostViewSize(double fallbackAspect) {
  return gWebGL.heightPx > 0 ? static_cast<double>(gWebGL.widthPx) / gWebGL.heightPx : fallbackAspect;
}
extern "C" void gea_three_webgl_update_size_uwp(double width, double height, double pixelRatio) {
  gWebGL.widthPx = std::max(1, static_cast<int>(width));
  gWebGL.heightPx = std::max(1, static_cast<int>(height));
  gWebGL.devicePixelRatio = pixelRatio > 0.0 ? pixelRatio : 1.0;
}
#endif

#if defined(_WIN32)
// The UWP frame driver owns its EGL context exclusively until it returns to
// CoreWindow event dispatch. Other hosts retain per-call binding semantics.
static thread_local bool gUwpFrameContextCurrent = false;
#endif
static bool makeCurrent(const char *label) {
#if defined(_WIN32)
  if (gUwpFrameContextCurrent) return true;
#endif
  if (!gWebGL.ready && gWebGL.context == EGL_NO_CONTEXT) return false;
  // THIS FRAME LOOP IS ALREADY PACED. macOS drives it from the window's
  // CADisplayLink at the screen's own cadence (`macos_main.mm`
  // `updateDisplayLinkRate` pins `preferredFrameRateRange` to
  // `screen.maximumFramesPerSecond`), and the CAMetalLayer presents with
  // `displaySyncEnabled`. EGL's DEFAULT swap interval of 1 adds a THIRD
  // waiter: `eglSwapBuffers` blocks for a vsync that the display link has
  // already accounted for. The two pacers beat against each other -- a frame
  // that finishes just after its own vsync waits for the next one, so the
  // period lands at 2 refreshes now and then. A reference app measured
  // `fps=55.5 wall=18.00ms busy=3.23ms idle=14.77ms(disp=14.77)`: only 3.2 ms
  // of work against a 16.67 ms budget, missing 60 Hz purely on presentation
  // pacing. Interval 0 hands pacing to the display link alone; tearing is not
  // reintroduced because the layer still syncs its own present.
  // `GEA_ANGLE_SWAP_INTERVAL` overrides it (set `1` to restore the old
  // double-paced behaviour) so both arms can be measured from one binary.
  if (gWebGL.eglSwapInterval) {
    const char *requested = std::getenv("GEA_ANGLE_SWAP_INTERVAL");
    const EGLint interval = requested ? static_cast<EGLint>(std::atoi(requested)) : 0;
    gWebGL.eglSwapInterval(gWebGL.display, interval);
  }
  if (gWebGL.eglMakeCurrent(gWebGL.display, gWebGL.surface, gWebGL.surface, gWebGL.context) == EGL_FALSE_VALUE) {
    logEglFailure(label);
    return false;
  }
  return true;
}

#if defined(_WIN32)
extern "C" bool gea_three_webgl_begin_frame_uwp() {
  // Always rebind after the dispatcher, where arbitrary platform callbacks
  // may have used a different context. No such callbacks run within the frame.
  gUwpFrameContextCurrent = false;
  if (!gWebGL.ready || !makeCurrent("eglMakeCurrent(frame)")) return false;
  gUwpFrameContextCurrent = true;
  return true;
}
extern "C" void gea_three_webgl_end_frame_uwp() {
  gUwpFrameContextCurrent = false;
}
#endif

#if !defined(_WIN32)
static bool rebuildWindowSurface(const char *label) {
  if (!gWebGL.eglCreateWindowSurface || !gWebGL.eglDestroySurface || !gWebGL.eglMakeCurrent ||
      !gWebGL.metalLayer || !gWebGL.config || gWebGL.context == EGL_NO_CONTEXT) {
    return false;
  }
  syncHostViewSize(static_cast<double>(gWebGL.widthPx) / static_cast<double>(std::max(1, gWebGL.heightPx)));
  EGLSurface oldSurface = gWebGL.surface;
  gWebGL.eglMakeCurrent(gWebGL.display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
  if (oldSurface != EGL_NO_SURFACE) gWebGL.eglDestroySurface(gWebGL.display, oldSurface);
  gWebGL.surface = gWebGL.eglCreateWindowSurface(
    gWebGL.display,
    gWebGL.config,
    (__bridge EGLNativeWindowType)gWebGL.metalLayer,
    nullptr
  );
  if (gWebGL.surface == EGL_NO_SURFACE) {
    logEglFailure(label);
    return false;
  }
  if (!makeCurrent("eglMakeCurrent(rebound-window-surface)")) return false;
  configureMetalLayerForPresentation(gWebGL.metalLayer);
  if (gWebGL.glViewport) gWebGL.glViewport(0, 0, gWebGL.widthPx, gWebGL.heightPx);
  // Re-issue a full clear into the freshly rebound surface so its backbuffer is
  // initialised to the app's frame instead of presenting an uninitialised
  // (black) drawable before the app's next render lands.
  if (gWebGL.glClearColor && gWebGL.glClear) {
    gWebGL.glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
    gWebGL.glClear(0x00004000 /* GL_COLOR_BUFFER_BIT */ | 0x00000100 /* GL_DEPTH_BUFFER_BIT */);
  }
  return true;
}

#endif

static bool loadGlSymbols() {
#define LOAD_GL(name, type) \
  gWebGL.name = loadGl<type>(#name); \
  if (!gWebGL.name) { \
    std::fprintf(stderr, "[three-angle-metal] missing GL symbol %s\n", #name); \
    return false; \
  }
  LOAD_GL(glActiveTexture, PFNGLACTIVETEXTUREPROC)
  LOAD_GL(glAttachShader, PFNGLATTACHSHADERPROC)
  LOAD_GL(glBindBuffer, PFNGLBINDBUFFERPROC)
  LOAD_GL(glBindFramebuffer, PFNGLBINDFRAMEBUFFERPROC)
  LOAD_GL(glBindRenderbuffer, PFNGLBINDRENDERBUFFERPROC)
  LOAD_GL(glBindTexture, PFNGLBINDTEXTUREPROC)
  LOAD_GL(glBindVertexArray, PFNGLBINDVERTEXARRAYPROC)
  LOAD_GL(glBlendEquation, PFNGLBLENDEQUATIONPROC)
  LOAD_GL(glBlendEquationSeparate, PFNGLBLENDEQUATIONSEPARATEPROC)
  LOAD_GL(glBlendFunc, PFNGLBLENDFUNCPROC)
  LOAD_GL(glBlendFuncSeparate, PFNGLBLENDFUNCSEPARATEPROC)
  LOAD_GL(glBufferData, PFNGLBUFFERDATAPROC)
  LOAD_GL(glBufferSubData, PFNGLBUFFERSUBDATAPROC)
  LOAD_GL(glCopyBufferSubData, PFNGLCOPYBUFFERSUBDATAPROC)
  LOAD_GL(glCheckFramebufferStatus, PFNGLCHECKFRAMEBUFFERSTATUSPROC)
  LOAD_GL(glClear, PFNGLCLEARPROC)
  LOAD_GL(glClearColor, PFNGLCLEARCOLORPROC)
  LOAD_GL(glClearDepthf, PFNGLCLEARDEPTHFPROC)
  LOAD_GL(glClearStencil, PFNGLCLEARSTENCILPROC)
  LOAD_GL(glColorMask, PFNGLCOLORMASKPROC)
  LOAD_GL(glCompileShader, PFNGLCOMPILESHADERPROC)
  LOAD_GL(glCreateProgram, PFNGLCREATEPROGRAMPROC)
  LOAD_GL(glCreateShader, PFNGLCREATESHADERPROC)
  LOAD_GL(glCullFace, PFNGLCULLFACEPROC)
  LOAD_GL(glDeleteBuffers, PFNGLDELETEBUFFERSPROC)
  LOAD_GL(glDeleteFramebuffers, PFNGLDELETEFRAMEBUFFERSPROC)
  LOAD_GL(glDeleteProgram, PFNGLDELETEPROGRAMPROC)
  LOAD_GL(glDeleteRenderbuffers, PFNGLDELETERENDERBUFFERSPROC)
  LOAD_GL(glDeleteShader, PFNGLDELETESHADERPROC)
  LOAD_GL(glDeleteTextures, PFNGLDELETETEXTURESPROC)
  LOAD_GL(glDeleteVertexArrays, PFNGLDELETEVERTEXARRAYSPROC)
  LOAD_GL(glDepthFunc, PFNGLDEPTHFUNCPROC)
  LOAD_GL(glDepthMask, PFNGLDEPTHMASKPROC)
  LOAD_GL(glDisable, PFNGLDISABLEPROC)
  LOAD_GL(glDisableVertexAttribArray, PFNGLDISABLEVERTEXATTRIBARRAYPROC)
  LOAD_GL(glDrawArrays, PFNGLDRAWARRAYSPROC)
  LOAD_GL(glDrawArraysInstanced, PFNGLDRAWARRAYSINSTANCEDPROC)
  LOAD_GL(glDrawBuffers, PFNGLDRAWBUFFERSPROC)
  LOAD_GL(glDrawElements, PFNGLDRAWELEMENTSPROC)
  LOAD_GL(glDrawElementsInstanced, PFNGLDRAWELEMENTSINSTANCEDPROC)
  LOAD_GL(glEnable, PFNGLENABLEPROC)
  LOAD_GL(glEnableVertexAttribArray, PFNGLENABLEVERTEXATTRIBARRAYPROC)
  LOAD_GL(glFramebufferRenderbuffer, PFNGLFRAMEBUFFERRENDERBUFFERPROC)
  LOAD_GL(glFramebufferTexture2D, PFNGLFRAMEBUFFERTEXTURE2DPROC)
  LOAD_GL(glFrontFace, PFNGLFRONTFACEPROC)
  LOAD_GL(glGenBuffers, PFNGLGENBUFFERSPROC)
  LOAD_GL(glGenFramebuffers, PFNGLGENFRAMEBUFFERSPROC)
  LOAD_GL(glGenRenderbuffers, PFNGLGENRENDERBUFFERSPROC)
  LOAD_GL(glGenTextures, PFNGLGENTEXTURESPROC)
  LOAD_GL(glGenVertexArrays, PFNGLGENVERTEXARRAYSPROC)
  LOAD_GL(glGenerateMipmap, PFNGLGENERATEMIPMAPPROC)
  LOAD_GL(glGetActiveAttrib, PFNGLGETACTIVEATTRIBPROC)
  LOAD_GL(glGetActiveUniform, PFNGLGETACTIVEUNIFORMPROC)
  LOAD_GL(glGetAttribLocation, PFNGLGETATTRIBLOCATIONPROC)
  LOAD_GL(glGetError, PFNGLGETERRORPROC)
  LOAD_GL(glGetIntegerv, PFNGLGETINTEGERVPROC)
  LOAD_GL(glGetProgramiv, PFNGLGETPROGRAMIVPROC)
  LOAD_GL(glGetShaderiv, PFNGLGETSHADERIVPROC)
  LOAD_GL(glGetShaderInfoLog, PFNGLGETSHADERINFOLOGPROC)
  LOAD_GL(glGetString, PFNGLGETSTRINGPROC)
  LOAD_GL(glGetUniformLocation, PFNGLGETUNIFORMLOCATIONPROC)
  LOAD_GL(glLineWidth, PFNGLLINEWIDTHPROC)
  LOAD_GL(glLinkProgram, PFNGLLINKPROGRAMPROC)
  LOAD_GL(glPixelStorei, PFNGLPIXELSTOREIPROC)
  LOAD_GL(glPolygonOffset, PFNGLPOLYGONOFFSETPROC)
  LOAD_GL(glReadPixels, PFNGLREADPIXELSPROC)
  LOAD_GL(glRenderbufferStorage, PFNGLRENDERBUFFERSTORAGEPROC)
  LOAD_GL(glScissor, PFNGLSCISSORPROC)
  LOAD_GL(glShaderSource, PFNGLSHADERSOURCEPROC)
  LOAD_GL(glStencilFunc, PFNGLSTENCILFUNCPROC)
  LOAD_GL(glStencilFuncSeparate, PFNGLSTENCILFUNCSEPARATEPROC)
  LOAD_GL(glStencilMask, PFNGLSTENCILMASKPROC)
  LOAD_GL(glStencilMaskSeparate, PFNGLSTENCILMASKSEPARATEPROC)
  LOAD_GL(glStencilOp, PFNGLSTENCILOPPROC)
  LOAD_GL(glStencilOpSeparate, PFNGLSTENCILOPSEPARATEPROC)
  LOAD_GL(glTexImage2D, PFNGLTEXIMAGE2DPROC)
  LOAD_GL(glTexParameterf, PFNGLTEXPARAMETERFPROC)
  LOAD_GL(glTexParameteri, PFNGLTEXPARAMETERIPROC)
  LOAD_GL(glTexSubImage2D, PFNGLTEXSUBIMAGE2DPROC)
  LOAD_GL(glTexStorage2D, PFNGLTEXSTORAGE2DPROC)
  LOAD_GL(glUniform1f, PFNGLUNIFORM1FPROC)
  LOAD_GL(glUniform1fv, PFNGLUNIFORM1FVPROC)
  LOAD_GL(glUniform1i, PFNGLUNIFORM1IPROC)
  LOAD_GL(glUniform1iv, PFNGLUNIFORM1IVPROC)
  LOAD_GL(glUniform1ui, PFNGLUNIFORM1UIPROC)
  LOAD_GL(glUniform1uiv, PFNGLUNIFORM1UIVPROC)
  LOAD_GL(glUniform2f, PFNGLUNIFORM2FPROC)
  LOAD_GL(glUniform2fv, PFNGLUNIFORM2FVPROC)
  LOAD_GL(glUniform2i, PFNGLUNIFORM2IPROC)
  LOAD_GL(glUniform2iv, PFNGLUNIFORM2IVPROC)
  LOAD_GL(glUniform2ui, PFNGLUNIFORM2UIPROC)
  LOAD_GL(glUniform2uiv, PFNGLUNIFORM2UIVPROC)
  LOAD_GL(glUniform3f, PFNGLUNIFORM3FPROC)
  LOAD_GL(glUniform3fv, PFNGLUNIFORM3FVPROC)
  LOAD_GL(glUniform3i, PFNGLUNIFORM3IPROC)
  LOAD_GL(glUniform3iv, PFNGLUNIFORM3IVPROC)
  LOAD_GL(glUniform3ui, PFNGLUNIFORM3UIPROC)
  LOAD_GL(glUniform3uiv, PFNGLUNIFORM3UIVPROC)
  LOAD_GL(glUniform4f, PFNGLUNIFORM4FPROC)
  LOAD_GL(glUniform4fv, PFNGLUNIFORM4FVPROC)
  LOAD_GL(glUniform4i, PFNGLUNIFORM4IPROC)
  LOAD_GL(glUniform4iv, PFNGLUNIFORM4IVPROC)
  LOAD_GL(glUniform4ui, PFNGLUNIFORM4UIPROC)
  LOAD_GL(glUniform4uiv, PFNGLUNIFORM4UIVPROC)
  LOAD_GL(glUniformMatrix2fv, PFNGLUNIFORMMATRIX2FVPROC)
  LOAD_GL(glUniformMatrix3fv, PFNGLUNIFORMMATRIX3FVPROC)
  LOAD_GL(glUniformMatrix4fv, PFNGLUNIFORMMATRIX4FVPROC)
  LOAD_GL(glUseProgram, PFNGLUSEPROGRAMPROC)
  LOAD_GL(glVertexAttribDivisor, PFNGLVERTEXATTRIBDIVISORPROC)
  LOAD_GL(glVertexAttribPointer, PFNGLVERTEXATTRIBPOINTERPROC)
  LOAD_GL(glViewport, PFNGLVIEWPORTPROC)
#undef LOAD_GL
  return true;
}

#if defined(_WIN32)
extern "C" bool gea_three_webgl_attach_uwp(
  void *nativeWindow,
#else
extern "C" bool gea_three_webgl_attach(
  gea::apple::AppKit::NSView view,
#endif
  double width,
  double height,
  double devicePixelRatio
) {
  geaTrapCheck("gea_three_webgl_attach");
  smokeLog("[three-angle-metal] WebGL host attach requested");
  if (gWebGL.ready) return true;

#if defined(_WIN32)
  gWebGL.egl = LoadPackagedLibrary(L"libEGL.dll", 0);
  gWebGL.gles = LoadPackagedLibrary(L"libGLESv2.dll", 0);
#else
  static const char *const eglPaths[] = {
    "/Applications/Visual Studio Code.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libEGL.dylib",
    "/Applications/Cursor.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libEGL.dylib",
    "/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/149.0.7827.201/Libraries/libEGL.dylib",
    "/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/149.0.7827.197/Libraries/libEGL.dylib",
    nullptr,
  };
  static const char *const glesPaths[] = {
    "/Applications/Visual Studio Code.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libGLESv2.dylib",
    "/Applications/Cursor.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libGLESv2.dylib",
    "/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/149.0.7827.201/Libraries/libGLESv2.dylib",
    "/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/149.0.7827.197/Libraries/libGLESv2.dylib",
    nullptr,
  };

  gWebGL.egl = openFirst("GEA_ANGLE_EGL_DYLIB", eglPaths);
  gWebGL.gles = openFirst("GEA_ANGLE_GLES_DYLIB", glesPaths);
#endif
  if (!gWebGL.egl || !gWebGL.gles) {
    smokeLog("[three-angle-metal] ANGLE libEGL/libGLESv2 were not found");
    return false;
  }

  gWebGL.eglGetProcAddress = loadSymbol<PFNEGLGETPROCADDRESS>(gWebGL.egl, "eglGetProcAddress");
  auto eglInitialize = loadSymbol<PFNEGLINITIALIZEPROC>(gWebGL.egl, "eglInitialize");
  auto eglBindAPI = loadSymbol<PFNEGLBINDAPIPROC>(gWebGL.egl, "eglBindAPI");
  auto eglChooseConfig = loadSymbol<PFNEGLCHOOSECONFIGPROC>(gWebGL.egl, "eglChooseConfig");
  gWebGL.eglCreateWindowSurface = loadSymbol<PFNEGLCREATEWINDOWSURFACEPROC>(gWebGL.egl, "eglCreateWindowSurface");
  gWebGL.eglCreatePbufferSurface = loadSymbol<PFNEGLCREATEPBUFFERSURFACEPROC>(gWebGL.egl, "eglCreatePbufferSurface");
  auto eglCreateContext = loadSymbol<PFNEGLCREATECONTEXTPROC>(gWebGL.egl, "eglCreateContext");
  gWebGL.eglDestroySurface = loadSymbol<PFNEGLDESTROYSURFACEPROC>(gWebGL.egl, "eglDestroySurface");
  gWebGL.eglGetError = loadSymbol<PFNEGLGETERRORPROC>(gWebGL.egl, "eglGetError");
  gWebGL.eglMakeCurrent = loadSymbol<PFNEGLMAKECURRENTPROC>(gWebGL.egl, "eglMakeCurrent");
  gWebGL.eglSwapBuffers = loadSymbol<PFNEGLSWAPBUFFERSPROC>(gWebGL.egl, "eglSwapBuffers");
  // Optional: an older EGL without it simply keeps the driver default below.
  gWebGL.eglSwapInterval = loadSymbol<PFNEGLSWAPINTERVALPROC>(gWebGL.egl, "eglSwapInterval");
  if (!gWebGL.eglGetProcAddress || !eglInitialize || !eglBindAPI || !eglChooseConfig ||
      !eglCreateContext || !gWebGL.eglMakeCurrent || !gWebGL.eglSwapBuffers) {
    smokeLog("[three-angle-metal] required EGL symbols were missing");
    return false;
  }

  auto eglGetPlatformDisplayEXT =
    reinterpret_cast<PFNEGLGETPLATFORMDISPLAYEXTPROC>(gWebGL.eglGetProcAddress("eglGetPlatformDisplayEXT"));
  if (!eglGetPlatformDisplayEXT) {
    smokeLog("[three-angle-metal] eglGetPlatformDisplayEXT unavailable");
    return false;
  }

  const EGLint displayAttrs[] = {
    EGL_PLATFORM_ANGLE_TYPE_ANGLE,
#if defined(_WIN32)
    0x3208, // EGL_PLATFORM_ANGLE_TYPE_D3D11_ANGLE
#else
    EGL_PLATFORM_ANGLE_TYPE_METAL_ANGLE,
#endif
    EGL_NONE,
  };
  gWebGL.display = eglGetPlatformDisplayEXT(EGL_PLATFORM_ANGLE_ANGLE, EGL_DEFAULT_DISPLAY, displayAttrs);
  if (gWebGL.display == EGL_NO_DISPLAY) {
    logEglFailure("eglGetPlatformDisplayEXT");
    return false;
  }

  EGLint major = 0;
  EGLint minor = 0;
  if (eglInitialize(gWebGL.display, &major, &minor) == EGL_FALSE_VALUE) {
    logEglFailure("eglInitialize");
    return false;
  }
  if (eglBindAPI(EGL_OPENGL_ES_API) == EGL_FALSE_VALUE) {
    logEglFailure("eglBindAPI");
    return false;
  }

  const EGLint configAttrs[] = {
    EGL_SURFACE_TYPE, EGL_WINDOW_BIT | EGL_PBUFFER_BIT,
    EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT | EGL_OPENGL_ES2_BIT,
    EGL_RED_SIZE, 8,
    EGL_GREEN_SIZE, 8,
    EGL_BLUE_SIZE, 8,
    EGL_ALPHA_SIZE, 8,
    EGL_DEPTH_SIZE, 24,
    EGL_STENCIL_SIZE, 8,
    EGL_NONE,
  };
  EGLConfig config = nullptr;
  EGLint configCount = 0;
  if (eglChooseConfig(gWebGL.display, configAttrs, &config, 1, &configCount) == EGL_FALSE_VALUE || configCount < 1) {
    logEglFailure("eglChooseConfig");
    return false;
  }
  gWebGL.config = config;

#if defined(_WIN32)
  gWebGL.nativeWindow = nativeWindow;
  gea_three_webgl_update_size_uwp(width, height, devicePixelRatio);
  if (gWebGL.eglCreateWindowSurface) {
    gWebGL.surface = gWebGL.eglCreateWindowSurface(gWebGL.display, config, nativeWindow, nullptr);
  }
  if (gWebGL.surface == EGL_NO_SURFACE) {
    logEglFailure("eglCreateWindowSurface(CoreWindow)");
    return false;
  }
#else
  NSView *containerView = (__bridge NSView *)gea::apple::objc::object(view.handle);
  containerView.wantsLayer = YES;
  containerView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  [containerView layoutSubtreeIfNeeded];

  GeaAngleWebGLHostView *nativeView = [[GeaAngleWebGLHostView alloc] initWithFrame:containerView.bounds];
  [containerView addSubview:nativeView];
  gWebGL.hostView = nativeView;
  geaInstallPointerMonitor();
  gWebGL.devicePixelRatio = devicePixelRatio > 0.0 ? devicePixelRatio : 1.0;
  const double fallbackAspect = width > 0.0 && height > 0.0 ? width / height : 1.0;

  CAMetalLayer *metalLayer = [nativeView.layer isKindOfClass:CAMetalLayer.class]
    ? (CAMetalLayer *)nativeView.layer
    : [CAMetalLayer layer];
  nativeView.layer = metalLayer;
  gWebGL.metalLayer = metalLayer;
  syncHostViewSize(fallbackAspect);
  [nativeView displayIfNeeded];
  [nativeView layoutSubtreeIfNeeded];
  [CATransaction flush];

  if (gWebGL.eglCreateWindowSurface) {
    gWebGL.surface = gWebGL.eglCreateWindowSurface(gWebGL.display, config, (__bridge EGLNativeWindowType)metalLayer, nullptr);
  }
  if (gWebGL.surface == EGL_NO_SURFACE && gWebGL.eglCreatePbufferSurface) {
    logEglFailure("eglCreateWindowSurface");
    const EGLint surfaceAttrs[] = {
      EGL_WIDTH, static_cast<EGLint>(gWebGL.widthPx),
      EGL_HEIGHT, static_cast<EGLint>(gWebGL.heightPx),
      EGL_NONE,
    };
    gWebGL.surface = gWebGL.eglCreatePbufferSurface(gWebGL.display, config, surfaceAttrs);
  }
  if (gWebGL.surface == EGL_NO_SURFACE) {
    logEglFailure("eglCreatePbufferSurface");
    return false;
  }
  configureMetalLayerForPresentation(gWebGL.metalLayer);
#endif

  const EGLint contextAttrs[] = {
    EGL_CONTEXT_CLIENT_VERSION, 3,
    EGL_NONE,
  };
  gWebGL.context = eglCreateContext(gWebGL.display, config, EGL_NO_CONTEXT, contextAttrs);
  if (gWebGL.context == EGL_NO_CONTEXT) {
    logEglFailure("eglCreateContext");
    return false;
  }
  if (!makeCurrent("eglMakeCurrent")) return false;
  if (!loadGlSymbols()) return false;

  gWebGL.ready = true;
  gWebGL.glViewport(0, 0, gWebGL.widthPx, gWebGL.heightPx);
#if !defined(_WIN32)
  dispatch_async(dispatch_get_main_queue(), ^{
    if (gWebGL.ready && rebuildWindowSurface("eglCreateWindowSurface(deferred)")) {
      smokeLog("[three-angle-metal] WebGL EGL surface rebound at %dx%d", gWebGL.widthPx, gWebGL.heightPx);
    }
  });
#endif
  smokeLog("[native-webgl-angle] context attached, EGL %d.%d at %dx%d", major, minor, gWebGL.widthPx, gWebGL.heightPx);
  return true;
}

extern "C" double gea_three_webgl_sync_size(double fallbackAspect) {
  if (nativeFrameProfileEnabled()) {
    gProfileSizeSync = std::chrono::steady_clock::now();
    gProfileSizeSyncPending = true;
  }
  geaTrapCheck("gea_three_webgl_sync_size");
  if (std::getenv("GEA_WEBGL_HOST_DEBUG")) {
    smokeLog("[three-angle-metal] gea_three_webgl_sync_size begin fallback=%g ready=%d size=%dx%d",
             fallbackAspect, gWebGL.ready ? 1 : 0, gWebGL.widthPx, gWebGL.heightPx);
  }
  const double aspect = syncHostViewSize(fallbackAspect);
  gGpuFrameProfile.start();
  if (gWebGL.ready && gWebGL.glViewport) gWebGL.glViewport(0, 0, gWebGL.widthPx, gWebGL.heightPx);
  if (std::getenv("GEA_WEBGL_HOST_DEBUG")) {
    smokeLog("[three-angle-metal] gea_three_webgl_sync_size end aspect=%g size=%dx%d",
             aspect, gWebGL.widthPx, gWebGL.heightPx);
  }
  return aspect;
}

extern "C" double gea_three_webgl_width() {
  geaTrapCheck("gea_three_webgl_width");
  return static_cast<double>(gWebGL.widthPx);
}

extern "C" double gea_three_webgl_height() {
  geaTrapCheck("gea_three_webgl_height");
  return static_cast<double>(gWebGL.heightPx);
}

// The backing scale the host actually applied (window backingScaleFactor,
// refreshed by every syncHostViewSize) — the native analog of
// window.devicePixelRatio. widthPx/heightPx are DEVICE pixels; dividing by
// this yields the CSS-pixel (logical) size the web build lays out in.
extern "C" double gea_three_webgl_device_pixel_ratio() {
  geaTrapCheck("gea_three_webgl_device_pixel_ratio");
  return gWebGL.devicePixelRatio > 0.0 ? gWebGL.devicePixelRatio : 1.0;
}

extern "C" void gea_three_webgl_swap() {
  geaTrapCheck("gea_three_webgl_swap");
  if (!gWebGL.ready || !makeCurrent("eglMakeCurrent(swap)")) return;
  gGpuFrameProfile.finish();
  // GEA_WEBGL_FPS=1 — rolling real-time present cadence to stderr. Measures the
  // wall-clock interval between successive swaps (the true windowed frame rate,
  // which the vsync-free headless [gea.perf] cannot see). Harmless when unset.
  if (std::getenv("GEA_WEBGL_FPS")) {
    using clock = std::chrono::steady_clock;
    static clock::time_point last = clock::now();
    static clock::time_point windowStart = last;
    static int frames = 0;
    const clock::time_point nowTp = clock::now();
    ++frames;
    const double windowMs =
      std::chrono::duration<double, std::milli>(nowTp - windowStart).count();
    if (windowMs >= 1000.0) {
      const double dtMs =
        std::chrono::duration<double, std::milli>(nowTp - last).count();
      smokeLog("[gea.fps] %.1f fps over %d frames (%.0fms), last dt=%.2fms",
               frames * 1000.0 / windowMs, frames, windowMs, dtMs);
      frames = 0;
      windowStart = nowTp;
    }
    last = nowTp;
  }
  if (std::getenv("GEA_WEBGL_SAMPLE_PIXELS") && gWebGL.glReadPixels && gWebGL.glGetError && gWebGL.glGetIntegerv) {
    static int sampleCount = 0;
    if (sampleCount < 16 || sampleCount % 60 == 0) {
      unsigned char pixel[4] = {0, 0, 0, 0};
      GLint viewport[4] = {0, 0, 0, 0};
      GLint framebuffer = 0;
      gWebGL.glGetIntegerv(GL_VIEWPORT_VALUE, viewport);
      gWebGL.glGetIntegerv(GL_FRAMEBUFFER_BINDING_VALUE, &framebuffer);
      gWebGL.glReadPixels(
        std::max(0, gWebGL.widthPx / 2),
        std::max(0, gWebGL.heightPx / 2),
        1,
        1,
        GL_RGBA_VALUE,
        GL_UNSIGNED_BYTE,
        pixel
      );
      const GLenum readError = gWebGL.glGetError();
      smokeLog(
        "[three-angle-metal] swap sample frame=%d surface=%dx%d viewport=%d,%d,%d,%d framebuffer=%d center=%u,%u,%u,%u glError=0x%04x",
        sampleCount,
        gWebGL.widthPx,
        gWebGL.heightPx,
        viewport[0],
        viewport[1],
        viewport[2],
        viewport[3],
        framebuffer,
        pixel[0],
        pixel[1],
        pixel[2],
        pixel[3],
        readError
      );
    }
    sampleCount++;
  }
  // TEMP-DIAG: GEA_THREE_VIEW_DUMP=1 — at frame 60, log the window's full
  // subview tree and a hit-test grid so overlay views that would swallow
  // mouse events are visible without Accessibility permission.
#if !defined(_WIN32)
  if (std::getenv("GEA_THREE_VIEW_DUMP")) {
    static int viewDumpCount = 0;
    if (++viewDumpCount == 60) {
      NSView *host = gWebGL.hostView;
      NSWindow *window = host ? host.window : nil;
      NSView *content = window ? window.contentView : nil;
      if (content) {
        __block void (^walk)(NSView *, int) = nil;
        walk = ^(NSView *view, int depth) {
          smokeLog("[view-dump] %*s%s frame=(%.0f,%.0f %.0fx%.0f) hidden=%d", depth * 2, "",
                   object_getClassName(view), view.frame.origin.x, view.frame.origin.y,
                   view.frame.size.width, view.frame.size.height, view.isHidden ? 1 : 0);
          for (NSView *sub in view.subviews) walk(sub, depth + 1);
        };
        walk(content, 0);
        const CGFloat w = content.bounds.size.width;
        const CGFloat h = content.bounds.size.height;
        for (int gy = 1; gy < 8; gy += 2) {
          for (int gx = 1; gx < 8; gx += 2) {
            const NSPoint inContent = NSMakePoint(w * gx / 8.0, h * gy / 8.0);
            const NSPoint inSuper = [content.superview convertPoint:inContent fromView:content];
            NSView *hit = [content hitTest:inSuper];
            smokeLog("[hit-grid] (%.0f,%.0f) -> %s", inContent.x, inContent.y,
                     hit ? object_getClassName(hit) : "nil");
          }
        }
      } else {
        smokeLog("[view-dump] no window/content view");
      }
    }
  }
#endif
  // Debug frame dump: GEA_WEBGL_DUMP_FRAME=<path-prefix> writes the full
  // framebuffer of frames 90/180/300 as PPM (P6) — visual ground truth for
  // native-vs-browser comparisons without needing a window screenshot.
  if (const char *dumpPrefix = std::getenv("GEA_WEBGL_DUMP_FRAME"); dumpPrefix && gWebGL.glReadPixels) {
    static int dumpCount = 0;
    ++dumpCount;
    if (dumpCount == 90 || dumpCount == 180 || dumpCount == 300) {
      const int w = gWebGL.widthPx;
      const int h = gWebGL.heightPx;
      std::vector<unsigned char> rgba(static_cast<size_t>(w) * h * 4);
      gWebGL.glReadPixels(0, 0, w, h, GL_RGBA_VALUE, GL_UNSIGNED_BYTE, rgba.data());
      char path[512];
      std::snprintf(path, sizeof path, "%s-f%d.ppm", dumpPrefix, dumpCount);
      if (FILE *file = std::fopen(path, "wb")) {
        std::fprintf(file, "P6\n%d %d\n255\n", w, h);
        for (int y = h - 1; y >= 0; --y) {
          const unsigned char *row = rgba.data() + static_cast<size_t>(y) * w * 4;
          for (int x = 0; x < w; ++x) std::fwrite(row + x * 4, 1, 3, file);
        }
        std::fclose(file);
        smokeLog("[three-angle-metal] dumped frame %d to %s", dumpCount, path);
      }
    }
  }
  // Measure presentation separately from the display-link callback. The
  // latter includes this wait and cannot by itself distinguish frame work
  // from drawable/GPU backpressure. No clock reads run when profiling is off.
  const bool profile = nativeFrameProfileEnabled();
  using Clock = std::chrono::steady_clock;
  const auto swapBegin = profile ? Clock::now() : Clock::time_point{};
  if (gWebGL.eglSwapBuffers(gWebGL.display, gWebGL.surface) == EGL_FALSE_VALUE) {
    logEglFailure("eglSwapBuffers");
  }
  if (profile) {
    const auto end = Clock::now();
    static auto windowStart = swapBegin;
    static double totalMs = 0.0;
    static double frameWorkMs = 0.0;
    static unsigned timedFrames = 0;
    static double maximumMs = 0.0;
    static unsigned frames = 0;
    const double elapsedMs = std::chrono::duration<double, std::milli>(end - swapBegin).count();
    totalMs += elapsedMs;
    if (gProfileSizeSyncPending) {
      frameWorkMs += std::chrono::duration<double, std::milli>(swapBegin - gProfileSizeSync).count();
      ++timedFrames;
      gProfileSizeSyncPending = false;
    }
    maximumMs = std::max(maximumMs, elapsedMs);
    ++frames;
    if (std::chrono::duration<double>(end - windowStart).count() >= 1.0) {
      smokeLog("[gea.swap-profile] swap_mean_ms=%.3f swap_max_ms=%.3f size_sync_to_swap_mean_ms=%.3f timed_frames=%u frames=%u surface=%dx%d",
               totalMs / frames, maximumMs, timedFrames ? frameWorkMs / timedFrames : 0.0, timedFrames, frames, gWebGL.widthPx, gWebGL.heightPx);
      frames = 0;
      totalMs = frameWorkMs = maximumMs = 0.0;
      timedFrames = 0;
      windowStart = end;
    }
  }
}

enum WebGLOp {
  OP_CLEAR_COLOR = 1,
  OP_CLEAR = 2,
  OP_VIEWPORT = 3,
  OP_ENABLE = 4,
  OP_DISABLE = 5,
  OP_DEPTH_FUNC = 6,
  OP_DEPTH_MASK = 7,
  OP_COLOR_MASK = 8,
  OP_BLEND_FUNC = 9,
  OP_BLEND_FUNC_SEPARATE = 10,
  OP_BLEND_EQUATION = 11,
  OP_BLEND_EQUATION_SEPARATE = 12,
  OP_CULL_FACE = 13,
  OP_FRONT_FACE = 14,
  OP_CREATE_BUFFER = 15,
  OP_DELETE_BUFFER = 16,
  OP_BIND_BUFFER = 17,
  OP_CREATE_SHADER = 20,
  OP_SHADER_SOURCE = 21,
  OP_COMPILE_SHADER = 22,
  OP_GET_SHADER_PARAMETER = 23,
  OP_DELETE_SHADER = 24,
  OP_CREATE_PROGRAM = 25,
  OP_ATTACH_SHADER = 26,
  OP_LINK_PROGRAM = 27,
  OP_GET_PROGRAM_PARAMETER = 28,
  OP_DELETE_PROGRAM = 29,
  OP_USE_PROGRAM = 30,
  OP_GET_ATTRIB_LOCATION = 31,
  OP_GET_UNIFORM_LOCATION = 32,
  OP_ENABLE_VERTEX_ATTRIB_ARRAY = 33,
  OP_DISABLE_VERTEX_ATTRIB_ARRAY = 34,
  OP_VERTEX_ATTRIB_POINTER = 35,
  OP_UNIFORM_1F = 37,
  OP_UNIFORM_1I = 38,
  OP_UNIFORM_2F = 39,
  OP_UNIFORM_3F = 40,
  OP_UNIFORM_4F = 41,
  OP_DRAW_ELEMENTS = 42,
  OP_DRAW_ARRAYS = 43,
  OP_ACTIVE_TEXTURE = 44,
  OP_CREATE_TEXTURE = 45,
  OP_DELETE_TEXTURE = 46,
  OP_BIND_TEXTURE = 47,
  OP_TEX_PARAMETERI = 48,
  OP_PIXEL_STOREI = 49,
  OP_GENERATE_MIPMAP = 52,
  OP_CREATE_VERTEX_ARRAY = 53,
  OP_BIND_VERTEX_ARRAY = 54,
  OP_DELETE_VERTEX_ARRAY = 55,
  OP_GET_ERROR = 56,
  OP_SCISSOR = 57,
  OP_LINE_WIDTH = 58,
  OP_POLYGON_OFFSET = 59,
  OP_CLEAR_DEPTH = 60,
  OP_CLEAR_STENCIL = 61,
  OP_STENCIL_MASK = 62,
  OP_STENCIL_FUNC = 63,
  OP_STENCIL_OP = 64,
  OP_STENCIL_FUNC_SEPARATE = 65,
  OP_STENCIL_OP_SEPARATE = 66,
  OP_STENCIL_MASK_SEPARATE = 67,
  OP_CREATE_FRAMEBUFFER = 68,
  OP_BIND_FRAMEBUFFER = 69,
  OP_DELETE_FRAMEBUFFER = 70,
  OP_FRAMEBUFFER_TEXTURE_2D = 71,
  OP_CHECK_FRAMEBUFFER_STATUS = 72,
  OP_CREATE_RENDERBUFFER = 73,
  OP_BIND_RENDERBUFFER = 74,
  OP_RENDERBUFFER_STORAGE = 75,
  OP_FRAMEBUFFER_RENDERBUFFER = 76,
  OP_DELETE_RENDERBUFFER = 77,
  OP_DRAW_BUFFERS = 78,
};

static GLuint generatedBuffer() {
  GLuint handle = 0;
  gWebGL.glGenBuffers(1, &handle);
  return handle;
}

static GLuint generatedTexture() {
  GLuint handle = 0;
  gWebGL.glGenTextures(1, &handle);
  return handle;
}

static GLuint generatedVertexArray() {
  GLuint handle = 0;
  gWebGL.glGenVertexArrays(1, &handle);
  return handle;
}

static GLuint generatedFramebuffer() {
  GLuint handle = 0;
  gWebGL.glGenFramebuffers(1, &handle);
  return handle;
}

static GLuint generatedRenderbuffer() {
  GLuint handle = 0;
  gWebGL.glGenRenderbuffers(1, &handle);
  return handle;
}

static bool ensureWebGLCurrent(const char *step) {
  return gWebGL.ready && makeCurrent(step);
}

static GLenum asGLenum(double value) { return static_cast<GLenum>(value); }
static GLint asGLint(double value) { return static_cast<GLint>(value); }
static GLsizei asGLsizei(double value) { return static_cast<GLsizei>(value); }
static GLuint asGLuint(double value) { return static_cast<GLuint>(value); }
static GLbitfield asGLbitfield(double value) { return static_cast<GLbitfield>(value); }

static int vectorTypeCodeForGLType(double value) {
  const GLenum type = asGLenum(value);
  if (type == 0x1403) return 2; // UNSIGNED_SHORT
  if (type == 0x1405) return 3; // UNSIGNED_INT
  if (type == 0x1401) return 4; // UNSIGNED_BYTE
  return 1;
}

#if defined(GEA_PROFILE_ALLOCATIONS) || defined(GEA_PROFILE_NATIVE_FRAMES)
namespace {
using ProfileClock = std::chrono::steady_clock;
static double nativeThreadCpuMs() {
#if defined(_WIN32)
  FILETIME created{}, exited{}, kernel{}, user{};
  if (!GetThreadTimes(GetCurrentThread(), &created, &exited, &kernel, &user)) return 0;
  const auto ticks = [](const FILETIME& t) { return (static_cast<std::uint64_t>(t.dwHighDateTime) << 32) | t.dwLowDateTime; };
  return static_cast<double>(ticks(kernel) + ticks(user)) / 10000.0;
#else
  return 0;
#endif
}
struct NativeFrameProfile {
  double phases[4]{}, phaseCpu[4]{}, cpuStarted = 0, host[4]{};
  std::uint64_t calls[4]{};
  unsigned phase = 0, frames = 0;
  ProfileClock::time_point started{};
};
thread_local NativeFrameProfile nativeProfile;
struct NativeCallTime { const char* name = nullptr; double ms = 0; std::uint64_t calls = 0; };
thread_local NativeCallTime nativeCalls[128];
struct NativeHostProfile {
  unsigned category;
  const char* name;
  ProfileClock::time_point start = ProfileClock::now();
  explicit NativeHostProfile(const char* step) : category(std::strstr(step, "draw") ? 0 : std::strstr(step, "uniform") ? 1 : std::strstr(step, "buffer") || std::strstr(step, "Buffer") || std::strstr(step, "tex") ? 2 : 3), name(step) {}
  ~NativeHostProfile() {
    const double elapsed = std::chrono::duration<double, std::milli>(ProfileClock::now() - start).count();
    nativeProfile.host[category] += elapsed;
    for (auto& row : nativeCalls) {
      if (!row.name) row.name = name;
      if (row.name == name || std::strcmp(row.name, name) == 0) { row.ms += elapsed; ++row.calls; break; }
    }
    ++nativeProfile.calls[category];
  }
};
}
#define GEA_PROFILE_HOST(step) NativeHostProfile geaHostScope(step)
#else
#define GEA_PROFILE_HOST(step)
#endif

extern "C" void gea_three_native_profile_phase(double phaseValue) {
#if defined(GEA_PROFILE_ALLOCATIONS) || defined(GEA_PROFILE_NATIVE_FRAMES)
  auto& p = nativeProfile;
  const auto now = ProfileClock::now();
  const double cpu = nativeThreadCpuMs();
  const unsigned next = static_cast<unsigned>(phaseValue);
  if (p.phase) p.phaseCpu[p.phase] += cpu - p.cpuStarted;
  if (p.phase) p.phases[p.phase] += std::chrono::duration<double, std::milli>(now - p.started).count();
  if (p.phase == 2 && next == 0 && ++p.frames == 60) {
    std::fprintf(stderr, "[gea.regions] frames=%u update_ms=%.6f render_ms=%.6f scene_ms=%.6f update_cpu_ms=%.6f render_cpu_ms=%.6f scene_cpu_ms=%.6f draw_ms=%.6f uniform_ms=%.6f upload_ms=%.6f state_ms=%.6f draw_calls=%llu uniform_calls=%llu upload_calls=%llu state_calls=%llu\n",
      p.frames, p.phases[1] / p.frames, p.phases[2] / p.frames, p.phases[3] / p.frames, p.phaseCpu[1] / p.frames, p.phaseCpu[2] / p.frames, p.phaseCpu[3] / p.frames,
      p.host[0] / p.frames, p.host[1] / p.frames, p.host[2] / p.frames, p.host[3] / p.frames,
      p.calls[0], p.calls[1], p.calls[2], p.calls[3]);
    for (auto& row : nativeCalls) {
      if (row.calls) std::fprintf(stderr, "[gea.host] name=%s calls=%llu ms=%.6f\n", row.name, row.calls, row.ms);
      row = {};
    }
    p = {};
  }
  p.phase = next; p.started = now; p.cpuStarted = cpu;
#endif
}

#define GEA_WEBGL_VOID(step) GEA_PROFILE_HOST(step); if (!ensureWebGLCurrent(step)) return
#define GEA_WEBGL_DOUBLE(step) GEA_PROFILE_HOST(step); if (!ensureWebGLCurrent(step)) return 0.0

// GEA_WEBGL_TRAP=1: poll glGetError at every intrinsic ENTRY and log the
// first offenders. GL errors are sticky until polled, so the intrinsic that
// OBSERVES the error ran right after the intrinsic that PRODUCED it — the
// log sequence pins the producer of the chronic per-frame GL_INVALID_OPERATION.
static void geaTrapCheck(const char *where) {
  if (!nativeWebGLTrapEnabled() || !gWebGL.glGetError || !gWebGL.ready) return;
  static int logged = 0;
  if (logged >= 60) return;
  const GLenum err = gWebGL.glGetError();
  if (err == 0) return;
  ++logged;
  smokeLog("[gea-webgl-trap] error=0x%04x observed entering %s", err, where);
}

#if defined(GEA_PROFILE_ALLOCATIONS) || defined(GEA_PROFILE_NATIVE_FRAMES) || defined(_WIN32)
// Streaming policies preserve the GL object identity (and VAO
// references). Only known full vertex/index replacements may discard storage.
// Partial updates and other targets always retain the ordinary subdata path.
struct NativeBufferState { GLsizeiptr size = 0; GLenum usage = 0; GLuint staging[3]{}; unsigned next = 0; };
static GLuint gArrayBuffer = 0, gCopyReadBuffer = 0, gCopyWriteBuffer = 0;
static std::unordered_map<GLuint, NativeBufferState> gBuffers;
static GLuint nativeUploadBuffer(GLenum target) {
  if (target == 0x8892) return gArrayBuffer;
  if (target == 0x8893) {
    // The element binding belongs to the current VAO. Query it instead of
    // shadowing one global binding that becomes stale on a VAO switch.
    GLint buffer = 0;
    gWebGL.glGetIntegerv(0x8895, &buffer);
    return static_cast<GLuint>(buffer);
  }
  return 0;
}
static int nativeBufferStreamingMode() {
  static const int mode = [] {
    const char* value = std::getenv("GEA_WEBGL_BUFFER_STREAMING");
    if (value) return std::atoi(value);
#if defined(_WIN32)
    return 8; // D3D11: stage vertex writes; retain CPU-accessible index data.
#else
    return 0;
#endif
  }();
  return mode;
}
static GLint nativeUploadUniformLimit() {
  static const GLint limit = [] {
    GLint value = 0;
    gWebGL.glGetIntegerv(0x8A30, &value); // MAX_UNIFORM_BLOCK_SIZE
    return value;
  }();
  return limit;
}
static void bindNativeBuffer(GLenum target, GLuint handle) {
  gWebGL.glBindBuffer(target, handle);
#if !defined(GEA_PROFILE_ALLOCATIONS) && !defined(GEA_PROFILE_NATIVE_FRAMES)
  if (nativeBufferStreamingMode() == 0) return;
#endif
  if (target == 0x8892) gArrayBuffer = handle;
  if (target == 0x8F36) gCopyReadBuffer = handle;
  if (target == 0x8F37) gCopyWriteBuffer = handle;
}
static void deleteNativeBuffer(GLuint handle) {
  gWebGL.glDeleteBuffers(1, &handle);
#if !defined(GEA_PROFILE_ALLOCATIONS) && !defined(GEA_PROFILE_NATIVE_FRAMES)
  if (nativeBufferStreamingMode() == 0) return;
#endif
  const auto found = gBuffers.find(handle);
  if (found != gBuffers.end()) gWebGL.glDeleteBuffers(3, found->second.staging);
  gBuffers.erase(handle);
  if (gArrayBuffer == handle) gArrayBuffer = 0;
  if (gCopyReadBuffer == handle) gCopyReadBuffer = 0;
  if (gCopyWriteBuffer == handle) gCopyWriteBuffer = 0;
}
static void nativeBufferData(GLenum target, GLsizeiptr size, const void* bytes, GLenum usage) {
  gWebGL.glBufferData(target, size, bytes, usage);
#if !defined(GEA_PROFILE_ALLOCATIONS) && !defined(GEA_PROFILE_NATIVE_FRAMES)
  if (nativeBufferStreamingMode() == 0) return;
#endif
  const GLuint buffer = nativeUploadBuffer(target);
  if (buffer && size >= 0) {
    auto& state = gBuffers[buffer];
    if (state.size != size) { gWebGL.glDeleteBuffers(3, state.staging); state = {}; }
    state.size = size; state.usage = usage;
  }
}
static void nativeBufferSubData(GLenum target, GLintptr offset, GLsizeiptr size, const void* bytes) {
#if !defined(GEA_PROFILE_ALLOCATIONS) && !defined(GEA_PROFILE_NATIVE_FRAMES)
  if (nativeBufferStreamingMode() == 0) { gWebGL.glBufferSubData(target, offset, size, bytes); return; }
#endif
  const GLuint buffer = nativeUploadBuffer(target);
  const auto found = gBuffers.find(buffer);
  const bool full = found != gBuffers.end() && offset == 0 && size > 0 && size == found->second.size;
  const int mode = nativeBufferStreamingMode();
  // 1..4 retain the original vertex-only experiments. 5/6 include indices;
  // 7 isolates index streaming; 8 combines vertex staging with dynamic indices.
  // 9 writes small vertex staging buffers through uniform storage. ANGLE D3D11
  // maps this storage with WRITE_DISCARD instead of waiting on a staging map.
  const bool eligible = full && (mode >= 5 || target == 0x8892);
#if defined(GEA_PROFILE_ALLOCATIONS) || defined(GEA_PROFILE_NATIVE_FRAMES)
  const auto start = ProfileClock::now();
#endif
  if (eligible && (mode == 4 || mode == 6 || ((mode == 8 || mode == 9) && target == 0x8892)) && gWebGL.glCopyBufferSubData) {
    auto& state = found->second;
    if (!state.staging[0]) {
      gWebGL.glGenBuffers(3, state.staging);
      for (GLuint staging : state.staging) {
        gWebGL.glBindBuffer(0x8F36, staging);
        gWebGL.glBufferData(0x8F36, size, nullptr, 0x88E4);
      }
    }
    // Rotate upload storage while keeping the destination's object identity,
    // so every existing VAO continues referencing the correct buffer.
    const GLuint staging = state.staging[state.next];
    gWebGL.glBindBuffer(0x8F36, staging);
    state.next = (state.next + 1) % 3;
    if (mode == 9 && size <= nativeUploadUniformLimit()) {
      // Query rather than shadow this binding: bindBufferBase/Range may also
      // change it. The destination GL object, usage and VAOs remain untouched.
      GLint uniform = 0;
      gWebGL.glGetIntegerv(0x8A28, &uniform); // UNIFORM_BUFFER_BINDING
      gWebGL.glBindBuffer(0x8A11, staging); // UNIFORM_BUFFER
      gWebGL.glBufferSubData(0x8A11, 0, size, bytes);
      gWebGL.glBindBuffer(0x8A11, static_cast<GLuint>(uniform));
    } else {
      gWebGL.glBufferSubData(0x8F36, 0, size, bytes);
    }
    gWebGL.glBindBuffer(0x8F37, buffer);
    gWebGL.glCopyBufferSubData(0x8F36, 0x8F37, 0, 0, size);
    gWebGL.glBindBuffer(0x8F36, gCopyReadBuffer);
    gWebGL.glBindBuffer(0x8F37, gCopyWriteBuffer);
  } else if (eligible && mode == 1) {
    gWebGL.glBufferData(target, size, nullptr, found->second.usage);
    gWebGL.glBufferSubData(target, offset, size, bytes);
  } else if (eligible && (mode == 3 || mode == 5 || ((mode == 7 || mode == 8 || mode == 9) && target == 0x8893))) {
    gWebGL.glBufferData(target, size, bytes, 0x88E0); // STREAM_DRAW selects ANGLE dynamic storage.
  } else if (eligible && mode == 2) {
    gWebGL.glBufferData(target, size, bytes, found->second.usage);
  } else {
    gWebGL.glBufferSubData(target, offset, size, bytes);
  }
#if defined(GEA_PROFILE_ALLOCATIONS) || defined(GEA_PROFILE_NATIVE_FRAMES)
  // Fixed storage keeps the profiler from contributing per-upload heap work.
  struct Row { GLuint buffer = 0; GLsizeiptr size = 0; GLintptr offset = 0; GLenum target = 0, usage = 0; unsigned calls = 0, full = 0; double ms = 0, maximum = 0; };
  static Row rows[32];
  static auto window = start;
  const double elapsed = std::chrono::duration<double, std::milli>(ProfileClock::now() - start).count();
  for (auto& row : rows) {
    if (row.calls && (row.buffer != buffer || row.size != size || row.offset != offset || row.target != target)) continue;
    row.buffer = buffer; row.size = size; row.offset = offset; row.target = target;
    row.usage = found != gBuffers.end() ? found->second.usage : 0;
    ++row.calls; row.full += full; row.ms += elapsed; row.maximum = std::max(row.maximum, elapsed);
    break;
  }
  if (std::chrono::duration<double>(start - window).count() >= 1.0) {
    for (auto& row : rows) {
      if (row.calls) std::fprintf(stderr, "[gea.buffer] mode=%d buffer=%u target=%u usage=%u bytes=%lld offset=%lld calls=%u full=%u ms=%.6f max_ms=%.6f\n",
        mode, row.buffer, row.target, row.usage, static_cast<long long>(row.size), static_cast<long long>(row.offset), row.calls, row.full, row.ms, row.maximum);
      row = {};
    }
    window = start;
  }
#endif
}

// Streaming experiment ends here.
#else
static void bindNativeBuffer(GLenum target, GLuint handle) { gWebGL.glBindBuffer(target, handle); }
static void deleteNativeBuffer(GLuint handle) { gWebGL.glDeleteBuffers(1, &handle); }
static void nativeBufferData(GLenum target, GLsizeiptr size, const void* bytes, GLenum usage) { gWebGL.glBufferData(target, size, bytes, usage); }
static void nativeBufferSubData(GLenum target, GLintptr offset, GLsizeiptr size, const void* bytes) { gWebGL.glBufferSubData(target, offset, size, bytes); }
#endif

extern "C" double gea_three_webgl_create_buffer() {
  geaTrapCheck("gea_three_webgl_create_buffer"); GEA_WEBGL_DOUBLE("createBuffer"); return generatedBuffer(); }
extern "C" void gea_three_webgl_delete_buffer(double buffer) {
  geaTrapCheck("gea_three_webgl_delete_buffer"); GEA_WEBGL_VOID("deleteBuffer"); deleteNativeBuffer(asGLuint(buffer)); }
extern "C" void gea_three_webgl_bind_buffer(double target, double buffer) {
  geaTrapCheck("gea_three_webgl_bind_buffer"); GEA_WEBGL_VOID("bindBuffer"); bindNativeBuffer(asGLenum(target), asGLuint(buffer)); }

extern "C" double gea_three_webgl_create_shader(double type) {
  geaTrapCheck("gea_three_webgl_create_shader"); GEA_WEBGL_DOUBLE("createShader"); return gWebGL.glCreateShader(asGLenum(type)); }
extern "C" void gea_three_webgl_shader_source(double shader, std::string source) {
  geaTrapCheck("gea_three_webgl_shader_source");
  GEA_WEBGL_VOID("shaderSource");
  const char *sourceBytes = source.c_str();
  const GLint length = static_cast<GLint>(source.size());
  gWebGL.glShaderSource(asGLuint(shader), 1, &sourceBytes, &length);
}
extern "C" void gea_three_webgl_compile_shader(double shader) {
  geaTrapCheck("gea_three_webgl_compile_shader");
  GEA_WEBGL_VOID("compileShader");
  gWebGL.glCompileShader(asGLuint(shader));
}
extern "C" double gea_three_webgl_get_shader_parameter(double shader, double pname) {
  geaTrapCheck("gea_three_webgl_get_shader_parameter");
  GEA_WEBGL_DOUBLE("getShaderParameter");
  GLint value = 0;
  gWebGL.glGetShaderiv(asGLuint(shader), asGLenum(pname), &value);
  return value;
}
extern "C" void gea_three_webgl_delete_shader(double shader) {
  geaTrapCheck("gea_three_webgl_delete_shader"); GEA_WEBGL_VOID("deleteShader"); gWebGL.glDeleteShader(asGLuint(shader)); }

extern "C" double gea_three_webgl_create_program() {
  geaTrapCheck("gea_three_webgl_create_program"); GEA_WEBGL_DOUBLE("createProgram"); return gWebGL.glCreateProgram(); }
extern "C" void gea_three_webgl_attach_shader(double program, double shader) {
  geaTrapCheck("gea_three_webgl_attach_shader"); GEA_WEBGL_VOID("attachShader"); gWebGL.glAttachShader(asGLuint(program), asGLuint(shader)); }
extern "C" void gea_three_webgl_link_program(double program) {
  geaTrapCheck("gea_three_webgl_link_program");
  GEA_WEBGL_VOID("linkProgram");
  gWebGL.glLinkProgram(asGLuint(program));
}
extern "C" double gea_three_webgl_get_program_parameter(double program, double pname) {
  geaTrapCheck("gea_three_webgl_get_program_parameter");
  GEA_WEBGL_DOUBLE("getProgramParameter");
  GLint value = 0;
  gWebGL.glGetProgramiv(asGLuint(program), asGLenum(pname), &value);
  return value;
}
extern "C" void gea_three_webgl_delete_program(double program) {
  geaTrapCheck("gea_three_webgl_delete_program"); GEA_WEBGL_VOID("deleteProgram"); gWebGL.glDeleteProgram(asGLuint(program)); }
extern "C" void gea_three_webgl_use_program(double program) {
  geaTrapCheck("gea_three_webgl_use_program"); GEA_WEBGL_VOID("useProgram");
  if (nativeWebGLTrapEnabled()) {
    static int logged = 0;
    if (logged++ < 40) smokeLog("[gea-webgl-trap] useProgram(%f -> %u)", program, asGLuint(program));
  }
  gWebGL.glUseProgram(asGLuint(program)); }
extern "C" double gea_three_webgl_get_attrib_location(double program, std::string name) {
  geaTrapCheck("gea_three_webgl_get_attrib_location");
  GEA_WEBGL_DOUBLE("getAttribLocation");
  return gWebGL.glGetAttribLocation(asGLuint(program), name.c_str());
}
extern "C" double gea_three_webgl_get_uniform_location(double program, std::string name) {
  geaTrapCheck("gea_three_webgl_get_uniform_location");
  GEA_WEBGL_DOUBLE("getUniformLocation");
  const GLint loc = gWebGL.glGetUniformLocation(asGLuint(program), name.c_str());
  if (nativeWebGLTrapEnabled()) {
    static int logged = 0;
    if (logged++ < 120) {
      smokeLog("[gea-webgl-trap] getUniformLocation(prog=%u, %s) = %d", asGLuint(program), name.c_str(), loc);
    }
  }
  return loc;
}

// Active-uniform/attrib reflection, serialized as "name|type|size" (empty
// string past the end). This is REAL driver reflection via ANGLE — the TS shim
// must NOT reconstruct it by text-parsing GLSL: three.js relies on
// glGetActiveUniform semantics (struct arrays expanded per member as
// "lights[0].member", basic arrays reported as "name[0]" with size=N) to build
// its uniform upload tree; a source-text parser misses #define-sized arrays
// and struct expansion, which silently kills all struct uniforms (lights).
static std::string geaActiveInfoString(bool uniform, double program, double index) {
  GLchar name[512] = {0};
  GLsizei length = 0;
  GLint size = 0;
  GLenum type = 0;
  if (uniform) {
    if (!gWebGL.glGetActiveUniform) return std::string();
    gWebGL.glGetActiveUniform(asGLuint(program), asGLuint(index), sizeof name, &length, &size, &type, name);
  } else {
    if (!gWebGL.glGetActiveAttrib) return std::string();
    gWebGL.glGetActiveAttrib(asGLuint(program), asGLuint(index), sizeof name, &length, &size, &type, name);
  }
  if (length <= 0) return std::string();
  std::string out(name, static_cast<size_t>(length));
  out += "|";
  out += std::to_string(static_cast<unsigned>(type));
  out += "|";
  out += std::to_string(size);
  if (nativeWebGLTrapEnabled()) {
    static int logged = 0;
    if (logged++ < 240) {
      smokeLog("[gea-webgl-trap] active%s(prog=%u, index=%u, name=%s, type=%u, size=%d)",
               uniform ? "Uniform" : "Attrib", asGLuint(program), asGLuint(index), name,
               static_cast<unsigned>(type), size);
    }
  }
  return out;
}
extern "C" std::string gea_three_webgl_get_active_uniform_info(double program, double index) {
  geaTrapCheck("gea_three_webgl_get_active_uniform_info");
  if (!ensureWebGLCurrent("getActiveUniform")) return std::string();
  return geaActiveInfoString(true, program, index);
}
extern "C" std::string gea_three_webgl_get_active_attrib_info(double program, double index) {
  geaTrapCheck("gea_three_webgl_get_active_attrib_info");
  if (!ensureWebGLCurrent("getActiveAttrib")) return std::string();
  return geaActiveInfoString(false, program, index);
}

extern "C" void gea_three_webgl_enable_vertex_attrib_array(double index) {
  geaTrapCheck("gea_three_webgl_enable_vertex_attrib_array"); GEA_WEBGL_VOID("enableVertexAttribArray"); gWebGL.glEnableVertexAttribArray(asGLuint(index)); }
extern "C" void gea_three_webgl_disable_vertex_attrib_array(double index) {
  geaTrapCheck("gea_three_webgl_disable_vertex_attrib_array"); GEA_WEBGL_VOID("disableVertexAttribArray"); gWebGL.glDisableVertexAttribArray(asGLuint(index)); }
extern "C" void gea_three_webgl_vertex_attrib_pointer(double index, double size, double type, double normalized, double stride, double offset) {
  geaTrapCheck("gea_three_webgl_vertex_attrib_pointer");
  GEA_WEBGL_VOID("vertexAttribPointer");
  gWebGL.glVertexAttribPointer(
    asGLuint(index),
    asGLint(size),
    asGLenum(type),
    normalized != 0.0,
    asGLsizei(stride),
    reinterpret_cast<const void *>(static_cast<std::uintptr_t>(offset))
  );
}

extern "C" void gea_three_webgl_uniform_1f(double location, double x) {
  geaTrapCheck("gea_three_webgl_uniform_1f"); GEA_WEBGL_VOID("uniform1f");
  gWebGL.glUniform1f(asGLint(location), static_cast<GLfloat>(x)); }
extern "C" void gea_three_webgl_uniform_1i(double location, double x) {
  geaTrapCheck("gea_three_webgl_uniform_1i"); GEA_WEBGL_VOID("uniform1i");
  gWebGL.glUniform1i(asGLint(location), asGLint(x)); }
extern "C" void gea_three_webgl_uniform_1ui(double location, double x) {
  geaTrapCheck("gea_three_webgl_uniform_1ui"); GEA_WEBGL_VOID("uniform1ui"); gWebGL.glUniform1ui(asGLint(location), asGLuint(x)); }
extern "C" void gea_three_webgl_uniform_2f(double location, double x, double y) {
  geaTrapCheck("gea_three_webgl_uniform_2f"); GEA_WEBGL_VOID("uniform2f");
  gWebGL.glUniform2f(asGLint(location), static_cast<GLfloat>(x), static_cast<GLfloat>(y)); }
extern "C" void gea_three_webgl_uniform_2i(double location, double x, double y) {
  geaTrapCheck("gea_three_webgl_uniform_2i"); GEA_WEBGL_VOID("uniform2i"); gWebGL.glUniform2i(asGLint(location), asGLint(x), asGLint(y)); }
extern "C" void gea_three_webgl_uniform_2ui(double location, double x, double y) {
  geaTrapCheck("gea_three_webgl_uniform_2ui"); GEA_WEBGL_VOID("uniform2ui"); gWebGL.glUniform2ui(asGLint(location), asGLuint(x), asGLuint(y)); }
extern "C" void gea_three_webgl_uniform_3f(double location, double x, double y, double z) {
  geaTrapCheck("gea_three_webgl_uniform_3f"); GEA_WEBGL_VOID("uniform3f");
  gWebGL.glUniform3f(asGLint(location), static_cast<GLfloat>(x), static_cast<GLfloat>(y), static_cast<GLfloat>(z)); }
extern "C" void gea_three_webgl_uniform_3i(double location, double x, double y, double z) {
  geaTrapCheck("gea_three_webgl_uniform_3i"); GEA_WEBGL_VOID("uniform3i"); gWebGL.glUniform3i(asGLint(location), asGLint(x), asGLint(y), asGLint(z)); }
extern "C" void gea_three_webgl_uniform_3ui(double location, double x, double y, double z) {
  geaTrapCheck("gea_three_webgl_uniform_3ui"); GEA_WEBGL_VOID("uniform3ui"); gWebGL.glUniform3ui(asGLint(location), asGLuint(x), asGLuint(y), asGLuint(z)); }
extern "C" void gea_three_webgl_uniform_4f(double location, double x, double y, double z, double w) {
  geaTrapCheck("gea_three_webgl_uniform_4f"); GEA_WEBGL_VOID("uniform4f"); gWebGL.glUniform4f(asGLint(location), static_cast<GLfloat>(x), static_cast<GLfloat>(y), static_cast<GLfloat>(z), static_cast<GLfloat>(w)); }
extern "C" void gea_three_webgl_uniform_4i(double location, double x, double y, double z, double w) {
  geaTrapCheck("gea_three_webgl_uniform_4i"); GEA_WEBGL_VOID("uniform4i"); gWebGL.glUniform4i(asGLint(location), asGLint(x), asGLint(y), asGLint(z), asGLint(w)); }
extern "C" void gea_three_webgl_uniform_4ui(double location, double x, double y, double z, double w) {
  geaTrapCheck("gea_three_webgl_uniform_4ui"); GEA_WEBGL_VOID("uniform4ui"); gWebGL.glUniform4ui(asGLint(location), asGLuint(x), asGLuint(y), asGLuint(z), asGLuint(w)); }

extern "C" double gea_three_webgl_create_texture() {
  geaTrapCheck("gea_three_webgl_create_texture"); GEA_WEBGL_DOUBLE("createTexture"); return generatedTexture(); }
extern "C" void gea_three_webgl_delete_texture(double texture) {
  geaTrapCheck("gea_three_webgl_delete_texture"); GEA_WEBGL_VOID("deleteTexture"); GLuint handle = asGLuint(texture); gWebGL.glDeleteTextures(1, &handle); }
extern "C" void gea_three_webgl_bind_texture(double target, double texture) {
  geaTrapCheck("gea_three_webgl_bind_texture"); GEA_WEBGL_VOID("bindTexture"); gWebGL.glBindTexture(asGLenum(target), asGLuint(texture)); }
extern "C" void gea_three_webgl_active_texture(double texture) {
  geaTrapCheck("gea_three_webgl_active_texture"); GEA_WEBGL_VOID("activeTexture"); gWebGL.glActiveTexture(asGLenum(texture)); }
extern "C" void gea_three_webgl_tex_parameteri(double target, double pname, double param) {
  geaTrapCheck("gea_three_webgl_tex_parameteri"); GEA_WEBGL_VOID("texParameteri");
  gWebGL.glTexParameteri(asGLenum(target), asGLenum(pname), asGLint(param));
}
extern "C" void gea_three_webgl_pixel_storei(double pname, double param) {
  geaTrapCheck("gea_three_webgl_pixel_storei"); GEA_WEBGL_VOID("pixelStorei");
  const GLenum glPname = asGLenum(pname);
  // UNPACK_FLIP_Y_WEBGL (0x9240), UNPACK_PREMULTIPLY_ALPHA_WEBGL (0x9241) and
  // UNPACK_COLORSPACE_CONVERSION_WEBGL (0x9243) are WebGL-only client-side
  // pixel-store parameters: a browser's WebGL layer consumes them (applying any
  // flip/premultiply in software during texImage) and never forwards them to
  // GL. ANGLE ES3 has no such enums and rejects them with GL_INVALID_ENUM —
  // three.js sets all three on every texture upload, which is the source of the
  // frame-0 0x0500 seen at startup (later tex_parameteri/tex_storage_2d calls
  // only observe that sticky error). This host performs no GL-side flip either
  // way, so dropping these to match browser semantics is behaviour-preserving
  // and keeps the GL error state clean.
  if (glPname == 0x9240 || glPname == 0x9241 || glPname == 0x9243) return;
  gWebGL.glPixelStorei(glPname, asGLint(param)); }
extern "C" void gea_three_webgl_generate_mipmap(double target) {
  geaTrapCheck("gea_three_webgl_generate_mipmap"); GEA_WEBGL_VOID("generateMipmap"); gWebGL.glGenerateMipmap(asGLenum(target)); }

extern "C" double gea_three_webgl_create_vertex_array() {
  geaTrapCheck("gea_three_webgl_create_vertex_array"); GEA_WEBGL_DOUBLE("createVertexArray"); return generatedVertexArray(); }
extern "C" void gea_three_webgl_bind_vertex_array(double vertexArray) {
  geaTrapCheck("gea_three_webgl_bind_vertex_array"); GEA_WEBGL_VOID("bindVertexArray"); gWebGL.glBindVertexArray(asGLuint(vertexArray)); }
extern "C" void gea_three_webgl_delete_vertex_array(double vertexArray) {
  geaTrapCheck("gea_three_webgl_delete_vertex_array"); GEA_WEBGL_VOID("deleteVertexArray"); GLuint handle = asGLuint(vertexArray); gWebGL.glDeleteVertexArrays(1, &handle); }

extern "C" double gea_three_webgl_create_framebuffer() {
  geaTrapCheck("gea_three_webgl_create_framebuffer"); GEA_WEBGL_DOUBLE("createFramebuffer"); return generatedFramebuffer(); }
extern "C" void gea_three_webgl_bind_framebuffer(double target, double framebuffer) {
  geaTrapCheck("gea_three_webgl_bind_framebuffer"); GEA_WEBGL_VOID("bindFramebuffer");
  if (nativeShadowColorAuditEnabled()) {
    static int bindLogs = 0;
    if (bindLogs++ < 80) smokeLog("[shadow-color-state] bindFramebuffer target=0x%04x fbo=%u", asGLenum(target), asGLuint(framebuffer));
  }
  if (nativeShadowColorAuditEnabled() && gWebGL.glReadPixels && gWebGL.glGetIntegerv && gWebGL.glGetError) {
    static GLuint previousFramebuffer = 0;
    static bool auditedShadowTarget = false;
    const GLuint nextFramebuffer = asGLuint(framebuffer);
    if (previousFramebuffer != 0 && nextFramebuffer == 0 && !auditedShadowTarget) {
      GLint viewport[4] = {0, 0, 0, 0};
      gWebGL.glGetIntegerv(0x0BA2 /* GL_VIEWPORT */, viewport);
      if (viewport[2] == 2048 && viewport[3] == 2048) {
        const size_t pixelCount = static_cast<size_t>(viewport[2]) * static_cast<size_t>(viewport[3]);
        std::vector<uint8_t> rgba(pixelCount * 4);
        while (gWebGL.glGetError() != 0) {}
        gWebGL.glReadPixels(viewport[0], viewport[1], viewport[2], viewport[3],
                            0x1908 /* GL_RGBA */, 0x1401 /* GL_UNSIGNED_BYTE */, rgba.data());
        size_t nonWhite = 0;
        uint8_t minimum = 255;
        uint8_t maximum = 0;
        for (size_t i = 0; i < pixelCount; ++i) {
          const uint8_t r = rgba[i * 4];
          const uint8_t g = rgba[i * 4 + 1];
          const uint8_t b = rgba[i * 4 + 2];
          minimum = std::min(minimum, std::min(r, std::min(g, b)));
          maximum = std::max(maximum, std::max(r, std::max(g, b)));
          if (r != 255 || g != 255 || b != 255) ++nonWhite;
        }
        const GLenum error = gWebGL.glGetError();
        smokeLog("[shadow-color-audit] fbo=%u viewport=%d,%d %dx%d nonWhite=%zu/%zu min=%u max=%u error=0x%04x",
                 previousFramebuffer, viewport[0], viewport[1], viewport[2], viewport[3], nonWhite, pixelCount,
                 static_cast<unsigned>(minimum), static_cast<unsigned>(maximum), error);
        auditedShadowTarget = true;
      }
    }
    previousFramebuffer = nextFramebuffer;
  }
  gWebGL.glBindFramebuffer(asGLenum(target), asGLuint(framebuffer)); }
extern "C" void gea_three_webgl_delete_framebuffer(double framebuffer) {
  geaTrapCheck("gea_three_webgl_delete_framebuffer"); GEA_WEBGL_VOID("deleteFramebuffer"); GLuint handle = asGLuint(framebuffer); gWebGL.glDeleteFramebuffers(1, &handle); }
extern "C" void gea_three_webgl_framebuffer_texture_2d(double target, double attachment, double textarget, double texture, double level) {
  geaTrapCheck("gea_three_webgl_framebuffer_texture_2d"); GEA_WEBGL_VOID("framebufferTexture2D");
  gWebGL.glFramebufferTexture2D(asGLenum(target), asGLenum(attachment), asGLenum(textarget), asGLuint(texture), asGLint(level)); }
extern "C" double gea_three_webgl_check_framebuffer_status(double target) {
  geaTrapCheck("gea_three_webgl_check_framebuffer_status"); GEA_WEBGL_DOUBLE("checkFramebufferStatus"); return gWebGL.glCheckFramebufferStatus(asGLenum(target)); }
extern "C" double gea_three_webgl_create_renderbuffer() {
  geaTrapCheck("gea_three_webgl_create_renderbuffer"); GEA_WEBGL_DOUBLE("createRenderbuffer"); return generatedRenderbuffer(); }
extern "C" void gea_three_webgl_bind_renderbuffer(double target, double renderbuffer) {
  geaTrapCheck("gea_three_webgl_bind_renderbuffer"); GEA_WEBGL_VOID("bindRenderbuffer"); gWebGL.glBindRenderbuffer(asGLenum(target), asGLuint(renderbuffer)); }
extern "C" void gea_three_webgl_delete_renderbuffer(double renderbuffer) {
  geaTrapCheck("gea_three_webgl_delete_renderbuffer"); GEA_WEBGL_VOID("deleteRenderbuffer"); GLuint handle = asGLuint(renderbuffer); gWebGL.glDeleteRenderbuffers(1, &handle); }
extern "C" void gea_three_webgl_renderbuffer_storage(double target, double internalFormat, double width, double height) {
  geaTrapCheck("gea_three_webgl_renderbuffer_storage"); GEA_WEBGL_VOID("renderbufferStorage"); gWebGL.glRenderbufferStorage(asGLenum(target), asGLenum(internalFormat), asGLsizei(width), asGLsizei(height)); }
extern "C" void gea_three_webgl_framebuffer_renderbuffer(double target, double attachment, double renderbuffertarget, double renderbuffer) {
  geaTrapCheck("gea_three_webgl_framebuffer_renderbuffer"); GEA_WEBGL_VOID("framebufferRenderbuffer"); gWebGL.glFramebufferRenderbuffer(asGLenum(target), asGLenum(attachment), asGLenum(renderbuffertarget), asGLuint(renderbuffer)); }
extern "C" void gea_three_webgl_draw_buffers(double attachment) {
  geaTrapCheck("gea_three_webgl_draw_buffers"); GEA_WEBGL_VOID("drawBuffers"); const GLenum glAttachment = asGLenum(attachment); gWebGL.glDrawBuffers(1, &glAttachment); }

extern "C" void gea_three_webgl_clear_color(double r, double g, double b, double a) {
  geaTrapCheck("gea_three_webgl_clear_color"); GEA_WEBGL_VOID("clearColor");
  if (nativeShadowColorAuditEnabled()) {
    static int clearColorLogs = 0;
    if (clearColorLogs++ < 20) smokeLog("[shadow-color-state] clearColor %.3f %.3f %.3f %.3f", r, g, b, a);
  }
  gWebGL.glClearColor(static_cast<GLfloat>(r), static_cast<GLfloat>(g), static_cast<GLfloat>(b), static_cast<GLfloat>(a)); }
extern "C" void gea_three_webgl_clear(double mask) {
  geaTrapCheck("gea_three_webgl_clear"); GEA_WEBGL_VOID("clear");
  if (nativeShadowColorAuditEnabled() && gWebGL.glGetIntegerv) {
    static int clearLogs = 0;
    if (clearLogs++ < 20) {
      GLint framebuffer = 0;
      gWebGL.glGetIntegerv(0x8CA6 /* GL_FRAMEBUFFER_BINDING */, &framebuffer);
      smokeLog("[shadow-color-state] clear fbo=%d mask=0x%04x", framebuffer, asGLbitfield(mask));
    }
  }
  gWebGL.glClear(asGLbitfield(mask)); }
extern "C" void gea_three_webgl_clear_depth(double depth) {
  geaTrapCheck("gea_three_webgl_clear_depth"); GEA_WEBGL_VOID("clearDepth"); gWebGL.glClearDepthf(static_cast<GLfloat>(depth)); }
extern "C" void gea_three_webgl_clear_stencil(double stencil) {
  geaTrapCheck("gea_three_webgl_clear_stencil"); GEA_WEBGL_VOID("clearStencil"); gWebGL.glClearStencil(asGLint(stencil)); }
extern "C" void gea_three_webgl_color_mask(double r, double g, double b, double a) {
  geaTrapCheck("gea_three_webgl_color_mask"); GEA_WEBGL_VOID("colorMask"); gWebGL.glColorMask(r != 0.0, g != 0.0, b != 0.0, a != 0.0); }
extern "C" void gea_three_webgl_depth_mask(double flag) {
  geaTrapCheck("gea_three_webgl_depth_mask"); GEA_WEBGL_VOID("depthMask"); gWebGL.glDepthMask(flag != 0.0 ? GL_TRUE_VALUE : GL_FALSE_VALUE); }
extern "C" void gea_three_webgl_depth_func(double func) {
  geaTrapCheck("gea_three_webgl_depth_func"); GEA_WEBGL_VOID("depthFunc"); gWebGL.glDepthFunc(asGLenum(func)); }
extern "C" void gea_three_webgl_enable(double cap) {
  geaTrapCheck("gea_three_webgl_enable"); GEA_WEBGL_VOID("enable");
  if (nativeBlendDebugEnabled() && asGLenum(cap) == 0x0BE2) {
    smokeLog("[blend-dbg] enable BLEND");
  }
  gWebGL.glEnable(asGLenum(cap)); }
extern "C" void gea_three_webgl_disable(double cap) {
  geaTrapCheck("gea_three_webgl_disable"); GEA_WEBGL_VOID("disable");
  if (nativeBlendDebugEnabled() && asGLenum(cap) == 0x0BE2) {
    smokeLog("[blend-dbg] disable BLEND");
  }
  gWebGL.glDisable(asGLenum(cap)); }
extern "C" void gea_three_webgl_blend_func(double sfactor, double dfactor) {
  geaTrapCheck("gea_three_webgl_blend_func"); GEA_WEBGL_VOID("blendFunc");
  if (nativeBlendDebugEnabled()) {
    smokeLog("[blend-dbg] blendFunc src=0x%04x dst=0x%04x", asGLenum(sfactor), asGLenum(dfactor));
  }
  gWebGL.glBlendFunc(asGLenum(sfactor), asGLenum(dfactor)); }
extern "C" void gea_three_webgl_blend_func_separate(double srcRGB, double dstRGB, double srcAlpha, double dstAlpha) {
  geaTrapCheck("gea_three_webgl_blend_func_separate"); GEA_WEBGL_VOID("blendFuncSeparate");
  if (nativeBlendDebugEnabled()) {
    smokeLog("[blend-dbg] blendFuncSeparate rgb=(0x%04x,0x%04x) alpha=(0x%04x,0x%04x)",
             asGLenum(srcRGB), asGLenum(dstRGB), asGLenum(srcAlpha), asGLenum(dstAlpha));
  }
  gWebGL.glBlendFuncSeparate(asGLenum(srcRGB), asGLenum(dstRGB), asGLenum(srcAlpha), asGLenum(dstAlpha)); }
extern "C" void gea_three_webgl_blend_equation(double mode) {
  geaTrapCheck("gea_three_webgl_blend_equation"); GEA_WEBGL_VOID("blendEquation");
  if (nativeBlendDebugEnabled()) {
    smokeLog("[blend-dbg] blendEquation mode=0x%04x", asGLenum(mode));
  }
  gWebGL.glBlendEquation(asGLenum(mode)); }
extern "C" void gea_three_webgl_blend_equation_separate(double modeRGB, double modeAlpha) {
  geaTrapCheck("gea_three_webgl_blend_equation_separate"); GEA_WEBGL_VOID("blendEquationSeparate");
  if (nativeBlendDebugEnabled()) {
    smokeLog("[blend-dbg] blendEquationSeparate rgb=0x%04x alpha=0x%04x", asGLenum(modeRGB), asGLenum(modeAlpha));
  }
  gWebGL.glBlendEquationSeparate(asGLenum(modeRGB), asGLenum(modeAlpha)); }
extern "C" void gea_three_webgl_cull_face(double mode) {
  geaTrapCheck("gea_three_webgl_cull_face"); GEA_WEBGL_VOID("cullFace"); gWebGL.glCullFace(asGLenum(mode)); }
extern "C" void gea_three_webgl_front_face(double mode) {
  geaTrapCheck("gea_three_webgl_front_face"); GEA_WEBGL_VOID("frontFace"); gWebGL.glFrontFace(asGLenum(mode)); }
extern "C" void gea_three_webgl_viewport(double x, double y, double width, double height) {
  geaTrapCheck("gea_three_webgl_viewport"); GEA_WEBGL_VOID("viewport"); gWebGL.glViewport(asGLint(x), asGLint(y), asGLsizei(width), asGLsizei(height)); }
extern "C" void gea_three_webgl_scissor(double x, double y, double width, double height) {
  geaTrapCheck("gea_three_webgl_scissor"); GEA_WEBGL_VOID("scissor"); gWebGL.glScissor(asGLint(x), asGLint(y), asGLsizei(width), asGLsizei(height)); }
extern "C" void gea_three_webgl_line_width(double width) {
  geaTrapCheck("gea_three_webgl_line_width"); GEA_WEBGL_VOID("lineWidth"); gWebGL.glLineWidth(static_cast<GLfloat>(width)); }
extern "C" void gea_three_webgl_polygon_offset(double factor, double units) {
  geaTrapCheck("gea_three_webgl_polygon_offset"); GEA_WEBGL_VOID("polygonOffset"); gWebGL.glPolygonOffset(static_cast<GLfloat>(factor), static_cast<GLfloat>(units)); }
extern "C" void gea_three_webgl_stencil_mask(double mask) {
  geaTrapCheck("gea_three_webgl_stencil_mask"); GEA_WEBGL_VOID("stencilMask"); gWebGL.glStencilMask(asGLuint(mask)); }
extern "C" void gea_three_webgl_stencil_mask_separate(double face, double mask) {
  geaTrapCheck("gea_three_webgl_stencil_mask_separate"); GEA_WEBGL_VOID("stencilMaskSeparate"); gWebGL.glStencilMaskSeparate(asGLenum(face), asGLuint(mask)); }
extern "C" void gea_three_webgl_stencil_func(double func, double ref, double mask) {
  geaTrapCheck("gea_three_webgl_stencil_func"); GEA_WEBGL_VOID("stencilFunc"); gWebGL.glStencilFunc(asGLenum(func), asGLint(ref), asGLuint(mask)); }
extern "C" void gea_three_webgl_stencil_func_separate(double face, double func, double ref, double mask) {
  geaTrapCheck("gea_three_webgl_stencil_func_separate"); GEA_WEBGL_VOID("stencilFuncSeparate"); gWebGL.glStencilFuncSeparate(asGLenum(face), asGLenum(func), asGLint(ref), asGLuint(mask)); }
extern "C" void gea_three_webgl_stencil_op(double fail, double zfail, double zpass) {
  geaTrapCheck("gea_three_webgl_stencil_op"); GEA_WEBGL_VOID("stencilOp"); gWebGL.glStencilOp(asGLenum(fail), asGLenum(zfail), asGLenum(zpass)); }
extern "C" void gea_three_webgl_stencil_op_separate(double face, double fail, double zfail, double zpass) {
  geaTrapCheck("gea_three_webgl_stencil_op_separate"); GEA_WEBGL_VOID("stencilOpSeparate"); gWebGL.glStencilOpSeparate(asGLenum(face), asGLenum(fail), asGLenum(zfail), asGLenum(zpass)); }
extern "C" void gea_three_webgl_draw_elements(double mode, double count, double type, double offset) {
  geaTrapCheck("gea_three_webgl_draw_elements"); GEA_WEBGL_VOID("drawElements");
  gWebGL.glDrawElements(asGLenum(mode), asGLsizei(count), asGLenum(type), reinterpret_cast<const void *>(static_cast<std::uintptr_t>(offset))); }
extern "C" void gea_three_webgl_draw_arrays(double mode, double first, double count) {
  geaTrapCheck("gea_three_webgl_draw_arrays"); GEA_WEBGL_VOID("drawArrays");
  gWebGL.glDrawArrays(asGLenum(mode), asGLint(first), asGLsizei(count)); }
extern "C" void gea_three_webgl_vertex_attrib_divisor(double index, double divisor) {
  geaTrapCheck("gea_three_webgl_vertex_attrib_divisor"); GEA_WEBGL_VOID("vertexAttribDivisor");
  gWebGL.glVertexAttribDivisor(asGLuint(index), asGLuint(divisor)); }
extern "C" void gea_three_webgl_draw_elements_instanced(double mode, double count, double type, double offset, double instanceCount) {
  geaTrapCheck("gea_three_webgl_draw_elements_instanced"); GEA_WEBGL_VOID("drawElementsInstanced");
  gWebGL.glDrawElementsInstanced(asGLenum(mode), asGLsizei(count), asGLenum(type),
    reinterpret_cast<const void *>(static_cast<std::uintptr_t>(offset)), asGLsizei(instanceCount)); }
extern "C" void gea_three_webgl_draw_arrays_instanced(double mode, double first, double count, double instanceCount) {
  geaTrapCheck("gea_three_webgl_draw_arrays_instanced"); GEA_WEBGL_VOID("drawArraysInstanced");
  gWebGL.glDrawArraysInstanced(asGLenum(mode), asGLint(first), asGLsizei(count), asGLsizei(instanceCount)); }
extern "C" double gea_three_webgl_get_error() {
  geaTrapCheck("gea_three_webgl_get_error"); GEA_WEBGL_DOUBLE("getError"); return gWebGL.glGetError(); }

extern "C" double gea_three_webgl_call(
  double opValue,
  double a,
  double b,
  double c,
  double d,
  double e,
  double f,
  double h,
  double i
) {
  geaTrapCheck("gea_three_webgl_call");
  if (!gWebGL.ready || !makeCurrent("eglMakeCurrent(call)")) return 0.0;
  const int op = static_cast<int>(opValue);
  switch (op) {
    case OP_CLEAR_COLOR: gWebGL.glClearColor(a, b, c, d); return 0.0;
    case OP_CLEAR: gWebGL.glClear(static_cast<GLbitfield>(a)); return 0.0;
    case OP_VIEWPORT: gWebGL.glViewport(a, b, c, d); return 0.0;
    case OP_ENABLE: gWebGL.glEnable(static_cast<GLenum>(a)); return 0.0;
    case OP_DISABLE: gWebGL.glDisable(static_cast<GLenum>(a)); return 0.0;
    case OP_DEPTH_FUNC: gWebGL.glDepthFunc(static_cast<GLenum>(a)); return 0.0;
    case OP_DEPTH_MASK: gWebGL.glDepthMask(a != 0.0 ? GL_TRUE_VALUE : GL_FALSE_VALUE); return 0.0;
    case OP_COLOR_MASK: gWebGL.glColorMask(a != 0.0, b != 0.0, c != 0.0, d != 0.0); return 0.0;
    case OP_BLEND_FUNC: gWebGL.glBlendFunc(static_cast<GLenum>(a), static_cast<GLenum>(b)); return 0.0;
    case OP_BLEND_FUNC_SEPARATE: gWebGL.glBlendFuncSeparate(a, b, c, d); return 0.0;
    case OP_BLEND_EQUATION: gWebGL.glBlendEquation(static_cast<GLenum>(a)); return 0.0;
    case OP_BLEND_EQUATION_SEPARATE: gWebGL.glBlendEquationSeparate(a, b); return 0.0;
    case OP_CULL_FACE: gWebGL.glCullFace(static_cast<GLenum>(a)); return 0.0;
    case OP_FRONT_FACE: gWebGL.glFrontFace(static_cast<GLenum>(a)); return 0.0;
    case OP_CREATE_BUFFER: return generatedBuffer();
    case OP_DELETE_BUFFER: deleteNativeBuffer(a); return 0.0;
    case OP_BIND_BUFFER: bindNativeBuffer(a, b); return 0.0;
    case OP_CREATE_SHADER: return gWebGL.glCreateShader(static_cast<GLenum>(a));
    case OP_COMPILE_SHADER: gWebGL.glCompileShader(a); return 0.0;
    case OP_GET_SHADER_PARAMETER: { GLint value = 0; gWebGL.glGetShaderiv(a, b, &value); return value; }
    case OP_DELETE_SHADER: gWebGL.glDeleteShader(static_cast<GLuint>(a)); return 0.0;
    case OP_CREATE_PROGRAM: return gWebGL.glCreateProgram();
    case OP_ATTACH_SHADER: gWebGL.glAttachShader(a, b); return 0.0;
    case OP_LINK_PROGRAM: gWebGL.glLinkProgram(a); return 0.0;
    case OP_GET_PROGRAM_PARAMETER: { GLint value = 0; gWebGL.glGetProgramiv(a, b, &value); return value; }
    case OP_DELETE_PROGRAM: gWebGL.glDeleteProgram(static_cast<GLuint>(a)); return 0.0;
    case OP_USE_PROGRAM: gWebGL.glUseProgram(a); return 0.0;
    case OP_ENABLE_VERTEX_ATTRIB_ARRAY: gWebGL.glEnableVertexAttribArray(a); return 0.0;
    case OP_DISABLE_VERTEX_ATTRIB_ARRAY: gWebGL.glDisableVertexAttribArray(a); return 0.0;
    case OP_VERTEX_ATTRIB_POINTER: gWebGL.glVertexAttribPointer(a, b, c, d != 0.0, e, reinterpret_cast<const void *>(static_cast<std::uintptr_t>(f))); return 0.0;
    case OP_UNIFORM_1F: gWebGL.glUniform1f(a, b); return 0.0;
    case OP_UNIFORM_1I: gWebGL.glUniform1i(a, b); return 0.0;
    case OP_UNIFORM_2F: gWebGL.glUniform2f(a, b, c); return 0.0;
    case OP_UNIFORM_3F: gWebGL.glUniform3f(a, b, c, d); return 0.0;
    case OP_UNIFORM_4F: gWebGL.glUniform4f(a, b, c, d, e); return 0.0;
    case OP_DRAW_ELEMENTS: gWebGL.glDrawElements(a, b, c, reinterpret_cast<const void *>(static_cast<std::uintptr_t>(d))); return 0.0;
    case OP_DRAW_ARRAYS: gWebGL.glDrawArrays(a, b, c); return 0.0;
    case OP_ACTIVE_TEXTURE: gWebGL.glActiveTexture(a); return 0.0;
    case OP_CREATE_TEXTURE: return generatedTexture();
    case OP_DELETE_TEXTURE: { GLuint handle = a; gWebGL.glDeleteTextures(1, &handle); return 0.0; }
    case OP_BIND_TEXTURE: gWebGL.glBindTexture(a, b); return 0.0;
    case OP_TEX_PARAMETERI: gWebGL.glTexParameteri(a, b, c); return 0.0;
    case OP_PIXEL_STOREI: gWebGL.glPixelStorei(a, b); return 0.0;
    case OP_GENERATE_MIPMAP: gWebGL.glGenerateMipmap(a); return 0.0;
    case OP_CREATE_VERTEX_ARRAY: return generatedVertexArray();
    case OP_BIND_VERTEX_ARRAY: gWebGL.glBindVertexArray(a); return 0.0;
    case OP_DELETE_VERTEX_ARRAY: { GLuint handle = a; gWebGL.glDeleteVertexArrays(1, &handle); return 0.0; }
    case OP_GET_ERROR: return gWebGL.glGetError();
    case OP_SCISSOR: gWebGL.glScissor(a, b, c, d); return 0.0;
    case OP_LINE_WIDTH: gWebGL.glLineWidth(a); return 0.0;
    case OP_POLYGON_OFFSET: gWebGL.glPolygonOffset(a, b); return 0.0;
    case OP_CLEAR_DEPTH: gWebGL.glClearDepthf(a); return 0.0;
    case OP_CLEAR_STENCIL: gWebGL.glClearStencil(a); return 0.0;
    case OP_STENCIL_MASK: gWebGL.glStencilMask(static_cast<GLuint>(a)); return 0.0;
    case OP_STENCIL_FUNC: gWebGL.glStencilFunc(a, b, c); return 0.0;
    case OP_STENCIL_OP: gWebGL.glStencilOp(a, b, c); return 0.0;
    case OP_STENCIL_FUNC_SEPARATE: gWebGL.glStencilFuncSeparate(a, b, c, d); return 0.0;
    case OP_STENCIL_OP_SEPARATE: gWebGL.glStencilOpSeparate(a, b, c, d); return 0.0;
    case OP_STENCIL_MASK_SEPARATE: gWebGL.glStencilMaskSeparate(a, static_cast<GLuint>(b)); return 0.0;
    case OP_CREATE_FRAMEBUFFER: return generatedFramebuffer();
    case OP_BIND_FRAMEBUFFER: gWebGL.glBindFramebuffer(a, b); return 0.0;
    case OP_DELETE_FRAMEBUFFER: { GLuint handle = a; gWebGL.glDeleteFramebuffers(1, &handle); return 0.0; }
    case OP_FRAMEBUFFER_TEXTURE_2D: gWebGL.glFramebufferTexture2D(a, b, c, d, e); return 0.0;
    case OP_CHECK_FRAMEBUFFER_STATUS: return gWebGL.glCheckFramebufferStatus(a);
    case OP_CREATE_RENDERBUFFER: return generatedRenderbuffer();
    case OP_BIND_RENDERBUFFER: gWebGL.glBindRenderbuffer(a, b); return 0.0;
    case OP_RENDERBUFFER_STORAGE: gWebGL.glRenderbufferStorage(a, b, c, d); return 0.0;
    case OP_FRAMEBUFFER_RENDERBUFFER: gWebGL.glFramebufferRenderbuffer(a, b, c, d); return 0.0;
    case OP_DELETE_RENDERBUFFER: { GLuint handle = a; gWebGL.glDeleteRenderbuffers(1, &handle); return 0.0; }
    case OP_DRAW_BUFFERS: {
      const GLenum attachment = static_cast<GLenum>(a);
      gWebGL.glDrawBuffers(1, &attachment);
      return 0.0;
    }
    default: return 0.0;
  }
}

extern "C" double gea_three_webgl_call_string(
  double opValue,
  double a,
  double b,
  std::string value
) {
  geaTrapCheck("gea_three_webgl_call_string");
  if (!gWebGL.ready || !makeCurrent("eglMakeCurrent(call-string)")) return 0.0;
  const int op = static_cast<int>(opValue);
  if (op == OP_SHADER_SOURCE) {
    const char *source = value.c_str();
    const GLint length = static_cast<GLint>(value.size());
    gWebGL.glShaderSource(static_cast<GLuint>(a), 1, &source, &length);
    return 0.0;
  }
  if (op == OP_GET_ATTRIB_LOCATION) {
    return gWebGL.glGetAttribLocation(static_cast<GLuint>(a), value.c_str());
  }
  if (op == OP_GET_UNIFORM_LOCATION) {
    return gWebGL.glGetUniformLocation(static_cast<GLuint>(a), value.c_str());
  }
  return 0.0;
}

// Most uploads here are one vec2/vec3/vec4 or one 3x3/4x4 matrix. Convert
// those without an allocator round trip; larger arrays retain owned heap
// storage until the synchronous GL upload returns. No shared mutable scratch.
class FloatUploadData {
  float inlineValues_[16];
  std::vector<float> heapValues_;
  std::size_t size_;
 public:
  explicit FloatUploadData(std::span<const double> values) : size_(values.size()) {
    if (size_ <= 16) {
      for (std::size_t i = 0; i < size_; ++i) inlineValues_[i] = static_cast<float>(values[i]);
    } else {
      heapValues_.reserve(size_);
      for (double value : values) heapValues_.push_back(static_cast<float>(value));
    }
  }
  const float* data() const { return size_ <= 16 ? inlineValues_ : heapValues_.data(); }
  std::size_t size() const { return size_; }
  bool empty() const { return size_ == 0; }
};

static std::vector<std::uint16_t> asU16Data(std::span<const double> values) {
  std::vector<std::uint16_t> out;
  out.reserve(values.size());
  for (double value : values) out.push_back(static_cast<std::uint16_t>(std::max(0.0f, static_cast<float>(value))));
  return out;
}

static std::vector<std::uint32_t> asU32Data(std::span<const double> values) {
  std::vector<std::uint32_t> out;
  out.reserve(values.size());
  for (double value : values) out.push_back(static_cast<std::uint32_t>(std::max(0.0f, static_cast<float>(value))));
  return out;
}

static std::vector<std::uint8_t> asU8Data(std::span<const double> values) {
  std::vector<std::uint8_t> out;
  out.reserve(values.size());
  for (double value : values) out.push_back(static_cast<std::uint8_t>(std::max(0.0f, std::min(255.0f, static_cast<float>(value)))));
  return out;
}

template <typename Fn>
static void withVectorBytes(std::span<const double> values, int typeCode, Fn fn) {
  if (values.empty()) {
    fn(nullptr, 0);
    return;
  }
  if (typeCode == 2) {
    const std::vector<std::uint16_t> data = asU16Data(values);
    fn(data.data(), static_cast<GLsizeiptr>(data.size() * sizeof(std::uint16_t)));
    return;
  }
  if (typeCode == 3) {
    const std::vector<std::uint32_t> data = asU32Data(values);
    fn(data.data(), static_cast<GLsizeiptr>(data.size() * sizeof(std::uint32_t)));
    return;
  }
  if (typeCode == 4) {
    const std::vector<std::uint8_t> data = asU8Data(values);
    fn(data.data(), static_cast<GLsizeiptr>(data.size() * sizeof(std::uint8_t)));
    return;
  }
  const FloatUploadData data(values);
  fn(data.data(), static_cast<GLsizeiptr>(data.size() * sizeof(float)));
}

extern "C" void gea_three_webgl_buffer_data(
  double target,
  double usage,
  double typeCode,
  std::span<const double> values
) {
  geaTrapCheck("gea_three_webgl_buffer_data");
  GEA_WEBGL_VOID("bufferData");
  withVectorBytes(values, static_cast<int>(typeCode), [&](const void *bytes, GLsizeiptr size) {
    nativeBufferData(asGLenum(target), size, bytes, asGLenum(usage));
  });
}

extern "C" void gea_three_webgl_buffer_sub_data(
  double target,
  double offset,
  double typeCode,
  std::span<const double> values
) {
  geaTrapCheck("gea_three_webgl_buffer_sub_data");
  GEA_WEBGL_VOID("bufferSubData");
  withVectorBytes(values, static_cast<int>(typeCode), [&](const void *bytes, GLsizeiptr size) {
    nativeBufferSubData(asGLenum(target), static_cast<GLintptr>(offset), size, bytes);
  });
}

extern "C" void gea_three_webgl_buffer_data_bytes(double target, double usage, const void* bytes, double byteLength) {
  GEA_WEBGL_VOID("bufferDataBytes");
  nativeBufferData(asGLenum(target), static_cast<GLsizeiptr>(byteLength), bytes, asGLenum(usage));
}

extern "C" void gea_three_webgl_tex_image_2d_bytes(double target, double level, double internalFormat, double width, double height, double format, double type, const void* bytes, double) {
  GEA_WEBGL_VOID("texImage2DBytes");
  gWebGL.glTexImage2D(asGLenum(target), asGLint(level), asGLint(internalFormat), asGLsizei(width), asGLsizei(height), 0, asGLenum(format), asGLenum(type), bytes);
}

extern "C" void gea_three_webgl_tex_sub_image_2d_bytes(double target, double level, double xoffset, double yoffset, double width, double height, double format, double type, const void* bytes, double) {
  GEA_WEBGL_VOID("texSubImage2DBytes");
  gWebGL.glTexSubImage2D(asGLenum(target), asGLint(level), asGLint(xoffset), asGLint(yoffset), asGLsizei(width), asGLsizei(height), asGLenum(format), asGLenum(type), bytes);
}

// Native typed arrays already own byte-exact, alias-preserving storage. This
// entry point lets generated code upload that storage directly instead of
// promoting every element through a temporary std::vector<double> first.
extern "C" void gea_three_webgl_buffer_sub_data_bytes(
  double target,
  double offset,
  const void *bytes,
  double byteLength
) {
  geaTrapCheck("gea_three_webgl_buffer_sub_data_bytes");
  GEA_WEBGL_VOID("bufferSubDataBytes");
  const GLsizeiptr size = static_cast<GLsizeiptr>(std::max(0.0, byteLength));
  nativeBufferSubData(asGLenum(target), static_cast<GLintptr>(offset), size, bytes);
}

#define GEA_DEFINE_UNIFORM_FV(WIDTH) \
  extern "C" void gea_three_webgl_uniform_##WIDTH##fv( \
    double location, const gea::detail::HostNumericArgument<float>& values \
  ) { \
    geaTrapCheck("gea_three_webgl_uniform_" #WIDTH "fv"); \
    GEA_WEBGL_VOID("uniform" #WIDTH "fv"); \
    const auto& data = values; \
    const GLsizei count = static_cast<GLsizei>(data.size() / WIDTH); \
    if (count > 0) gWebGL.glUniform##WIDTH##fv(asGLint(location), count, data.data()); \
  }

#define GEA_DEFINE_UNIFORM_IV(WIDTH) \
  extern "C" void gea_three_webgl_uniform_##WIDTH##iv( \
    double location, const gea::detail::HostNumericArgument<std::int32_t>& values \
  ) { \
    geaTrapCheck("gea_three_webgl_uniform_" #WIDTH "iv"); \
    GEA_WEBGL_VOID("uniform" #WIDTH "iv"); \
    const auto& data = values; \
    const GLsizei count = static_cast<GLsizei>(data.size() / WIDTH); \
    if (count > 0) gWebGL.glUniform##WIDTH##iv(asGLint(location), count, data.data()); \
  }

#define GEA_DEFINE_UNIFORM_UIV(WIDTH) \
  extern "C" void gea_three_webgl_uniform_##WIDTH##uiv( \
    double location, const gea::detail::HostNumericArgument<std::uint32_t>& values \
  ) { \
    geaTrapCheck("gea_three_webgl_uniform_" #WIDTH "uiv"); \
    GEA_WEBGL_VOID("uniform" #WIDTH "uiv"); \
    const auto& data = values; \
    const GLsizei count = static_cast<GLsizei>(data.size() / WIDTH); \
    if (count > 0) gWebGL.glUniform##WIDTH##uiv(asGLint(location), count, data.data()); \
  }

GEA_DEFINE_UNIFORM_FV(1)
GEA_DEFINE_UNIFORM_FV(2)
GEA_DEFINE_UNIFORM_FV(3)
GEA_DEFINE_UNIFORM_FV(4)
GEA_DEFINE_UNIFORM_IV(1)
GEA_DEFINE_UNIFORM_IV(2)
GEA_DEFINE_UNIFORM_IV(3)
GEA_DEFINE_UNIFORM_IV(4)
GEA_DEFINE_UNIFORM_UIV(1)
GEA_DEFINE_UNIFORM_UIV(2)
GEA_DEFINE_UNIFORM_UIV(3)
GEA_DEFINE_UNIFORM_UIV(4)

#undef GEA_DEFINE_UNIFORM_FV
#undef GEA_DEFINE_UNIFORM_IV
#undef GEA_DEFINE_UNIFORM_UIV

extern "C" void gea_three_webgl_uniform_matrix_2fv(
  double location,
  double count,
  double transpose,
  const gea::detail::HostNumericArgument<float>& values
) {
  geaTrapCheck("gea_three_webgl_uniform_matrix_2fv");
  GEA_WEBGL_VOID("uniformMatrix2fv");
  const auto& data = values;
  if (data.size() % 4 != 0) return;
  const GLsizei matrixCount = static_cast<GLsizei>(data.size() / 4);
  if (!data.empty()) gWebGL.glUniformMatrix2fv(asGLint(location), matrixCount, transpose != 0.0, data.data());
}

extern "C" void gea_three_webgl_uniform_matrix_3fv(
  double location,
  double count,
  double transpose,
  const gea::detail::HostNumericArgument<float>& values
) {
  geaTrapCheck("gea_three_webgl_uniform_matrix_3fv");
  GEA_WEBGL_VOID("uniformMatrix3fv");
  const auto& data = values;
  if (data.size() % 9 != 0) return;
  const GLsizei matrixCount = static_cast<GLsizei>(data.size() / 9);
  if (!data.empty()) gWebGL.glUniformMatrix3fv(asGLint(location), matrixCount, transpose != 0.0, data.data());
  if (nativeWebGLTrapEnabled()) {
    static int logged = 0;
    const GLenum err = gWebGL.glGetError ? gWebGL.glGetError() : 0;
    if (err != 0 && logged < 24) {
      ++logged;
      GLint prog = -1;
      gWebGL.glGetIntegerv(0x8B8D /* GL_CURRENT_PROGRAM */, &prog);
      smokeLog("[gea-webgl-trap] uniformMatrix3fv ERR=0x%04x loc=%d count=%d n=%zu prog=%d",
               err, asGLint(location), asGLsizei(std::max(1.0, count)), values.size(), prog);
    }
  }
}

extern "C" void gea_three_webgl_uniform_matrix_4fv(
  double location,
  double count,
  double transpose,
  const gea::detail::HostNumericArgument<float>& values
) {
  geaTrapCheck("gea_three_webgl_uniform_matrix_4fv");
  GEA_WEBGL_VOID("uniformMatrix4fv");
  const auto& data = values;
  if (data.size() % 16 != 0) return;
  const GLsizei matrixCount = static_cast<GLsizei>(data.size() / 16);
  if (!data.empty()) gWebGL.glUniformMatrix4fv(asGLint(location), matrixCount, transpose != 0.0, data.data());
}

extern "C" void gea_three_webgl_tex_image_2d(
  double target,
  double level,
  double internalFormat,
  double width,
  double height,
  double format,
  double type,
  std::span<const double> values
) {
  geaTrapCheck("gea_three_webgl_tex_image_2d");
  GEA_WEBGL_VOID("texImage2D");
  withVectorBytes(values, vectorTypeCodeForGLType(type), [&](const void *bytes, GLsizeiptr) {
    gWebGL.glTexImage2D(
      asGLenum(target),
      asGLint(level),
      asGLint(internalFormat),
      asGLsizei(width),
      asGLsizei(height),
      0,
      asGLenum(format),
      asGLenum(type),
      bytes
    );
  });
}

extern "C" void gea_three_webgl_tex_storage_2d(
  double target,
  double levels,
  double internalFormat,
  double width,
  double height
) {
  geaTrapCheck("gea_three_webgl_tex_storage_2d");
  GEA_WEBGL_VOID("texStorage2D");
  if (nativeWebGLTrapEnabled()) {
    smokeLog("[gea-webgl-trap] texStorage2D(target=0x%04x levels=%d fmt=0x%04x %dx%d)",
             asGLenum(target), asGLsizei(std::max(1.0, levels)), asGLenum(internalFormat),
             asGLsizei(width), asGLsizei(height));
  }
  gWebGL.glTexStorage2D(
    asGLenum(target),
    asGLsizei(std::max(1.0, levels)),
    asGLenum(internalFormat),
    asGLsizei(width),
    asGLsizei(height)
  );
}

extern "C" void gea_three_webgl_tex_sub_image_2d(
  double target,
  double level,
  double xoffset,
  double yoffset,
  double width,
  double height,
  double format,
  double type,
  std::span<const double> values
) {
  geaTrapCheck("gea_three_webgl_tex_sub_image_2d");
  GEA_WEBGL_VOID("texSubImage2D");
  if (nativeWebGLTrapEnabled()) {
    static int logged = 0;
    if (logged++ < 12) {
      smokeLog("[gea-webgl-trap] texSubImage2D(target=0x%04x level=%d off=%d,%d %dx%d fmt=0x%04x type=0x%04x n=%zu)",
               asGLenum(target), asGLint(level), asGLint(xoffset), asGLint(yoffset),
               asGLsizei(width), asGLsizei(height), asGLenum(format), asGLenum(type), values.size());
      if (values.size() >= 3000) {
        unsigned long sum = 0;
        char preview[128];
        int pl = 0;
        for (size_t i = 2048; i < 2048 + 16 && i < values.size(); i++) {
          pl += snprintf(preview + pl, sizeof(preview) - pl, "%d,", (int)values[i]);
        }
        for (size_t i = 0; i < values.size(); i++) sum += (unsigned long)(unsigned char)(int)values[i];
        smokeLog("[gea-webgl-trap] texSubImage2D bytes@2048: %s sum%%1e9+7=%lu", preview, sum % 1000000007ul);
      }
    }
  }
  withVectorBytes(values, vectorTypeCodeForGLType(type), [&](const void *bytes, GLsizeiptr) {
    gWebGL.glTexSubImage2D(
      asGLenum(target),
      asGLint(level),
      asGLint(xoffset),
      asGLint(yoffset),
      asGLsizei(width),
      asGLsizei(height),
      asGLenum(format),
      asGLenum(type),
      bytes
    );
  });
}

extern "C" double gea_three_webgl_call_f32(
  double opValue,
  double a,
  double b,
  double c,
  double d,
  double e,
  double f,
  double h,
  double i,
  std::span<const double> values
) {
  geaTrapCheck("gea_three_webgl_call_f32");
  if (!gWebGL.ready || !makeCurrent("eglMakeCurrent(call-f32)")) return 0.0;
  const int op = static_cast<int>(opValue);
  if (op == 18) {
    withVectorBytes(values, static_cast<int>(c), [&](const void *bytes, GLsizeiptr size) {
      nativeBufferData(static_cast<GLenum>(a), size, bytes, static_cast<GLenum>(b));
    });
    return 0.0;
  }
  if (op == 19) {
    withVectorBytes(values, static_cast<int>(c), [&](const void *bytes, GLsizeiptr size) {
      nativeBufferSubData(static_cast<GLenum>(a), static_cast<GLintptr>(b), size, bytes);
    });
    return 0.0;
  }
  if (op == 36) {
    const FloatUploadData data(values);
    gWebGL.glUniformMatrix4fv(static_cast<GLint>(a), static_cast<GLsizei>(std::max(1.0, b)), c != 0.0, data.data());
    return 0.0;
  }
  if (op == 80) {
    const FloatUploadData data(values);
    gWebGL.glUniformMatrix3fv(static_cast<GLint>(a), static_cast<GLsizei>(std::max(1.0, b)), c != 0.0, data.data());
    return 0.0;
  }
  if (op == 50) {
    withVectorBytes(values, static_cast<int>(h), [&](const void *bytes, GLsizeiptr) {
      gWebGL.glTexImage2D(
        static_cast<GLenum>(a),
        static_cast<GLint>(b),
        static_cast<GLint>(c),
        static_cast<GLsizei>(d),
        static_cast<GLsizei>(e),
        0,
        static_cast<GLenum>(f),
        static_cast<GLenum>(h),
        bytes
      );
    });
    return 0.0;
  }
  if (op == 51) {
    withVectorBytes(values, static_cast<int>(h), [&](const void *bytes, GLsizeiptr) {
      gWebGL.glTexSubImage2D(
        static_cast<GLenum>(a),
        static_cast<GLint>(b),
        static_cast<GLint>(c),
        static_cast<GLint>(d),
        static_cast<GLsizei>(e),
        static_cast<GLsizei>(f),
        static_cast<GLenum>(h),
        static_cast<GLenum>(i),
        bytes
      );
    });
    return 0.0;
  }
  return 0.0;
}
