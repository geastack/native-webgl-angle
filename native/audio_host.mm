// Native audio host for the ANGLE/WebGL macOS target — a minimal Web-Audio-like
// graph engine behind the `gea_three_audio_*` externs (see geatsc-plugin.mjs +
// src/nativeAudioHost.ts). It implements exactly the surface the reference app's
// sound design uses:
//
//   nodes   — gain, biquad lowpass, buffer source (mp3 clips, loops, synth
//             noise buffers), oscillator (sine/square/sawtooth/triangle),
//             destination
//   params  — value get/set, setValueAtTime, linearRampToValueAtTime,
//             exponentialRampToValueAtTime, cancelScheduledValues
//   decode  — mp3/wav via AVAudioFile out of the app bundle's Resources/Sounds
//             (basename lookup — the native asset stub lowers `import url from
//             './x.mp3'` to the basename), or $GEA_THREE_AUDIO_DIR for dev runs
//
// Output runs through a single AVAudioSourceNode render block; the graph is a
// tiny DAG (a handful of buses + short-lived one-shot voices) processed per
// render quantum in topological order from the live sources. Set
// GEA_THREE_AUDIO_LOG=1 for stderr diagnostics (engine start, decodes, voice
// starts, per-second output RMS).

#if defined(_WIN32)
#define _USE_MATH_DEFINES
#include "audio_uwp.h"
#else
#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>
#endif

#include "gea_runtime.h"

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstdarg>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

#if defined(_WIN32)
static std::wstring geaAudioAssetDirectory;
extern "C" void gea_three_audio_set_directory_uwp(const wchar_t *path) {
  geaAudioAssetDirectory = path ? path : L"";
}
#endif

namespace {

bool geaAudioLogEnabled() {
  static const bool enabled = [] {
    const char *value = std::getenv("GEA_THREE_AUDIO_LOG");
    return value && value[0] && std::strcmp(value, "0") != 0;
  }();
  return enabled;
}

bool geaAudioMutedFromEnvironment() {
  const char *value = std::getenv("GEA_THREE_AUDIO_MUTED");
  return value && value[0] && std::strcmp(value, "0") != 0;
}

void geaAudioLog(const char *format, ...) {
  if (!geaAudioLogEnabled()) return;
  va_list args;
  va_start(args, format);
  std::fprintf(stderr, "[gea-audio] ");
  std::vfprintf(stderr, format, args);
  std::fprintf(stderr, "\n");
  va_end(args);
}

// ---------------------------------------------------------------------------
// Param automation — WebAudio-style scheduled events over an anchor value.
// ---------------------------------------------------------------------------

enum ParamMethod : int {
  kParamSetValue = 0,
  kParamSetValueAtTime = 1,
  kParamLinearRamp = 2,
  kParamExponentialRamp = 3,
  kParamCancel = 4,
};

struct ParamEvent {
  int type = kParamSetValueAtTime;
  double value = 0.0;
  double time = 0.0;
};

struct AudioParamState {
  double anchorValue = 0.0;
  double anchorTime = 0.0;
  std::vector<ParamEvent> events;

  explicit AudioParamState(double initial = 0.0) : anchorValue(initial) {}

  void schedule(int method, double value, double time, double now) {
    if (method == kParamSetValue) {
      anchorValue = value;
      anchorTime = now;
      events.clear();
      return;
    }
    if (method == kParamCancel) {
      events.erase(
          std::remove_if(events.begin(), events.end(), [&](const ParamEvent &e) { return e.time >= time; }),
          events.end());
      return;
    }
    // The game re-schedules `set(current, t) + ramp(target, t+dt)` every frame;
    // dropping events at/after the new event's time keeps the list tiny and
    // matches the intended "restart the ramp from here" semantics.
    events.erase(
        std::remove_if(events.begin(), events.end(), [&](const ParamEvent &e) { return e.time >= time - 1e-9; }),
        events.end());
    events.push_back({method, value, time});
    std::sort(events.begin(), events.end(), [](const ParamEvent &a, const ParamEvent &b) { return a.time < b.time; });
  }

