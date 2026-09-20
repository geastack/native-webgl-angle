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
  alphaBase64: string[]
}
