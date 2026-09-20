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
${nativeUploadFunctions.map(row => row[3]).join('\n')}
int main() {
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