  // Value at time t; consumes fully elapsed events into the anchor. Callers
  // advance t monotonically within a render quantum.
  double valueAt(double t) {
    while (!events.empty()) {
      const ParamEvent e = events.front();
      if (t >= e.time) {
        anchorValue = e.value;
        anchorTime = e.time;
        events.erase(events.begin());
        continue;
      }
      if (e.type == kParamLinearRamp) {
        const double span = e.time - anchorTime;
        if (span <= 0.0) return e.value;
        double f = (t - anchorTime) / span;
        if (f < 0.0) f = 0.0;
        return anchorValue + (e.value - anchorValue) * f;
      }
      if (e.type == kParamExponentialRamp) {
        const double span = e.time - anchorTime;
        if (span <= 0.0 || anchorValue == 0.0 || e.value == 0.0 || ((anchorValue < 0.0) != (e.value < 0.0))) {
          return anchorValue;  // exponential ramp is undefined across zero; hold
        }
        double f = (t - anchorTime) / span;
        if (f < 0.0) f = 0.0;
        return anchorValue * std::pow(e.value / anchorValue, f);
      }
      // A setValueAtTime still in the future: hold the anchor until it lands.
      return anchorValue;
    }
    return anchorValue;
  }
};

// ---------------------------------------------------------------------------
// Buffers + nodes
// ---------------------------------------------------------------------------

struct AudioBufferData {
  double sampleRate = 44100.0;
  std::vector<std::vector<float>> channels;
  std::string name;  // diagnostics only
  size_t frames() const { return channels.empty() ? 0 : channels[0].size(); }
};

enum NodeKind : int {
  kNodeDestination = 0,
  kNodeGain = 1,
  kNodeBiquad = 2,
  kNodeBufferSource = 3,
  kNodeOscillator = 4,
};

enum OscShape : int { kOscSine = 0, kOscSquare = 1, kOscSawtooth = 2, kOscTriangle = 3 };

struct AudioNodeState {
  long id = 0;
  int kind = kNodeGain;

  AudioParamState gain{1.0};
  AudioParamState frequency{350.0};
  AudioParamState q{1.0};
  AudioParamState playbackRate{1.0};

  int shape = kOscSine;  // oscillator waveform; biquad type is lowpass-only

  std::vector<long> outputs;

  // Buffer source state
  std::shared_ptr<AudioBufferData> buffer;
  bool loop = false;
  bool started = false;
  bool finished = false;
  bool startLogged = false;
  double startTime = 0.0;
  double stopTime = 1e30;
  double playhead = 0.0;  // fractional frame index into the buffer

  // Oscillator phase
  double phase = 0.0;

  // Biquad (RBJ lowpass), direct form 2 transposed, stereo state
  float b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  float z1[2] = {0, 0};
  float z2[2] = {0, 0};
  double lastFreq = -1.0, lastQ = -1.0;

  // Per-quantum scratch (stereo, plane-major: [0..n) left, [n..2n) right)
  std::vector<float> input;
  std::vector<float> output;
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

struct GeaAudioEngine {
  std::mutex mutex;
  std::unordered_map<long, std::shared_ptr<AudioNodeState>> nodes;
  std::unordered_map<long, std::shared_ptr<AudioBufferData>> buffers;
  long nextNodeId = 1;
  long nextBufferId = 1;
  double sampleRate = 44100.0;
  std::atomic<long long> renderedFrames{0};
  bool started = false;
  bool startFailed = false;
#if defined(_WIN32)
  GeaUwpAudioOutput uwpOutput;
#else
  AVAudioEngine *avEngine = nil;
  AVAudioSourceNode *sourceNode = nil;
#endif

  // RMS diagnostics (log-gated)
  double rmsAccum = 0.0;
  long long rmsCount = 0;
  long long rmsNextLogFrame = 0;

  GeaAudioEngine() {
    auto dest = std::make_shared<AudioNodeState>();
    dest->id = 0;
    dest->kind = kNodeDestination;
    nodes[0] = dest;
  }

  double currentTime() const {
    return static_cast<double>(renderedFrames.load(std::memory_order_relaxed)) / sampleRate;
  }

  bool ensureStarted() {
    std::lock_guard<std::mutex> guard(mutex);
    return ensureStartedLocked();
  }

