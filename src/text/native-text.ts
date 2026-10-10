// Native text rendering for the troika-three-text Text surface: baked alpha glyph
// atlases (stb_truetype, build-time) drawn as textured quads. This is the
// "engine stb_truetype -> GL atlas" path — it runs on
// any three-angle target (macOS/ANGLE, Windows) with zero host dependencies: the
// atlas rides in the compiled binary and uploads as a DataTexture.
import { BufferAttribute } from 'three/src/core/BufferAttribute.js'
import { BufferGeometry } from 'three/src/core/BufferGeometry.js'
import { DataTexture } from 'three/src/textures/DataTexture.js'
import type { Texture } from 'three/src/textures/Texture.js'
import {
  ClampToEdgeWrapping,
  LinearFilter,
  NoColorSpace,
  RedFormat,
  RGFormat,
  UnsignedByteType,
  UVMapping,
} from 'three/src/constants.js'
import type { GlyphAtlas } from './native-text-types'
import { base64Bytes, inflateRaw } from '../inflate'
export interface LaidOutText {
  geometry: BufferGeometry
  positions: Float32Array
  width: number
  ascent: number
  descent: number
}

// Caches keyed by the atlas NAME: GlyphAtlas is an interface (by-value
// struct under geatsc), so identity comparison on module reads never hits —
// which would re-decode and re-upload the 1MB texture on every sync
// (measured: 0.2 fps). String keys are stable across copies.
const textureCacheKeys: string[] = []
const textureCacheValues: DataTexture[] = []

// Where an atlas's alpha bitmap comes from when the build carries none
// (`alphaBase64` is empty): a target can keep its atlases outside the app image
// -- the ESP-Mosaico on its SPI NAND -- and set this to read one by atlas name.
// The bytes are the bitmap as baked: raw DEFLATE when `alphaPacked`.
let atlasAlphaSource: (name: string) => Uint8Array = (name: string): Uint8Array => {
  throw new Error(`text: no alpha bitmap for atlas ${name}: this build carries none and no source is set`)
}

export function setAtlasAlphaSource(source: (name: string) => Uint8Array): void {
  atlasAlphaSource = source
}

// A renderer that can sample one byte per texel as both red and green (gea-threejs:
// TextureUserData.redAsGreen) keeps an atlas at one byte per texel instead of two,
// and the bitmap read from the source is the texture's own storage (no copy).
let singleByteAtlases = false

export function useSingleByteAtlases(): void {
  singleByteAtlases = true
}

// Decode the alpha bitmap into the glyph coverage texture, built once per atlas
// and shared by every text instance. It is the material's alphaMap, which
// reads green, so the texture is red-green (r = g = coverage): two bytes per
// texel where a white RGBA map took four, and a renderer that keeps byte
// images at their own size (gea-threejs) holds half of what it did. The
// bytes are dropped once uploaded -- nothing re-uploads an atlas.
export function atlasTexture(atlas: GlyphAtlas): DataTexture {
  for (let i = 0; i < textureCacheKeys.length; i++) {
    if (textureCacheKeys[i] === atlas.name) return textureCacheValues[i]
  }
  const total = atlas.atlasWidth * atlas.atlasHeight
  const encoded = atlas.alphaBase64.length === 0 ? atlasAlphaSource(atlas.name) : base64Bytes(atlas.alphaBase64)
  const alpha = atlas.alphaPacked ? inflateRaw(encoded, total) : encoded
  if (singleByteAtlases) {
    const single = new DataTexture(
      alpha,
      atlas.atlasWidth,
      atlas.atlasHeight,
      RedFormat,
      UnsignedByteType,
      UVMapping,
      ClampToEdgeWrapping,
      ClampToEdgeWrapping,
      LinearFilter,
      LinearFilter,
      1,
      NoColorSpace,
    )
    single.userData.redAsGreen = true
    single.unpackAlignment = 1
    single.onUpdate = releaseAtlasBytes
    single.needsUpdate = true
    textureCacheKeys.push(atlas.name)
    textureCacheValues.push(single)
    return single
  }
  const coverage = new Uint8Array(total * 2)
  for (let i = 0; i < total; i++) {
    coverage[i * 2] = alpha[i]
    coverage[i * 2 + 1] = alpha[i]
  }
  const tex = new DataTexture(
    coverage,
    atlas.atlasWidth,
    atlas.atlasHeight,
    RGFormat,
    UnsignedByteType,
    UVMapping,
    ClampToEdgeWrapping,
    ClampToEdgeWrapping,
    LinearFilter,
    LinearFilter,
    1,
    NoColorSpace,
  )
  // Rows of width * 2 bytes: tightly packed for any even width.
  tex.unpackAlignment = 2
  tex.onUpdate = releaseAtlasBytes
  tex.needsUpdate = true
  textureCacheKeys.push(atlas.name)
  textureCacheValues.push(tex)
  return tex
}


function releaseAtlasBytes(texture: Texture): void {
  if (!(texture instanceof DataTexture)) return
  const image = texture.image
  if (image !== null) image.data = new Uint8Array(0)
}

const kerningCacheKeys: string[] = []
const kerningCacheValues: Map<number, number>[] = []

function kerningTable(atlas: GlyphAtlas): Map<number, number> {
  for (let i = 0; i < kerningCacheKeys.length; i++) {
    if (kerningCacheKeys[i] === atlas.name) return kerningCacheValues[i]
  }
  const table = new Map<number, number>()
  for (const row of atlas.kerning) {
    table.set(row[0] * 1024 + row[1], row[2])
  }
  kerningCacheKeys.push(atlas.name)
  kerningCacheValues.push(table)
  return table
}

