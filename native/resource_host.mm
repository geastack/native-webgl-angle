// SPDX-License-Identifier: Apache-2.0
// Files an app ships in its Resources folder, read whole into a typed array the
// program allocated (src/nativeResources.ts). Resources is the app bundle's
// resource directory on macOS and iOS, and the Resources folder beside the
// executable elsewhere (where the desktop targets stage an app's
// nativeResources); GEA_RESOURCE_DIR names another directory.
//
// A name is relative to that directory, with '/' between its parts; an
// absolute name, a backslash or a '..' part is refused, so a name never reaches
// outside it.
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <string>

#if defined(_WIN32)
#include <windows.h>
#elif defined(__APPLE__)
#import <Foundation/Foundation.h>
#else
#include <unistd.h>
#include <climits>
#endif

namespace {

bool geaResourceNameValid(const std::string &name) {
  if (name.empty() || name.front() == '/' || name.find('\\') != std::string::npos || name.find(':') != std::string::npos) return false;
  size_t start = 0;
  while (start <= name.size()) {
    const size_t end = name.find('/', start);
    const std::string part = name.substr(start, end == std::string::npos ? std::string::npos : end - start);
    if (part.empty() || part == "." || part == "..") return false;
    if (end == std::string::npos) break;
    start = end + 1;
  }
  return true;
}

#if defined(_WIN32)
const std::wstring &geaResourceDirectory() {
  static const std::wstring directory = [] {
    wchar_t value[MAX_PATH] = {};
    const DWORD n = GetEnvironmentVariableW(L"GEA_RESOURCE_DIR", value, MAX_PATH);
    if (n > 0 && n < MAX_PATH) return std::wstring(value);
    wchar_t module[MAX_PATH] = {};
    const DWORD length = GetModuleFileNameW(nullptr, module, MAX_PATH);
    std::wstring path(module, length < MAX_PATH ? length : 0);
    const size_t slash = path.find_last_of(L"\\/");
    return slash == std::wstring::npos ? std::wstring() : path.substr(0, slash) + L"\\Resources";
  }();
  return directory;
}

FILE *geaOpenResource(const std::string &name) {
  if (!geaResourceNameValid(name) || geaResourceDirectory().empty()) return nullptr;
  const int length = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, name.data(), static_cast<int>(name.size()), nullptr, 0);
  if (length <= 0) return nullptr;
  std::wstring relative(static_cast<size_t>(length), L'\0');
  MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, name.data(), static_cast<int>(name.size()), relative.data(), length);
  for (wchar_t &c : relative) if (c == L'/') c = L'\\';
  FILE *file = nullptr;
  return _wfopen_s(&file, (geaResourceDirectory() + L"\\" + relative).c_str(), L"rb") == 0 ? file : nullptr;
}
#else
const std::string &geaResourceDirectory() {
  static const std::string directory = [] {
    if (const char *value = std::getenv("GEA_RESOURCE_DIR")) return std::string(value);
#if defined(__APPLE__)
    @autoreleasepool {
      NSString *resources = [[NSBundle mainBundle] resourcePath];
      return resources ? std::string(resources.UTF8String) : std::string();
    }
#else
    char path[PATH_MAX] = {};
    const ssize_t length = readlink("/proc/self/exe", path, sizeof(path) - 1);
    if (length <= 0) return std::string();
    const std::string executable(path, static_cast<size_t>(length));
    const size_t slash = executable.find_last_of('/');
    return slash == std::string::npos ? std::string() : executable.substr(0, slash) + "/Resources";
#endif
  }();
  return directory;
}

FILE *geaOpenResource(const std::string &name) {
  if (!geaResourceNameValid(name) || geaResourceDirectory().empty()) return nullptr;
  return std::fopen((geaResourceDirectory() + "/" + name).c_str(), "rb");
}
#endif

long long geaResourceLength(FILE *file) {
  if (std::fseek(file, 0, SEEK_END) != 0) return -1;
#if defined(_WIN32)
  const long long length = _ftelli64(file);
#else
  const long long length = static_cast<long long>(ftello(file));
#endif
  if (length < 0 || std::fseek(file, 0, SEEK_SET) != 0) return -1;
  return length;
}

}  // namespace

// The file's size in bytes, or -1 when it is missing or the name is refused.
extern "C" double gea_three_resource_size(std::string name) {
  FILE *file = geaOpenResource(name);
  if (!file) return -1;
  const long long length = geaResourceLength(file);
  std::fclose(file);
  return static_cast<double>(length);
}

// Reads the whole file into `bytes` when it holds exactly `byteLength` bytes.
// Answers the bytes read, or -1 (missing file, refused name, other size, short read).
extern "C" double gea_three_resource_read_bytes(std::string name, void *bytes, double byteLength) {
  if (!bytes && byteLength != 0) return -1;
  FILE *file = geaOpenResource(name);
  if (!file) return -1;
  const long long length = geaResourceLength(file);
  double result = -1;
  if (length >= 0 && static_cast<double>(length) == byteLength) {
    const size_t wanted = static_cast<size_t>(length);
    if (wanted == 0 || std::fread(bytes, 1, wanted, file) == wanted) result = static_cast<double>(length);
  }
  std::fclose(file);
  return result;
}