  bool ensureStartedLocked() {
    if (started) return true;
    if (startFailed) return false;
#if defined(_WIN32)
    sampleRate = 48000.0;
    started = uwpOutput.start(this, [](void *context, size_t frames, float *left, float *right) {
      bool silence = false;
      static_cast<GeaAudioEngine *>(context)->renderPlanar(&silence, frames, left, right);
    });
    startFailed = !started;
    geaAudioLog("XAudio2 engine %s (rate=%.0f)", started ? "started" : "FAILED", sampleRate);
    return started;
#else
    @autoreleasepool {
      avEngine = [[AVAudioEngine alloc] init];
      const double hwRate = [[avEngine.outputNode inputFormatForBus:0] sampleRate];
      sampleRate = hwRate > 0.0 ? hwRate : 44100.0;
      AVAudioFormat *format = [[AVAudioFormat alloc] initStandardFormatWithSampleRate:sampleRate channels:2];
      GeaAudioEngine *self_ = this;
      sourceNode = [[AVAudioSourceNode alloc]
          initWithFormat:format
             renderBlock:^OSStatus(BOOL *isSilence, const AudioTimeStamp *, AVAudioFrameCount frameCount,
                                   AudioBufferList *outputData) {
               return self_->render(isSilence, frameCount, outputData);
             }];
      [avEngine attachNode:sourceNode];
      [avEngine connect:sourceNode to:avEngine.mainMixerNode format:format];
      NSError *error = nil;
      if (![avEngine startAndReturnError:&error]) {
        geaAudioLog("engine start FAILED: %s", error ? error.localizedDescription.UTF8String : "unknown");
        startFailed = true;
        avEngine = nil;
        sourceNode = nil;
        return false;
      }
      started = true;
      geaAudioLog("engine started (rate=%.0f)", sampleRate);
      geaAudioLog("resourcePath=%s",
                  [[NSBundle mainBundle] resourcePath] ? [[NSBundle mainBundle] resourcePath].UTF8String : "(nil)");
      return true;
    }
#endif
  }

  long createNode(int kind) {
    std::lock_guard<std::mutex> guard(mutex);
    auto node = std::make_shared<AudioNodeState>();
    node->id = nextNodeId++;
    node->kind = kind;
    if (kind == kNodeOscillator) node->frequency = AudioParamState(440.0);
    nodes[node->id] = node;
    return node->id;
  }

  std::shared_ptr<AudioNodeState> nodeLocked(long id) {
    auto it = nodes.find(id);
    return it == nodes.end() ? nullptr : it->second;
  }

  void connect(long src, long dst) {
    std::lock_guard<std::mutex> guard(mutex);
    auto node = nodeLocked(src);
    if (!node || nodes.find(dst) == nodes.end()) return;
    if (std::find(node->outputs.begin(), node->outputs.end(), dst) == node->outputs.end()) {
      node->outputs.push_back(dst);
    }
  }

  void paramEvent(long id, int param, int method, double value, double time) {
    std::lock_guard<std::mutex> guard(mutex);
    auto node = nodeLocked(id);
    if (!node) return;
    AudioParamState *state = paramFor(*node, param);
    if (!state) return;
    state->schedule(method, value, time, currentTime());
  }

  double paramGet(long id, int param) {
    std::lock_guard<std::mutex> guard(mutex);
    auto node = nodeLocked(id);
    if (!node) return 0.0;
    AudioParamState *state = paramFor(*node, param);
    if (!state) return 0.0;
    return state->valueAt(currentTime());
  }

  static AudioParamState *paramFor(AudioNodeState &node, int param) {
    switch (param) {
      case 0: return &node.gain;
      case 1: return &node.frequency;
      case 2: return &node.q;
      case 3: return &node.playbackRate;
    }
    return nullptr;
  }

  void setNodeType(long id, const std::string &type) {
    std::lock_guard<std::mutex> guard(mutex);
    auto node = nodeLocked(id);
    if (!node) return;
    if (type == "sine") node->shape = kOscSine;
    else if (type == "square") node->shape = kOscSquare;
    else if (type == "sawtooth") node->shape = kOscSawtooth;
    else if (type == "triangle") node->shape = kOscTriangle;
    // biquad: lowpass is the only implemented (and only used) filter type
  }

