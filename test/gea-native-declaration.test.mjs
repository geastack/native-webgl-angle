// The package's native declaration for desktop targets (gea-native.json): every
// named source ships in the npm archive, the declaration itself is exported,
// and each role of the required EGL/GLES provider reaches the host through a
// define the host reads.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const declaration = JSON.parse(fs.readFileSync(path.join(root, 'gea-native.json'), 'utf8'))
const windows = declaration.windows

assert.equal(manifest.exports['./gea-native.json'], './gea-native.json')
assert.ok(manifest.files.includes('gea-native.json'))
const shipped = (file) => manifest.files.some((entry) => file === entry || file.startsWith(`${entry}/`))
for (const file of [...windows.sources, ...windows.includeDirs]) {
  assert.ok(fs.existsSync(path.join(root, file)), `${file} exists`)
  assert.ok(shipped(file), `${file} is in the npm archive`)
}
assert.ok(windows.sources.includes('native/angle_webgl_host.mm'))
assert.ok(windows.sources.includes('native/audio_host.mm'))

const host = fs.readFileSync(path.join(root, 'native', 'angle_webgl_host.mm'), 'utf8')
const roles = Object.entries(windows.requires.gles.files)
assert.deepEqual(roles.map(([role]) => role).sort(), ['egl', 'gles'])
// A Windows checkout made with Git's core.autocrlf (its installer's default) reads the host with CRLF line ends.
for (const [role, { define, default: fallback }] of roles) {
  assert.match(host, new RegExp(`#ifndef ${define}\\r?\\n#define ${define} "${fallback.replace('.', '\\.')}"`), `${role}: the host defaults ${define}`)
  assert.match(host, new RegExp(`openWin32\\([^)]*${define}\\)`), `${role}: the host loads ${define}`)
}

const surface = fs.readFileSync(path.join(root, 'native', 'win32_webgl_surface.cpp'), 'utf8')
assert.match(surface, /gea_win32_register_host_extension\(&kSurfaceExtension\)/)
assert.match(surface, /gea_three_webgl_attach_uwp\(gSurface/)
console.log('PASS the desktop native declaration ships its sources and names the provider files the host loads')
