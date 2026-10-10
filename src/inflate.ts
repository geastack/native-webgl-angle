// Raw DEFLATE (RFC 1951) decoder for data baked into a native binary -- glyph
// atlases, an app's mesh blobs. Baked data ships as base64 string literals,
// and compressing it first is what keeps a font or a model kit inside a
// microcontroller's app partition: zlib's deflate packs a 512 KB alpha atlas to
// ~40 KB and mesh blobs (flat shading triples every vertex) to a third.
// Encoders are zlib's own (node:zlib deflateRawSync, Python zlib with wbits=-15).

const lengthBase = new Uint16Array([3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258])
const lengthExtra = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0])
const distanceBase = new Uint16Array([
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385,
  24577
])
const distanceExtra = new Uint8Array([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13])
const codeLengthOrder = new Uint8Array([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15])

// The decoder is plain functions over locals and typed arrays, no class: a
// native build narrows a function's integer locals to machine integers, but a
// class's number fields stay doubles, and on a core without a double FPU (the
// ESP32-S31) every bit read through a field was several soft-float calls --
// inflating skytail's kit at boot took over 80 seconds.

/** Decoder state: read position, bit buffer, bits held, bytes written. */
const position = 0
const bitBuffer = 1
const bitCount = 2
const written = 3

function bits(state: Int32Array, source: Uint8Array, count: number): number {
  let buffer = state[bitBuffer]
  let have = state[bitCount]
  let at = state[position]
  while (have < count) {
    buffer |= source[at] << have
    at += 1
    have += 8
  }
  state[position] = at
  state[bitBuffer] = buffer >>> count
  state[bitCount] = have - count
  return buffer & ((1 << count) - 1)
}

/**
 * A canonical Huffman code as puff.c keeps it: `counts` (codes per length,
 * 16 entries) and `symbols` (in code order) built from code lengths.
 */
function buildHuffman(counts: Uint16Array, symbols: Uint16Array, lengths: Uint8Array, start: number, count: number): void {
  counts.fill(0)
  for (let i = 0; i < count; i++) counts[lengths[start + i]] += 1
  counts[0] = 0
  const offsets = new Uint16Array(16)
  for (let length = 1; length < 15; length++) offsets[length + 1] = offsets[length] + counts[length]
  for (let i = 0; i < count; i++) {
    const length = lengths[start + i]
    if (length !== 0) {
      symbols[offsets[length]] = i
      offsets[length] += 1
    }
  }
}

function decode(state: Int32Array, source: Uint8Array, counts: Uint16Array, symbols: Uint16Array): number {
  let code = 0
  let first = 0
  let index = 0
  for (let length = 1; length < 16; length++) {
    code |= bits(state, source, 1)
    const count = counts[length]
    if (code - first < count) return symbols[index + code - first]
    index += count
    first = (first + count) << 1
    code <<= 1
  }
  throw new Error('inflate: invalid Huffman code')
}

function stored(state: Int32Array, source: Uint8Array, output: Uint8Array): void {
  state[bitBuffer] = 0
  state[bitCount] = 0
  let at = state[position]
  let out = state[written]
  const length = source[at] | (source[at + 1] << 8)
  at += 4
  for (let i = 0; i < length; i++) {
    output[out] = source[at]
    out += 1
    at += 1
  }
  state[position] = at
  state[written] = out
}

function fixedCodes(literalCounts: Uint16Array, literals: Uint16Array, distanceCounts: Uint16Array, distances: Uint16Array): void {
  const lengths = new Uint8Array(320)
  for (let i = 0; i < 144; i++) lengths[i] = 8
  for (let i = 144; i < 256; i++) lengths[i] = 9
  for (let i = 256; i < 280; i++) lengths[i] = 7
  for (let i = 280; i < 288; i++) lengths[i] = 8
  for (let i = 288; i < 320; i++) lengths[i] = 5
  buildHuffman(literalCounts, literals, lengths, 0, 288)
  buildHuffman(distanceCounts, distances, lengths, 288, 30)
}