  long registerBuffer(std::shared_ptr<AudioBufferData> data) {
    std::lock_guard<std::mutex> guard(mutex);
    const long id = nextBufferId++;
    buffers[id] = std::move(data);
    return id;
  }

  long createBuffer(int channels, long frames, double rate) {
    auto data = std::make_shared<AudioBufferData>();
    data->sampleRate = rate > 0.0 ? rate : 44100.0;
    data->name = "synth";
    if (channels < 1) channels = 1;
    if (channels > 2) channels = 2;
    if (frames < 0) frames = 0;
    data->channels.assign(static_cast<size_t>(channels), std::vector<float>(static_cast<size_t>(frames), 0.0f));
    return registerBuffer(std::move(data));
  }

  void bufferChannelData(long bufferId, int channel, const gea::TypedArray<float> &samples) {
    std::lock_guard<std::mutex> guard(mutex);
    auto it = buffers.find(bufferId);
    if (it == buffers.end()) return;
    AudioBufferData &data = *it->second;
    if (channel < 0 || static_cast<size_t>(channel) >= data.channels.size()) return;
    std::vector<float> &plane = data.channels[static_cast<size_t>(channel)];
    const size_t count = std::min(plane.size(), static_cast<size_t>(samples.size()));
    for (size_t i = 0; i < count; i++) plane[i] = samples[i];
  }

  void sourceSetBuffer(long nodeId, long bufferId) {
    std::lock_guard<std::mutex> guard(mutex);
    auto node = nodeLocked(nodeId);
    if (!node) return;
    auto it = buffers.find(bufferId);
    if (it != buffers.end()) node->buffer = it->second;
  }

  void sourceStart(long nodeId, double when, bool loop) {
    std::lock_guard<std::mutex> guard(mutex);
    if (!ensureStartedLocked()) return;
    auto node = nodeLocked(nodeId);
    if (!node || node->started) return;
    const double now = currentTime();
    node->loop = node->kind == kNodeBufferSource ? (loop || node->loop) : false;
    node->startTime = when > now ? when : now;
    node->started = true;
    node->finished = false;
    node->playhead = 0.0;
    node->phase = 0.0;
  }

  void sourceStop(long nodeId, double when) {
    std::lock_guard<std::mutex> guard(mutex);
    auto node = nodeLocked(nodeId);
    if (!node) return;
    const double now = currentTime();
    node->stopTime = when > now ? when : now;
  }

  // -- Decode ---------------------------------------------------------------

