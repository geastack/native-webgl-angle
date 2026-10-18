// SPDX-License-Identifier: Apache-2.0
// The WebGL surface of a Windows desktop build: a child window filling the
// main window's content area, which the native WebGL host renders into, and
// the input the host reports to the program.
//
// It plugs into the Windows target as a host extension (gea_win32_host.h):
// the target attaches it before the program's top level runs -- the program
// creates its WebGL context while it initializes -- and brackets the
// initialization and every frame with begin/end, which is when the host's
// EGL context is current. Keys reach the host as macOS virtual key codes, the
// code space the program's key polling uses on every platform; pointer
// positions are in CSS pixels of the surface.
#include "gea_win32_host.h"

#include <windowsx.h>

#include <algorithm>
#include <cstdio>
#include <cstdlib>

extern "C" bool gea_three_webgl_attach_uwp(void *nativeWindow, double width, double height, double devicePixelRatio);
extern "C" void gea_three_webgl_update_size_uwp(double width, double height, double devicePixelRatio);
extern "C" bool gea_three_webgl_begin_frame_uwp();
extern "C" void gea_three_webgl_end_frame_uwp();
extern "C" void gea_three_set_key_state(int code, bool down);
extern "C" void gea_three_set_pointer_state(double x, double y, double width, double height, bool down);

