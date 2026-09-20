import assert from 'node:assert/strict'
import fs from 'node:fs'

const [prefix, logFile] = process.argv.slice(2)
assert.ok(prefix && logFile, 'Usage: compare-auto-instance-frames.mjs <frame prefix> <application log>')
function read(frame) {
  const bytes = fs.readFileSync(`${prefix}-f${frame}.ppm`)
  const header = /^P6\n(\d+) (\d+)\n255\n/.exec(bytes.subarray(0, 80).toString('ascii'))
  assert.ok(header)
  const width = Number(header[1]), height = Number(header[2])
  const pixels = bytes.subarray(header[0].length)
  assert.equal(pixels.length, width * height * 3)
  return { width, height, pixels }
}
const reference = read(90), instanced = read(180), hidden = read(300)
assert.equal(instanced.width, reference.width)
assert.equal(hidden.width, reference.width)
assert.equal(instanced.height, reference.height)
assert.equal(hidden.height, reference.height)
assert.ok(reference.pixels.some(value => value > 100), 'Reference must contain visible geometry')
assert.deepEqual(instanced.pixels, reference.pixels, 'Automatic instancing must preserve every lit reference pixel')
let changedLeft = 0, changedRight = 0
for (let pixel = 0; pixel < reference.width * reference.height; pixel++) {
  const offset = pixel * 3
  if (reference.pixels.subarray(offset, offset + 3).equals(hidden.pixels.subarray(offset, offset + 3))) continue
  if (pixel % reference.width < reference.width / 2) changedLeft++
  else changedRight++
}
assert.ok(changedLeft > 100, 'Hiding the left mesh must visibly remove it')
assert.equal(changedRight, 0, 'The right mesh must retain its pixels after the batch shrinks')
const log = fs.readFileSync(logFile, 'utf8')
for (const frame of [90, 180, 300]) assert.ok(log.includes(`dumped frame ${frame} to ${prefix}-f${frame}.ppm`))
assert.match(log, /\[auto\.instance\] 90 2 24 180/)
assert.match(log, /\[auto\.instance\] 180 1 24 240/)
assert.match(log, /\[auto\.instance\] 300 1 12 240/)
assert.match(log, /\[batch\.render\] complete/)
console.log(JSON.stringify({ width: reference.width, height: reference.height,
  differing: 0, changedLeft, changedRight, referenceDraws: 2, instancedDraws: 1, hiddenDraws: 1 }))