  long loadBufferFile(const std::string &name) {
    if (name.empty() || name.find('/') != std::string::npos || name.find("..") != std::string::npos) return 0;
#if defined(_WIN32)
    if (name.find('\\') != std::string::npos || geaAudioAssetDirectory.empty()) return 0;
    const int length = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, name.data(), static_cast<int>(name.size()), nullptr, 0);
    if (length <= 0) return 0;
    std::wstring base(static_cast<size_t>(length), L'\0');
    MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, name.data(), static_cast<int>(name.size()), base.data(), length);
    auto data = std::make_shared<AudioBufferData>();
    data->name = name;
    if (!geaUwpDecodeAudio(geaAudioAssetDirectory + L"\\" + base, data->channels, data->sampleRate)) {
      geaAudioLog("decode FAILED: %s", name.c_str());
      return 0;
    }
    return registerBuffer(std::move(data));
#else
    @autoreleasepool {
      NSString *base = [NSString stringWithUTF8String:name.c_str()];
      NSMutableArray<NSString *> *candidates = [NSMutableArray array];
      if (const char *dir = std::getenv("GEA_THREE_AUDIO_DIR")) {
        [candidates addObject:[[NSString stringWithUTF8String:dir] stringByAppendingPathComponent:base]];
      }
      NSString *resources = [[NSBundle mainBundle] resourcePath];
      if (resources) {
        [candidates addObject:[[resources stringByAppendingPathComponent:@"Sounds"] stringByAppendingPathComponent:base]];
        [candidates addObject:[resources stringByAppendingPathComponent:base]];
      }
      NSString *path = nil;
      for (NSString *candidate in candidates) {
        if ([[NSFileManager defaultManager] fileExistsAtPath:candidate]) {
          path = candidate;
          break;
        }
      }
      if (!path) {
        geaAudioLog("decode MISS: %s (no file in GEA_THREE_AUDIO_DIR or Resources/Sounds)", name.c_str());
        return 0;
      }
      NSError *error = nil;
      AVAudioFile *file = [[AVAudioFile alloc] initForReading:[NSURL fileURLWithPath:path]
                                                 commonFormat:AVAudioPCMFormatFloat32
                                                  interleaved:NO
                                                        error:&error];
      if (!file) {
        geaAudioLog("decode FAILED to open %s: %s", name.c_str(),
                    error ? error.localizedDescription.UTF8String : "unknown");
        return 0;
      }
      const AVAudioFrameCount capacity = static_cast<AVAudioFrameCount>(file.length);
      AVAudioPCMBuffer *pcm = [[AVAudioPCMBuffer alloc] initWithPCMFormat:file.processingFormat
                                                            frameCapacity:capacity > 0 ? capacity : 1];
      if (!pcm || ![file readIntoBuffer:pcm error:&error]) {
        geaAudioLog("decode FAILED to read %s: %s", name.c_str(),
                    error ? error.localizedDescription.UTF8String : "unknown");
        return 0;
      }
      const AVAudioChannelCount channelCount = pcm.format.channelCount;
      const AVAudioFrameCount frameCount = pcm.frameLength;
      auto data = std::make_shared<AudioBufferData>();
      data->sampleRate = pcm.format.sampleRate;
      data->name = name;
      const AVAudioChannelCount keep = channelCount > 2 ? 2 : channelCount;
      data->channels.resize(keep);
      float *const *planes = pcm.floatChannelData;
      for (AVAudioChannelCount ch = 0; ch < keep; ch++) {
        data->channels[ch].assign(planes[ch], planes[ch] + frameCount);
      }
      const long id = registerBuffer(std::move(data));
      geaAudioLog("decoded %s -> buffer %ld (%u frames, %u ch, %.0f Hz)", name.c_str(), id,
                  static_cast<unsigned>(frameCount), static_cast<unsigned>(keep), pcm.format.sampleRate);
      return id;
    }
#endif
  }

  // -- Render ---------------------------------------------------------------

#if !defined(_WIN32)
  OSStatus render(BOOL *isSilence, AVAudioFrameCount frameCount, AudioBufferList *outputData) {
    float *outL = outputData->mNumberBuffers > 0 ? static_cast<float *>(outputData->mBuffers[0].mData) : nullptr;
    float *outR = outputData->mNumberBuffers > 1 ? static_cast<float *>(outputData->mBuffers[1].mData) : outL;
    bool silence = true;
    renderPlanar(&silence, frameCount, outL, outR);
    *isSilence = silence ? YES : NO;
    return noErr;
  }
#endif

