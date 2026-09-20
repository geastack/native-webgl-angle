// Native text rendering for the troika-three-text Text surface: baked alpha glyph
// atlases (stb_truetype, build-time) drawn as textured quads. This is the
// "engine stb_truetype -> GL atlas" path — it runs on
// any three-angle target (macOS/ANGLE, Windows) with zero host dependencies: the
// atlas rides in the compiled binary and uploads as a DataTexture.
import { BufferAttribute } from 'three/src/core/BufferAttribute.js'
import { BufferGeometry } from 'three/src/core/BufferGeometry.js'
import { DataTexture } from 'three/src/textures/DataTexture.js'
import {
  ClampToEdgeWrapping,
  LinearFilter,
  NoColorSpace,
  RGBAFormat,
  UnsignedByteType,
  UVMapping,
} from 'three/src/constants.js'
import type { GlyphAtlas } from './native-text-types'
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

function base64Value(code: number): number {
  if (code >= 65 && code <= 90) return code - 65
  if (code >= 97 && code <= 122) return code - 71
  if (code >= 48 && code <= 57) return code + 4
  if (code === 43) return 62
  if (code === 47) return 63
  return 0
}

// Decode the base64 alpha bitmap into an RGBA texture (white RGB, glyph
// alpha). Built once per atlas and shared by every text instance.
export function atlasTexture(atlas: GlyphAtlas): DataTexture {
  for (let i = 0; i < textureCacheKeys.length; i++) {
    if (textureCacheKeys[i] === atlas.name) return textureCacheValues[i]
  }
  const total = atlas.atlasWidth * atlas.atlasHeight
  const rgba = new Uint8Array(total * 4)
  let out = 0
  for (let c = 0; c < atlas.alphaBase64.length; c++) {
    // Do not route through atob's "binary string". The native runtime stores
    // strings as UTF-8, so bytes >= 0x80 would be interpreted as Unicode when
    // charCodeAt reads the result, corrupting the alpha atlas. Decode the ASCII
    // base64 directly into the typed array instead.
    const chunk = atlas.alphaBase64[c]
    for (let i = 0; i < chunk.length; i += 4) {
      const code2 = chunk.charCodeAt(i + 2)
      const code3 = chunk.charCodeAt(i + 3)
      const v0 = base64Value(chunk.charCodeAt(i))
      const v1 = base64Value(chunk.charCodeAt(i + 1))
      const v2 = base64Value(code2)
      const v3 = base64Value(code3)
      const a0 = (v0 << 2) | (v1 >> 4)
      rgba[out] = 255
      rgba[out + 1] = 255
      rgba[out + 2] = 255
      rgba[out + 3] = a0
      out += 4
      if (code2 !== 61) {
        const a1 = ((v1 & 15) << 4) | (v2 >> 2)
        rgba[out] = 255
        rgba[out + 1] = 255
        rgba[out + 2] = 255
        rgba[out + 3] = a1
        out += 4
      }
      if (code3 !== 61) {
        const a2 = ((v2 & 3) << 6) | v3
        rgba[out] = 255
        rgba[out + 1] = 255
        rgba[out + 2] = 255
        rgba[out + 3] = a2
        out += 4
      }
    }
  }
  const tex = new DataTexture(
    rgba,
    atlas.atlasWidth,
    atlas.atlasHeight,
    RGBAFormat,
    UnsignedByteType,
    UVMapping,
    ClampToEdgeWrapping,
    ClampToEdgeWrapping,
    LinearFilter,
    LinearFilter,
    1,
    NoColorSpace,
  )
  tex.needsUpdate = true
  textureCacheKeys.push(atlas.name)
  textureCacheValues.push(tex)
  return tex
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
