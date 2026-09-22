// Native audio host facade — a Web-Audio-shaped wrapper over the
// `gea_three_audio_*` externs (native/audio_host.mm, registered through
// geatsc-plugin.mjs). It implements exactly the surface a Web Audio sound
// design uses: gain / biquad
// lowpass / buffer source / oscillator nodes, param automation (setValueAtTime,
// linear/exponential ramps, cancel), synth buffers written via getChannelData,
// and mp3 decode by asset basename (the native asset stub lowers
// `import url from './x.mp3'` to the file's basename).
//
// An app writes its sound design against the browser's own Web Audio names;
// geatsc-plugin.mjs's `ambientTypeRealizations` respell those names to the
// classes below for the native build, so this module is the Web Audio
// implementation the app's types already describe. On the web these classes
// are never constructed (the browser's own context wins), so the ambient host
// externs are never referenced at runtime there.

// Node kinds (native/audio_host.mm NodeKind).
const NODE_GAIN = 1
const NODE_BIQUAD = 2
const NODE_BUFFER_SOURCE = 3
const NODE_OSCILLATOR = 4

// Param codes (audio_host.mm paramFor).
const PARAM_GAIN = 0
const PARAM_FREQUENCY = 1
const PARAM_Q = 2
const PARAM_PLAYBACK_RATE = 3

// Param methods (audio_host.mm ParamMethod).
const METHOD_SET_VALUE = 0
const METHOD_SET_VALUE_AT_TIME = 1
const METHOD_LINEAR_RAMP = 2
const METHOD_EXPONENTIAL_RAMP = 3
const METHOD_CANCEL = 4

export class NativeAudioParam {
  readonly __audioNodeId: number
  readonly __paramCode: number

  constructor(nodeId: number, paramCode: number) {
    this.__audioNodeId = nodeId
    this.__paramCode = paramCode
  }

  get value(): number {
    return threeAudioParamGet(this.__audioNodeId, this.__paramCode)
  }

  set value(v: number) {
    threeAudioParamEvent(this.__audioNodeId, this.__paramCode, METHOD_SET_VALUE, v, 0)
  }

  setValueAtTime(value: number, time: number): void {
    threeAudioParamEvent(this.__audioNodeId, this.__paramCode, METHOD_SET_VALUE_AT_TIME, value, time)
  }

  linearRampToValueAtTime(value: number, time: number): void {
    threeAudioParamEvent(this.__audioNodeId, this.__paramCode, METHOD_LINEAR_RAMP, value, time)
  }

  exponentialRampToValueAtTime(value: number, time: number): void {
    threeAudioParamEvent(this.__audioNodeId, this.__paramCode, METHOD_EXPONENTIAL_RAMP, value, time)
  }

  cancelScheduledValues(time: number): void {
    threeAudioParamEvent(this.__audioNodeId, this.__paramCode, METHOD_CANCEL, 0, time)
  }
}

export class NativeAudioNode {
  readonly __audioNodeId: number

  constructor(nodeId: number) {
    this.__audioNodeId = nodeId
  }

  // Param connect targets never occur in the reference graph; node targets are
  // always wrappers from this module, so the id read is direct.
  connect(node: NativeAudioNode): void {
    threeAudioConnect(this.__audioNodeId, node.__audioNodeId)
  }
}

export class NativeAudioDestination extends NativeAudioNode {}

export class NativeGainNode extends NativeAudioNode {
  readonly gain: NativeAudioParam

  constructor(nodeId: number) {
    super(nodeId)
    this.gain = new NativeAudioParam(nodeId, PARAM_GAIN)
  }
}

export class NativeBiquadFilterNode extends NativeAudioNode {
  readonly frequency: NativeAudioParam
  readonly Q: NativeAudioParam
  private __typeName = 'lowpass'

  constructor(nodeId: number) {
    super(nodeId)
    this.frequency = new NativeAudioParam(nodeId, PARAM_FREQUENCY)
    this.Q = new NativeAudioParam(nodeId, PARAM_Q)
  }

