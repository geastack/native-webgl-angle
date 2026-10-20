// A texture upload hands GL the view's own bytes, and the GL type names the view
// (WebGL 2 3.7.6, OES_texture_half_float): UNSIGNED_SHORT, HALF_FLOAT and the
// packed 16-bit types read a Uint16Array; UNSIGNED_INT and the packed 32-bit
// types a Uint32Array; BYTE, SHORT and INT their signed views; FLOAT a Float32Array.
const textureElementKind = '(type == 0x1401 ? 4 : type == 0x1400 ? 5 : type == 0x1402 ? 6 : type == 0x1404 ? 7 : ' +
  'type == 0x1403 || type == 0x140B || type == 0x8D61 || type == 0x8033 || type == 0x8034 || type == 0x8363 ? 2 : ' +
  'type == 0x1405 || type == 0x8368 || type == 0x8C3B || type == 0x8C3E || type == 0x84FA ? 3 : 1)'

// The host owns the physical upload format. The compiler only preserves the
// native carriers at these explicitly registered synchronous boundaries.
export const nativeUploadFunctions = [
  ['threeWebGLBufferData', 'gea_three_webgl_buffer_data_native', ['target', 'usage', 'typeCode'], 'gea_three_webgl_buffer_data_bytes', ['target', 'usage'], 'typeCode'],
  ['threeWebGLBufferSubData', 'gea_three_webgl_buffer_sub_data_native', ['target', 'offset', 'typeCode'], 'gea_three_webgl_buffer_sub_data_bytes', ['target', 'offset'], 'typeCode'],
  ['threeWebGLBufferSubDataRange', 'gea_three_webgl_buffer_sub_data_range_native', ['target', 'offset', 'typeCode'], 'gea_three_webgl_buffer_sub_data_bytes', ['target', 'offset'], 'typeCode', true],
  ['threeWebGLTexImage2D', 'gea_three_webgl_tex_image_2d_native', ['target', 'level', 'internalFormat', 'width', 'height', 'format', 'type'], 'gea_three_webgl_tex_image_2d_bytes', ['target', 'level', 'internalFormat', 'width', 'height', 'format', 'type'], textureElementKind],
  ['threeWebGLTexImage3D', 'gea_three_webgl_tex_image_3d_native', ['target', 'level', 'internalFormat', 'width', 'height', 'depth', 'format', 'type'], 'gea_three_webgl_tex_image_3d_bytes', ['target', 'level', 'internalFormat', 'width', 'height', 'depth', 'format', 'type'], textureElementKind],
  ['threeWebGLTexSubImage3D', 'gea_three_webgl_tex_sub_image_3d_native', ['target', 'level', 'xoffset', 'yoffset', 'zoffset', 'width', 'height', 'depth', 'format', 'type'], 'gea_three_webgl_tex_sub_image_3d_bytes', ['target', 'level', 'xoffset', 'yoffset', 'zoffset', 'width', 'height', 'depth', 'format', 'type'], textureElementKind],
  ['threeWebGLTexSubImage2D', 'gea_three_webgl_tex_sub_image_2d_native', ['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'type'], 'gea_three_webgl_tex_sub_image_2d_bytes', ['target', 'level', 'xoffset', 'yoffset', 'width', 'height', 'format', 'type'], textureElementKind],
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
