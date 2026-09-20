type NativeFrameCallback = (timestampMs: number) => void

/**
 * Three's renderer-local animation driver on hosts without browser `self`.
 * Apple applications schedule frames through their native host callback, so
 * this object retains Three's lifecycle surface without owning a second loop.
 */
export class WebGLAnimation {
  start(): void {}
  stop(): void {}
  setAnimationLoop(_callback: NativeFrameCallback): void {}
  setContext(): void {}
}