  get type(): string {
    return this.__typeName
  }

  set type(value: string) {
    this.__typeName = value
    threeAudioSetNodeType(this.__audioNodeId, value)
  }
}

export class NativeOscillatorNode extends NativeAudioNode {
  readonly frequency: NativeAudioParam
  private __typeName = 'sine'

  constructor(nodeId: number) {
    super(nodeId)
    this.frequency = new NativeAudioParam(nodeId, PARAM_FREQUENCY)
  }

  get type(): string {
    return this.__typeName
  }

  set type(value: string) {
    this.__typeName = value
    threeAudioSetNodeType(this.__audioNodeId, value)
  }

  start(when = 0): void {
    threeAudioSourceStart(this.__audioNodeId, when, 0)
  }

  stop(when = 0): void {
    threeAudioSourceStop(this.__audioNodeId, when)
  }
}

export class NativeAudioBuffer {
  __nativeBufferId: number
  readonly __sampleRate: number
  readonly __channels: Float32Array[]

  constructor(nativeBufferId: number, channels: number, length: number, sampleRate: number) {
    this.__nativeBufferId = nativeBufferId
    this.__sampleRate = sampleRate
    this.__channels = []
    if (nativeBufferId === 0) {
      for (let ch = 0; ch < channels; ch++) this.__channels.push(new Float32Array(length))
    }
  }

  // Synth buffers (createBuffer) hand out writable local planes; decoded
  // buffers live natively and are never read back by the game.
  getChannelData(channel: number): Float32Array {
    if (channel >= 0 && channel < this.__channels.length) return this.__channels[channel]
    return new Float32Array(0)
  }

  // Push locally written synth planes to the host on first playback.
  __ensureUploaded(): number {
    if (this.__nativeBufferId === 0 && this.__channels.length > 0) {
      const length = this.__channels[0].length
      const id = threeAudioCreateBuffer(this.__channels.length, length, this.__sampleRate)
      for (let ch = 0; ch < this.__channels.length; ch++) {
        threeAudioBufferChannelData(id, ch, this.__channels[ch])
      }
      this.__nativeBufferId = id
    }
    return this.__nativeBufferId
  }
}

export class NativeBufferSourceNode extends NativeAudioNode {
  buffer: NativeAudioBuffer | null = null
  loop = false
  readonly playbackRate: NativeAudioParam

  constructor(nodeId: number) {
    super(nodeId)
    this.playbackRate = new NativeAudioParam(nodeId, PARAM_PLAYBACK_RATE)
  }

  start(when = 0): void {
    const buffer = this.buffer
    if (buffer) {
      const bufferId = buffer.__ensureUploaded()
      if (bufferId > 0) threeAudioSourceSetBuffer(this.__audioNodeId, bufferId)
    }
    threeAudioSourceStart(this.__audioNodeId, when, this.loop ? 1 : 0)
  }

  stop(when = 0): void {
    threeAudioSourceStop(this.__audioNodeId, when)
  }
}

export class NativeAudioContext {
  readonly destination: NativeAudioDestination = new NativeAudioDestination(0)
  readonly state: string = 'running'

  get currentTime(): number {
    return threeAudioCurrentTime()
  }

  get sampleRate(): number {
    return threeAudioSampleRate()
  }

  createGain(): NativeGainNode {
    return new NativeGainNode(threeAudioCreateNode(NODE_GAIN))
  }

  createBiquadFilter(): NativeBiquadFilterNode {
    return new NativeBiquadFilterNode(threeAudioCreateNode(NODE_BIQUAD))
  }

  createBufferSource(): NativeBufferSourceNode {
    return new NativeBufferSourceNode(threeAudioCreateNode(NODE_BUFFER_SOURCE))
  }

  createOscillator(): NativeOscillatorNode {
    return new NativeOscillatorNode(threeAudioCreateNode(NODE_OSCILLATOR))
  }

  createBuffer(channels: number, length: number, sampleRate: number): NativeAudioBuffer {
    return new NativeAudioBuffer(0, channels, length, sampleRate)
  }

