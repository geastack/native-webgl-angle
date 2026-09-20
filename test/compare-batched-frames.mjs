import assert from 'node:assert/strict'
import fs from 'node:fs'

const prefix = process.argv[2]
const logFile = process.argv[3]
assert.ok(prefix && logFile, 'Usage: node test/compare-batched-frames.mjs <GEA_WEBGL_DUMP_FRAME prefix> <application log>')
function read(frame) {
  const bytes = fs.readFileSync(`${prefix}-f${frame}.ppm`)
  const header = /^P6\n(\d+) (\d+)\n255\n/.exec(bytes.subarray(0, 80).toString('ascii'))
  assert.ok(header, 'Expected native host P6 framebuffer dump')
  const width = Number(header[1]), height = Number(header[2])
  const pixels = bytes.subarray(header[0].length)
  assert.equal(pixels.length, width * height * 3)
  return { width, height, pixels }
}
const reference = read(90), batch = read(180), hidden = read(300)
assert.equal(batch.width, reference.width)
assert.equal(batch.height, reference.height)
assert.equal(hidden.width, reference.width)
assert.equal(hidden.height, reference.height)
let differing = 0, changedAfterHide = 0
function colors(frame) {
  let red = 0, blue = 0
  for (let i = 0; i < frame.pixels.length; i += 3) {
    const [r, g, b] = frame.pixels.subarray(i, i + 3)
    if (r > 160 && g < 130 && b < 90) red++
    if (r < 100 && g > 100 && b > 160) blue++
  }
  return { red, blue }
}
for (let offset = 0; offset < reference.pixels.length; offset += 3) {
  const expected = reference.pixels.subarray(offset, offset + 3)
  if (!expected.equals(batch.pixels.subarray(offset, offset + 3))) differing++
  if (!expected.equals(hidden.pixels.subarray(offset, offset + 3))) changedAfterHide++
}
assert.equal(differing, 0, 'Batched colors and matrices must match ordinary mesh pixels')
assert.ok(changedAfterHide > 100, 'Hiding the first instance must change visible pixels')
const referenceColors = colors(reference), hiddenColors = colors(hidden)
assert.ok(referenceColors.red > 100 && referenceColors.blue > 100, 'Reference must visibly contain both colored meshes')
assert.equal(hiddenColors.red, 0, 'Hiding instance zero must remove the red mesh')
assert.equal(hiddenColors.blue, referenceColors.blue, 'The indirect draw ID must still select the unchanged blue mesh')
const log = fs.readFileSync(logFile, 'utf8')
for (const frame of [90, 180, 300]) {
  assert.ok(log.includes(`dumped frame ${frame} to ${prefix}-f${frame}.ppm`), 'The current run must capture every compared frame')
}
assert.match(log, /\[batch\.render\] 90 2 24 0/)
assert.match(log, /\[batch\.render\] 180 2 24 2/)
assert.match(log, /\[batch\.render\] 300 1 12 1/)
assert.match(log, /\[batch\.render\] complete/)
console.log(JSON.stringify({ width: reference.width, height: reference.height, differing,
  changedAfterHide, referenceColors, hiddenColors, referenceDraws: 2, batchDraws: 2, hiddenDraws: 1 }))
