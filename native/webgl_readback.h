#pragma once
#include <cmath>
#include <cstdint>
#include <limits>

namespace gea_webgl {
// Calculate the complete destination window, including WebGL2 pack layout.
// Return a GL error before the driver can touch an undersized typed array.
inline unsigned validateReadPixels(double width, double height, double format, double type,
    double bytes, double elementType, int alignment, int rowLength, int skipRows, int skipPixels) {
  if (!std::isfinite(width) || !std::isfinite(height) || width < 0 || height < 0 ||
      width > INT32_MAX || height > INT32_MAX || std::floor(width) != width || std::floor(height) != height) return 0x0501;
  if (format != 0x1908 || (type != 0x1401 && type != 0x1406 && type != 0x140B)) return 0x0502;
  if (elementType != type && !(type == 0x140B && elementType == 0x1403)) return 0x0502;
  if (bytes < 0 || !std::isfinite(bytes)) return 0x0501;
  if (width == 0 || height == 0) return 0;
  if (alignment != 1 && alignment != 2 && alignment != 4 && alignment != 8) return 0x0502;
  if (rowLength < 0 || skipRows < 0 || skipPixels < 0) return 0x0502;
  const uint64_t pixel = type == 0x1406 ? 16 : type == 0x140B ? 8 : 4;
  const uint64_t row = rowLength ? rowLength : static_cast<uint64_t>(width);
  if (row < static_cast<uint64_t>(width) + skipPixels) return 0x0502;
  const uint64_t pitch = (row*pixel + alignment-1)/alignment*alignment;
  const uint64_t rows = static_cast<uint64_t>(height)-1+skipRows;
  if (rows && pitch > UINT64_MAX/rows) return 0x0502;
  const uint64_t tail = (static_cast<uint64_t>(skipPixels)+static_cast<uint64_t>(width))*pixel;
  if (rows*pitch > UINT64_MAX-tail) return 0x0502;
  return static_cast<long double>(rows*pitch+tail) <= bytes ? 0 : 0x0502;
}
}
