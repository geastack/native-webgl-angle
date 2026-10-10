// Shape of a baked glyph atlas (native-webgl-angle/tools/bake-font-atlas.cpp
// via gen-troika-atlas.mjs). Glyph rows are [x0, y0, x1, y1, xoff, yoff,
// xadvance] in atlas pixels at `pixelHeight`; kerning rows are
// [codepointA, codepointB, advancePx].
export interface GlyphAtlas {
  name: string
  atlasWidth: number
  atlasHeight: number
  pixelHeight: number
  ascent: number
  descent: number
  lineGap: number
  first: number
  glyphs: number[][]
  kerning: number[][]
  /** The alpha bitmap is raw DEFLATE (zlib deflateRawSync) before base64. */
  alphaPacked: boolean
  alphaBase64: string[]
}

/**
 * Metric rows from their packed spelling, `width` comma-separated numbers per
 * row. A generated atlas writes its glyph and kerning tables this way because a
 * nested array literal compiles to code building every row -- 470 KB of it for
 * one font's 1078 kerning pairs -- while a string is plain read-only data.
 */
/**
 * The `alphaBase64` of an atlas whose bitmap the build does not carry
 * (native-text.ts reads it from setAtlasAlphaSource instead). One typed array
 * rather than a `[]` literal per atlas: a bundler inlines the literal, and an
 * empty literal says nothing about its element type.
 */
export const ALPHA_ELSEWHERE: string[] = []

export function unpackRows(width: number, packed: string): number[][] {
  const rows: number[][] = []
  if (packed.length === 0) return rows
  const fields = packed.split(',')
  for (let i = 0; i + width <= fields.length; i += width) {
    const row: number[] = []
    for (let k = 0; k < width; k++) row.push(Number(fields[i + k]))
    rows.push(row)
  }
  return rows
}