  void renderPlanar(bool *isSilence, size_t frames, float *outL, float *outR) {
    static bool firstRender = true;
    if (firstRender) { firstRender = false; geaAudioLog("first render pull frames=%u", static_cast<unsigned>(frames)); }
    if (!outL) return;
    std::memset(outL, 0, frames * sizeof(float));
    if (outR != outL) std::memset(outR, 0, frames * sizeof(float));

    // Lets renderer/profile runs exercise the real in-game audio graph without
    // emitting sound. The app's own mute control remains unchanged.
    if (geaAudioMutedFromEnvironment()) {
      advanceClock(frames, outL, outR);
      *isSilence = true;
      return;
    }

    std::lock_guard<std::mutex> guard(mutex);
    const double qStart = currentTime();
    const double dt = 1.0 / sampleRate;

    // Live sources drive everything; nodes not reachable from one are skipped
    // (finished one-shot voice chains cost nothing).
    std::vector<AudioNodeState *> order;
    order.reserve(nodes.size());
    std::unordered_map<long, int> indegree;
    {
      // Forward reachability from active sources.
      std::vector<long> stack;
      std::unordered_map<long, bool> reachable;
      for (auto &entry : nodes) {
        AudioNodeState &n = *entry.second;
        const bool activeSource = (n.kind == kNodeBufferSource || n.kind == kNodeOscillator) && n.started && !n.finished;
        if (activeSource) {
          stack.push_back(n.id);
          reachable[n.id] = true;
        }
      }
      while (!stack.empty()) {
        const long id = stack.back();
        stack.pop_back();
        auto node = nodeLocked(id);
        if (!node) continue;
        for (long out : node->outputs) {
          if (!reachable[out]) {
            reachable[out] = true;
            stack.push_back(out);
          }
          indegree[out]++;
        }
      }
      if (reachable.empty()) {
        advanceClock(frames, outL, outR);
        *isSilence = true;
        return;
      }
      // Kahn over the reachable subgraph.
      std::vector<long> ready;
      for (auto &entry : reachable) {
        if (indegree.find(entry.first) == indegree.end()) ready.push_back(entry.first);
      }
      std::unordered_map<long, int> remaining = indegree;
      while (!ready.empty()) {
        const long id = ready.back();
        ready.pop_back();
        auto node = nodeLocked(id);
        if (!node) continue;
        order.push_back(node.get());
        for (long out : node->outputs) {
          if (--remaining[out] == 0) ready.push_back(out);
        }
      }
    }

    // Zero per-node scratch.
    for (AudioNodeState *node : order) {
      node->input.assign(frames * 2, 0.0f);
      node->output.assign(frames * 2, 0.0f);
    }

    for (AudioNodeState *node : order) {
      processNode(*node, frames, qStart, dt);
      // Fan out into downstream inputs.
      for (long out : node->outputs) {
        auto dst = nodeLocked(out);
        if (!dst || dst->input.size() != frames * 2) continue;
        for (size_t i = 0; i < frames * 2; i++) dst->input[i] += node->output[i];
      }
    }

    auto destination = nodeLocked(0);
    if (destination && destination->input.size() == frames * 2) {
      std::memcpy(outL, destination->input.data(), frames * sizeof(float));
      std::memcpy(outR, destination->input.data() + frames, frames * sizeof(float));
      *isSilence = false;
    } else {
      *isSilence = true;
    }

    // Reap finished one-shot sources (their private per-voice gain chains stop
    // being processed once unreachable; the structs themselves are reclaimed
    // when the TS wrappers drop — node maps only grow by finished voices).
    for (auto it = nodes.begin(); it != nodes.end();) {
      AudioNodeState &n = *it->second;
      if ((n.kind == kNodeBufferSource || n.kind == kNodeOscillator) && n.finished) {
        it = nodes.erase(it);
      } else {
        ++it;
      }
    }

    advanceClock(frames, outL, outR);
    return;
  }

  void advanceClock(size_t frames, const float *outL, const float *outR) {
    if (geaAudioLogEnabled() && outL) {
      for (size_t i = 0; i < frames; i++) {
        const double l = outL[i];
        const double r = outR ? outR[i] : l;
        rmsAccum += l * l + r * r;
      }
      rmsCount += static_cast<long long>(frames) * 2;
      const long long total = renderedFrames.load(std::memory_order_relaxed) + static_cast<long long>(frames);
      if (total >= rmsNextLogFrame) {
        const double rms = rmsCount > 0 ? std::sqrt(rmsAccum / static_cast<double>(rmsCount)) : 0.0;
        geaAudioLog("t=%.1fs output rms=%.5f", static_cast<double>(total) / sampleRate, rms);
        rmsAccum = 0.0;
        rmsCount = 0;
        rmsNextLogFrame = total + static_cast<long long>(sampleRate);
      }
    }
    renderedFrames.fetch_add(static_cast<long long>(frames), std::memory_order_relaxed);
  }

  void processNode(AudioNodeState &node, size_t frames, double qStart, double dt) {
    switch (node.kind) {
      case kNodeBufferSource: renderBufferSource(node, frames, qStart, dt); break;
      case kNodeOscillator: renderOscillator(node, frames, qStart, dt); break;
      case kNodeGain: {
        for (size_t i = 0; i < frames; i++) {
          const float g = static_cast<float>(node.gain.valueAt(qStart + static_cast<double>(i) * dt));
          node.output[i] = node.input[i] * g;
          node.output[frames + i] = node.input[frames + i] * g;
        }
        break;
      }
      case kNodeBiquad: renderBiquad(node, frames, qStart, dt); break;
      case kNodeDestination:
      default:
        break;  // destination consumes its input directly
    }
  }

