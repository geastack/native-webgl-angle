import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dirname, resolve, join } from 'node:path'
import { nativeUploadFunctions } from '../geatsc-plugin-uploads.mjs'
import { nativeTestOutDir } from './out-dir.mjs'
import { fileURLToPath } from 'node:url'
const runtimeInclude = dirname(fileURLToPath(import.meta.resolve('@geastack/compiler/src/targets/cpp/runtime/gea_runtime_builtins.cpp')))

const binary = join(nativeTestOutDir(), 'native-upload-transport-test')
const source = `#include "gea_runtime.h"
#include <cassert>
#include <array>
#include <cstring>
static std::array<unsigned char, 64> received{};
static double receivedSize = 0, receivedOffset = 0;
extern "C" void gea_three_webgl_buffer_data_bytes(double, double, const void* data, double size) {
  receivedSize = size;
  if (size) std::memcpy(received.data(), data, static_cast<std::size_t>(size));
}
extern "C" void gea_three_webgl_buffer_sub_data_bytes(double, double offset, const void* data, double size) {
  receivedOffset = offset;
  gea_three_webgl_buffer_data_bytes(0,0,data,size);
}
extern "C" void gea_three_webgl_tex_image_2d_bytes(double, double, double, double, double, double, double, const void* data, double size) {
  gea_three_webgl_buffer_data_bytes(0,0,data,size);
}
extern "C" void gea_three_webgl_tex_sub_image_2d_bytes(double, double, double, double, double, double, double, double, const void* data, double size) {
  gea_three_webgl_buffer_data_bytes(0,0,data,size);
}
${nativeUploadFunctions.map(row => row[3]).join('\n')}
// WebGL uploads a texture view's own bytes, and the GL type names the view
// (WebGL 2 3.7.6): HALF_FLOAT data is Uint16Array bit patterns, as in three's
// DFG LUT, and must not be widened to float.
template <typename T> static void assertTextureBytes(double type, std::initializer_list<T> values) {
  auto pixels = gea::makeRef<gea::TypedArray<T>>(values.size());
  unsigned i = 0;
  for (T value : values) pixels->setElement(i++, value);
  const double size = static_cast<double>(values.size() * sizeof(T));
  gea_three_webgl_tex_image_2d_native(0, 0, 0, 1, 1, 0, type, pixels);
  assert(receivedSize == size && std::memcmp(received.data(), pixels->data(), values.size() * sizeof(T)) == 0);
  receivedSize = -1;
  gea_three_webgl_tex_sub_image_2d_native(0, 0, 0, 0, 1, 1, 0, type, pixels);
  assert(receivedSize == size && std::memcmp(received.data(), pixels->data(), values.size() * sizeof(T)) == 0);
}
int main() {
  assertTextureBytes<std::uint8_t>(0x1401, {255, 1});
  assertTextureBytes<std::int8_t>(0x1400, {-1, -128});
  for (double type : {0x1403, 0x140B, 0x8D61, 0x8033, 0x8034, 0x8363})
    assertTextureBytes<std::uint16_t>(type, {0x30b5, 0x7bff});
  assertTextureBytes<std::int16_t>(0x1402, {-1, -32768});
  for (double type : {0x1405, 0x8368, 0x8C3B, 0x8C3E, 0x84FA})
    assertTextureBytes<std::uint32_t>(type, {0xffffffffu, 0x80000001u});
  assertTextureBytes<std::int32_t>(0x1404, {-1, -2147483647});
  assertTextureBytes<float>(0x1406, {0.1f, -2.5f});
  auto words = gea::makeRef<gea::TypedArray<std::uint16_t>>(4);
  for (unsigned i = 0; i < 4; ++i) words->setElement(i, 65000 + i);
  gea_three_webgl_buffer_sub_data_range_native(0, 12, 2, words, 1, 2);
  assert(receivedSize == 4 && receivedOffset == 12);
  std::uint16_t value; std::memcpy(&value, received.data(), sizeof(value));
  assert(value == 65001);
  gea_three_webgl_buffer_sub_data_range_native(0, 0, 2, words, INFINITY, 5);
  assert(receivedSize == 0);
  gea_three_webgl_buffer_sub_data_range_native(0, 0, 2, words, 1, INFINITY);
  assert(receivedSize == 6);
  auto signedBytes = gea::makeRef<gea::TypedArray<std::int8_t>>(2);
  signedBytes->setElement(0, -1); signedBytes->setElement(1, -128);
  gea_three_webgl_buffer_data_native(0, 0, 5, signedBytes);
  assert(receivedSize == 2 && received[0] == 255 && received[1] == 128);
  auto doubles = gea::makeRef<gea::TypedArray<double>>(1);
  doubles->setElement(0, 1.0 / 3);
  gea_three_webgl_buffer_data_native(0,0,8,doubles);
  double exact; std::memcpy(&exact, received.data(), sizeof(exact));
  assert(receivedSize == 8 && exact == 1.0 / 3);
  auto numbers = gea::makeRef<gea::ArrayObject<double>>();
  numbers->push(1.25); numbers->push(2.5);
  gea_three_webgl_buffer_data_native(0,0,1,numbers);
  float single; std::memcpy(&single, received.data(), sizeof(single));
  assert(receivedSize == 8 && single == 1.25f);
  gea_three_webgl_buffer_data_native(0,0,1,gea::Undefined{});
  assert(receivedSize == 0);
}`
execFileSync('clang++', ['-std=c++20', '-O1', '-fsanitize=address,undefined',
  '-I'+runtimeInclude, '-x', 'c++', '-', '-o', binary], { input: source, stdio: ['pipe', 'inherit', 'inherit'] })
assert.equal(execFileSync(binary, { encoding: 'utf8' }), '')
console.log('Native upload formats, exact bytes, offsets and bounded ranges pass ASan/UBSan')
