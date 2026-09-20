import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { nativeTestOutDir } from './out-dir.mjs'


const packageDir = resolve(import.meta.dirname, '..')
const host = readFileSync(resolve(packageDir, 'native/angle_webgl_host.mm'), 'utf8')
const start = host.indexOf('struct NativeBufferState')
const end = host.indexOf('// Streaming experiment ends here.', start)
assert.ok(start >= 0 && end > start)
const implementation = host.slice(start, end)
const binary = join(nativeTestOutDir(), 'buffer-streaming-contract-test')
for (const profiling of ['', 'GEA_PROFILE_ALLOCATIONS', 'GEA_PROFILE_NATIVE_FRAMES']) {
execFileSync(process.env.CXX ?? 'clang++', ['-std=c++20', '-O1', '-fsanitize=address,undefined', '-x', 'c++', '-', '-o', binary], {
  input: `${profiling ? `#define ${profiling} 1` : ''}
#include <chrono>
#include <cstdio>
#include <algorithm>
#include <cassert>
#include <cstdlib>
#include <cstring>
#include <unordered_map>
#include <vector>
using ProfileClock = std::chrono::steady_clock;
using GLenum = unsigned; using GLuint = unsigned; using GLsizei = int; using GLint = int;
using GLsizeiptr = std::ptrdiff_t; using GLintptr = std::ptrdiff_t;
static std::unordered_map<GLenum, GLuint> bindings;
static std::unordered_map<GLuint, std::vector<unsigned char>> storage;
static unsigned nextBuffer = 100, dataCalls = 0, subCalls = 0, copyCalls = 0, uniformWrites = 0;
struct MockGL {
  void glGetIntegerv(GLenum name, GLint* value) {
    if(name == 0x8895) *value = bindings[0x8893];
    else if(name == 0x8A28) *value = bindings[0x8A11];
    else { assert(name == 0x8A30); *value = std::getenv("TEST_NO_UNIFORM_STORAGE") ? 0 : 8; }
  }
  void glBindBuffer(GLenum target, GLuint buffer) { bindings[target] = buffer; }
  void glGenBuffers(GLsizei n, GLuint* buffers) { while(n--) *buffers++ = nextBuffer++; }
  void glDeleteBuffers(GLsizei n, const GLuint* buffers) { while(n--) storage.erase(*buffers++); }
  void glBufferData(GLenum target, GLsizeiptr size, const void* bytes, GLenum) {
    ++dataCalls; auto& dest = storage[bindings[target]]; dest.resize(size);
    if(bytes) std::memcpy(dest.data(), bytes, size);
  }
  void glBufferSubData(GLenum target, GLintptr offset, GLsizeiptr size, const void* bytes) {
    ++subCalls; auto& dest = storage[bindings[target]];
    if(target == 0x8A11) { ++uniformWrites; assert(size <= 8 && offset == 0); }
    assert(offset >= 0 && offset + size <= dest.size());
    if(size) std::memcpy(dest.data() + offset, bytes, size);
  }
  static void copy(GLenum from, GLenum to, GLintptr fromOffset, GLintptr toOffset, GLsizeiptr size) {
    ++copyCalls;
    std::memcpy(storage[bindings[to]].data() + toOffset, storage[bindings[from]].data() + fromOffset, size);
  }
  decltype(&copy) glCopyBufferSubData = copy;
} gWebGL;
${implementation}
int main() {
  const unsigned char initial[] = {1,2,3,4}, full[] = {5,6,7,8}, partial[] = {9,10};
  bindNativeBuffer(0x8892, 1);
  bindNativeBuffer(0x8F36, 2); bindNativeBuffer(0x8F37, 3);
  bindNativeBuffer(0x8A11, 4);
  // Indexed UBO binding functions can change the generic binding too.
  bindings[0x8A11] = 5;
  nativeBufferData(0x8892, 4, initial, 0x88E4);
  const auto before = dataCalls;
  nativeBufferSubData(0x8892, 1, 2, partial);
  assert(dataCalls == before && storage[1] == std::vector<unsigned char>({1,9,10,4}));
  for(int i = 0; i < 7; ++i) nativeBufferSubData(0x8892, 0, 4, full);
  assert(storage[1] == std::vector<unsigned char>({5,6,7,8}));
  assert(bindings[0x8892] == 1 && bindings[0x8F36] == 2 && bindings[0x8F37] == 3 && bindings[0x8A11] == 5);
  const int mode = nativeBufferStreamingMode();
  const bool rotating = mode == 4 || mode == 6 || mode == 8 || mode == 9;
  assert(rotating == (copyCalls == 7));
  assert(uniformWrites == (mode == 9 && !std::getenv("TEST_NO_UNIFORM_STORAGE") ? 7 : 0));
  const auto sizeBefore = storage.size();
  nativeBufferData(0x8892, 2, partial, 0x88E4);
  if(rotating) assert(storage.size() == sizeBefore - 3);
  // Non-16-byte sizes remain exact GL buffer sizes, including after resize.
  nativeBufferSubData(0x8892, 0, 2, partial);
  assert(storage[1] == std::vector<unsigned char>({9,10}));
  deleteNativeBuffer(1);
  assert(gArrayBuffer == 0 && gBuffers.empty() && storage.empty());
  // Larger updates retain mode8 staging; zero-size writes do not discard.
  const unsigned char large[16] = {11,12,13};
  bindNativeBuffer(0x8892, 20);
  nativeBufferData(0x8892, 16, nullptr, 0x88E4);
  const auto uniformBefore = uniformWrites;
  nativeBufferSubData(0x8892, 0, 16, large);
  nativeBufferSubData(0x8892, 0, 0, nullptr);
  assert(uniformWrites == uniformBefore && storage[20] == std::vector<unsigned char>(large, large + 16));
  assert(bindings[0x8A11] == 5 && bindings[0x8F36] == 2 && bindings[0x8F37] == 3);
  deleteNativeBuffer(20);
  // Missing copy capability falls back to ordinary subdata without a ring.
  auto copy = gWebGL.glCopyBufferSubData;
  gWebGL.glCopyBufferSubData = nullptr;
  bindNativeBuffer(0x8892, 21);
  nativeBufferData(0x8892, 4, initial, 0x88E4);
  nativeBufferSubData(0x8892, 0, 4, full);
  assert(storage[21] == std::vector<unsigned char>({5,6,7,8}));
  deleteNativeBuffer(21);
  assert(storage.empty());
  gWebGL.glCopyBufferSubData = copy;
  bindNativeBuffer(0x8893, 10);
  nativeBufferData(0x8893, 4, initial, 0x88E4);
  bindNativeBuffer(0x8893, 11);
  nativeBufferData(0x8893, 4, initial, 0x88E4);
  // A VAO switch changes the driver's element binding without bindBuffer.
  bindings[0x8893] = 10;
  const auto beforeIndex = dataCalls;
  nativeBufferSubData(0x8893, 1, 2, partial);
  assert(dataCalls == beforeIndex && storage[10] == std::vector<unsigned char>({1,9,10,4}));
  const auto beforeCopy = copyCalls;
  nativeBufferSubData(0x8893, 0, 4, full);
  assert(storage[10] == std::vector<unsigned char>({5,6,7,8}));
  assert(storage[11] == std::vector<unsigned char>({1,2,3,4}));
  assert(bindings[0x8893] == 10 && bindings[0x8F36] == 2 && bindings[0x8F37] == 3);
  assert(copyCalls - beforeCopy == (mode == 6 ? 1 : 0));
  deleteNativeBuffer(10); deleteNativeBuffer(11);
  assert(gBuffers.empty());
}
`, env: { ...process.env, TMPDIR: nativeTestOutDir() }, stdio: ['pipe', 'inherit', 'inherit'],
})
for (const mode of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
  execFileSync(binary, [], { env: { ...process.env, GEA_WEBGL_BUFFER_STREAMING: String(mode) }, stdio: 'inherit' })
}
execFileSync(binary, [], { env: { ...process.env, GEA_WEBGL_BUFFER_STREAMING: '9', TEST_NO_UNIFORM_STORAGE: '1' }, stdio: 'inherit' })
}
console.log('Normal, allocation-profile and frame-profile streaming policies preserve full/partial data, bindings, ring reuse and deletion under ASan/UBSan')