// layoutText's quads written into existing position (12 per quad) and uv
// (8 per quad) arrays, when `text` lays out to exactly as many quads as they
// hold: a score or FPS readout changing digits reuses its geometry instead of
// building a new one. Returns the laid-out width, or -1 (nothing written in a
// way the caller may keep) when the quad count differs.
export function layoutTextInPlace(
  atlas: GlyphAtlas,
  text: string,
  fontSize: number,
  letterSpacing: number,
  positions: Float32Array,
  uvs: Float32Array,
): number {
  const quads = positions.length / 12
  if (uvs.length !== quads * 8) return -1
  let n = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code === 10) return -1
    const index = code - atlas.first
    if (index < 0 || index >= atlas.glyphs.length) continue
    const g = atlas.glyphs[index]
    if (g[2] > g[0] && g[3] > g[1]) n++
  }
  if (n !== quads) return -1
  const scale = fontSize / atlas.pixelHeight
  const kern = kerningTable(atlas)
  const invW = 1 / atlas.atlasWidth
  const invH = 1 / atlas.atlasHeight
  let penX = 0
  let prev = 0
  let q = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    const index = code - atlas.first
    if (index < 0 || index >= atlas.glyphs.length) continue
    if (prev !== 0) {
      const k = kern.get(prev * 1024 + code)
      if (k !== undefined) penX += k * scale
    }
    const g = atlas.glyphs[index]
    const gx0 = g[0]
    const gy0 = g[1]
    const gx1 = g[2]
    const gy1 = g[3]
    if (gx1 > gx0 && gy1 > gy0) {
      const x0 = penX + g[4] * scale
      const y1 = -g[5] * scale
      const x1 = x0 + (gx1 - gx0) * scale
      const y0 = y1 - (gy1 - gy0) * scale
      const p = q * 12
      positions[p] = x0
      positions[p + 1] = y0
      positions[p + 2] = 0
      positions[p + 3] = x1
      positions[p + 4] = y0
      positions[p + 5] = 0
      positions[p + 6] = x1
      positions[p + 7] = y1
      positions[p + 8] = 0
      positions[p + 9] = x0
      positions[p + 10] = y1
      positions[p + 11] = 0
      const u0 = gx0 * invW
      const u1 = gx1 * invW
      const v0 = gy1 * invH
      const v1 = gy0 * invH
      const t = q * 8
      uvs[t] = u0
      uvs[t + 1] = v0
      uvs[t + 2] = u1
      uvs[t + 3] = v0
      uvs[t + 4] = u1
      uvs[t + 5] = v1
      uvs[t + 6] = u0
      uvs[t + 7] = v1
      q++
    }
    penX += g[6] * scale + letterSpacing * fontSize
    prev = code
  }
  return penX > 0 ? penX : 0
}

// Build quad geometry for `text` at `fontSize` world units per em.
// letterSpacing is in em units (troika convention). Multi-line via '\n'.
// The origin is the LEFT edge of the FIRST baseline; the caller applies
// anchor offsets from the returned metrics.
export function layoutText(
  atlas: GlyphAtlas,
  text: string,
  fontSize: number,
  letterSpacing: number,
): LaidOutText {
  const scale = fontSize / atlas.pixelHeight
  const lineHeight = (atlas.ascent - atlas.descent + atlas.lineGap) * scale
  const kern = kerningTable(atlas)
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  let penX = 0
  let penY = 0
  let maxX = 0
  let prev = 0
  const invW = 1 / atlas.atlasWidth
  const invH = 1 / atlas.atlasHeight
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code === 10) {
      if (penX > maxX) maxX = penX
      penX = 0
      penY -= lineHeight
      prev = 0
      continue
    }
    const index = code - atlas.first
    if (index < 0 || index >= atlas.glyphs.length) continue
    if (prev !== 0) {
      const k = kern.get(prev * 1024 + code)
      if (k !== undefined) penX += k * scale
    }
    const g = atlas.glyphs[index]
    const gx0 = g[0]
    const gy0 = g[1]
    const gx1 = g[2]
    const gy1 = g[3]
    const xoff = g[4]
    const yoff = g[5]
    const xadvance = g[6]
    if (gx1 > gx0 && gy1 > gy0) {
      // yoff is the offset of the bitmap TOP from the baseline (negative up
      // in stb's y-down convention); flip into three's y-up space.
      const x0 = penX + xoff * scale
      const y1 = penY - yoff * scale
      const x1 = x0 + (gx1 - gx0) * scale
      const y0 = y1 - (gy1 - gy0) * scale
      const base = positions.length / 3
      positions.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0)
      // DataTexture rows upload bottom-up (flipY=false): atlas row 0 (top of
      // the baked image) lands at v=0, so v maps directly from atlas y.
      const u0 = gx0 * invW
      const u1 = gx1 * invW
      const v0 = gy1 * invH
      const v1 = gy0 * invH
      uvs.push(u0, v0, u1, v0, u1, v1, u0, v1)
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
    penX += xadvance * scale + letterSpacing * fontSize
    prev = code
  }
  if (penX > maxX) maxX = penX
  const positionArray = new Float32Array(positions)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positionArray, 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geometry.setIndex(indices)
  return {
    geometry,
    positions: positionArray,
    width: maxX,
    ascent: atlas.ascent * scale,
    descent: atlas.descent * scale,
  }
}
