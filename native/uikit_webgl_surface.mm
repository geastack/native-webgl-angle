// SPDX-License-Identifier: Apache-2.0
// The WebGL surface of an iOS or tvOS build: a view filling the window's root
// view, backed by the CAMetalLayer the native WebGL host's EGL implementation
// presents into (the static ANGLE the target builds from tools/angle-apple, or any
// other EGL and GLES linked in with GEA_WEBGL_STATIC_GLES).
//
// It plugs into the iOS/tvOS target as a host extension (gea_uikit_host.h), the
// counterpart of win32_webgl_surface.cpp on Windows: the target attaches it
// before the program's top level runs -- the program creates its WebGL context
// while it initializes -- and brackets the initialization and every frame with
// begin/end, which is when the host's EGL context is current. Input belongs to
// the app's own glue (on tvOS a game controller, through the gamepad channels).
#include "gea_uikit_host.h"

#import <QuartzCore/CAMetalLayer.h>
#import <UIKit/UIKit.h>

#include <algorithm>

extern "C" bool gea_three_webgl_attach_uwp(void *nativeWindow, double width, double height, double devicePixelRatio);
extern "C" void gea_three_webgl_update_size_uwp(double width, double height, double devicePixelRatio);
extern "C" bool gea_three_webgl_begin_frame_uwp();
extern "C" void gea_three_webgl_end_frame_uwp();

@interface GeaWebGLSurfaceView : UIView
@end

@implementation GeaWebGLSurfaceView
+ (Class)layerClass
{
	return CAMetalLayer.class;
}
@end

namespace {

GeaWebGLSurfaceView *gSurface = nil;

// Sizes the layer's drawable to the view in device pixels and tells the host.
void resize(double width, double height, double scale)
{
	const double s = scale > 0 ? scale : 1.0;
	const double pixelWidth = std::max(1.0, width * s);
	const double pixelHeight = std::max(1.0, height * s);
	auto *layer = static_cast<CAMetalLayer *>(gSurface.layer);
	layer.contentsScale = s;
	layer.drawableSize = CGSizeMake(pixelWidth, pixelHeight);
	gea_three_webgl_update_size_uwp(pixelWidth, pixelHeight, s);
}

int attach(void *rootView, double width, double height, double scale)
{
	UIView *root = (__bridge UIView *)rootView;
	if (!root) return 0;
	gSurface = [[GeaWebGLSurfaceView alloc] initWithFrame:root.bounds];
	gSurface.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
	gSurface.userInteractionEnabled = NO;
	gSurface.opaque = YES;
	[root addSubview:gSurface];
	auto *layer = static_cast<CAMetalLayer *>(gSurface.layer);
	layer.opaque = YES;
	layer.framebufferOnly = YES;
	// Block for a drawable rather than drop a frame, as the macOS host does.
	layer.allowsNextDrawableTimeout = NO;
	layer.maximumDrawableCount = 3;
	resize(width, height, scale);
	const double s = scale > 0 ? scale : 1.0;
	return gea_three_webgl_attach_uwp((__bridge void *)layer, std::max(1.0, width * s), std::max(1.0, height * s), s) ? 1 : 0;
}

void layout(double width, double height, double scale)
{
	if (gSurface) resize(width, height, scale);
}

int beginFrame(void) { return gea_three_webgl_begin_frame_uwp() ? 1 : 0; }

void endFrame(void) { gea_three_webgl_end_frame_uwp(); }

const gea_uikit_host_extension kSurface = {
	GEA_UIKIT_HOST_EXTENSION_VERSION, "native-webgl-angle", attach, layout, beginFrame, endFrame, nullptr,
};
const bool kRegistered = (gea_uikit_register_host_extension(&kSurface), true);

}  // namespace
