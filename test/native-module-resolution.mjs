import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { geaAppleNativeModuleAliases } from '@geastack/core/scripts/gea-vite-module-graph-plugin.mjs'

// The same TypeScript the compiler itself uses. This package's own
// devDependency is `latest`, and TypeScript 7 moved the compiler API behind
// ./unstable/*, so a bare `typescript` import resolves to a version stub.
const ts = createRequire(import.meta.resolve('@geastack/compiler/package.json'))('typescript')

// Hashes the installed compiler's built output, so a test can prove the same
// compiler produced every artifact it compares.
export function compilerFingerprint() {
  const compilerRoot = path.dirname(fileURLToPath(import.meta.resolve('@geastack/compiler/dist/compiler.js')))
  const files = []
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (entry.name.endsWith('.js') || entry.name.endsWith('.d.ts')) files.push(file)
    }
  }
  visit(compilerRoot)
  const hash = createHash('sha256')
  for (const file of files.sort()) hash.update(path.relative(compilerRoot, file).replaceAll('\\', '/')).update(fs.readFileSync(file))
  return hash.digest('hex')
}

// Apply the shipping target's aliases when an isolated compiler fixture does
// not go through Vite. In particular, callback parameter layouts must use the
// native XR/animation managers rather than accidentally importing browser XR.
export function nativeModuleResolution() {
  const packageDir = fileURLToPath(new URL('..', import.meta.url))
  const require = createRequire(import.meta.resolve('@geastack/compiler/package.json'))
  const ts = require('typescript')
  const threeSrcDir = fs.realpathSync(fileURLToPath(new URL('./', import.meta.resolve('three/src/constants.js'))))
  const aliases = geaAppleNativeModuleAliases({
    threeSrcDir,
    threeUtilsModule: path.join(packageDir, 'src/nativeThreeUtils.ts'),
    threeWebGLAnimationModule: path.join(packageDir, 'src/nativeWebGLAnimation.ts'),
    threeWebXRManagerModule: path.join(packageDir, 'src/nativeWebXRManager.ts'),
  })
  const resolution = new Map()
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (/\.[cm]?[jt]s$/.test(entry.name)) {
        const imports = ts.preProcessFile(fs.readFileSync(file, 'utf8')).importedFiles
        const selected = new Map()
        for (const { fileName: specifier } of imports) {
          const alias = aliases.find(alias => alias.find.test(specifier))
          if (alias) selected.set(specifier, specifier.replace(alias.find, alias.replacement))
        }
        if (selected.size) resolution.set(file, selected)
      }
    }
  }
  visit(threeSrcDir)
  visit(path.join(packageDir, 'src'))
  return resolution
}