function dynamicCodes(
  state: Int32Array,
  source: Uint8Array,
  literalCounts: Uint16Array,
  literals: Uint16Array,
  distanceCounts: Uint16Array,
  distances: Uint16Array
): void {
  const literalCount = bits(state, source, 5) + 257
  const distanceCount = bits(state, source, 5) + 1
  const codeLengthCount = bits(state, source, 4) + 4
  const lengths = new Uint8Array(320)
  for (let i = 0; i < codeLengthCount; i++) lengths[codeLengthOrder[i]] = bits(state, source, 3)
  buildHuffman(literalCounts, literals, lengths, 0, 19)
  lengths.fill(0)
  let index = 0
  while (index < literalCount + distanceCount) {
    const symbol = decode(state, source, literalCounts, literals)
    if (symbol < 16) {
      lengths[index] = symbol
      index += 1
      continue
    }
    let value = 0
    let repeat = 0
    if (symbol === 16) {
      value = lengths[index - 1]
      repeat = 3 + bits(state, source, 2)
    } else if (symbol === 17) {
      repeat = 3 + bits(state, source, 3)
    } else {
      repeat = 11 + bits(state, source, 7)
    }
    for (let i = 0; i < repeat; i++) {
      lengths[index] = value
      index += 1
    }
  }
  buildHuffman(literalCounts, literals, lengths, 0, literalCount)
  buildHuffman(distanceCounts, distances, lengths, literalCount, distanceCount)
}

function codes(
  state: Int32Array,
  source: Uint8Array,
  output: Uint8Array,
  literalCounts: Uint16Array,
  literals: Uint16Array,
  distanceCounts: Uint16Array,
  distances: Uint16Array
): void {
  for (;;) {
    const symbol = decode(state, source, literalCounts, literals)
    if (symbol < 256) {
      const out = state[written]
      output[out] = symbol
      state[written] = out + 1
      continue
    }
    if (symbol === 256) return
    const lengthSymbol = symbol - 257
    const length = lengthBase[lengthSymbol] + bits(state, source, lengthExtra[lengthSymbol])
    const distanceSymbol = decode(state, source, distanceCounts, distances)
    const distance = distanceBase[distanceSymbol] + bits(state, source, distanceExtra[distanceSymbol])
    // A match may overlap its own output, so it copies byte by byte.
    let out = state[written]
    let from = out - distance
    for (let i = 0; i < length; i++) {
      output[out] = output[from]
      out += 1
      from += 1
    }
    state[written] = out
  }
}

/** Inflates a raw DEFLATE stream into exactly `length` bytes. */
export function inflateRaw(source: Uint8Array, length: number): Uint8Array {
  const output = new Uint8Array(length)
  const state = new Int32Array(4)
  const literalCounts = new Uint16Array(16)
  const literals = new Uint16Array(288)
  const distanceCounts = new Uint16Array(16)
  const distances = new Uint16Array(288)
  let last = 0
  while (last === 0) {
    last = bits(state, source, 1)
    const type = bits(state, source, 2)
    if (type === 0) stored(state, source, output)
    else if (type === 1) {
      fixedCodes(literalCounts, literals, distanceCounts, distances)
      codes(state, source, output, literalCounts, literals, distanceCounts, distances)
    } else if (type === 2) {
      dynamicCodes(state, source, literalCounts, literals, distanceCounts, distances)
      codes(state, source, output, literalCounts, literals, distanceCounts, distances)
    } else throw new Error('inflate: invalid block type')
  }
  if (state[written] !== length) throw new Error('inflate: stream length does not match')
  return output
}

function base64Value(code: number): number {
  if (code >= 65 && code <= 90) return code - 65
  if (code >= 97 && code <= 122) return code - 71
  if (code >= 48 && code <= 57) return code + 4
  if (code === 43) return 62
  if (code === 47) return 63
  return 0
}

/**
 * The bytes base64 string chunks spell. Not atob: the native runtime stores
 * strings as UTF-8, so atob's "binary string" would read bytes >= 0x80 back as
 * Unicode through charCodeAt. Every chunk but the last is a multiple of 4.
 */
export function base64Bytes(chunks: string[]): Uint8Array {
  let length = 0
  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c]
    length += (chunk.length / 4) * 3
    if (chunk.length > 0 && chunk.charCodeAt(chunk.length - 1) === 61) length -= 1
    if (chunk.length > 1 && chunk.charCodeAt(chunk.length - 2) === 61) length -= 1
  }
  const bytes = new Uint8Array(length)
  let out = 0
  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c]
    for (let i = 0; i < chunk.length; i += 4) {
      const code2 = chunk.charCodeAt(i + 2)
      const code3 = chunk.charCodeAt(i + 3)
      const v0 = base64Value(chunk.charCodeAt(i))
      const v1 = base64Value(chunk.charCodeAt(i + 1))
      const v2 = base64Value(code2)
      const v3 = base64Value(code3)
      bytes[out] = (v0 << 2) | (v1 >> 4)
      out += 1
      if (code2 !== 61) {
        bytes[out] = ((v1 & 15) << 4) | (v2 >> 2)
        out += 1
      }
      if (code3 !== 61) {
        bytes[out] = ((v2 & 3) << 6) | v3
        out += 1
      }
    }
  }
  return bytes
}