  void renderBufferSource(AudioNodeState &node, size_t frames, double qStart, double dt) {
    if (!node.buffer || node.buffer->frames() == 0) {
      node.finished = true;
      return;
    }
    if (!node.startLogged) {
      node.startLogged = true;
      geaAudioLog("voice start: source %ld buffer=%s loop=%d rate=%.2f", node.id, node.buffer->name.c_str(),
                  node.loop ? 1 : 0, node.playbackRate.valueAt(qStart));
    }
    const AudioBufferData &buf = *node.buffer;
    const size_t length = buf.frames();
    const size_t channels = buf.channels.size();
    const double rateScale = buf.sampleRate / sampleRate;
    for (size_t i = 0; i < frames; i++) {
      const double t = qStart + static_cast<double>(i) * dt;
      if (t < node.startTime) continue;
      if (t >= node.stopTime) {
        node.finished = true;
        break;
      }
      if (node.playhead >= static_cast<double>(length)) {
        if (node.loop) {
          node.playhead = std::fmod(node.playhead, static_cast<double>(length));
        } else {
          node.finished = true;
          break;
        }
      }
      const size_t i0 = static_cast<size_t>(node.playhead);
      const size_t i1 = i0 + 1 < length ? i0 + 1 : (node.loop ? 0 : i0);
      const float frac = static_cast<float>(node.playhead - static_cast<double>(i0));
      const float l = buf.channels[0][i0] + (buf.channels[0][i1] - buf.channels[0][i0]) * frac;
      const float r = channels > 1 ? (buf.channels[1][i0] + (buf.channels[1][i1] - buf.channels[1][i0]) * frac) : l;
      node.output[i] = l;
      node.output[frames + i] = r;
      node.playhead += node.playbackRate.valueAt(t) * rateScale;
    }
  }

  void renderOscillator(AudioNodeState &node, size_t frames, double qStart, double dt) {
    if (!node.startLogged) {
      node.startLogged = true;
      geaAudioLog("voice start: oscillator %ld shape=%d f=%.1f", node.id, node.shape, node.frequency.valueAt(qStart));
    }
    for (size_t i = 0; i < frames; i++) {
      const double t = qStart + static_cast<double>(i) * dt;
      if (t < node.startTime) continue;
      if (t >= node.stopTime) {
        node.finished = true;
        break;
      }
      const double f = node.frequency.valueAt(t);
      node.phase += f / sampleRate;
      node.phase -= std::floor(node.phase);
      float v = 0.0f;
      switch (node.shape) {
        case kOscSine: v = static_cast<float>(std::sin(node.phase * 2.0 * M_PI)); break;
        case kOscSquare: v = node.phase < 0.5 ? 1.0f : -1.0f; break;
        case kOscSawtooth: v = static_cast<float>(2.0 * node.phase - 1.0); break;
        case kOscTriangle:
          v = static_cast<float>(node.phase < 0.5 ? 4.0 * node.phase - 1.0 : 3.0 - 4.0 * node.phase);
          break;
      }
      node.output[i] = v;
      node.output[frames + i] = v;
    }
  }

