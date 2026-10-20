import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path, { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { executableSuffix, nativeTestOutDir } from './out-dir.mjs'
const runtimeInclude = dirname(fileURLToPath(import.meta.resolve('@geastack/compiler/src/targets/cpp/runtime/gea_runtime_builtins.cpp')))
const packageDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
process.env.GEATSC2_WEBGL_PLUGIN = path.join(packageDir, 'geatsc-plugin.mjs')
const { compile } = await import('@geastack/compiler/dist/compiler.js')

// A program reads files from its Resources folder whole, in place, into the
// Uint8Array it allocated; a missing file, a refused name and a size mismatch
// are reported, never read past.
const entry = path.join(packageDir, 'test', 'resource-host-entry.js')
const source = `
import { nativeReadResource, nativeResourceSize } from '../src/nativeResources.js'
const bytes = nativeReadResource('textures/a.bin')
let sum = 0
for (let i = 0; i < bytes.length; i++) sum += bytes[i]
console.log(bytes.length, sum, bytes[0], bytes[bytes.length - 1])
console.log(nativeResourceSize('missing.bin'), nativeResourceSize('../outside.bin'), nativeResourceSize('/abs.bin'), nativeResourceSize('textures/../a.bin'))
console.log(nativeReadResource('empty.bin').length)
let missing = ''
try { nativeReadResource('missing.bin') } catch (error) { missing = error instanceof Error ? error.message : 'thrown' }
console.log(missing)
`
const result = compile({ rootFileNames: [entry], projectFileName: null, sourceOverlay: new Map([[entry, source]]) })
assert.ok(result.certificate && result.source, JSON.stringify({ diagnostics: result.diagnostics.diagnostics, refusals: result.refusals }, null, 2))
assert.deepEqual(result.emissionRefusals, [])

const out = nativeTestOutDir()
const resources = join(out, 'resource-host-resources')
fs.rmSync(resources, { recursive: true, force: true })
fs.mkdirSync(join(resources, 'textures'), { recursive: true })
const payload = Buffer.from(Array.from({ length: 70000 }, (_, i) => (i * 7 + 3) & 255))
fs.writeFileSync(join(resources, 'textures', 'a.bin'), payload)
fs.writeFileSync(join(resources, 'empty.bin'), Buffer.alloc(0))
fs.writeFileSync(join(out, 'outside.bin'), Buffer.from([1, 2, 3]))

const binary = join(out, `resource-host-contract-test${executableSuffix}`)
const host = path.join(packageDir, 'native', 'resource_host.mm')
execFileSync(process.env.CXX ?? 'clang++', ['-std=c++20', '-O1', '-fsanitize=address,undefined', `-I${runtimeInclude}`,
  '-x', 'c++', host, '-x', 'c++', '-', '-o', binary], {
  input: `${result.source}
int main() { __gea_top_level(); }
`,
  env: { ...process.env, TMPDIR: out },
  stdio: ['pipe', 'inherit', 'inherit'],
})
let sum = 0
for (const byte of payload) sum += byte
// Windows opens a C++ program's stdout in text mode: `\n` arrives as `\r\n`.
const printed = execFileSync(binary, { encoding: 'utf8', env: { ...process.env, GEA_RESOURCE_DIR: resources } }).replaceAll('\r\n', '\n')
assert.equal(printed, `70000 ${sum} ${payload[0]} ${payload[payload.length - 1]}\n-1 -1 -1 -1\n0\nMissing resource: missing.bin\n`)
console.log('Resources files reach a typed array whole and in place; missing, refused and outside names are not read')
