// Native-target implementation of the `troika-three-text` Text surface.
//
// troika-three-text renders SDF glyphs via a Web Worker + runtime font parsing,
// neither of which is available on the native/ANGLE target. Browser builds use
// the upstream package; native target resolution selects this module, which renders the
// SAME property surface (text/font/fontSize/color/anchorX/anchorY/letterSpacing/
// fillOpacity + sync()) from build-time stb_truetype glyph atlases (see
// native-webgl-angle/tools/bake-font-atlas.cpp) drawn as textured quads.
//
// Font selection consults the atlases an app registered with
// registerFontAtlas(); the Playfair regular/italic and Inter atlases this
// package bakes are the defaults behind them.
//
// Import from the specific `three/src` path (NOT bare `three`): a bare-`three`
// import resolves to the pre-bundled `three/build/three.module.js`, which emits
// duplicate cross-module classes (Vector2__m2, "incomplete type") and drags the
// entire library into the compile graph.
import { DoubleSide } from 'three/src/constants.js'
import { Mesh } from 'three/src/objects/Mesh.js'
import { BufferAttribute } from 'three/src/core/BufferAttribute.js'
import { BufferGeometry } from 'three/src/core/BufferGeometry.js'
import { MeshBasicMaterial } from 'three/src/materials/MeshBasicMaterial.js'
import { Object3D } from 'three/src/core/Object3D.js'
import type { Texture } from 'three/src/textures/Texture.js'
import { atlasTexture, layoutText } from './text/native-text'
import type { GlyphAtlas } from './text/native-text-types'
import { sansAtlas } from './text/atlas-sans'
import { serifAtlas } from './text/atlas-serif'
import { serifItalicAtlas } from './text/atlas-serif-italic'

// The fonts belong to the app, not to this package. Selecting them by the
// names one app happens to use -- 'playfair', 'italic' -- meant every other app
// rendered its whole UI in the fallback sans while nothing reported a problem:
// the reference app's Unbounded display face silently became Inter. An app whose own
// fonts must render natively bakes them (tools/bake-font-atlas.cpp, then
// tools/gen-troika-atlas.mjs) and registers them from its native entry, before
// the first Text is constructed. The three below stay as this package's
// defaults so an app that registers nothing still draws.
interface RegisteredAtlas {
  match: string
  atlas: GlyphAtlas
}

const registered: RegisteredAtlas[] = []

/**
 * Map a substring of the app's `font` value (a bundler asset URL, so matching
 * the file stem is enough) onto a baked atlas. Later registrations win over the
 * built-in defaults but not over earlier ones, so registration order is the
 * app's priority order.
 */
export function registerFontAtlas(match: string, atlas: GlyphAtlas): void {
  registered.push({ match, atlas })
}

// One authority for "which atlas is this font", because sync() needs the
// identity for its layout key and the layout itself needs the atlas; resolving
// them separately is how the two could ever disagree.
function atlasNameForFont(font: string | null): string {
  if (font === null) return 'sans'
  for (let i = 0; i < registered.length; i++) {
    const entry = registered[i]
    if (entry !== undefined && font.indexOf(entry.match) >= 0) return entry.match
  }
  if (font.indexOf('italic') >= 0) return 'serif-italic'
  if (font.indexOf('playfair') >= 0) return 'serif'
  return 'sans'
}

function atlasForFont(font: string | null): GlyphAtlas {
  const name = atlasNameForFont(font)
  for (let i = 0; i < registered.length; i++) {
    const entry = registered[i]
    if (entry !== undefined && entry.match === name) return entry.atlas
  }
  if (name === 'serif-italic') return serifItalicAtlas
  if (name === 'serif') return serifAtlas
  return sansAtlas
}

function srgbToLinear(value: number): number {
  return value < 0.04045 ? value * 0.0773993808 : Math.pow(value * 0.9478672986 + 0.0521327014, 2.4)
}

function setMaterialHex(material: MeshBasicMaterial, value: number): void {
  material.color.r = srgbToLinear(((value >> 16) & 0xff) / 255)
  material.color.g = srgbToLinear(((value >> 8) & 0xff) / 255)
  material.color.b = srgbToLinear((value & 0xff) / 255)
}

// NOTE: the class must NOT be named `Text` — geatsc's gea host-shim maps any
// type named `Text` (the DOM global) to `gea::embedded::ui::NodeHandle`, so a
// class named `Text` would lower to a NodeHandle (no `.sync()`/`.visible`).
// Name it `TroikaText` and re-export as `Text` so the upstream package's
// import surface is unchanged while the class keeps its own native struct type.
export class TroikaText extends Object3D {
  text = ''
  font: string | null = null
  fontSize = 1
  color: number = 0xffffff
  anchorX: number | string = 'center'
  anchorY: number | string = 'middle'
  letterSpacing = 0
  fillOpacity = 1
  depthOffset = 0
  outlineWidth: number | string = 0
  outlineColor: number | string = 0x000000
  material: MeshBasicMaterial
  private mesh: Mesh
  // Layout fingerprint of the last geometry build. HUD callers (troika
  // convention) call sync() every frame while pulsing fillOpacity/color;
  // rebuilding glyph quads for that is pure waste — only rebuild when an
  // input that changes GEOMETRY changed.
  private layoutKey = '\u0000'

