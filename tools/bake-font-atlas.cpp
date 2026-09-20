// One-shot glyph-atlas baker for the native troika-three-text adapter.
// Usage: bake-font-atlas <font.ttf> <pixel-height> <out-prefix>
// Writes <out-prefix>.bin (alpha atlas, tightly packed W*H bytes) and
// <out-prefix>.json (atlas size, per-glyph quad metrics in the packed-quad
// convention, font vertical metrics, and non-zero kerning pairs), both keyed
// to ASCII 32..126. Consumed by gen-troika-atlas.mjs, which embeds the result
// as a TS module for the reference app's native text renderer.
// Build (stb ships inside @geastack/engine; a #include cannot resolve a package
// specifier, so the include path is passed on the command line):
//   clang++ -std=c++20 -O2 \
//     -I"$(node -p "require('node:path').dirname(require.resolve('@geastack/engine/package.json'))")/vendor/stb" \
//     tools/bake-font-atlas.cpp -o bake-font-atlas
#define STB_TRUETYPE_IMPLEMENTATION
#include "stb_truetype.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

int main(int argc, char **argv) {
  if (argc != 4) {
    std::fprintf(stderr, "usage: %s <font.ttf> <pixel-height> <out-prefix>\n", argv[0]);
    return 2;
  }
  const char *fontPath = argv[1];
  const float pixelHeight = static_cast<float>(std::atof(argv[2]));
  const std::string outPrefix = argv[3];

  FILE *f = std::fopen(fontPath, "rb");
  if (!f) {
    std::fprintf(stderr, "cannot open %s\n", fontPath);
    return 1;
  }
  std::fseek(f, 0, SEEK_END);
  const long size = std::ftell(f);
  std::fseek(f, 0, SEEK_SET);
  std::vector<unsigned char> font(static_cast<size_t>(size));
  if (std::fread(font.data(), 1, font.size(), f) != font.size()) {
    std::fclose(f);
    std::fprintf(stderr, "short read on %s\n", fontPath);
    return 1;
  }
  std::fclose(f);

  constexpr int FIRST = 32;
  constexpr int COUNT = 95;  // ASCII 32..126

  // Grow the atlas until every glyph packs.
  int atlasW = 512;
  int atlasH = 512;
  std::vector<unsigned char> atlas;
  std::vector<stbtt_packedchar> packed(COUNT);
  for (;;) {
    atlas.assign(static_cast<size_t>(atlasW) * atlasH, 0);
    stbtt_pack_context ctx;
    if (!stbtt_PackBegin(&ctx, atlas.data(), atlasW, atlasH, 0, 1, nullptr)) {
      std::fprintf(stderr, "PackBegin failed\n");
      return 1;
    }
    stbtt_PackSetOversampling(&ctx, 1, 1);
    const int ok = stbtt_PackFontRange(&ctx, font.data(), 0, pixelHeight, FIRST, COUNT, packed.data());
    stbtt_PackEnd(&ctx);
    if (ok) break;
    if (atlasW <= atlasH) atlasW *= 2;
    else atlasH *= 2;
    if (atlasW > 4096) {
      std::fprintf(stderr, "atlas exceeded 4096 wide\n");
      return 1;
    }
  }

  stbtt_fontinfo info;
  if (!stbtt_InitFont(&info, font.data(), stbtt_GetFontOffsetForIndex(font.data(), 0))) {
    std::fprintf(stderr, "InitFont failed\n");
    return 1;
  }
  const float scale = stbtt_ScaleForPixelHeight(&info, pixelHeight);
  int ascent = 0;
  int descent = 0;
  int lineGap = 0;
  stbtt_GetFontVMetrics(&info, &ascent, &descent, &lineGap);

  const std::string binPath = outPrefix + ".bin";
  FILE *bin = std::fopen(binPath.c_str(), "wb");
  if (!bin) {
    std::fprintf(stderr, "cannot write %s\n", binPath.c_str());
    return 1;
  }
  std::fwrite(atlas.data(), 1, atlas.size(), bin);
  std::fclose(bin);

  const std::string jsonPath = outPrefix + ".json";
  FILE *js = std::fopen(jsonPath.c_str(), "w");
  if (!js) {
    std::fprintf(stderr, "cannot write %s\n", jsonPath.c_str());
    return 1;
  }
  std::fprintf(js, "{\n");
  std::fprintf(js, "  \"atlasWidth\": %d,\n  \"atlasHeight\": %d,\n", atlasW, atlasH);
  std::fprintf(js, "  \"pixelHeight\": %g,\n", pixelHeight);
  std::fprintf(js, "  \"ascent\": %g,\n  \"descent\": %g,\n  \"lineGap\": %g,\n", ascent * scale, descent * scale,
               lineGap * scale);
  std::fprintf(js, "  \"first\": %d,\n", FIRST);
  std::fprintf(js, "  \"glyphs\": [\n");
  for (int i = 0; i < COUNT; ++i) {
    const stbtt_packedchar &c = packed[i];
    std::fprintf(js, "    [%d,%d,%d,%d,%g,%g,%g]%s\n", c.x0, c.y0, c.x1, c.y1, c.xoff, c.yoff, c.xadvance,
                 i + 1 < COUNT ? "," : "");
  }
  std::fprintf(js, "  ],\n");
  std::fprintf(js, "  \"kerning\": [\n");
  bool firstPair = true;
  for (int a = 0; a < COUNT; ++a) {
    for (int b = 0; b < COUNT; ++b) {
      const int kern = stbtt_GetCodepointKernAdvance(&info, FIRST + a, FIRST + b);
      if (kern == 0) continue;
      std::fprintf(js, "%s    [%d,%d,%g]", firstPair ? "" : ",\n", FIRST + a, FIRST + b, kern * scale);
      firstPair = false;
    }
  }
  std::fprintf(js, "\n  ]\n}\n");
  std::fclose(js);
  std::printf("%s: %dx%d atlas\n", outPrefix.c_str(), atlasW, atlasH);
  return 0;
}
