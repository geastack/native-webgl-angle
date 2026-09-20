import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { compilerFingerprint } from './native-module-resolution.mjs'

// Reuse the shipping graph and compiler in memory, so profiling never rewrites
// the generated C++ an ongoing native build may be reading.
const packageDir = fileURLToPath(new URL('../', import.meta.url))
const appleRoot = path.dirname(createRequire(import.meta.url).resolve('@geastack/apple/package.json'))
const option = name => {
  const index = process.argv.indexOf(name)
  return index < 0 ? null : process.argv[index + 1]
}
const generated = path.resolve(option('--generated') ?? path.join(appleRoot, 'targets/macos/generated/three-batched-mesh'))
const fingerprint = compilerFingerprint()
process.env.GEA_STAGE_TIMING = '1'
process.env.GEATSC2_WEBGL_PLUGIN ??= path.join(packageDir, 'geatsc-plugin-batched-probe.mjs')
import { compile } from '@geastack/compiler/dist/compiler.js'
import { readModuleGraph } from '@geastack/compiler/dist/cli-module-graph.js'
import { findProjectFile } from '@geastack/compiler/dist/semantics/program.js'
const graph = readModuleGraph(path.join(generated, 'module-graph/gea-module-graph.json'), 'hybrid', option('--entry'))
assert.equal(compilerFingerprint(), fingerprint, 'Compiler changed while loading')
const stages = {}
const originalWrite = process.stderr.write
process.stderr.write = function (chunk, ...args) {
  const match = /^\[STAGE\]\s+(\S+)\s+(\d+)ms/.exec(String(chunk))
  if (match) stages[match[1]] = Number(match[2])
  return originalWrite.call(this, chunk, ...args)
}
const cpuBefore = process.cpuUsage()
const started = performance.now()
let result
try {
  result = compile({
    rootFileNames: [graph.entry], projectFileName: findProjectFile(path.dirname(graph.entry)),
    javaScriptSources: true, dynamicFallback: false,
    pluginOptions: new Map([
      ['gea.ir', path.join(generated, 'dist/gea-ir.json')],
      ['gea.microtasks-namespace', 'gea::framework::app::generated'],
      ['apple.metadata', path.join(generated, 'gea-apple-metadata.json')]
    ]),
    sourceOverlay: graph.overlay, moduleResolution: graph.imports,
    statedModuleSet: true, isolateSymbols: false, translationUnits: 'per-file',
    unitBaseName: path.basename(graph.entry).replace(/\.[^.]+$/, '')
  })
} finally {
  process.stderr.write = originalWrite
}
const wallMs = performance.now() - started
const cpu = process.cpuUsage(cpuBefore)
assert.equal(compilerFingerprint(), fingerprint, 'Compiler changed during measurement')
assert.ok(result.certificate, 'Profiled program must certify')
assert.ok(result.units.length, 'Profiled program must emit C++')
const hashes = Object.fromEntries(result.units.map(unit => [unit.fileName, createHash('sha256').update(unit.source).digest('hex')]).sort(([a], [b]) => a.localeCompare(b)))
const report = { fingerprint, entry: graph.entry, wallMs, cpuMs: (cpu.user + cpu.system) / 1000, stages, hashes }
const compare = option('--compare')
if (compare) {
  const before = JSON.parse(fs.readFileSync(compare, 'utf8'))
  const changedUnits = [...new Set([...Object.keys(hashes), ...Object.keys(before.hashes)])].filter(file => hashes[file] !== before.hashes[file])
  report.comparison = { byteIdentical: changedUnits.length === 0, changedUnits, speedup: before.wallMs / wallMs, cpuSpeedup: before.cpuMs / report.cpuMs }
}
const output = option('--report')
if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ ...report, hashes: undefined, units: result.units.length }))
if (report.comparison) assert.equal(report.comparison.changedUnits.length, 0, 'Optimization changed emitted C++')
