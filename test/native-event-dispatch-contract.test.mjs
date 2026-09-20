import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import plugin from '../geatsc-plugin.mjs'

import { compile } from '@geastack/compiler/dist/compiler.js'
import { walkRepresentation } from '@geastack/compiler/dist/representation/model.js'
import { nativeTestOutDir } from './out-dir.mjs'
const runtimeInclude = dirname(fileURLToPath(import.meta.resolve('@geastack/compiler/src/targets/cpp/runtime/gea_runtime_builtins.cpp')))
const sourceFile = fileURLToPath(import.meta.resolve('three/src/core/EventDispatcher.js'))
const source = plugin.configure().hostShims.transformSource({
  fileName: sourceFile,
  text: readFileSync(sourceFile, 'utf8'),
})
const entry = join(nativeTestOutDir(), 'native-event-dispatcher.js')
const binary = join(nativeTestOutDir(), 'native-event-dispatcher')
const environment = {
  ...process.env,
  TMPDIR: nativeTestOutDir(),
  CCACHE_DISABLE: '1',
  UBSAN_OPTIONS: 'halt_on_error=1',
}
for (const expected of [11, 12]) {
  const program = `${source}
let observed = 0;
const dispatcher = new EventDispatcher();
/** @this {EventDispatcher} @param {NativeEvent} event */
function second(event) { observed += this === event.target ? 10 : 1000; }
/** @this {EventDispatcher} @param {NativeEvent} event */
function first(event) {
  observed += this === event.target ? 1 : 100;
  dispatcher.removeEventListener('dispose', second);
  return { ignored: true };
}
dispatcher.addEventListener('dispose', first);
dispatcher.addEventListener('dispose', second);
dispatcher.addEventListener('dispose', first);
dispatcher.dispatchEvent({ type: 'dispose' });
new Date(observed === ${expected} ? 0 : NaN).toISOString();
`
  const result = compile({
    rootFileNames: [entry],
    projectFileName: null,
    javaScriptSources: true,
    sourceOverlay: new Map([[entry, program]]),
  })
  assert.ok(
    result.certificate,
    JSON.stringify({
      diagnostics: result.diagnostics.diagnostics,
      refusals: result.refusals,
    })
  )
  assert.deepEqual(result.loweringBlockers, [])
  assert.deepEqual(result.emissionRefusals, [])
  assert.ok(result.source)
  assert.equal(
    [...result.representations.plan.selected.values()].filter((value) =>
      [...walkRepresentation(value)].some((part) => part.kind === 'dynamic')
    ).length,
    0
  )
  const executable = result.source.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ' ')
  assert.doesNotMatch(executable, /\bgea::Value\b|\bgea_cpp_value\b|\bValue::box\w*\s*[<(]|\bunbox\w*\s*[<(]/)
  execFileSync(
    'clang++',
    [
      '-std=c++20',
      '-O1',
      '-fsanitize=address,undefined',
      `-I${runtimeInclude}`,
      '-x',
      'c++',
      '-',
      '-o',
      binary,
    ],
    {
      input: `${result.source}
int main() {
  try { __gea_top_level(); return 0; }
  catch (const gea::Value& error) {
    if (!gea::host::isRuntimeError(error)) return 2;
    std::fprintf(stderr, "%s\\n", gea::host::runtimeErrorString(error).c_str());
    return 1;
  }
}
`,
      env: environment,
    }
  )
  const native = spawnSync(binary, [], { encoding: 'utf8', env: environment })
  const javascript = spawnSync(process.execPath, ['--input-type=module', '-e', program], { encoding: 'utf8' })
  for (const execution of [native, javascript]) {
    assert.equal(execution.error, undefined)
    assert.equal(execution.status, expected === 11 ? 0 : 1, execution.stderr)
    if (expected !== 11) assert.match(execution.stderr, /RangeError: Invalid time value/)
  }
  assert.doesNotMatch(native.stderr, /AddressSanitizer|runtime error:/)
}
console.log('Native EventDispatcher preserves receiver, callback identity and snapshot delivery with zero boxing under ASan/UBSan')