  void renderBiquad(AudioNodeState &node, size_t frames, double qStart, double dt) {
    // Coefficients re-derived per 64-sample block so filter sweeps track their
    // ramps; state carries across blocks.
    constexpr size_t kBlock = 64;
    for (size_t block = 0; block < frames; block += kBlock) {
      const size_t end = std::min(frames, block + kBlock);
      const double t = qStart + static_cast<double>(block) * dt;
      double freq = node.frequency.valueAt(t);
      double qual = node.q.valueAt(t);
      const double nyquist = sampleRate * 0.5;
      if (freq < 10.0) freq = 10.0;
      if (freq > nyquist * 0.99) freq = nyquist * 0.99;
      if (qual < 0.0001) qual = 0.0001;
      if (freq != node.lastFreq || qual != node.lastQ) {
        node.lastFreq = freq;
        node.lastQ = qual;
        const double w0 = 2.0 * M_PI * freq / sampleRate;
        const double alpha = std::sin(w0) / (2.0 * qual);
        const double cw = std::cos(w0);
        const double a0 = 1.0 + alpha;
        node.b0 = static_cast<float>(((1.0 - cw) / 2.0) / a0);
        node.b1 = static_cast<float>((1.0 - cw) / a0);
        node.b2 = node.b0;
        node.a1 = static_cast<float>((-2.0 * cw) / a0);
        node.a2 = static_cast<float>((1.0 - alpha) / a0);
      }
      for (int ch = 0; ch < 2; ch++) {
        const float *in = node.input.data() + static_cast<size_t>(ch) * frames;
        float *out = node.output.data() + static_cast<size_t>(ch) * frames;
        float z1 = node.z1[ch];
        float z2 = node.z2[ch];
        for (size_t i = block; i < end; i++) {
          const float x = in[i];
          const float y = node.b0 * x + z1;
          z1 = node.b1 * x - node.a1 * y + z2;
          z2 = node.b2 * x - node.a2 * y;
          out[i] = y;
        }
        node.z1[ch] = z1;
        node.z2[ch] = z2;
      }
    }
  }
};

GeaAudioEngine &geaAudio() {
  static GeaAudioEngine *engine = new GeaAudioEngine();
  return *engine;
}

}  // namespace

// ---------------------------------------------------------------------------
// Host externs (see native-webgl-angle/geatsc-plugin.mjs + src/nativeAudioHost.ts)
// ---------------------------------------------------------------------------

extern "C" bool gea_three_audio_supported() {
  return geaAudio().ensureStarted();
}

extern "C" double gea_three_audio_current_time() {
  return geaAudio().currentTime();
}

extern "C" double gea_three_audio_sample_rate() {
  return geaAudio().sampleRate;
}

extern "C" void gea_three_audio_resume() {
  geaAudio().ensureStarted();
}

extern "C" double gea_three_audio_create_node(double kind) {
  geaAudioLog("create_node kind=%d", static_cast<int>(kind));
  return static_cast<double>(geaAudio().createNode(static_cast<int>(kind)));
}

extern "C" void gea_three_audio_set_node_type(double node, std::string type) {
  geaAudio().setNodeType(static_cast<long>(node), type);
}

extern "C" void gea_three_audio_connect(double src, double dst) {
  geaAudioLog("connect %d->%d", static_cast<int>(src), static_cast<int>(dst));
  geaAudio().connect(static_cast<long>(src), static_cast<long>(dst));
}

extern "C" void gea_three_audio_param_event(double node, double param, double method, double value, double time) {
  geaAudioLog("param_event node=%d param=%d method=%d val=%.3f",
              static_cast<int>(node), static_cast<int>(param), static_cast<int>(method), value);
  geaAudio().paramEvent(static_cast<long>(node), static_cast<int>(param), static_cast<int>(method), value, time);
}

extern "C" double gea_three_audio_param_get(double node, double param) {
  return geaAudio().paramGet(static_cast<long>(node), static_cast<int>(param));
}

extern "C" double gea_three_audio_load_buffer(std::string name) {
  geaAudioLog("load_buffer '%s'", name.c_str());
  return static_cast<double>(geaAudio().loadBufferFile(name));
}

extern "C" double gea_three_audio_create_buffer(double channels, double length, double sampleRate) {
  return static_cast<double>(
      geaAudio().createBuffer(static_cast<int>(channels), static_cast<long>(length), sampleRate));
}

extern "C" void gea_three_audio_buffer_channel_data(double buffer, double channel, const gea::TypedArray<float> &data) {
  geaAudio().bufferChannelData(static_cast<long>(buffer), static_cast<int>(channel), data);
}

extern "C" void gea_three_audio_source_set_buffer(double node, double buffer) {
  geaAudio().sourceSetBuffer(static_cast<long>(node), static_cast<long>(buffer));
}

extern "C" void gea_three_audio_source_start(double node, double when, double loop) {
  geaAudioLog("source_start node=%d loop=%d", static_cast<int>(node), loop != 0.0);
  geaAudio().sourceStart(static_cast<long>(node), when, loop != 0.0);
}

extern "C" void gea_three_audio_source_stop(double node, double when) {
  geaAudio().sourceStop(static_cast<long>(node), when);
}