namespace {

HWND gSurface = nullptr;
HWND gMainWindow = nullptr;
double gScale = 1.0;
bool gPointerDown = false;
// The program polls key state once per frame, so a tap whose key-down and
// key-up both arrive between two frames would never be seen. A release waits
// here until a frame has run with the key down.
bool gReleasePending[256] = {};

// macOS virtual key codes (Carbon kVK_*), for the keys a game typically polls.
int macKeyCode(WPARAM vk)
{
	switch (vk) {
	case VK_LEFT: return 123;
	case VK_RIGHT: return 124;
	case VK_DOWN: return 125;
	case VK_UP: return 126;
	case VK_SPACE: return 49;
	case VK_RETURN: return 36;
	case VK_ESCAPE: return 53;
	case VK_TAB: return 48;
	case VK_BACK: return 51;
	case VK_DELETE: return 117;
	case VK_HOME: return 115;
	case VK_END: return 119;
	case VK_PRIOR: return 116;
	case VK_NEXT: return 121;
	case VK_SHIFT: case VK_LSHIFT: return 56;
	case VK_RSHIFT: return 60;
	case VK_CONTROL: case VK_LCONTROL: return 59;
	case VK_RCONTROL: return 62;
	case VK_MENU: case VK_LMENU: return 58;
	case VK_RMENU: return 61;
	case VK_OEM_MINUS: return 27;
	case VK_OEM_PLUS: return 24;
	case VK_OEM_COMMA: return 43;
	case VK_OEM_PERIOD: return 47;
	case VK_OEM_1: return 41;   // ;
	case VK_OEM_2: return 44;   // /
	case VK_OEM_3: return 50;   // `
	case VK_OEM_4: return 33;   // [
	case VK_OEM_5: return 42;   // backslash
	case VK_OEM_6: return 30;   // ]
	case VK_OEM_7: return 39;   // '
	default: break;
	}
	static const int letters[26] = {0, 11, 8, 2, 14, 3, 5, 4, 34, 38, 40, 37, 46, 45, 31, 35, 12, 15, 1, 17, 32, 9, 13, 7, 16, 6};
	if (vk >= 'A' && vk <= 'Z') return letters[vk - 'A'];
	static const int digits[10] = {29, 18, 19, 20, 21, 23, 22, 26, 28, 25};
	if (vk >= '0' && vk <= '9') return digits[vk - '0'];
	static const int functions[12] = {122, 120, 99, 118, 96, 97, 98, 100, 101, 109, 103, 111};
	if (vk >= VK_F1 && vk <= VK_F12) return functions[vk - VK_F1];
	return -1;
}

void releaseAllKeys()
{
	for (int code = 0; code < 256; ++code) {
		gReleasePending[code] = false;
		gea_three_set_key_state(code, false);
	}
}

void reportPointer(LPARAM lParam)
{
	RECT client{};
	GetClientRect(gSurface, &client);
	gea_three_set_pointer_state(GET_X_LPARAM(lParam) / gScale, GET_Y_LPARAM(lParam) / gScale, std::max<LONG>(1, client.right) / gScale,
	                            std::max<LONG>(1, client.bottom) / gScale, gPointerDown);
}

LRESULT CALLBACK surfaceProc(HWND hwnd, UINT message, WPARAM wParam, LPARAM lParam)
{
	switch (message) {
	case WM_KEYDOWN:
	case WM_SYSKEYDOWN:
		if (message == WM_SYSKEYDOWN && wParam == VK_F4) break;  // Alt+F4 closes the window
		if (const int code = macKeyCode(wParam); code >= 0) {
			gReleasePending[code] = false;
			gea_three_set_key_state(code, true);
		}
		return 0;  // no menu activation on Alt or F10
	case WM_KEYUP:
	case WM_SYSKEYUP:
		if (const int code = macKeyCode(wParam); code >= 0) gReleasePending[code] = true;
		return 0;
	case WM_SYSCHAR:
		return 0;  // no beep for Alt+key
	case WM_KILLFOCUS:
		gPointerDown = false;
		ReleaseCapture();
		releaseAllKeys();
		return 0;
	case WM_LBUTTONDOWN:
		SetFocus(hwnd);
		gPointerDown = true;
		SetCapture(hwnd);
		reportPointer(lParam);
		return 0;
	case WM_LBUTTONUP:
		gPointerDown = false;
		ReleaseCapture();
		reportPointer(lParam);
		return 0;
	case WM_MOUSEMOVE:
		reportPointer(lParam);
		return 0;
	case WM_ERASEBKGND:
		return 1;  // the swap chain owns every pixel
	case WM_PAINT:
		ValidateRect(hwnd, nullptr);
		return 0;
	default:
		break;
	}
	return DefWindowProcW(hwnd, message, wParam, lParam);
}

int attach(HWND window, RECT area, double scale)
{
	gMainWindow = window;
	gScale = scale > 0 ? scale : 1.0;
	HINSTANCE instance = GetModuleHandleW(nullptr);
	WNDCLASSEXW cls{};
	cls.cbSize = sizeof(cls);
	cls.style = CS_OWNDC | CS_DBLCLKS;
	cls.lpfnWndProc = surfaceProc;
	cls.hInstance = instance;
	cls.hCursor = LoadCursorW(nullptr, IDC_ARROW);
	cls.lpszClassName = L"GeaWebGLSurface";
	RegisterClassExW(&cls);
	// The main window must not paint over its swap-chain child.
	SetWindowLongPtrW(window, GWL_STYLE, GetWindowLongPtrW(window, GWL_STYLE) | WS_CLIPCHILDREN);
	const int width = std::max<int>(1, area.right - area.left);
	const int height = std::max<int>(1, area.bottom - area.top);
	gSurface = CreateWindowExW(0, cls.lpszClassName, L"", WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS, area.left, area.top, width, height, window, nullptr,
	                           instance, nullptr);
	if (!gSurface) {
		std::fprintf(stderr, "[native-webgl-angle] could not create the surface window (error %lu)\n", GetLastError());
		return 0;
	}
	SetWindowPos(gSurface, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
	// Present with vsync unless the environment says otherwise.
	if (!std::getenv("GEA_ANGLE_SWAP_INTERVAL")) _putenv_s("GEA_ANGLE_SWAP_INTERVAL", "1");
	if (!gea_three_webgl_attach_uwp(gSurface, width, height, gScale)) {
		std::fprintf(stderr, "[native-webgl-angle] the WebGL surface could not start: no usable EGL/OpenGL ES implementation\n");
		return 0;
	}
	// eglSwapBuffers paces the loop: it waits for the refresh with vsync on and
	// renders unthrottled with it off (GEA_ANGLE_SWAP_INTERVAL=0).
	gea_win32_set_frame_pacing(GEA_WIN32_FRAME_PACING_PRESENT);
	SetFocus(gSurface);
	return 1;
}

void layout(RECT area, double scale)
{
	if (!gSurface) return;
	gScale = scale > 0 ? scale : 1.0;
	const int width = std::max<int>(1, area.right - area.left);
	const int height = std::max<int>(1, area.bottom - area.top);
	SetWindowPos(gSurface, nullptr, area.left, area.top, width, height, SWP_NOZORDER | SWP_NOACTIVATE);
	gea_three_webgl_update_size_uwp(width, height, gScale);
}

int beginFrame() { return gea_three_webgl_begin_frame_uwp() ? 1 : 0; }

void endFrame()
{
	gea_three_webgl_end_frame_uwp();
	for (int code = 0; code < 256; ++code) {
		if (!gReleasePending[code]) continue;
		gReleasePending[code] = false;
		gea_three_set_key_state(code, false);
	}
}

int windowMessage(HWND, UINT message, WPARAM, LPARAM, LRESULT *result)
{
	// Activating the main window gives it the keyboard focus; the surface is
	// where keys are read.
	if (message == WM_SETFOCUS && gSurface) {
		SetFocus(gSurface);
		*result = 0;
		return 1;
	}
	return 0;
}

void detach()
{
	if (gSurface) DestroyWindow(gSurface);
	gSurface = nullptr;
}

const gea_win32_host_extension kSurfaceExtension = {
	GEA_WIN32_HOST_EXTENSION_VERSION, "The WebGL surface", attach, layout, beginFrame, endFrame, windowMessage, detach,
};
const bool kRegistered = (gea_win32_register_host_extension(&kSurfaceExtension), true);

}  // namespace