  constructor() {
    super()
    this.material = new MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      // Flat glyph quads never need Three's transparent double-sided two-pass
      // path. Without this, Three flips `side` twice per label per frame,
      // increments material.version, and rebuilds the program-parameter graph.
      forceSinglePass: true
    })
    this.mesh = new Mesh(new BufferGeometry(), this.material)
    // This mesh lives in the orthographic HUD pass. Its bounds are rebuilt
    // whenever glyph geometry changes, and native Three can otherwise retain
    // the empty constructor geometry's bounds until a later text update. HUD
    // glyphs are screen-space by definition, so frustum culling is both
    // unnecessary and capable of hiding labels that never change after mount.
    this.mesh.frustumCulled = false
    this.add(this.mesh)
  }

  // No callback param: troika's real sync(cb?) is async, but this native stub
  // lays out synchronously, so every caller invokes sync() with no argument.
  // Declaring an optional callback made the dynamic (duck-typed) call site in
  // hud.ts lower the absent arg into a non-empty std::function that invokes a
  // `missing` value ("Value is not callable"); omitting it removes that path.
  sync(): void {
    // Compute the cheap font identity first. GlyphAtlas is a large generated
    // by-value struct under geatsc, so fetching it before the layout-key check
    // copied the entire atlas even for paint-only syncs.
    const atlasKey = atlasNameForFont(this.font)
    const nextLayoutKey =
      this.text +
      '\u0001' +
      String(this.fontSize) +
      '\u0001' +
      String(this.letterSpacing) +
      '\u0001' +
      atlasKey +
      '\u0001' +
      String(this.anchorX) +
      '\u0001' +
      String(this.anchorY)
    if (nextLayoutKey === this.layoutKey) {
      // Geometry inputs unchanged: only refresh paint state (color/opacity),
      // matching what per-frame HUD pulses actually vary.
      setMaterialHex(this.material, this.color)
      this.material.opacity = this.fillOpacity
      return
    }
    const atlas = atlasForFont(this.font)
    this.layoutKey = nextLayoutKey
    const laidOut = layoutText(atlas, this.text, this.fontSize, this.letterSpacing)
    // Anchor offsets: troika's anchorX left|center|right and anchorY
    // top|middle|bottom (the subset the app uses). The layout origin is the
    // left edge of the first baseline.
    let offsetX = 0
    if (this.anchorX === 'center') offsetX = -laidOut.width / 2
    else if (this.anchorX === 'right') offsetX = -laidOut.width
    let offsetY = 0
    if (this.anchorY === 'middle') offsetY = -(laidOut.ascent + laidOut.descent) / 2
    else if (this.anchorY === 'top') offsetY = -laidOut.ascent
    else if (this.anchorY === 'bottom') offsetY = -laidOut.descent
    // 'bottom-baseline' needs no offset: the layout origin IS the baseline.
    const positions = laidOut.positions
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += offsetX
      positions[i + 1] += offsetY
    }
    // Keep the BufferAttribute objects stable when the next layout has the
    // same storage shape. WebGLAttributes keys its native buffer cache by
    // attribute identity, so swapping the entire geometry would otherwise
    // delete and recreate three GL buffers for every same-length score change.
    // A size or typed-array-kind change still replaces and disposes the old
    // geometry so WebGLAttributes can allocate correctly-sized storage.
    const previous: BufferGeometry = this.mesh.geometry
    const next = laidOut.geometry
    const previousPosition = previous.getAttribute('position')
    const nextPosition = next.getAttribute('position')
    const previousUv = previous.getAttribute('uv')
    const nextUv = next.getAttribute('uv')
    const previousIndex = previous.index
    const nextIndex = next.index
    const matchingIndexStorage =
      previousIndex !== null &&
      nextIndex !== null &&
      ((previousIndex.array instanceof Uint16Array && nextIndex.array instanceof Uint16Array) ||
        (previousIndex.array instanceof Uint32Array && nextIndex.array instanceof Uint32Array))
    if (
      previousPosition instanceof BufferAttribute &&
      nextPosition instanceof BufferAttribute &&
      previousUv instanceof BufferAttribute &&
      nextUv instanceof BufferAttribute &&
      previousPosition.array instanceof Float32Array &&
      nextPosition.array instanceof Float32Array &&
      previousUv.array instanceof Float32Array &&
      nextUv.array instanceof Float32Array &&
      matchingIndexStorage &&
      previousPosition.array.length === nextPosition.array.length &&
      previousUv.array.length === nextUv.array.length &&
      previousIndex.array.length === nextIndex.array.length
    ) {
      previousPosition.array = nextPosition.array
      previousPosition.needsUpdate = true
      previousUv.array = nextUv.array
      previousUv.needsUpdate = true
      previousIndex.array = nextIndex.array
      previousIndex.needsUpdate = true
    } else {
      this.mesh.geometry = next
      previous.dispose()
    }
    // Keep both sides of the identity comparison on the shared Texture
    // carrier. Otherwise a derived DataTexture local can be incorrectly
    // treated as disjoint from Material.map during native constant folding.
    const nextMap: Texture = atlasTexture(atlas)
    if (this.material.map !== nextMap) {
      this.material.map = nextMap
      // needsUpdate recompiles the shader program; only pay that when the
      // map binding actually changed, not on every per-frame sync().
      this.material.needsUpdate = true
    }
    setMaterialHex(this.material, this.color)
    this.material.opacity = this.fillOpacity
  }

  dispose(): void {
    if (this.mesh.geometry) this.mesh.geometry.dispose()
    this.material.dispose()
  }
}

export { TroikaText as Text }
