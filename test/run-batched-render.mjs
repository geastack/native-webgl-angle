import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { compilerFingerprint } from './native-module-resolution.mjs'

import { createRequire } from 'node:module'

// This runs in the app it validates, like every other build in the stack: the
// app directory is the working directory, and the app's own `dist/macos` is
// where the shipping target writes.
const appDir = process.cwd()
const appId = 'three-batched-mesh'
const appPackage = path.join(appDir, 'package.json')
assert.ok(
  fs.existsSync(appPackage) && JSON.parse(fs.readFileSync(appPackage, 'utf8')).gea?.id === appId,
  `run this from the ${appId} app directory; cwd is ${appDir}`,
)

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const appleRoot = path.dirname(createRequire(appPackage).resolve('@geastack/apple/package.json'))
const target = path.join(appleRoot, 'targets/macos')
const appOutput = path.join(appDir, 'dist/macos', appId)
const output = path.join(appOutput, 'build')
// This is the shipping target's build directory, also used by build-macos.sh.
fs.mkdirSync(output, { recursive: true })
const buildLog = path.join(output, 'validation-build.log')
const applicationLog = path.join(output, 'validation.log')
const autoInstance = process.argv.includes('--auto-instance')
const prefix = path.join(output, autoInstance ? 'auto-instance-render' : 'batched-render')
const environment = {
  ...process.env,
  GEA_PER_FILE_UNITS: '1',
  GEA_MACOS_JOBS: process.env.GEA_MACOS_JOBS ?? '2',
  GEA_MACOS_TIMINGS: '1',
  GEATSC2_WEBGL_PLUGIN: path.join(packageRoot, 'geatsc-plugin-batched-probe.mjs'),
  ...(autoInstance ? { GEA_WEBGL_AUTO_INSTANCE: '1', GEA_WEBGL_AUTO_INSTANCE_TEST: '1' } : {}),
}
if (!process.argv.includes('--capture-only')) {
  const compilerBefore = compilerFingerprint()
  console.log(`Building the real native validation app; log: ${buildLog}`)
  const buildFd = fs.openSync(buildLog, 'w')
  fs.writeSync(buildFd, `Canonical compiler (paths relative to compiler root): ${compilerBefore}\n`)
  try {
    await new Promise((resolve, reject) => {
      const child = spawn('bash', [path.join(target, 'build-macos.sh'), appId], {
        cwd: appDir, env: environment, stdio: ['ignore', 'pipe', 'pipe'],
      })
      let generationVerified = false
      let tail = ''
      const capture = chunk => {
        fs.writeSync(buildFd, chunk)
        tail = (tail + chunk.toString()).slice(-8000)
        if (!generationVerified && /\[macos timing\] generation\s/.test(tail)) {
          // The canonical compiler is no longer read after this build phase.
          // Other work may rebuild it while Clang compiles the emitted C++.
          const compilerAfter = compilerFingerprint()
          generationVerified = true
          fs.writeSync(buildFd, `Canonical compiler after generation: ${compilerAfter}\n`)
          console.log(`C++ generation complete; compiler provenance ${compilerBefore} -> ${compilerAfter}`)
        }
      }
      child.stdout.on('data', capture)
      child.stderr.on('data', capture)
      child.on('error', reject)
      child.on('close', (code, signal) => {
        if (code !== 0) reject(new Error(`Native build failed (${code ?? signal}); see ${buildLog}`))
        else if (!generationVerified) reject(new Error('Native build did not report its generation checkpoint'))
        else resolve()
      })
    })
  } finally {
    fs.closeSync(buildFd)
  }
} else {
  assert.ok(fs.existsSync(buildLog), 'Capture-only validation requires the existing application build log')
  console.log(`Capturing the existing native executable; its build provenance is in ${buildLog}`)
}

// Permit C++ compilation to overlap the output gate; capture remains a separate check.
if (process.argv.includes('--build-only')) process.exit(0)

console.log(`Capturing actual ANGLE framebuffers; log: ${applicationLog}`)
const executable = path.join(appOutput, 'Three BatchedMesh Validation.app/Contents/MacOS/Three BatchedMesh Validation')
const logFd = fs.openSync(applicationLog, 'w')
try {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, [], {
      env: { ...environment, GEA_WEBGL_DUMP_FRAME: prefix, GEA_THREE_ANGLE_SMOKE_LOG: path.join(output, 'validation-host.log') },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let complete = false
    let timedOut = false
    let tail = ''
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, 45000)
    const capture = chunk => {
      fs.writeSync(logFd, chunk)
      tail = (tail + chunk.toString()).slice(-8000)
      if (!complete && tail.includes('[batch.render] complete')) {
        complete = true
        child.kill('SIGTERM')
      }
    }
    child.stdout.on('data', capture)
    child.stderr.on('data', capture)
    child.on('error', error => { clearTimeout(timeout); reject(error) })
    child.on('close', (code, signal) => {
      clearTimeout(timeout)
      if (timedOut) reject(new Error(`Native rendering did not complete within 45 seconds; see ${applicationLog}\n${tail}`))
      else if (complete) resolve()
      else reject(new Error(`Native renderer exited before completion (${code ?? signal}); see ${applicationLog}\n${tail}`))
    })
  })
} finally {
  fs.closeSync(logFd)
}
const comparison = spawnSync(process.execPath, [fileURLToPath(new URL(autoInstance ? 'compare-auto-instance-frames.mjs' : 'compare-batched-frames.mjs', import.meta.url)), prefix, applicationLog], {
  stdio: 'inherit',
})
assert.equal(comparison.status, 0, 'Actual native framebuffer/draw comparison failed')
