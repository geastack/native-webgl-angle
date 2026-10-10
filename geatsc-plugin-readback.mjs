// Writable typed views must reach GLES in place. Upload snapshots are not valid
// here: copying into a temporary would discard readPixels' observable result.
export const nativeReadbackFunctions = [[
  'threeWebGLReadPixels', 'gea_three_webgl_read_pixels_native', 'void', `
#include <variant>
extern "C" void gea_three_webgl_read_pixels_bytes(double x, double y, double width, double height,
  double format, double type, void* bytes, double byteLength, double elementType);
template <typename T> inline void gea_three_webgl_read_pixels_native(double x, double y, double width, double height,
  double format, double type, const gea::Ref<gea::TypedArray<T>>& destination, double offset) {
  constexpr int elementType = std::is_same_v<T, float> ? 0x1406 : std::is_same_v<T, std::uint16_t> ? 0x1403 :
    std::is_same_v<T, std::uint8_t> ? 0x1401 : std::is_same_v<T, std::uint32_t> ? 0x1405 :
    std::is_same_v<T, std::int32_t> ? 0x1404 : std::is_same_v<T, std::int16_t> ? 0x1402 : 0x1400;
  if (!destination || !std::isfinite(offset) || offset < 0 || std::floor(offset) != offset || offset > destination->size()) {
    gea_three_webgl_read_pixels_bytes(x,y,width,height,format,type,nullptr,-1,elementType); return;
  }
  const auto start = static_cast<std::size_t>(offset);
  auto* data = destination->data();
  gea_three_webgl_read_pixels_bytes(x,y,width,height,format,type,data ? data + start : nullptr,
    static_cast<double>((destination->size()-start)*sizeof(T)), elementType);
}
template <typename... T> inline void gea_three_webgl_read_pixels_native(double x, double y, double width, double height,
  double format, double type, const std::variant<T...>& destination, double offset) {
  std::visit([&](const auto& view) { gea_three_webgl_read_pixels_native(x,y,width,height,format,type,view,offset); }, destination);
}`
]];
