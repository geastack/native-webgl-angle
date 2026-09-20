#pragma once
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <xaudio2.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <wrl/client.h>
#include <array>
#include <string>
#include <vector>

// The WebAudio graph remains in audio_host.mm. This adapter only delivers its
// planar float output to XAudio2 and decodes packaged audio through Media Foundation.
class GeaUwpAudioOutput final : public IXAudio2VoiceCallback {
  // Two 10 ms blocks bound queued audio to 20 ms at 48 kHz. The previous
  // three 1024-frame blocks delayed gain changes and new sounds by up to 64 ms.
  static constexpr size_t frames = 480;
  Microsoft::WRL::ComPtr<IXAudio2> engine;
  IXAudio2MasteringVoice *master = nullptr;
  IXAudio2SourceVoice *voice = nullptr;
  std::array<std::array<float, frames * 2>, 2> buffers{};
  std::array<float, frames> left{}, right{};
  void *context = nullptr;
  void (*render)(void *, size_t, float *, float *) = nullptr;

  HRESULT submit(float *data) {
    XAUDIO2_BUFFER buffer{};
    buffer.AudioBytes = static_cast<UINT32>(frames * 2 * sizeof(float));
    buffer.pAudioData = reinterpret_cast<const BYTE *>(data);
    buffer.pContext = data;
    return voice->SubmitSourceBuffer(&buffer);
  }

public:
  ~GeaUwpAudioOutput() {
    if (voice) voice->DestroyVoice();
    if (master) master->DestroyVoice();
  }
  bool start(void *ctx, void (*pull)(void *, size_t, float *, float *)) {
    context = ctx;
    render = pull;
    if (FAILED(XAudio2Create(engine.GetAddressOf(), 0, XAUDIO2_DEFAULT_PROCESSOR))) return false;
    if (FAILED(engine->CreateMasteringVoice(&master, 2, 48000))) return false;
    WAVEFORMATEX format{};
    format.wFormatTag = WAVE_FORMAT_IEEE_FLOAT;
    format.nChannels = 2;
    format.nSamplesPerSec = 48000;
    format.wBitsPerSample = 32;
    format.nBlockAlign = 8;
    format.nAvgBytesPerSec = 48000 * 8;
    if (FAILED(engine->CreateSourceVoice(&voice, &format, 0, 1.0f, this))) return false;
    for (auto &buffer : buffers) if (FAILED(submit(buffer.data()))) return false;
    return SUCCEEDED(voice->Start());
  }

  void STDMETHODCALLTYPE OnBufferEnd(void *data) override {
    render(context, frames, left.data(), right.data());
    auto *output = static_cast<float *>(data);
    for (size_t i = 0; i < frames; ++i) {
      output[i * 2] = left[i];
      output[i * 2 + 1] = right[i];
    }
    if (FAILED(submit(output))) OutputDebugStringA("[gea-audio] XAudio2 buffer submission failed\n");
  }
  void STDMETHODCALLTYPE OnStreamEnd() override {}
  void STDMETHODCALLTYPE OnVoiceProcessingPassEnd() override {}
  void STDMETHODCALLTYPE OnVoiceProcessingPassStart(UINT32) override {}
  void STDMETHODCALLTYPE OnBufferStart(void *) override {}
  void STDMETHODCALLTYPE OnLoopEnd(void *) override {}
  void STDMETHODCALLTYPE OnVoiceError(void *, HRESULT) override {
    OutputDebugStringA("[gea-audio] XAudio2 voice failed\n");
  }
};

inline bool geaUwpDecodeAudio(const std::wstring &path, std::vector<std::vector<float>> &channels, double &rate) {
  using Microsoft::WRL::ComPtr;
  static const HRESULT startup = MFStartup(MF_VERSION);
  if (FAILED(startup)) return false;
  ComPtr<IMFSourceReader> reader;
  if (FAILED(MFCreateSourceReaderFromURL(path.c_str(), nullptr, reader.GetAddressOf()))) return false;
  ComPtr<IMFMediaType> requested;
  if (FAILED(MFCreateMediaType(requested.GetAddressOf()))) return false;
  requested->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Audio);
  requested->SetGUID(MF_MT_SUBTYPE, MFAudioFormat_Float);
  if (FAILED(reader->SetCurrentMediaType(MF_SOURCE_READER_FIRST_AUDIO_STREAM, nullptr, requested.Get()))) return false;
  ComPtr<IMFMediaType> actual;
  if (FAILED(reader->GetCurrentMediaType(MF_SOURCE_READER_FIRST_AUDIO_STREAM, actual.GetAddressOf()))) return false;
  UINT32 count = 0, sampleRate = 0;
  if (FAILED(actual->GetUINT32(MF_MT_AUDIO_NUM_CHANNELS, &count)) || count == 0 || count > 2) return false;
  if (FAILED(actual->GetUINT32(MF_MT_AUDIO_SAMPLES_PER_SECOND, &sampleRate)) || sampleRate == 0) return false;
  rate = sampleRate;
  channels.resize(count);
  for (;;) {
    DWORD flags = 0;
    ComPtr<IMFSample> sample;
    if (FAILED(reader->ReadSample(MF_SOURCE_READER_FIRST_AUDIO_STREAM, 0, nullptr, &flags, nullptr, sample.GetAddressOf()))) return false;
    if (flags & MF_SOURCE_READERF_ERROR) return false;
    if (sample) {
      ComPtr<IMFMediaBuffer> buffer;
      if (FAILED(sample->ConvertToContiguousBuffer(buffer.GetAddressOf()))) return false;
      BYTE *bytes = nullptr;
      DWORD length = 0;
      if (FAILED(buffer->Lock(&bytes, nullptr, &length))) return false;
      const auto *pcm = reinterpret_cast<const float *>(bytes);
      const size_t frames = length / (sizeof(float) * count);
      for (size_t i = 0; i < frames; ++i)
        for (UINT32 ch = 0; ch < count; ++ch) channels[ch].push_back(pcm[i * count + ch]);
      buffer->Unlock();
    }
    if (flags & MF_SOURCE_READERF_ENDOFSTREAM) break;
  }
  return !channels[0].empty();
}
