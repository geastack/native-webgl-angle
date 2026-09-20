// The host owns the physical upload format. The compiler only preserves the
// native carriers at these explicitly registered synchronous boundaries.
export const nativeUploadFunctions = [
  ['threeWebGLBufferData', 'gea_three_webgl_buffer_data_native', ['target', 'usage', 'typeCode'], 'gea_three_webgl_buffer_data_bytes', ['target', 'usage'], 'typeCode'],
  ['threeWebGLBufferSubData', 'gea_three_webgl_buffer_sub_data_native', ['target', 'offset', 'typeCode'], 'gea_three_webgl_buffer_sub_data_bytes', ['target', 'offset'], 'typeCode'],
  ['threeWebGLBufferSubDataRange', 'gea_three_webgl_buffer_sub_data_range_native', ['target', 'offset', 'typeCode'], 'gea_three_webgl_buffer_sub_data_bytes', ['target', 'offset'], 'typeCode', true],
  ['threeWebGLTexImage2D', 'gea_three_webgl_tex_image_2d_native', ['target', 'level', 'internalFormat', 'width', 'height', 'format', 'type'], 'gea_three_webgl_tex_image_2d_bytes', ['target', 'level', 'internalFormat', 'width', 'height', 'format', 'type'], '(type == 0x1403 ? 2 : type == 0x1405 ? 3 : type == 0x1401 ? 4 : 1)'],
  ['threeWebGLTexSubImage2D', 'gea_three_webgl_tex_sub_image_2d_native', ['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'type'], 'gea_three_webgl_tex_sub_image_2d_bytes', ['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'type'], '(type == 0x1403 ? 2 : type == 0x1405 ? 3 : type == 0x1401 ? 4 : 1)'],
].map(([name, binding, parameters, raw, rawParameters, kind, range]) => {
  const declaration = `extern "C" void ${raw}(${rawParameters.map(p => `double ${p}`).join(', ')}, const void* bytes, double byteLength);
  template <typename Source> inline void ${binding}(${parameters.map(p => `double ${p}`).join(', ')}, const Source& values${range ? ', double sourceOffset, double length' : ''}) {
    const auto upload = [&]<typename Element>() {
      const gea::detail::HostNumericArgument<Element> data(values);
      const auto view = data.span()${range ? '.subspan(static_cast<std::size_t>(std::min(static_cast<double>(data.size()), std::max(0.0, sourceOffset))))' : ''};
      const auto size = ${range ? 'static_cast<std::size_t>(std::min(static_cast<double>(view.size()), std::max(0.0, length)))' : 'view.size()'};
      ${raw}(${rawParameters.join(', ')}, size ? view.data() : nullptr, static_cast<double>(size * sizeof(Element)));
    };
    const int kind = static_cast<int>(${kind});
    if (kind == 2) upload.template operator()<std::uint16_t>();
    else if (kind == 3) upload.template operator()<std::uint32_t>();
    else if (kind == 4) upload.template operator()<std::uint8_t>();
    else if (kind == 5) upload.template operator()<std::int8_t>();
    else if (kind == 6) upload.template operator()<std::int16_t>();
    else if (kind == 7) upload.template operator()<std::int32_t>();
    else if (kind == 8) upload.template operator()<double>();
    else upload.template operator()<float>();
  }`
  return [name, binding, 'void', declaration]
})