  // Web-only surface (kept for structural compatibility with the app's
  // AudioContextLike). Native clip loading goes through
  // nativeAudioBufferForFile below; this promise never settles.
  decodeAudioData(_data: ArrayBuffer): Promise<NativeAudioBuffer> {
    return new Promise<NativeAudioBuffer>(() => {})
  }

  resume(): void {
    threeAudioResume()
  }
}

let activeNativeAudioContext: NativeAudioContext | null = null

// Create (or return) the native audio context. Only call this when the web
// AudioContext is absent — on the web the host externs referenced here do not
// exist at runtime.
export function createNativeAudioContext(): NativeAudioContext | null {
  if (activeNativeAudioContext) return activeNativeAudioContext
  if (!threeAudioSupported()) return null
  activeNativeAudioContext = new NativeAudioContext()
  return activeNativeAudioContext
}

// Decode an audio asset by basename ("coin.mp3" — what the native asset stub
// lowers an mp3 import to) into a playable buffer. Returns null when no native
// context is active (web) or the file is missing, letting callers fall through
// to the fetch + decodeAudioData path.
export function nativeAudioBufferForFile(name: string): NativeAudioBuffer | null {
  if (!activeNativeAudioContext) return null
  const bufferId = threeAudioLoadBuffer(name)
  if (bufferId <= 0) return null
  return new NativeAudioBuffer(bufferId, 0, 0, threeAudioSampleRate())
}

/** @gea-host-inert Reads scalar arguments and updates native audio state only; retains no script references or callbacks. */
declare function threeAudioSupported(): boolean
/** @gea-host-inert Reads scalar arguments and updates native audio state only; retains no script references or callbacks. */
declare function threeAudioCurrentTime(): number
/** @gea-host-inert Reads scalar arguments and updates native audio state only; retains no script references or callbacks. */
declare function threeAudioSampleRate(): number
/** @gea-host-inert Reads scalar arguments and updates native audio state only; retains no script references or callbacks. */
declare function threeAudioResume(): void
/** @gea-host-inert Reads scalar arguments and updates native audio state only; retains no script references or callbacks. */
declare function threeAudioCreateNode(kind: number): number
/** @gea-host-inert Reads scalar arguments and updates native audio state only; retains no script references or callbacks. */
declare function threeAudioSetNodeType(node: number, type: string): void
/** @gea-host-inert Reads scalar arguments and updates native audio state only; retains no script references or callbacks. */
declare function threeAudioConnect(src: number, dst: number): void
/** @gea-host-inert Reads scalar arguments and updates native audio state only; retains no script references or callbacks. */
declare function threeAudioParamEvent(node: number, param: number, method: number, value: number, time: number): void
/** @gea-host-inert Reads scalar arguments and updates native audio state only; retains no script references or callbacks. */
declare function threeAudioParamGet(node: number, param: number): number
/** @gea-host-inert Reads scalar arguments and updates native audio state only; retains no script references or callbacks. */
declare function threeAudioLoadBuffer(name: string): number
/** @gea-host-inert Reads scalar arguments and updates native audio state only; retains no script references or callbacks. */
declare function threeAudioCreateBuffer(channels: number, length: number, sampleRate: number): number
/** @gea-host-inert Synchronously copies the typed-array argument into native audio storage; retains no script references or callbacks. */
declare function threeAudioBufferChannelData(buffer: number, channel: number, data: Float32Array): void
/** @gea-host-inert Reads scalar arguments and updates native audio state only; retains no script references or callbacks. */
declare function threeAudioSourceSetBuffer(node: number, buffer: number): void
/** @gea-host-inert Reads scalar arguments and updates native audio state only; retains no script references or callbacks. */
declare function threeAudioSourceStart(node: number, when: number, loop: number): void
/** @gea-host-inert Reads scalar arguments and updates native audio state only; retains no script references or callbacks. */
declare function threeAudioSourceStop(node: number, when: number): void
