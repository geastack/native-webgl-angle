import {
  transformAutomaticInstancing,
  transformCanonicalInstanceHooks,
} from "./geatsc-plugin-instancing.mjs";
import fs from "node:fs";
import { nativeUploadFunctions } from "./geatsc-plugin-uploads.mjs";
import { fileURLToPath } from "node:url";

import {
  nativeLightUniformCaches,
  nativeUniformNamesEnabled,
  nativeUniformBindingsEnabled,
  nativeWebGLUniformsSource,
  rewriteUniformValueMethods,
  transformUniformsLib,
  transformUniformsUtils,
} from "./geatsc-plugin-uniforms.mjs";

const nativeWebGLSourceModule = fileURLToPath(
  new URL("./src/nativeWebGL.ts", import.meta.url),
);
// Render-list comparators receive this exact engine-owned record. Calling the
// default comparator through `any` forced two dynamic allocations per compare.
const renderGroupType =
  "({ start: number, count: number, materialIndex?: number } | null)";
const nativeRenderItemType = (prefix) =>
  `{ id: number, object: import('${prefix}core/Object3D.js').Object3D, geometry: import('${prefix}core/BufferGeometry.js').BufferGeometry, ` +
  `material: import('${prefix}materials/Material.js').Material, materialVariant: number, groupOrder: number, renderOrder: number, z: number, group: ${renderGroupType} }`;
const nativeWebGLReceiverIdentity = Object.freeze([
  Object.freeze({
    moduleSpecifier: nativeWebGLSourceModule,
    exportName: "NativeWebGL2RenderingContext",
  }),
  Object.freeze({
    moduleSpecifier: "@geastack/native-webgl-angle",
    exportName: "NativeWebGL2RenderingContext",
  }),
  Object.freeze({
    moduleSpecifier: "@geastack/native-webgl-angle/nativeWebGL",
    exportName: "NativeWebGL2RenderingContext",
  }),
]);

function nativeVoidMemberCallContract(
  id,
  binding,
  arity,
  adaptedNumericMembers = new Map(),
) {
  return Object.freeze({
    id,
    binding,
    receiverSourceClasses: nativeWebGLReceiverIdentity,
    parameters: Object.freeze(
      Array.from({ length: arity }, (_, sourceArgument) => {
        const member = adaptedNumericMembers.get(sourceArgument);
        return Object.freeze({
          sourceArgument,
          semantic: "number",
          ...(member
            ? {
                adapter: Object.freeze({
                  kind: "nullable-number-member",
                  member,
                  absent: 0,
                }),
              }
            : {}),
        });
      }),
    ),
    result: Object.freeze({ physical: "void", semantic: "undefined" }),
  });
}

const hostFunctions = [
  [
    "threeWebGLVertexAttribDivisor",
    "gea_three_webgl_vertex_attrib_divisor",
    "void",
    'extern "C" void gea_three_webgl_vertex_attrib_divisor(double index, double divisor);',
  ],
  [
    "threeWebGLDrawElementsInstanced",
    "gea_three_webgl_draw_elements_instanced",
    "void",
    'extern "C" void gea_three_webgl_draw_elements_instanced(double mode, double count, double type, double offset, double instanceCount);',
  ],
  [
    "threeWebGLDrawArraysInstanced",
    "gea_three_webgl_draw_arrays_instanced",
    "void",
    'extern "C" void gea_three_webgl_draw_arrays_instanced(double mode, double first, double count, double instanceCount);',
  ],
  ...nativeUploadFunctions,
  [
    "threeNativeProfilePhase",
    "gea_three_native_profile_phase",
    "void",
    'extern "C" void gea_three_native_profile_phase(double phase);',
  ],
  [
    "threeWebGLAttach",
    "gea_three_webgl_attach",
    "bool",
    'extern "C" bool gea_three_webgl_attach(gea::apple::AppKit::NSView view, double width, double height, double devicePixelRatio);',
  ],
  [
    "threeWebGLSyncSize",
    "gea_three_webgl_sync_size",
    "double",
    'extern "C" double gea_three_webgl_sync_size(double fallbackAspect);',
  ],
  [
    "threeWebGLWidth",
    "gea_three_webgl_width",
    "double",
    'extern "C" double gea_three_webgl_width();',
  ],
  [
    "threeWebGLHeight",
    "gea_three_webgl_height",
    "double",
    'extern "C" double gea_three_webgl_height();',
  ],
  [
    "threeWebGLDevicePixelRatio",
    "gea_three_webgl_device_pixel_ratio",
    "double",
    'extern "C" double gea_three_webgl_device_pixel_ratio();',
  ],
  [
    "threeWebGLSwap",
    "gea_three_webgl_swap",
    "void",
    'extern "C" void gea_three_webgl_swap();',
  ],
  [
    "threeAngleSmokeLog",
    "gea_three_angle_smoke_log",
    "void",
    'extern "C" void gea_three_angle_smoke_log(std::string message);',
  ],
  [
    "threeKeyPressed",
    "gea_three_key_pressed",
    "bool",
    'extern "C" bool gea_three_key_pressed(double code);',
  ],
  [
    "threeGamepadState",
    "gea_three_gamepad_state",
    "double",
    'extern "C" double gea_three_gamepad_state(double channel);',
  ],
  [
    "threePointerState",
    "gea_three_pointer_state",
    "double",
    'extern "C" double gea_three_pointer_state(double channel);',
  ],

  [
    "threeWebGLCreateBuffer",
    "gea_three_webgl_create_buffer",
    "double",
    'extern "C" double gea_three_webgl_create_buffer();',
  ],
  [
    "threeWebGLDeleteBuffer",
    "gea_three_webgl_delete_buffer",
    "void",
    'extern "C" void gea_three_webgl_delete_buffer(double buffer);',
  ],
  [
    "threeWebGLBindBuffer",
    "gea_three_webgl_bind_buffer",
    "void",
    'extern "C" void gea_three_webgl_bind_buffer(double target, double buffer);',
  ],
  [
    "threeWebGLBufferSubDataBytes",
    "gea_three_webgl_buffer_sub_data_bytes",
    "void",
    'extern "C" void gea_three_webgl_buffer_sub_data_bytes(double target, double offset, const void *bytes, double byteLength);',
  ],

  [
    "threeWebGLCreateShader",
    "gea_three_webgl_create_shader",
    "double",
    'extern "C" double gea_three_webgl_create_shader(double type);',
  ],
  [
    "threeWebGLShaderSource",
    "gea_three_webgl_shader_source",
    "void",
    'extern "C" void gea_three_webgl_shader_source(double shader, std::string source);',
  ],
  [
    "threeWebGLCompileShader",
    "gea_three_webgl_compile_shader",
    "void",
    'extern "C" void gea_three_webgl_compile_shader(double shader);',
  ],
  [
    "threeWebGLGetShaderParameter",
    "gea_three_webgl_get_shader_parameter",
    "double",
    'extern "C" double gea_three_webgl_get_shader_parameter(double shader, double pname);',
  ],
  [
    "threeWebGLDeleteShader",
    "gea_three_webgl_delete_shader",
    "void",
    'extern "C" void gea_three_webgl_delete_shader(double shader);',
  ],

  [
    "threeWebGLCreateProgram",
    "gea_three_webgl_create_program",
    "double",
    'extern "C" double gea_three_webgl_create_program();',
  ],
  [
    "threeWebGLAttachShader",
    "gea_three_webgl_attach_shader",
    "void",
    'extern "C" void gea_three_webgl_attach_shader(double program, double shader);',
  ],
  [
    "threeWebGLLinkProgram",
    "gea_three_webgl_link_program",
    "void",
    'extern "C" void gea_three_webgl_link_program(double program);',
  ],
  [
    "threeWebGLGetProgramParameter",
    "gea_three_webgl_get_program_parameter",
    "double",
    'extern "C" double gea_three_webgl_get_program_parameter(double program, double pname);',
  ],
  [
    "threeWebGLDeleteProgram",
    "gea_three_webgl_delete_program",
    "void",
    'extern "C" void gea_three_webgl_delete_program(double program);',
  ],
  [
    "threeWebGLUseProgram",
    "gea_three_webgl_use_program",
    "void",
    'extern "C" void gea_three_webgl_use_program(double program);',
  ],
  [
    "threeWebGLGetAttribLocation",
    "gea_three_webgl_get_attrib_location",
    "double",
    'extern "C" double gea_three_webgl_get_attrib_location(double program, std::string name);',
  ],
  [
    "threeWebGLGetUniformLocation",
    "gea_three_webgl_get_uniform_location",
    "double",
    'extern "C" double gea_three_webgl_get_uniform_location(double program, std::string name);',
  ],
  [
    "threeWebGLGetActiveUniformInfo",
    "gea_three_webgl_get_active_uniform_info",
    "std::string",
    'extern "C" std::string gea_three_webgl_get_active_uniform_info(double program, double index);',
  ],
  [
    "threeWebGLGetActiveAttribInfo",
    "gea_three_webgl_get_active_attrib_info",
    "std::string",
    'extern "C" std::string gea_three_webgl_get_active_attrib_info(double program, double index);',
  ],

  [
    "threeWebGLEnableVertexAttribArray",
    "gea_three_webgl_enable_vertex_attrib_array",
    "void",
    'extern "C" void gea_three_webgl_enable_vertex_attrib_array(double index);',
  ],
  [
    "threeWebGLDisableVertexAttribArray",
    "gea_three_webgl_disable_vertex_attrib_array",
    "void",
    'extern "C" void gea_three_webgl_disable_vertex_attrib_array(double index);',
  ],
  [
    "threeWebGLVertexAttribPointer",
    "gea_three_webgl_vertex_attrib_pointer",
    "void",
    'extern "C" void gea_three_webgl_vertex_attrib_pointer(double index, double size, double type, double normalized, double stride, double offset);',
  ],

  [
    "threeWebGLUniform1f",
    "gea_three_webgl_uniform_1f",
    "void",
    'extern "C" void gea_three_webgl_uniform_1f(double location, double x);',
  ],
  [
    "threeWebGLUniform1i",
    "gea_three_webgl_uniform_1i",
    "void",
    'extern "C" void gea_three_webgl_uniform_1i(double location, double x);',
  ],
  [
    "threeWebGLUniform1ui",
    "gea_three_webgl_uniform_1ui",
    "void",
    'extern "C" void gea_three_webgl_uniform_1ui(double location, double x);',
  ],
  [
    "threeWebGLUniform2f",
    "gea_three_webgl_uniform_2f",
    "void",
    'extern "C" void gea_three_webgl_uniform_2f(double location, double x, double y);',
  ],
  [
    "threeWebGLUniform2i",
    "gea_three_webgl_uniform_2i",
    "void",
    'extern "C" void gea_three_webgl_uniform_2i(double location, double x, double y);',
  ],
  [
    "threeWebGLUniform2ui",
    "gea_three_webgl_uniform_2ui",
    "void",
    'extern "C" void gea_three_webgl_uniform_2ui(double location, double x, double y);',
  ],
  [
    "threeWebGLUniform3f",
    "gea_three_webgl_uniform_3f",
    "void",
    'extern "C" void gea_three_webgl_uniform_3f(double location, double x, double y, double z);',
  ],
  [
    "threeWebGLUniform3i",
    "gea_three_webgl_uniform_3i",
    "void",
    'extern "C" void gea_three_webgl_uniform_3i(double location, double x, double y, double z);',
  ],
  [
    "threeWebGLUniform3ui",
    "gea_three_webgl_uniform_3ui",
    "void",
    'extern "C" void gea_three_webgl_uniform_3ui(double location, double x, double y, double z);',
  ],
  [
    "threeWebGLUniform4f",
    "gea_three_webgl_uniform_4f",
    "void",
    'extern "C" void gea_three_webgl_uniform_4f(double location, double x, double y, double z, double w);',
  ],
  [
    "threeWebGLUniform4i",
    "gea_three_webgl_uniform_4i",
    "void",
    'extern "C" void gea_three_webgl_uniform_4i(double location, double x, double y, double z, double w);',
  ],
  [
    "threeWebGLUniform4ui",
    "gea_three_webgl_uniform_4ui",
    "void",
    'extern "C" void gea_three_webgl_uniform_4ui(double location, double x, double y, double z, double w);',
  ],
  [
    "threeWebGLUniform1fv",
    "gea_three_webgl_uniform_1fv",
    "void",
    'extern "C" void gea_three_webgl_uniform_1fv(double location, const gea::detail::HostNumericArgument<float>& values);',
  ],
  [
    "threeWebGLUniform2fv",
    "gea_three_webgl_uniform_2fv",
    "void",
    'extern "C" void gea_three_webgl_uniform_2fv(double location, const gea::detail::HostNumericArgument<float>& values);',
  ],
  [
    "threeWebGLUniform3fv",
    "gea_three_webgl_uniform_3fv",
    "void",
    'extern "C" void gea_three_webgl_uniform_3fv(double location, const gea::detail::HostNumericArgument<float>& values);',
  ],
  [
    "threeWebGLUniform4fv",
    "gea_three_webgl_uniform_4fv",
    "void",
    'extern "C" void gea_three_webgl_uniform_4fv(double location, const gea::detail::HostNumericArgument<float>& values);',
  ],
  [
    "threeWebGLUniform1iv",
    "gea_three_webgl_uniform_1iv",
    "void",
    'extern "C" void gea_three_webgl_uniform_1iv(double location, const gea::detail::HostNumericArgument<std::int32_t>& values);',
  ],
  [
    "threeWebGLUniform2iv",
    "gea_three_webgl_uniform_2iv",
    "void",
    'extern "C" void gea_three_webgl_uniform_2iv(double location, const gea::detail::HostNumericArgument<std::int32_t>& values);',
  ],
  [
    "threeWebGLUniform3iv",
    "gea_three_webgl_uniform_3iv",
    "void",
    'extern "C" void gea_three_webgl_uniform_3iv(double location, const gea::detail::HostNumericArgument<std::int32_t>& values);',
  ],
  [
    "threeWebGLUniform4iv",
    "gea_three_webgl_uniform_4iv",
    "void",
    'extern "C" void gea_three_webgl_uniform_4iv(double location, const gea::detail::HostNumericArgument<std::int32_t>& values);',
  ],
  [
    "threeWebGLUniform1uiv",
    "gea_three_webgl_uniform_1uiv",
    "void",
    'extern "C" void gea_three_webgl_uniform_1uiv(double location, const gea::detail::HostNumericArgument<std::uint32_t>& values);',
  ],
  [
    "threeWebGLUniform2uiv",
    "gea_three_webgl_uniform_2uiv",
    "void",
    'extern "C" void gea_three_webgl_uniform_2uiv(double location, const gea::detail::HostNumericArgument<std::uint32_t>& values);',
  ],
  [
    "threeWebGLUniform3uiv",
    "gea_three_webgl_uniform_3uiv",
    "void",
    'extern "C" void gea_three_webgl_uniform_3uiv(double location, const gea::detail::HostNumericArgument<std::uint32_t>& values);',
  ],
  [
    "threeWebGLUniform4uiv",
    "gea_three_webgl_uniform_4uiv",
    "void",
    'extern "C" void gea_three_webgl_uniform_4uiv(double location, const gea::detail::HostNumericArgument<std::uint32_t>& values);',
  ],
  [
    "threeWebGLUniformMatrix2fv",
    "gea_three_webgl_uniform_matrix_2fv",
    "void",
    'extern "C" void gea_three_webgl_uniform_matrix_2fv(double location, double count, double transpose, const gea::detail::HostNumericArgument<float>& values);',
  ],
  [
    "threeWebGLUniformMatrix3fv",
    "gea_three_webgl_uniform_matrix_3fv",
    "void",
    'extern "C" void gea_three_webgl_uniform_matrix_3fv(double location, double count, double transpose, const gea::detail::HostNumericArgument<float>& values);',
  ],
  [
    "threeWebGLUniformMatrix4fv",
    "gea_three_webgl_uniform_matrix_4fv",
    "void",
    'extern "C" void gea_three_webgl_uniform_matrix_4fv(double location, double count, double transpose, const gea::detail::HostNumericArgument<float>& values);',
  ],

  [
    "threeWebGLCreateTexture",
    "gea_three_webgl_create_texture",
    "double",
    'extern "C" double gea_three_webgl_create_texture();',
  ],
  [
    "threeWebGLDeleteTexture",
    "gea_three_webgl_delete_texture",
    "void",
    'extern "C" void gea_three_webgl_delete_texture(double texture);',
  ],
  [
    "threeWebGLBindTexture",
    "gea_three_webgl_bind_texture",
    "void",
    'extern "C" void gea_three_webgl_bind_texture(double target, double texture);',
  ],
  [
    "threeWebGLActiveTexture",
    "gea_three_webgl_active_texture",
    "void",
    'extern "C" void gea_three_webgl_active_texture(double texture);',
  ],
  [
    "threeWebGLTexParameteri",
    "gea_three_webgl_tex_parameteri",
    "void",
    'extern "C" void gea_three_webgl_tex_parameteri(double target, double pname, double param);',
  ],
  [
    "threeWebGLPixelStorei",
    "gea_three_webgl_pixel_storei",
    "void",
    'extern "C" void gea_three_webgl_pixel_storei(double pname, double param);',
  ],
  [
    "threeWebGLGenerateMipmap",
    "gea_three_webgl_generate_mipmap",
    "void",
    'extern "C" void gea_three_webgl_generate_mipmap(double target);',
  ],
  [
    "threeWebGLTexStorage2D",
    "gea_three_webgl_tex_storage_2d",
    "void",
    'extern "C" void gea_three_webgl_tex_storage_2d(double target, double levels, double internalFormat, double width, double height);',
  ],

  [
    "threeWebGLCreateVertexArray",
    "gea_three_webgl_create_vertex_array",
    "double",
    'extern "C" double gea_three_webgl_create_vertex_array();',
  ],
  [
    "threeWebGLBindVertexArray",
    "gea_three_webgl_bind_vertex_array",
    "void",
    'extern "C" void gea_three_webgl_bind_vertex_array(double vertexArray);',
  ],
  [
    "threeWebGLDeleteVertexArray",
    "gea_three_webgl_delete_vertex_array",
    "void",
    'extern "C" void gea_three_webgl_delete_vertex_array(double vertexArray);',
  ],

  [
    "threeWebGLCreateFramebuffer",
    "gea_three_webgl_create_framebuffer",
    "double",
    'extern "C" double gea_three_webgl_create_framebuffer();',
  ],
  [
    "threeWebGLBindFramebuffer",
    "gea_three_webgl_bind_framebuffer",
    "void",
    'extern "C" void gea_three_webgl_bind_framebuffer(double target, double framebuffer);',
  ],
  [
    "threeWebGLDeleteFramebuffer",
    "gea_three_webgl_delete_framebuffer",
    "void",
    'extern "C" void gea_three_webgl_delete_framebuffer(double framebuffer);',
  ],
  [
    "threeWebGLFramebufferTexture2D",
    "gea_three_webgl_framebuffer_texture_2d",
    "void",
    'extern "C" void gea_three_webgl_framebuffer_texture_2d(double target, double attachment, double textarget, double texture, double level);',
  ],
  [
    "threeWebGLCheckFramebufferStatus",
    "gea_three_webgl_check_framebuffer_status",
    "double",
    'extern "C" double gea_three_webgl_check_framebuffer_status(double target);',
  ],
  [
    "threeWebGLCreateRenderbuffer",
    "gea_three_webgl_create_renderbuffer",
    "double",
    'extern "C" double gea_three_webgl_create_renderbuffer();',
  ],
  [
    "threeWebGLBindRenderbuffer",
    "gea_three_webgl_bind_renderbuffer",
    "void",
    'extern "C" void gea_three_webgl_bind_renderbuffer(double target, double renderbuffer);',
  ],
  [
    "threeWebGLDeleteRenderbuffer",
    "gea_three_webgl_delete_renderbuffer",
    "void",
    'extern "C" void gea_three_webgl_delete_renderbuffer(double renderbuffer);',
  ],
  [
    "threeWebGLRenderbufferStorage",
    "gea_three_webgl_renderbuffer_storage",
    "void",
    'extern "C" void gea_three_webgl_renderbuffer_storage(double target, double internalFormat, double width, double height);',
  ],
  [
    "threeWebGLFramebufferRenderbuffer",
    "gea_three_webgl_framebuffer_renderbuffer",
    "void",
    'extern "C" void gea_three_webgl_framebuffer_renderbuffer(double target, double attachment, double renderbuffertarget, double renderbuffer);',
  ],
  [
    "threeWebGLDrawBuffers",
    "gea_three_webgl_draw_buffers",
    "void",
    'extern "C" void gea_three_webgl_draw_buffers(double attachment);',
  ],

  [
    "threeWebGLClearColor",
    "gea_three_webgl_clear_color",
    "void",
    'extern "C" void gea_three_webgl_clear_color(double r, double g, double b, double a);',
  ],
  [
    "threeWebGLClear",
    "gea_three_webgl_clear",
    "void",
    'extern "C" void gea_three_webgl_clear(double mask);',
  ],
  [
    "threeWebGLClearDepth",
    "gea_three_webgl_clear_depth",
    "void",
    'extern "C" void gea_three_webgl_clear_depth(double depth);',
  ],
  [
    "threeWebGLClearStencil",
    "gea_three_webgl_clear_stencil",
    "void",
    'extern "C" void gea_three_webgl_clear_stencil(double stencil);',
  ],
  [
    "threeWebGLColorMask",
    "gea_three_webgl_color_mask",
    "void",
    'extern "C" void gea_three_webgl_color_mask(double r, double g, double b, double a);',
  ],
  [
    "threeWebGLDepthMask",
    "gea_three_webgl_depth_mask",
    "void",
    'extern "C" void gea_three_webgl_depth_mask(double flag);',
  ],
  [
    "threeWebGLDepthFunc",
    "gea_three_webgl_depth_func",
    "void",
    'extern "C" void gea_three_webgl_depth_func(double func);',
  ],
  [
    "threeWebGLEnable",
    "gea_three_webgl_enable",
    "void",
    'extern "C" void gea_three_webgl_enable(double cap);',
  ],
  [
    "threeWebGLDisable",
    "gea_three_webgl_disable",
    "void",
    'extern "C" void gea_three_webgl_disable(double cap);',
  ],
  [
    "threeWebGLBlendFunc",
    "gea_three_webgl_blend_func",
    "void",
    'extern "C" void gea_three_webgl_blend_func(double sfactor, double dfactor);',
  ],
  [
    "threeWebGLBlendFuncSeparate",
    "gea_three_webgl_blend_func_separate",
    "void",
    'extern "C" void gea_three_webgl_blend_func_separate(double srcRGB, double dstRGB, double srcAlpha, double dstAlpha);',
  ],
  [
    "threeWebGLBlendEquation",
    "gea_three_webgl_blend_equation",
    "void",
    'extern "C" void gea_three_webgl_blend_equation(double mode);',
  ],
  [
    "threeWebGLBlendEquationSeparate",
    "gea_three_webgl_blend_equation_separate",
    "void",
    'extern "C" void gea_three_webgl_blend_equation_separate(double modeRGB, double modeAlpha);',
  ],
  [
    "threeWebGLCullFace",
    "gea_three_webgl_cull_face",
    "void",
    'extern "C" void gea_three_webgl_cull_face(double mode);',
  ],
  [
    "threeWebGLFrontFace",
    "gea_three_webgl_front_face",
    "void",
    'extern "C" void gea_three_webgl_front_face(double mode);',
  ],
  [
    "threeWebGLViewport",
    "gea_three_webgl_viewport",
    "void",
    'extern "C" void gea_three_webgl_viewport(double x, double y, double width, double height);',
  ],
  [
    "threeWebGLScissor",
    "gea_three_webgl_scissor",
    "void",
    'extern "C" void gea_three_webgl_scissor(double x, double y, double width, double height);',
  ],
  [
    "threeWebGLLineWidth",
    "gea_three_webgl_line_width",
    "void",
    'extern "C" void gea_three_webgl_line_width(double width);',
  ],
  [
    "threeWebGLPolygonOffset",
    "gea_three_webgl_polygon_offset",
    "void",
    'extern "C" void gea_three_webgl_polygon_offset(double factor, double units);',
  ],
  [
    "threeWebGLStencilMask",
    "gea_three_webgl_stencil_mask",
    "void",
    'extern "C" void gea_three_webgl_stencil_mask(double mask);',
  ],
  [
    "threeWebGLStencilMaskSeparate",
    "gea_three_webgl_stencil_mask_separate",
    "void",
    'extern "C" void gea_three_webgl_stencil_mask_separate(double face, double mask);',
  ],
  [
    "threeWebGLStencilFunc",
    "gea_three_webgl_stencil_func",
    "void",
    'extern "C" void gea_three_webgl_stencil_func(double func, double ref, double mask);',
  ],
  [
    "threeWebGLStencilFuncSeparate",
    "gea_three_webgl_stencil_func_separate",
    "void",
    'extern "C" void gea_three_webgl_stencil_func_separate(double face, double func, double ref, double mask);',
  ],
  [
    "threeWebGLStencilOp",
    "gea_three_webgl_stencil_op",
    "void",
    'extern "C" void gea_three_webgl_stencil_op(double fail, double zfail, double zpass);',
  ],
  [
    "threeWebGLStencilOpSeparate",
    "gea_three_webgl_stencil_op_separate",
    "void",
    'extern "C" void gea_three_webgl_stencil_op_separate(double face, double fail, double zfail, double zpass);',
  ],
  [
    "threeWebGLDrawElements",
    "gea_three_webgl_draw_elements",
    "void",
    'extern "C" void gea_three_webgl_draw_elements(double mode, double count, double type, double offset);',
  ],
  [
    "threeWebGLDrawArrays",
    "gea_three_webgl_draw_arrays",
    "void",
    'extern "C" void gea_three_webgl_draw_arrays(double mode, double first, double count);',
  ],
  [
    "threeWebGLGetError",
    "gea_three_webgl_get_error",
    "double",
    'extern "C" double gea_three_webgl_get_error();',
  ],

  // Audio host (native/audio_host.mm) — the minimal Web-Audio-like surface a
  // three.js app's sound design uses, driven through src/nativeAudioHost.ts.
  [
    "threeAudioSupported",
    "gea_three_audio_supported",
    "bool",
    'extern "C" bool gea_three_audio_supported();',
  ],
  [
    "threeAudioCurrentTime",
    "gea_three_audio_current_time",
    "double",
    'extern "C" double gea_three_audio_current_time();',
  ],
  [
    "threeAudioSampleRate",
    "gea_three_audio_sample_rate",
    "double",
    'extern "C" double gea_three_audio_sample_rate();',
  ],
  [
    "threeAudioResume",
    "gea_three_audio_resume",
    "void",
    'extern "C" void gea_three_audio_resume();',
  ],
  [
    "threeAudioCreateNode",
    "gea_three_audio_create_node",
    "double",
    'extern "C" double gea_three_audio_create_node(double kind);',
  ],
  [
    "threeAudioSetNodeType",
    "gea_three_audio_set_node_type",
    "void",
    'extern "C" void gea_three_audio_set_node_type(double node, std::string type);',
  ],
  [
    "threeAudioConnect",
    "gea_three_audio_connect",
    "void",
    'extern "C" void gea_three_audio_connect(double src, double dst);',
  ],
  [
    "threeAudioParamEvent",
    "gea_three_audio_param_event",
    "void",
    'extern "C" void gea_three_audio_param_event(double node, double param, double method, double value, double time);',
  ],
  [
    "threeAudioParamGet",
    "gea_three_audio_param_get",
    "double",
    'extern "C" double gea_three_audio_param_get(double node, double param);',
  ],
  [
    "threeAudioLoadBuffer",
    "gea_three_audio_load_buffer",
    "double",
    'extern "C" double gea_three_audio_load_buffer(std::string name);',
  ],
  [
    "threeAudioCreateBuffer",
    "gea_three_audio_create_buffer",
    "double",
    'extern "C" double gea_three_audio_create_buffer(double channels, double length, double sampleRate);',
  ],
  [
    "threeAudioBufferChannelData",
    "gea_three_audio_buffer_channel_data",
    "void",
    'extern "C" void gea_three_audio_buffer_channel_data(double buffer, double channel, const gea::TypedArray<float> &data);',
  ],
  [
    "threeAudioSourceSetBuffer",
    "gea_three_audio_source_set_buffer",
    "void",
    'extern "C" void gea_three_audio_source_set_buffer(double node, double buffer);',
  ],
  [
    "threeAudioSourceStart",
    "gea_three_audio_source_start",
    "void",
    'extern "C" void gea_three_audio_source_start(double node, double when, double loop);',
  ],
  [
    "threeAudioSourceStop",
    "gea_three_audio_source_stop",
    "void",
    'extern "C" void gea_three_audio_source_stop(double node, double when);',
  ],
];

const embeddedHostFunctions = Object.fromEntries(
  hostFunctions.map(([tsName, cppName]) => [tsName, cppName]),
);
const embeddedHostFunctionReturnTypes = Object.fromEntries(
  hostFunctions.map(([tsName, , returnType]) => [tsName, returnType]),
);
const embeddedHostNoThrowFunctions = hostFunctions.map(([tsName]) => tsName);
const hostDeclarationIncludes = ['#include "gea_runtime.h"', "#include <span>"];
const hostExternDeclarations = Object.fromEntries(
  hostFunctions.map(([, cppName, , declaration]) => [
    cppName,
    [
      ...hostDeclarationIncludes,
      // Only the AppKit attach entry takes an Apple object. GL/audio calls are
      // shared with the UWP host and must not pull Objective-C into its units.
      ...(cppName === "gea_three_webgl_attach"
        ? ['#include "gea/apple/native_bridge.h"']
        : []),
      declaration,
    ],
  ]),
);
const voidHostFunctions = new Set(
  hostFunctions
    .filter(([, , returnType]) => returnType === "void")
    .map(([, cppName]) => cppName),
);

const directWebGLReceivers = new Set(["gl", "_gl", "context"]);
const vectorStoragePattern = /^std::vector<(.+)>$/;

// Keep constant folding in exact lockstep with the native facade. These are
// parsed once while loading the build plugin, never at application runtime.
// A static receiver such as `gl.TEXTURE_2D` can then become its numeric literal
// without constructing the boxed context or running its record getter.
const nativeWebGLSource = fs.readFileSync(
  new URL("./src/nativeWebGL.ts", import.meta.url),
  "utf8",
);
const webglConstants = new Map(
  [
    ...nativeWebGLSource.matchAll(
      /^\s*readonly\s+([A-Z][A-Z0-9_]*)\s*=\s*(0x[0-9a-f]+|\d+)\s*$/gim,
    ),
  ].map((match) => [match[1], Number(match[2])]),
);
if (webglConstants.size === 0)
  throw new Error(
    "native WebGL plugin could not read constants from src/nativeWebGL.ts",
  );

function receiverName(context) {
  const receiver = context.receiver;
  if (
    receiver &&
    receiver.kind !== undefined &&
    typeof receiver.getText === "function"
  )
    return receiver.getText();
  return "";
}

function canOwnDirectWebGLCall(context) {
  return (
    directWebGLReceivers.has(receiverName(context)) &&
    ![...context.expression.arguments].some((arg) =>
      arg.getText?.().startsWith("..."),
    )
  );
}

function emitArg(context, index) {
  return context.emitExpression(context.expression.arguments[index]);
}

function storageOf(context, index) {
  return context
    .expressionStorageTypeName(context.expression.arguments[index])
    .replace(/^const\s+/, "")
    .replace(/\s*&$/, "")
    .trim();
}

function isNumberStorage(storage) {
  return (
    storage === "double" ||
    storage === "long long" ||
    storage === "int" ||
    storage === "float"
  );
}

function isVectorStorage(storage) {
  return vectorStoragePattern.test(storage);
}

function bufferTypeCode(storage) {
  if (storage.includes("uint16_t")) return "2";
  if (storage.includes("uint32_t")) return "3";
  if (storage.includes("uint8_t")) return "4";
  return "1";
}

function f32Vector(context, index) {
  const storage = storageOf(context, index);
  const value = emitArg(context, index);
  // Three's WebGL interface erases BufferSource arguments when `gl` itself is
  // boxed. Recover typed-array backing storage in one operation instead of
  // routing every matrix element through record_get in the facade.
  // Header-emitted class methods can report an explicitly typed array
  // parameter as `auto` or even `gea_cpp_value` to plugins while the final C++
  // expression is a std::vector. Dispatch on the eventual C++ type for both
  // cases; genuine boxed Three values and native ranges then share the same
  // zero-per-element conversion boundary.
  if (storage === "gea_cpp_value" || storage === "auto") {
    const dataName = `__gea_webgl_f32_data_${context.nextTempIndex()}`;
    const typeName = `__GeaWebGLF32Data_${context.nextTempIndex()}`;
    return `([&]<typename ${typeName}>(const ${typeName} &${dataName}) -> std::vector<double> { using __GeaData = std::decay_t<${typeName}>; if constexpr (std::is_same_v<__GeaData, gea_cpp_value>) { if (${dataName}.is_nullish()) return {}; return static_cast<std::vector<double>>(gea_cpp_typed_array<double>(${dataName})); } else if constexpr (requires { ${dataName}.begin(); ${dataName}.end(); }) { return gea::runtime::array::subtype_promote<std::vector<double>>(${dataName}); } else { return {}; } })(${value})`;
  }
  if (storage.startsWith("gea_cpp_typed_array<")) {
    return `gea::runtime::array::subtype_promote<std::vector<double>>(${value})`;
  }
  if (!isVectorStorage(storage)) return null;
  if (storage === "std::vector<double>") return value;
  return `gea::runtime::array::subtype_promote<std::vector<double>>(${value})`;
}

function boxedBufferTypeCode(value) {
  return `((${value}).kind == gea_cpp_value::kind_t::array_value && (${value}).rare_r().typed_array_name == "Uint16Array" ? 2.0 : ((${value}).kind == gea_cpp_value::kind_t::array_value && (${value}).rare_r().typed_array_name == "Uint32Array" ? 3.0 : ((${value}).kind == gea_cpp_value::kind_t::array_value && ((${value}).rare_r().typed_array_name == "Uint8Array" || (${value}).rare_r().typed_array_name == "Uint8ClampedArray") ? 4.0 : 1.0)))`;
}

function boxedBufferData(context) {
  const dataName = `__gea_webgl_data_${context.nextTempIndex()}`;
  const sizeName = `__gea_webgl_size_${context.nextTempIndex()}`;
  const valuesName = `__gea_webgl_values_${context.nextTempIndex()}`;
  context.registerHostExtern("gea_three_webgl_buffer_data", 4);
  return `([&]() { auto ${dataName} = ${emitArg(context, 1)}; if (${dataName}.kind == gea_cpp_value::kind_t::number) { auto ${sizeName} = gea::runtime::coerce::to_number(${dataName}); gea_three_webgl_buffer_data(${emitArg(context, 0)}, ${emitArg(context, 2)}, 4, std::vector<double>(static_cast<std::size_t>((${sizeName} < 0) ? 0 : ${sizeName}), double(0))); return; } if (${dataName}.is_nullish()) { gea_three_webgl_buffer_data(${emitArg(context, 0)}, ${emitArg(context, 2)}, 1, std::vector<double>{}); return; } auto ${valuesName} = static_cast<std::vector<double>>(gea_cpp_typed_array<double>(${dataName})); gea_three_webgl_buffer_data(${emitArg(context, 0)}, ${emitArg(context, 2)}, ${boxedBufferTypeCode(dataName)}, ${valuesName}); })()`;
}

function boxedBufferSubData(context) {
  const dataName = `__gea_webgl_data_${context.nextTempIndex()}`;
  const valuesName = `__gea_webgl_values_${context.nextTempIndex()}`;
  context.registerHostExtern("gea_three_webgl_buffer_sub_data", 4);
  return `([&]() { auto ${dataName} = ${emitArg(context, 2)}; if (${dataName}.is_nullish()) { gea_three_webgl_buffer_sub_data(${emitArg(context, 0)}, ${emitArg(context, 1)}, 1, std::vector<double>{}); return; } auto ${valuesName} = static_cast<std::vector<double>>(gea_cpp_typed_array<double>(${dataName})); gea_three_webgl_buffer_sub_data(${emitArg(context, 0)}, ${emitArg(context, 1)}, ${boxedBufferTypeCode(dataName)}, ${valuesName}); })()`;
}

function zeroF32Vector(context, index) {
  const sizeName = `__gea_webgl_size_${context.nextTempIndex()}`;
  return `([&]() { auto ${sizeName} = ${emitArg(context, index)}; return std::vector<double>(static_cast<std::size_t>((${sizeName} < 0) ? 0 : ${sizeName}), double(0)); })()`;
}

function genericBufferData(context) {
  const dataName = `__gea_webgl_data_${context.nextTempIndex()}`;
  const dataTypeName = `__GeaWebGLData_${context.nextTempIndex()}`;
  const elementTypeName = `__GeaWebGLElement_${context.nextTempIndex()}`;
  const sizeName = `__gea_webgl_size_${context.nextTempIndex()}`;
  return `([&]<typename ${dataTypeName}>(${dataTypeName} &&${dataName}) { using __GeaData = std::decay_t<${dataTypeName}>; if constexpr (std::is_arithmetic_v<__GeaData>) { auto ${sizeName} = static_cast<double>(${dataName}); gea_three_webgl_buffer_data(${emitArg(context, 0)}, ${emitArg(context, 2)}, 4, std::vector<double>(static_cast<std::size_t>((${sizeName} < 0) ? 0 : ${sizeName}), double(0))); } else if constexpr (requires { ${dataName}.begin(); ${dataName}.end(); }) { using ${elementTypeName} = std::decay_t<decltype(*${dataName}.begin())>; constexpr double __gea_webgl_type_code = std::is_same_v<${elementTypeName}, uint16_t> ? 2.0 : (std::is_same_v<${elementTypeName}, uint32_t> ? 3.0 : ((std::is_same_v<${elementTypeName}, uint8_t> || std::is_same_v<${elementTypeName}, unsigned char>) ? 4.0 : 1.0)); gea_three_webgl_buffer_data(${emitArg(context, 0)}, ${emitArg(context, 2)}, __gea_webgl_type_code, gea::runtime::array::subtype_promote<std::vector<double>>(${dataName})); } })(${emitArg(context, 1)})`;
}

function genericBufferSubData(context) {
  const dataName = `__gea_webgl_data_${context.nextTempIndex()}`;
  const dataTypeName = `__GeaWebGLData_${context.nextTempIndex()}`;
  const elementTypeName = `__GeaWebGLElement_${context.nextTempIndex()}`;
  const backingName = `__gea_webgl_backing_${context.nextTempIndex()}`;
  const byteOffsetName = `__gea_webgl_byte_offset_${context.nextTempIndex()}`;
  const byteLengthName = `__gea_webgl_byte_length_${context.nextTempIndex()}`;
  context.registerHostExtern("gea_three_webgl_buffer_sub_data_bytes", 4);
  return `([&]<typename ${dataTypeName}>(${dataTypeName} &&${dataName}) { if constexpr (requires { ${dataName}.buffer(); ${dataName}.byteOffset(); ${dataName}.byteLength(); }) { auto ${backingName} = ${dataName}.buffer(); auto ${byteOffsetName} = static_cast<std::size_t>(${dataName}.byteOffset()); auto ${byteLengthName} = static_cast<std::size_t>(${dataName}.byteLength()); const void *__gea_webgl_bytes = (${backingName} && ${byteLengthName} > 0 && ${byteOffsetName} <= ${backingName}->size() && ${byteLengthName} <= ${backingName}->size() - ${byteOffsetName}) ? static_cast<const void *>(${backingName}->data() + ${byteOffsetName}) : nullptr; gea_three_webgl_buffer_sub_data_bytes(${emitArg(context, 0)}, ${emitArg(context, 1)}, __gea_webgl_bytes, static_cast<double>(${byteLengthName})); } else if constexpr (requires { ${dataName}.begin(); ${dataName}.end(); }) { using ${elementTypeName} = std::decay_t<decltype(*${dataName}.begin())>; constexpr double __gea_webgl_type_code = std::is_same_v<${elementTypeName}, uint16_t> ? 2.0 : (std::is_same_v<${elementTypeName}, uint32_t> ? 3.0 : ((std::is_same_v<${elementTypeName}, uint8_t> || std::is_same_v<${elementTypeName}, unsigned char>) ? 4.0 : 1.0)); gea_three_webgl_buffer_sub_data(${emitArg(context, 0)}, ${emitArg(context, 1)}, __gea_webgl_type_code, gea::runtime::array::subtype_promote<std::vector<double>>(${dataName})); } })(${emitArg(context, 2)})`;
}

function nativeHandle(context, index) {
  // No gcv storage guard: the recovery lambda below has an explicit
  // gea_cpp_value branch (record_get __nativeHandle / numeric fallback).
  // Rejecting boxed storage here pushed every such call into full boxed
  // invoke_method dispatch — the de-boxed uniform setters' matrix uploads
  // (`gl.uniformMatrix4fv(this.addr, …)` with a boxed addr) were the single
  // hottest bridge-cascade source in the reference profile.
  const handleName = `__gea_webgl_handle_${context.nextTempIndex()}`;
  // The handle argument is frequently a class field read off a BOXED receiver
  // (`this.addr` on a gcv-boxed uniform → gea_cpp_record_get_property → a
  // gea_cpp_value at runtime), even when its declared storage isn't
  // gea_cpp_value. The typed `->`/`.` __nativeHandle branches don't match a
  // gea_cpp_value, so it fell through to 0.0 — every uniform then uploaded to
  // location 0, clobbering modelView/projection/etc. (spinning cube stayed
  // black). Recover __nativeHandle from the boxed value via the NativeHandle
  // runtime bridge (public field → record_get) so the real location flows.
  // A uniform location handle may arrive as: a NativeHandle (typed or boxed,
  // exposing __nativeHandle), OR a PLAIN NUMBER (the raw GL location — e.g. when
  // getUniformLocation lowers to the numeric intrinsic instead of the shim). A
  // bare number has no __nativeHandle, so the boxed branch must fall back to the
  // number itself, and an arithmetic handle must be used directly — otherwise the
  // location collapses to 0 for every uniform (all clobber location 0 → black).
  return `([&]<typename __GeaHandle>(const __GeaHandle &${handleName}) -> double { if constexpr (std::is_same_v<std::decay_t<__GeaHandle>, std::nullptr_t>) { return 0.0; } else if constexpr (std::is_same_v<std::decay_t<__GeaHandle>, gea_cpp_value>) { if (${handleName}.kind == gea_cpp_value::kind_t::number) return gea::runtime::coerce::to_number(${handleName}); auto __gea_nh = ${handleName}.record_get_literal("__nativeHandle"); if (!__gea_nh.is_nullish()) return gea::runtime::coerce::to_number(__gea_nh); return 0.0; } else if constexpr (std::is_arithmetic_v<std::decay_t<__GeaHandle>>) { return static_cast<double>(${handleName}); } else if constexpr (requires { ${handleName}->__nativeHandle; }) { return ${handleName} ? ${handleName}->__nativeHandle : 0.0; } else if constexpr (requires { ${handleName}.__nativeHandle; }) { return ${handleName}.__nativeHandle; } else { return 0.0; } })(${emitArg(context, index)})`;
}

function boolAsDouble(context, index) {
  const storage = storageOf(context, index);
  if (storage === "gea_cpp_value")
    return `(gea::runtime::coerce::to_boolean(${emitArg(context, index)}) ? 1.0 : 0.0)`;
  return `((${emitArg(context, index)}) ? 1.0 : 0.0)`;
}

// Numeric argument for a direct GL intrinsic: typed numerics pass through,
// booleans normalize to 0/1, boxed values coerce with JS ToNumber semantics.
function numberArg(context, index) {
  const storage = storageOf(context, index);
  const value = emitArg(context, index);
  if (storage === "bool") return `((${value}) ? 1.0 : 0.0)`;
  if (storage === "gea_cpp_value" || storage === "auto")
    return `gea::runtime::coerce::to_number(${value})`;
  return value;
}

function stringArg(context, index) {
  const storage = storageOf(context, index);
  const value = emitArg(context, index);
  if (storage === "std::string") return value;
  return `gea_cpp_to_string(${value})`;
}

// Direct numeric-arg GL call: every argument through numberArg.
function directNumericCall(hostName, arity) {
  return (context) => {
    if (!canOwnDirectWebGLCall(context)) return null;
    const args = [];
    for (let i = 0; i < arity; i++) args.push(numberArg(context, i));
    return hostCall(context, hostName, arity, args);
  };
}

function hostCall(context, name, arity, args) {
  context.registerHostExtern(name, arity);
  const call = `${name}(${args.join(", ")})`;
  // A WebGL method can be returned from a JS helper (`return
  // gl.bindVertexArray(...)`). Give void host calls an expression value so the
  // emitter's dynamic-return adapter never has to form gea_cpp_key(void).
  // Optimized statement-position calls inline this lambda away.
  return voidHostFunctions.has(name)
    ? `([&]() -> gea_cpp_value { ${call}; return gea_cpp_value::missing(); })()`
    : call;
}

// Hot per-frame GL methods callable on a BOXED `gl` receiver. The typed shim
// path already lowers these natively; without entries here, a boxed receiver
// fell to gea_cpp_invoke_method → the context bridge's string-compare getter
// cascade per call (drawElements/bindBuffer/bindTexture dominated the reference
// gameplay profile). Instanced draws use the same typed numeric host ABI.
const directGlCalls = [
  ["vertexAttribDivisor", "gea_three_webgl_vertex_attrib_divisor", 2],
  ["drawElementsInstanced", "gea_three_webgl_draw_elements_instanced", 5],
  ["drawArraysInstanced", "gea_three_webgl_draw_arrays_instanced", 4],
  ["drawElements", "gea_three_webgl_draw_elements", 4],
  ["drawArrays", "gea_three_webgl_draw_arrays", 3],
  ["activeTexture", "gea_three_webgl_active_texture", 1],
  ["enableVertexAttribArray", "gea_three_webgl_enable_vertex_attrib_array", 1],
  [
    "disableVertexAttribArray",
    "gea_three_webgl_disable_vertex_attrib_array",
    1,
  ],
  ["vertexAttribPointer", "gea_three_webgl_vertex_attrib_pointer", 6],
  ["pixelStorei", "gea_three_webgl_pixel_storei", 2],
  ["texParameteri", "gea_three_webgl_tex_parameteri", 3],
  ["depthFunc", "gea_three_webgl_depth_func", 1],
  ["depthMask", "gea_three_webgl_depth_mask", 1],
  ["enable", "gea_three_webgl_enable", 1],
  ["disable", "gea_three_webgl_disable", 1],
  ["blendFunc", "gea_three_webgl_blend_func", 2],
  ["blendFuncSeparate", "gea_three_webgl_blend_func_separate", 4],
  ["blendEquation", "gea_three_webgl_blend_equation", 1],
  ["blendEquationSeparate", "gea_three_webgl_blend_equation_separate", 2],
  ["cullFace", "gea_three_webgl_cull_face", 1],
  ["frontFace", "gea_three_webgl_front_face", 1],
  ["clearColor", "gea_three_webgl_clear_color", 4],
  ["clear", "gea_three_webgl_clear", 1],
  ["clearDepth", "gea_three_webgl_clear_depth", 1],
  ["clearStencil", "gea_three_webgl_clear_stencil", 1],
  ["colorMask", "gea_three_webgl_color_mask", 4],
  ["viewport", "gea_three_webgl_viewport", 4],
  ["scissor", "gea_three_webgl_scissor", 4],
  ["lineWidth", "gea_three_webgl_line_width", 1],
  ["polygonOffset", "gea_three_webgl_polygon_offset", 2],
  ["stencilMask", "gea_three_webgl_stencil_mask", 1],
  ["stencilMaskSeparate", "gea_three_webgl_stencil_mask_separate", 2],
  ["stencilFunc", "gea_three_webgl_stencil_func", 3],
  ["stencilFuncSeparate", "gea_three_webgl_stencil_func_separate", 4],
  ["stencilOp", "gea_three_webgl_stencil_op", 3],
  ["stencilOpSeparate", "gea_three_webgl_stencil_op_separate", 4],
  ["generateMipmap", "gea_three_webgl_generate_mipmap", 1],
  ["renderbufferStorage", "gea_three_webgl_renderbuffer_storage", 4],
  ["checkFramebufferStatus", "gea_three_webgl_check_framebuffer_status", 1],
].map(([name, hostName, arity]) => ({
  name,
  minArgs: arity,
  emit: directNumericCall(hostName, arity),
}));

// Handle-taking GL binds: the object argument goes through nativeHandle
// (typed / boxed / null / raw-number handles all recover the GL id).
const directGlHandleCalls = [
  ["bindBuffer", "gea_three_webgl_bind_buffer", 2, [1]],
  ["deleteBuffer", "gea_three_webgl_delete_buffer", 1, [0]],
  ["bindTexture", "gea_three_webgl_bind_texture", 2, [1]],
  ["deleteTexture", "gea_three_webgl_delete_texture", 1, [0]],
  ["useProgram", "gea_three_webgl_use_program", 1, [0]],
  ["bindVertexArray", "gea_three_webgl_bind_vertex_array", 1, [0]],
  ["deleteVertexArray", "gea_three_webgl_delete_vertex_array", 1, [0]],
  ["bindFramebuffer", "gea_three_webgl_bind_framebuffer", 2, [1]],
  ["deleteFramebuffer", "gea_three_webgl_delete_framebuffer", 1, [0]],
  ["framebufferTexture2D", "gea_three_webgl_framebuffer_texture_2d", 5, [3]],
  ["bindRenderbuffer", "gea_three_webgl_bind_renderbuffer", 2, [1]],
  ["deleteRenderbuffer", "gea_three_webgl_delete_renderbuffer", 1, [0]],
  [
    "framebufferRenderbuffer",
    "gea_three_webgl_framebuffer_renderbuffer",
    4,
    [3],
  ],
  ["uniform1f", "gea_three_webgl_uniform_1f", 2, [0]],
  ["uniform1i", "gea_three_webgl_uniform_1i", 2, [0]],
  ["uniform1ui", "gea_three_webgl_uniform_1ui", 2, [0]],
  ["uniform2f", "gea_three_webgl_uniform_2f", 3, [0]],
  ["uniform2i", "gea_three_webgl_uniform_2i", 3, [0]],
  ["uniform2ui", "gea_three_webgl_uniform_2ui", 3, [0]],
  ["uniform3f", "gea_three_webgl_uniform_3f", 4, [0]],
  ["uniform3i", "gea_three_webgl_uniform_3i", 4, [0]],
  ["uniform3ui", "gea_three_webgl_uniform_3ui", 4, [0]],
  ["uniform4f", "gea_three_webgl_uniform_4f", 5, [0]],
  ["uniform4i", "gea_three_webgl_uniform_4i", 5, [0]],
  ["uniform4ui", "gea_three_webgl_uniform_4ui", 5, [0]],
].map(([name, hostName, arity, handleIndices]) => ({
  name,
  minArgs: arity,
  ...(name === "bindVertexArray"
    ? {
        nativeCall: nativeVoidMemberCallContract(
          "@geastack/native-webgl-angle.webgl.bindVertexArray.void.v1",
          hostName,
          arity,
          new Map(handleIndices.map((index) => [index, "__nativeHandle"])),
        ),
      }
    : {}),
  emit: (context) => {
    if (!canOwnDirectWebGLCall(context)) return null;
    const args = [];
    for (let i = 0; i < arity; i++) {
      args.push(
        handleIndices.includes(i)
          ? nativeHandle(context, i)
          : numberArg(context, i),
      );
    }
    return hostCall(context, hostName, arity, args);
  },
}));

const directGlCreateCalls = [
  ["createBuffer", "gea_three_webgl_create_buffer"],
  ["createTexture", "gea_three_webgl_create_texture"],
  ["createVertexArray", "gea_three_webgl_create_vertex_array"],
  ["createFramebuffer", "gea_three_webgl_create_framebuffer"],
  ["createRenderbuffer", "gea_three_webgl_create_renderbuffer"],
  ["getError", "gea_three_webgl_get_error"],
].map(([name, hostName]) => ({
  name,
  emit: (context) =>
    canOwnDirectWebGLCall(context) ? hostCall(context, hostName, 0, []) : null,
}));

function directUniformVectorCall(name, hostName) {
  return {
    name,
    minArgs: 2,
    emit: (context) => {
      if (!canOwnDirectWebGLCall(context)) return null;
      const storage = storageOf(context, 1);
      if (
        storage !== "gea_cpp_value" &&
        storage !== "auto" &&
        !storage.startsWith("gea_cpp_typed_array<") &&
        !isVectorStorage(storage)
      )
        return null;
      const values = f32Vector(context, 1);
      if (!values) return null;
      return hostCall(context, hostName, 2, [nativeHandle(context, 0), values]);
    },
  };
}

const directGlUniformVectorCalls = [
  directUniformVectorCall("uniform1fv", "gea_three_webgl_uniform_1fv"),
  directUniformVectorCall("uniform2fv", "gea_three_webgl_uniform_2fv"),
  directUniformVectorCall("uniform3fv", "gea_three_webgl_uniform_3fv"),
  directUniformVectorCall("uniform4fv", "gea_three_webgl_uniform_4fv"),
  directUniformVectorCall("uniform1iv", "gea_three_webgl_uniform_1iv"),
  directUniformVectorCall("uniform2iv", "gea_three_webgl_uniform_2iv"),
  directUniformVectorCall("uniform3iv", "gea_three_webgl_uniform_3iv"),
  directUniformVectorCall("uniform4iv", "gea_three_webgl_uniform_4iv"),
  directUniformVectorCall("uniform1uiv", "gea_three_webgl_uniform_1uiv"),
  directUniformVectorCall("uniform2uiv", "gea_three_webgl_uniform_2uiv"),
  directUniformVectorCall("uniform3uiv", "gea_three_webgl_uniform_3uiv"),
  directUniformVectorCall("uniform4uiv", "gea_three_webgl_uniform_4uiv"),
];

const runtimeMemberCalls = [
  ...directGlCalls,
  ...directGlHandleCalls,
  ...directGlCreateCalls,
  ...directGlUniformVectorCalls,
  {
    name: "getUniformLocation",
    minArgs: 2,
    emit: (context) =>
      canOwnDirectWebGLCall(context)
        ? hostCall(context, "gea_three_webgl_get_uniform_location", 2, [
            nativeHandle(context, 0),
            stringArg(context, 1),
          ])
        : null,
  },
  {
    name: "getAttribLocation",
    minArgs: 2,
    emit: (context) =>
      canOwnDirectWebGLCall(context)
        ? hostCall(context, "gea_three_webgl_get_attrib_location", 2, [
            nativeHandle(context, 0),
            stringArg(context, 1),
          ])
        : null,
  },
  {
    name: "bufferData",
    minArgs: 3,
    emit: (context) => {
      if (!canOwnDirectWebGLCall(context)) return null;
      const dataStorage = storageOf(context, 1);
      if (dataStorage === "gea_cpp_value") return boxedBufferData(context);
      if (dataStorage.includes("auto")) {
        context.registerHostExtern("gea_three_webgl_buffer_data", 4);
        return genericBufferData(context);
      }
      if (isNumberStorage(dataStorage)) {
        return hostCall(context, "gea_three_webgl_buffer_data", 4, [
          emitArg(context, 0),
          emitArg(context, 2),
          "4",
          zeroF32Vector(context, 1),
        ]);
      }
      const values = f32Vector(context, 1);
      if (!values) return null;
      return hostCall(context, "gea_three_webgl_buffer_data", 4, [
        emitArg(context, 0),
        emitArg(context, 2),
        bufferTypeCode(dataStorage),
        values,
      ]);
    },
  },
  {
    name: "bufferSubData",
    minArgs: 3,
    emit: (context) => {
      if (!canOwnDirectWebGLCall(context)) return null;
      const dataStorage = storageOf(context, 2);
      if (dataStorage === "gea_cpp_value") return boxedBufferSubData(context);
      // Preserve a native TypedArray's byte buffer all the way into ANGLE.
      // Header-emitted expressions are frequently reported as an auto-like
      // storage here, so let genericBufferSubData select its byte-view branch
      // from the final C++ type instead of forcing an f32-vector promotion.
      if (
        dataStorage.startsWith("gea_cpp_typed_array<") ||
        dataStorage.includes("auto")
      ) {
        return genericBufferSubData(context);
      }
      const values = f32Vector(context, 2);
      if (!values) return null;
      return hostCall(context, "gea_three_webgl_buffer_sub_data", 4, [
        emitArg(context, 0),
        emitArg(context, 1),
        bufferTypeCode(dataStorage),
        values,
      ]);
    },
  },
  {
    name: "uniformMatrix2fv",
    minArgs: 3,
    emit: (context) => {
      if (!canOwnDirectWebGLCall(context)) return null;
      const location = nativeHandle(context, 0);
      const transpose = boolAsDouble(context, 1);
      const values = f32Vector(context, 2);
      if (!location || !transpose || !values) return null;
      return hostCall(context, "gea_three_webgl_uniform_matrix_2fv", 4, [
        location,
        "1",
        transpose,
        values,
      ]);
    },
  },
  {
    name: "uniformMatrix3fv",
    minArgs: 3,
    emit: (context) => {
      if (!canOwnDirectWebGLCall(context)) return null;
      const location = nativeHandle(context, 0);
      const transpose = boolAsDouble(context, 1);
      const values = f32Vector(context, 2);
      if (!location || !transpose || !values) return null;
      return hostCall(context, "gea_three_webgl_uniform_matrix_3fv", 4, [
        location,
        "1",
        transpose,
        values,
      ]);
    },
  },
  {
    name: "uniformMatrix4fv",
    minArgs: 3,
    emit: (context) => {
      if (!canOwnDirectWebGLCall(context)) return null;
      const location = nativeHandle(context, 0);
      const transpose = boolAsDouble(context, 1);
      const values = f32Vector(context, 2);
      if (!location || !transpose || !values) return null;
      return hostCall(context, "gea_three_webgl_uniform_matrix_4fv", 4, [
        location,
        "1",
        transpose,
        values,
      ]);
    },
  },
  {
    name: "texImage2D",
    minArgs: 9,
    emit: (context) => {
      if (!canOwnDirectWebGLCall(context)) return null;
      const values = f32Vector(context, 8);
      if (!values) return null;
      return hostCall(context, "gea_three_webgl_tex_image_2d", 8, [
        emitArg(context, 0),
        emitArg(context, 1),
        emitArg(context, 2),
        emitArg(context, 3),
        emitArg(context, 4),
        emitArg(context, 6),
        emitArg(context, 7),
        values,
      ]);
    },
  },
  {
    name: "texSubImage2D",
    minArgs: 9,
    emit: (context) => {
      if (!canOwnDirectWebGLCall(context)) return null;
      const values = f32Vector(context, 8);
      if (!values) return null;
      return hostCall(context, "gea_three_webgl_tex_sub_image_2d", 9, [
        emitArg(context, 0),
        emitArg(context, 1),
        emitArg(context, 2),
        emitArg(context, 3),
        emitArg(context, 4),
        emitArg(context, 5),
        emitArg(context, 6),
        emitArg(context, 7),
        values,
      ]);
    },
  },
];

const runtimeMemberReads = [...webglConstants].map(([name, value]) => ({
  name,
  emit: (context) =>
    directWebGLReceivers.has(receiverName(context)) ? String(value) : null,
}));

// three's own `WebGLRenderer` states the context it holds as an AMBIENT
// BROWSER type -- `WebGLRenderingContext` in `@types/three`'s (stale, WebGL1)
// declaration for the internal renderer submodules' `_gl` parameters, and the
// correct `WebGL2RenderingContext` in three's own JSDoc `@typedef
// WebGLRenderer~Options`. Neither is what this build's `_gl` ever actually
// is: every one flows from `createNativeWebGLCanvas(...).getContext('webgl2')`,
// an instance of `NativeWebGL2RenderingContext` below. `WebGLRenderingContext`
// (WebGL 1) doesn't even declare `renderbufferStorageMultisample`,
// `blitFramebuffer`, `invalidateFramebuffer`, or the `DRAW_FRAMEBUFFER`/
// `READ_FRAMEBUFFER` constants three's renderer reads off it -- real WebGL2
// members this class implements (see `nativeWebGL.ts`) -- so a read of any of
// them typed `any` and boxed. Both ambient names route to the one concrete
// replacement; the compiler's `ambientTypeRealizations` mechanism
// (`plugins/model.ts`) is what respells a stated ambient name to this one
// wherever the program's own JSDoc (or a declaration overlay already applied
// to it) states it.
const ambientTypeRealizations = {
  WebGLRenderingContext: {
    type: "NativeWebGL2RenderingContext",
    importedFrom: "@geastack/native-webgl-angle/nativeWebGL",
  },
  WebGL2RenderingContext: {
    type: "NativeWebGL2RenderingContext",
    importedFrom: "@geastack/native-webgl-angle/nativeWebGL",
  },
  // Resource interfaces describe the native objects returned by this host,
  // not empty browser-interface records. Shader/program subclasses retain
  // their additional state; the remaining opaque resources use NativeHandle.
  WebGLBuffer: {
    type: "NativeHandle",
    importedFrom: "@geastack/native-webgl-angle/nativeWebGL",
  },
  WebGLFramebuffer: {
    type: "NativeHandle",
    importedFrom: "@geastack/native-webgl-angle/nativeWebGL",
  },
  WebGLRenderbuffer: {
    type: "NativeHandle",
    importedFrom: "@geastack/native-webgl-angle/nativeWebGL",
  },
  WebGLSync: {
    type: "NativeHandle",
    importedFrom: "@geastack/native-webgl-angle/nativeWebGL",
  },
  WebGLTexture: {
    type: "NativeHandle",
    importedFrom: "@geastack/native-webgl-angle/nativeWebGL",
  },
  WebGLUniformLocation: {
    type: "NativeHandle",
    importedFrom: "@geastack/native-webgl-angle/nativeWebGL",
  },
  WebGLVertexArrayObject: {
    type: "NativeHandle",
    importedFrom: "@geastack/native-webgl-angle/nativeWebGL",
  },
  WebGLShader: {
    type: "NativeShader",
    importedFrom: "@geastack/native-webgl-angle/nativeWebGL",
  },
  WebGLProgram: {
    type: "NativeProgram",
    importedFrom: "@geastack/native-webgl-angle/nativeWebGL",
  },
  // The canvas, for exactly the reason the context above is realized. three
  // documents `WebGLRenderer`'s own canvas as `{HTMLCanvasElement|OffscreenCanvas}`
  // (`WebGLRenderer.js`'s `domElement` and its `WebGLRenderer~Options` typedef),
  // because that is what a browser hands it. This host hands it a
  // `NativeWebGLCanvas`, and nothing else ever reaches those positions:
  // `app.tsx` builds one with `createNativeWebGLCanvas(width, height)` and
  // passes it in.
  //
  // Both names are also `absentGlobals` -- the CONSTRUCTORS really are not
  // there, and three's `typeof`/`instanceof` guards on them must keep folding
  // false. Realization respells JSDoc TYPE mentions only, so the two facts do
  // not collide: the type becomes the class the program holds, the value stays
  // absent. Without this the union of two denied ambient types collapsed to
  // nothing and every `canvas.width`/`.style`/`.addEventListener` read in the
  // renderer became a read off `undefined` -- 20 unmet obligations on the reference app.
  HTMLCanvasElement: {
    type: "NativeWebGLCanvas",
    importedFrom: "@geastack/native-webgl-angle/nativeWebGL",
  },
  OffscreenCanvas: {
    type: "NativeWebGLCanvas",
    importedFrom: "@geastack/native-webgl-angle/nativeWebGL",
  },
};

const object3DClearSource =
  "\tclear() {\n\n\t\treturn this.remove( ... this.children );\n\n\t}";
const nativeObject3DClearSource =
  "\tclear() {\n\n\t\tconst children = this.children.slice();\n\n\t\tfor ( let i = 0, l = children.length; i < l; i ++ ) {\n\n\t\t\tthis.remove( children[ i ] );\n\n\t\t}\n\n\t\treturn this;\n\n\t}";
const object3DRaycastSource = "\traycast( /* raycaster, intersects */ ) {}";
const nativeObject3DRaycastSource =
  "\t/**\n" +
  '\t * @param {import("./Raycaster.js").Raycaster} raycaster\n' +
  "\t * @param {Array<Object>} intersects\n" +
  "\t */\n" +
  "\traycast( raycaster, intersects ) {}";
const rendererGetContextSource =
  "\t\tfunction getContext( contextName, contextAttributes ) {";
const nativeRendererGetContextSource =
  '\t\t/** @param {import("@geastack/native-webgl-angle/nativeWebGL").NativeWebGLContextAttributes} [contextAttributes] */\n' +
  rendererGetContextSource;
const meshMaterialParameterSource =
  "@param {Material|Array<Material>} [material] - The mesh material.";
const nativeMeshMaterialParameterSource =
  '@param {import("../materials/Material.js").Material|Array<import("../materials/Material.js").Material>|null} [material] - The mesh material.';
const rendererMaterialsDeclarationSource = "\t\t\tconst materials = new Set();";
const nativeRendererMaterialsDeclarationSource =
  '\t\t\t/** @type {Set<import("../materials/Material.js").Material>} */\n' +
  rendererMaterialsDeclarationSource;
const rendererMaterialArrayBranchSource =
  "\t\t\t\t\tif ( Array.isArray( material ) ) {\n\n\t\t\t\t\t\tfor ( let i = 0; i < material.length; i ++ ) {";
const nativeRendererMaterialArrayBranchSource =
  "\t\t\t\t\tif ( Array.isArray( material ) ) {\n\n" +
  '\t\t\t\t\t\t/** @type {Array<import("../materials/Material.js").Material>} */\n' +
  "\t\t\t\t\t\tconst materialArray = material;\n\n" +
  "\t\t\t\t\t\tfor ( let i = 0; i < materialArray.length; i ++ ) {";
const rendererMaterialIndexSource =
  "\t\t\t\t\t\t\tconst material2 = material[ i ];";
const nativeRendererMaterialIndexSource =
  "\t\t\t\t\t\t\tconst material2 = materialArray[ i ];";
const rendererSingleMaterialSource =
  "\t\t\t\t\t} else {\n\n" +
  "\t\t\t\t\t\tprepareMaterial( material, targetScene, object );\n" +
  "\t\t\t\t\t\tmaterials.add( material );";
const nativeRendererSingleMaterialSource =
  "\t\t\t\t\t} else {\n\n" +
  '\t\t\t\t\t\t/** @type {import("../materials/Material.js").Material} */\n' +
  "\t\t\t\t\t\tconst material1 = material;\n\n" +
  "\t\t\t\t\t\tprepareMaterial( material1, targetScene, object );\n" +
  "\t\t\t\t\t\tmaterials.add( material1 );";
const rendererCompileReturnSource =
  "@return {Set<Material>} The precompiled materials.";
const nativeRendererCompileReturnSource =
  '@return {Set<import("../materials/Material.js").Material>} The precompiled materials.';
const rendererCompileAssignmentSource =
  "\t\tthis.compile = function ( scene, camera, targetScene = null ) {";
const nativeRendererCompileAssignmentSource =
  "\t\tfunction compile( scene, camera, targetScene = null ) {";
const rendererCompileAssignmentEndSource = "\t\t\treturn materials;\n\n\t\t};";
const nativeRendererCompileAssignmentEndSource =
  "\t\t\treturn materials;\n\n\t\t}\n\n\t\tthis.compile = compile;";
const rendererReleaseProgramsSource =
  "\t\t\tconst programs = properties.get( material ).programs;\n\n" +
  "\t\t\tif ( programs !== undefined ) {\n\n" +
  "\t\t\t\tprograms.forEach( function ( program ) {\n\n" +
  "\t\t\t\t\tprogramCache.releaseProgram( program );\n\n" +
  "\t\t\t\t} );";
const nativeRendererReleaseProgramsSource =
  "\t\t\t/** @type {Record<string, InstanceType<typeof import('./webgl/WebGLProgram.js').WebGLProgram>|undefined> | undefined} */\n" +
  "\t\t\tconst programs = properties.get( material ).programs;\n\n" +
  "\t\t\tif ( programs !== undefined ) {\n\n" +
  "\t\t\t\tconst programKeys = Object.keys( programs );\n\n" +
  "\t\t\t\tfor ( let i = 0; i < programKeys.length; i ++ ) {\n\n" +
  "\t\t\t\t\tconst program = programs[ programKeys[ i ] ];\n\n" +
  "\t\t\t\t\tif ( program !== undefined ) programCache.releaseProgram( program );\n\n" +
  "\t\t\t\t}";
const rendererCompileAsyncStartSource =
  "\t\tthis.compileAsync = function ( scene, camera, targetScene = null ) {";
const rendererCompileAsyncEndSource = "\n\t\t};\n\n\t\t// Animation Loop";
const nativeRendererCompileAsyncSource =
  "\t\tthis.compileAsync = function ( scene, camera, targetScene = null ) {\n\n" +
  "\t\t\tthis.compile( scene, camera, targetScene );\n\n" +
  "\t\t\treturn Promise.resolve( scene );\n\n" +
  "\t\t};";
const dataTextureUnpackAlignmentSource =
  "\t\t * @type {boolean}\n\t\t * @default 1";
const nativeDataTextureUnpackAlignmentSource =
  "\t\t * @type {number}\n\t\t * @default 1";
const dataTextureOverlayUnpackAlignmentSource =
  "\t/** @type {boolean} */\n\tunpackAlignment;";
const nativeDataTextureOverlayUnpackAlignmentSource =
  "\t/** @type {number} */\n\tunpackAlignment;";
const overlayToJSONParameterSource =
  /(\/\*\*\n\t \* @param )\{[^\n]+\}( \[meta\]\n\t \*\/\n\ttoJSON\( meta \) \{)/g;
const rendererReceiverMethods = [
  "setPixelRatio",
  "setSize",
  "setDrawingBufferSize",
  "clear",
  "clearColor",
  "clearDepth",
  "clearStencil",
  "setNodesHandler",
  "compileAsync",
  "render",
];
const nativeTypedArrayType =
  "Int8Array|Uint8Array|Uint8ClampedArray|Int16Array|Uint16Array|Int32Array|Uint32Array|Float32Array|Float64Array";
/**
 * The two spellings the native `texImage2D`/`texSubImage2D` frames are written
 * in, hoisted to module scope because more than one transformed file has to
 * name them. A structurally identical record spelled twice is still ONE type to
 * the compiler, but a DIVERGED spelling is not: when `WebGLTextures.js` hands a
 * record to a `WebGLState.js` frame, the two must describe the same shape down
 * to the member order, or the argument is refused as an unrelated record.
 */
const nativeBufferSourceType =
  "Float32Array|Float64Array|Int8Array|Uint8Array|Uint8ClampedArray|Int16Array|Uint16Array|Int32Array|Uint32Array|number[]|null|undefined";
const nativeImageSourceType = `{ width: number, height: number, data: Exclude<${nativeBufferSourceType}, null|undefined> }`;
export const nativeTypedArrayFactory = (name, inputType) => `/**
 * @param {${nativeTypedArrayType}} template
 * @param {${inputType}} input
 * @return {${nativeTypedArrayType}}
 */
function ${name}( template, input ) {

\tif ( template instanceof Int8Array ) return new Int8Array( input );
\tif ( template instanceof Uint8Array ) return new Uint8Array( input );
\tif ( template instanceof Uint8ClampedArray ) return new Uint8ClampedArray( input );
\tif ( template instanceof Int16Array ) return new Int16Array( input );
\tif ( template instanceof Uint16Array ) return new Uint16Array( input );
\tif ( template instanceof Int32Array ) return new Int32Array( input );
\tif ( template instanceof Uint32Array ) return new Uint32Array( input );
\tif ( template instanceof Float32Array ) return new Float32Array( input );
\tif ( template instanceof Float64Array ) return new Float64Array( input );

\tthrow new Error( 'Unsupported typed array.' );

}`;

const replaceOne = (text, before, after, fileName, description) => {
  if (!text.includes(before))
    throw new Error(
      `Three ${description} source at ${fileName} no longer matches the native adaptation`,
    );
  return text.replace(before, after);
};

/**
 * The tags of a JSDoc comment body: where each `@tag` starts, where its head
 * (tag name, `{type}` and, for `@param`, the parameter name) ends, where the
 * whole tag including its description ends, and the key two blocks agree on --
 * `param:<name>` for a parameter, the tag name otherwise (`@returns` is
 * `@return`). A `@` inside a `{type}` (`import('@geastack/...')`) is not a tag.
 */
const jsDocTagsOf = (text, from, to) => {
  const tags = [];
  const balanced = (at, open, close) => {
    let depth = 0;
    for (let index = at; index < to; index++) {
      if (text[index] === open) depth++;
      else if (text[index] === close && --depth === 0) return index + 1;
    }
    return to;
  };
  let depth = 0;
  for (let index = from; index < to; index++) {
    const char = text[index];
    if (char === "{") depth++;
    else if (char === "}") depth = Math.max(0, depth - 1);
    if (
      char !== "@" ||
      depth !== 0 ||
      (index > from && !/[\s*]/.test(text[index - 1]))
    )
      continue;
    const name = /^@([A-Za-z]+)/.exec(text.slice(index, to));
    if (!name) continue;
    let cursor = index + name[0].length;
    const typeStart = cursor + /^\s*/.exec(text.slice(cursor, to))[0].length;
    if (text[typeStart] === "{") cursor = balanced(typeStart, "{", "}");
    let key = name[1] === "returns" ? "return" : name[1];
    if (name[1] === "param") {
      const nameStart = cursor + /^\s*/.exec(text.slice(cursor, to))[0].length;
      const nameEnd =
        text[nameStart] === "["
          ? balanced(nameStart, "[", "]")
          : nameStart + /^[^\s]*/.exec(text.slice(nameStart, to))[0].length;
      const parameter = text
        .slice(nameStart, nameEnd)
        .replace(/^\[/, "")
        .replace(/\]$/, "")
        .split("=")[0]
        .replace(/^\.\.\./, "")
        .trim();
      if (parameter) {
        key = `param:${parameter}`;
        cursor = nameEnd;
      }
    }
    tags.push({ key, start: index, headEnd: cursor });
    index = cursor - 1;
  }
  return tags.map((tag, index) => ({
    ...tag,
    end: index + 1 < tags.length ? tags[index + 1].start : to,
  }));
};

/**
 * `lower`'s tags folded into `upper`, the JSDoc block directly above it. A tag
 * both state keeps `upper`'s place and description under `lower`'s head; a tag
 * only `lower` states is added -- after `upper`'s last tag of the same kind on a
 * line of its own, or inline in a one-line block.
 */
const foldJSDocBlock = (upper, lower) => {
  const upperTags = jsDocTagsOf(upper, 3, upper.length - 2);
  const edits = [];
  const appended = [];
  for (const tag of jsDocTagsOf(lower, 3, lower.length - 2)) {
    const head = lower.slice(tag.start, tag.headEnd).trim();
    const matching = upperTags.filter((candidate) => candidate.key === tag.key);
    for (const existing of matching)
      edits.push({ at: existing.start, end: existing.headEnd, text: head });
    if (matching.length === 0)
      appended.push({
        key: tag.key,
        text: lower.slice(tag.start, tag.end).trim(),
      });
  }
  if (!upper.includes("\n")) {
    const replaced = applyTextEdits(upper, edits);
    return `${replaced.slice(0, -2).trimEnd()}${appended.map((tag) => ` ${tag.text}`).join("")} */`;
  }
  for (const tag of appended) {
    const kind = tag.key.startsWith("param:") ? "param:" : tag.key;
    const anchor =
      [...upperTags]
        .reverse()
        .find((candidate) => candidate.key.startsWith(kind)) ??
      upperTags[upperTags.length - 1];
    if (anchor) {
      // The anchor's range runs to the next tag, so it carries the next line's
      // ` * ` prefix and any blank ` *` lines; insert after its own last line.
      const lines = upper.slice(anchor.start, anchor.end).split("\n");
      while (lines.length > 1 && /^\s*\*?\s*$/.test(lines[lines.length - 1]))
        lines.pop();
      const at = anchor.start + lines.join("\n").trimEnd().length;
      const lineStart = upper.lastIndexOf("\n", anchor.start) + 1;
      const prefix =
        lineStart > 0 ? upper.slice(lineStart, anchor.start) : " * ";
      edits.push({ at, end: at, text: `\n${prefix}${tag.text}` });
    } else {
      const closing = upper.lastIndexOf("\n");
      const indent = /^[ \t]*/.exec(upper.slice(closing + 1))[0];
      edits.push({
        at: closing,
        end: closing,
        text: `\n${indent} * ${tag.text}`,
      });
    }
  }
  return applyTextEdits(upper, edits);
};

/** `edits` applied back to front; an insertion at an edit's end lands after its replacement. */
const applyTextEdits = (text, edits) =>
  [...edits]
    .sort((a, b) => b.at - a.at || (a.end === a.at ? -1 : 1))
    .reduce(
      (result, edit) =>
        result.slice(0, edit.at) + edit.text + result.slice(edit.end),
      text,
    );

/**
 * TypeScript reads `@param`, `@type` and `@return` tags from only the LAST
 * JSDoc block above a declaration. The declaration overlay runs before this
 * plugin and writes a full `@param` block above many of three's functions; a
 * one-line block this plugin inserts directly beneath it would otherwise
 * silently discard every tag the overlay stated -- `renderBufferDirect`'s
 * `camera`, `geometry`, `material` and `object` read `any` behind the plugin's
 * two widened tags. Fold every such one-line, tags-only block into the block
 * directly above it instead. Vanilla three has no adjacent pair of this shape,
 * and folding a block whose tags `upper` already states verbatim changes only
 * its removal, so a second pass over the output is a no-op.
 *
 * Only tags that describe the declaration below fold, and only into a block
 * that describes it too. A `@typedef`/`@callback`/`@import` block declares
 * something of its own wherever it stands, and a `@template` names a type
 * parameter the block above may already use for another; neither side of such
 * a pair is rewritten.
 */
const adjacentJSDocBlocks =
  /(\/\*\*(?:[^*]|\*(?!\/))*\*\/)\s*(\/\*\*[ \t]*@(?:[^*]|\*(?!\/))*\*\/)/g;
const foldableTagKinds = new Set(["param", "return", "type", "this"]);
const declarationTagKinds = new Set([
  "typedef",
  "callback",
  "import",
  "overload",
  "property",
  "prop",
]);
const tagKindsOf = (block) =>
  jsDocTagsOf(block, 3, block.length - 2).map((tag) => tag.key.split(":")[0]);

const foldsInto = (upper, lower) => {
  const lowerKinds = tagKindsOf(lower);
  return (
    lowerKinds.length > 0 &&
    lowerKinds.every((kind) => foldableTagKinds.has(kind)) &&
    !tagKindsOf(upper).some((kind) => declarationTagKinds.has(kind))
  );
};

export const foldAdjacentJSDocBlocks = (text) => {
  let folded = text;
  const pattern = new RegExp(adjacentJSDocBlocks.source, "g");
  for (
    let match = pattern.exec(folded);
    match !== null;
    match = pattern.exec(folded)
  ) {
    const [whole, upper, lower] = match;
    if (!foldsInto(upper, lower)) {
      // `lower` may still take the block after it.
      pattern.lastIndex = match.index + whole.length - lower.length;
      continue;
    }
    folded =
      folded.slice(0, match.index) +
      foldJSDocBlock(upper, lower) +
      folded.slice(match.index + whole.length);
    // The folded block may take the block after it too.
    pattern.lastIndex = match.index;
  }
  return folded;
};

const transformSource = ({ fileName, text }) => {
  const normalized = fileName.replaceAll("\\", "/");
  const isThreeSource =
    normalized.includes("/three/src/") && normalized.endsWith(".js");
  let transformed = text;

  if (
    normalized.endsWith("/three/src/scenes/Scene.js") ||
    normalized.endsWith("/three/src/animation/AnimationMixer.js") ||
    normalized.endsWith("/three/src/loaders/Loader.js") ||
    normalized.endsWith("/three/src/renderers/WebGLRenderer.js") ||
    normalized.endsWith("/three/src/renderers/webgpu/WebGPURenderer.js")
  ) {
    transformed = replaceOne(
      transformed,
      "\t\tif ( typeof __THREE_DEVTOOLS__ !== 'undefined' ) {\n\n\t\t\t__THREE_DEVTOOLS__.dispatchEvent( new CustomEvent( 'observe', { detail: this } ) );\n\n\t\t}",
      "",
      fileName,
      "native build devtools observation",
    );
  }
  if (normalized.endsWith("/three/src/Three.Core.js")) {
    transformed = replaceOne(
      transformed,
      "if ( typeof __THREE_DEVTOOLS__ !== 'undefined' ) {\n\n\t__THREE_DEVTOOLS__.dispatchEvent( new CustomEvent( 'register', { detail: {\n\t\trevision: REVISION,\n\t} } ) );\n\n}\n",
      "",
      fileName,
      "native build devtools registration",
    );
  }
  if (normalized.endsWith("/three/src/core/Object3D.js")) {
    transformed = replaceOne(
      transformed,
      "const _childaddedEvent = { type: 'childadded', child: null };",
      "/** @type {{ type: string, child: Object3D|null }} */\nconst _childaddedEvent = { type: 'childadded', child: null };",
      fileName,
      "Object3D child-added event carrier",
    );
    transformed = replaceOne(
      transformed,
      "const _childremovedEvent = { type: 'childremoved', child: null };",
      "/** @type {{ type: string, child: Object3D|null }} */\nconst _childremovedEvent = { type: 'childremoved', child: null };",
      fileName,
      "Object3D child-removed event carrier",
    );
    if (!transformed.includes(object3DClearSource)) {
      throw new Error(
        `Three Object3D source at ${fileName} no longer contains the expected clear() implementation`,
      );
    }
    transformed = transformed.replace(
      object3DClearSource,
      nativeObject3DClearSource,
    );
    if (!transformed.includes(object3DRaycastSource)) {
      throw new Error(
        `Three Object3D source at ${fileName} no longer contains the expected raycast() placeholder`,
      );
    }
    transformed = transformed.replace(
      object3DRaycastSource,
      nativeObject3DRaycastSource,
    );
  }
  if (normalized.endsWith("/three/src/renderers/WebGLRenderer.js")) {
    transformed =
      `import { nativeProfilePhase } from '${fileURLToPath(new URL("./src/nativeWebGLHost.ts", import.meta.url))}';\n` +
      transformed;
    transformed = replaceOne(
      transformed,
      "if ( scene.matrixWorldAutoUpdate === true ) scene.updateMatrixWorld();",
      "nativeProfilePhase( 3 );\n\t\t\tif ( scene.matrixWorldAutoUpdate === true ) scene.updateMatrixWorld();",
      fileName,
      "WebGLRenderer scene profiling begin",
    );
    transformed = replaceOne(
      transformed,
      "if ( camera.parent === null && camera.matrixWorldAutoUpdate === true ) camera.updateMatrixWorld();",
      "if ( camera.parent === null && camera.matrixWorldAutoUpdate === true ) camera.updateMatrixWorld();\n\t\t\tnativeProfilePhase( 2 );",
      fileName,
      "WebGLRenderer scene profiling end",
    );

    transformed = replaceOne(
      transformed,
      "\t\t\tlet index = geometry.index;",
      "\t\t\t/** @type {import('../core/BufferAttribute.js').BufferAttribute|null|undefined} */\n\t\t\tlet index = geometry.index;",
      fileName,
      "WebGLRenderer stable index attribute carrier",
    );
    const asyncReadFunction =
      "\t\tthis.readRenderTargetPixelsAsync = async function (";
    const asyncReadFunctionIndex = transformed.indexOf(asyncReadFunction);
    const asyncReadReturnStart = transformed.lastIndexOf(
      "@return {Promise<",
      asyncReadFunctionIndex,
    );
    const asyncReadReturnEnd = transformed.indexOf(">}", asyncReadReturnStart);
    const asyncReadResult =
      asyncReadReturnStart >= 0 && asyncReadReturnEnd >= 0
        ? transformed.slice(asyncReadReturnStart, asyncReadReturnEnd)
        : "";
    if (
      asyncReadFunctionIndex >= 0 &&
      asyncReadReturnStart >= 0 &&
      asyncReadReturnEnd >= 0 &&
      !asyncReadResult.includes("undefined")
    ) {
      transformed =
        transformed.slice(0, asyncReadReturnEnd) +
        "|undefined" +
        transformed.slice(asyncReadReturnEnd);
    }
    transformed = replaceOne(
      transformed,
      "class WebGLRenderer {",
      `/**
 * @param {number|null|undefined} level
 * @return {number}
 */
function resolveTextureLevel( level ) {

\tif ( typeof level === 'number' ) return level;

\treturn 0;

}

/**
 * @param {number|undefined} value
 * @return {number}
 */
function requireTextureCoordinate( value ) {

\tif ( typeof value === 'number' ) return value;

\tthrow new Error( 'THREE.WebGLRenderer: Texture copy coordinates must be numeric.' );

}

/**
 * @param {InstanceType<typeof import('./webgl/WebGLProgram.js').WebGLProgram>|undefined} value
 * @return {InstanceType<typeof import('./webgl/WebGLProgram.js').WebGLProgram>}
 */
function requireUniformGroupProgram( value ) {

\tif ( value !== undefined ) return value;

\tthrow new Error( 'THREE.WebGLRenderer: Missing program for uniform group.' );

}

class WebGLRenderer {

\t/** @type {(callback: (((time: number) => void) | null)) => void} */
\tsetAnimationLoop;`,
      fileName,
      "WebGLRenderer animation-loop field",
    );
    transformed = replaceOne(
      transformed,
      "\t\tlet _opaqueSort = null;\n\t\tlet _transparentSort = null;",
      `\t\t/** @type {((a: ${nativeRenderItemType("../")}, b: ${nativeRenderItemType("../")}) => number) | null} */
\t\tlet _opaqueSort = null;
\t\t/** @type {((a: ${nativeRenderItemType("../")}, b: ${nativeRenderItemType("../")}) => number) | null} */
\t\tlet _transparentSort = null;`,
      fileName,
      "WebGLRenderer nullable sort callback cells",
    );
    for (const [setter, description] of [
      ["setOpaqueSort", "opaque"],
      ["setTransparentSort", "transparent"],
    ]) {
      transformed = replaceOne(
        transformed,
        `\t\t * @param {?Function} method - The opaque sort function.
\t\t */
\t\tthis.${setter} = function ( method ) {`,
        `\t\t * @param {((a: ${nativeRenderItemType("../")}, b: ${nativeRenderItemType("../")}) => number) | null} method - The ${description} sort function.
\t\t */
\t\tthis.${setter} = function ( method ) {`,
        fileName,
        `WebGLRenderer ${description} sort callback input`,
      );
    }
    if (!transformed.includes(rendererGetContextSource)) {
      throw new Error(
        `Three WebGLRenderer source at ${fileName} no longer contains the expected getContext() helper`,
      );
    }
    transformed = transformed.replace(
      rendererGetContextSource,
      nativeRendererGetContextSource,
    );
    if (!transformed.includes(rendererMaterialIndexSource)) {
      throw new Error(
        `Three WebGLRenderer source at ${fileName} no longer contains the expected material array read`,
      );
    }
    if (
      !transformed.includes(rendererMaterialsDeclarationSource) ||
      !transformed.includes(rendererMaterialArrayBranchSource)
    ) {
      throw new Error(
        `Three WebGLRenderer source at ${fileName} no longer contains the expected material collection setup`,
      );
    }
    if (!transformed.includes(rendererSingleMaterialSource)) {
      throw new Error(
        `Three WebGLRenderer source at ${fileName} no longer contains the expected single-material branch`,
      );
    }
    if (!transformed.includes(rendererCompileReturnSource)) {
      throw new Error(
        `Three WebGLRenderer source at ${fileName} no longer contains the expected material collection return annotation`,
      );
    }
    if (
      !transformed.includes(rendererCompileAssignmentSource) ||
      !transformed.includes(rendererCompileAssignmentEndSource)
    ) {
      throw new Error(
        `Three WebGLRenderer source at ${fileName} no longer contains the expected compile() assignment boundary`,
      );
    }
    transformed = transformed.replace(
      rendererMaterialsDeclarationSource,
      nativeRendererMaterialsDeclarationSource,
    );
    transformed = transformed.replace(
      rendererMaterialArrayBranchSource,
      nativeRendererMaterialArrayBranchSource,
    );
    transformed = transformed.replace(
      rendererMaterialIndexSource,
      nativeRendererMaterialIndexSource,
    );
    transformed = transformed.replace(
      rendererSingleMaterialSource,
      nativeRendererSingleMaterialSource,
    );
    transformed = transformed.replace(
      rendererCompileReturnSource,
      nativeRendererCompileReturnSource,
    );
    transformed = transformed.replace(
      rendererCompileAssignmentSource,
      nativeRendererCompileAssignmentSource,
    );
    transformed = transformed.replace(
      rendererCompileAssignmentEndSource,
      nativeRendererCompileAssignmentEndSource,
    );
    transformed = replaceOne(
      transformed,
      "const _emptyScene = { background: null, fog: null, environment: null, overrideMaterial: null, isScene: true };",
      "const _emptyScene = /*@__PURE__*/ new Scene();",
      fileName,
      "WebGLRenderer empty scene",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\t\tconst uCamPos = p_uniforms.map.cameraPosition;

\t\t\t\tif ( uCamPos !== undefined ) {

\t\t\t\t\tuCamPos.setValue( _gl, _vector3.setFromMatrixPosition( camera.matrixWorld ) );

\t\t\t\t}`,
      `\t\t\t\tp_uniforms.setValue( _gl, 'cameraPosition', _vector3.setFromMatrixPosition( camera.matrixWorld ) );`,
      fileName,
      "WebGLRenderer camera-position uniform dispatch",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\t\tattribute = attributes.get( index );

\t\t\t\trenderer = indexedBufferRenderer;
\t\t\t\trenderer.setIndex( attribute );`,
      `\t\t\t\tconst indexAttribute = attributes.get( index );

\t\t\t\tif ( indexAttribute !== undefined ) {

\t\t\t\t\tindexedBufferRenderer.setIndexValues( indexAttribute.type, indexAttribute.bytesPerElement );

\t\t\t\t} else {

\t\t\t\t\treturn;

\t\t\t\t}`,
      fileName,
      "WebGLRenderer indexed renderer dispatch",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tlet attribute;\n\t\t\tlet renderer = bufferRenderer;",
      "",
      fileName,
      "WebGLRenderer indexed attribute storage",
    );
    // A shared structural renderer cell materializes a native adapter per draw.
    // Both concrete renderers already exist; dispatch to them without that cell.
    for (const method of [
      "setMode",
      "render",
      "renderInstances",
      "renderMultiDraw",
    ]) {
      const calls = [
        ...transformed.matchAll(
          new RegExp(`renderer\\.${method}\\( ([^;\\n]+) \\);`, "g"),
        ),
      ];
      if (calls.length === 0)
        throw new Error(
          `Three WebGLRenderer.${method} dispatch at ${fileName} no longer matches`,
        );
      for (const [call, parameters] of calls) {
        transformed = transformed.replace(
          call,
          `if ( index !== null ) indexedBufferRenderer.${method}( ${parameters} ); else bufferRenderer.${method}( ${parameters} );`,
        );
      }
    }
    transformed = replaceOne(
      transformed,
      `\tget coordinateSystem() {

\t\treturn WebGLCoordinateSystem;

\t}`,
      `\tget coordinateSystem() {

\t\treturn WebGLCoordinateSystem;

\t}

\t/** @return {number} */
\tgetCoordinateSystem() {

\t\treturn WebGLCoordinateSystem;

\t}`,
      fileName,
      "WebGLRenderer direct coordinate-system read",
    );
    transformed = replaceOne(
      transformed,
      `\tget outputColorSpace() {

\t\treturn this._outputColorSpace;

\t}`,
      `\tget outputColorSpace() {

\t\treturn this._outputColorSpace;

\t}

\t/** @return {string} */
\tgetOutputColorSpace() {

\t\treturn this._outputColorSpace;

\t}`,
      fileName,
      "WebGLRenderer direct output color-space read",
    );
    transformed = replaceOne(
      transformed,
      `class WebGLRenderer {

\t/** @type {(callback: (((time: number) => void) | null)) => void} */`,
      `/**
 * @param {import('../textures/Texture.js').Texture['image']} value
 * @return {{ width: number, height: number }}
 */
function requireRendererTextureImageRecord( value ) {

\tif ( value !== null && ! Array.isArray( value ) && typeof value.width === 'number' && typeof value.height === 'number' ) return { width: value.width, height: value.height };

\tthrow new Error( 'THREE.WebGLRenderer: Depth texture image must be a dimensioned native image record.' );

}

class WebGLRenderer {

\t/** @type {(callback: (((time: number) => void) | null)) => void} */`,
      fileName,
      "WebGLRenderer native image guard",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\t\t\tconst depthTexture = renderTarget.depthTexture;
\t\t\t\t\tif ( renderTargetProperties.__boundDepthTexture !== depthTexture ) {

\t\t\t\t\t\t// check if the depth texture is compatible
\t\t\t\t\t\tif (
\t\t\t\t\t\t\tdepthTexture !== null &&
\t\t\t\t\t\t\tproperties.has( depthTexture ) &&
\t\t\t\t\t\t\t( renderTarget.width !== depthTexture.image.width || renderTarget.height !== depthTexture.image.height )
\t\t\t\t\t\t) {`,
      `\t\t\t\t\tconst depthTexture = renderTarget.depthTexture;
\t\t\t\t\tif ( renderTargetProperties.__boundDepthTexture !== depthTexture ) {

\t\t\t\t\t\t// check if the depth texture is compatible
\t\t\t\t\t\tif ( depthTexture !== null && properties.has( depthTexture ) ) {

\t\t\t\t\t\t\tconst depthTextureImage = requireRendererTextureImageRecord( depthTexture.image );

\t\t\t\t\t\t\tif ( renderTarget.width !== depthTextureImage.width || renderTarget.height !== depthTextureImage.height ) {`,
      fileName,
      "WebGLRenderer depth image record narrowing",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\t\t\t\t\tthrow new Error( 'THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.' );

\t\t\t\t\t\t}

\t\t\t\t\t\t// Swap the depth buffer to the currently attached one`,
      `\t\t\t\t\t\t\t\tthrow new Error( 'THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.' );

\t\t\t\t\t\t\t}

\t\t\t\t\t\t}

\t\t\t\t\t\t// Swap the depth buffer to the currently attached one`,
      fileName,
      "WebGLRenderer depth image guard close",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tprograms = new Map();",
      "\t\t\t\tprograms = /** @type {Record<string, InstanceType<typeof import('./webgl/WebGLProgram.js').WebGLProgram>|undefined>} */ ( {} );",
      fileName,
      "WebGLRenderer exact material program cache",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tlet program = programs.get( programCacheKey );",
      "\t\t\tlet program = programs[ programCacheKey ];",
      fileName,
      "WebGLRenderer material program lookup",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tprograms.set( programCacheKey, program );",
      "\t\t\t\tprograms[ programCacheKey ] = program;",
      fileName,
      "WebGLRenderer material program store",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tconst transmissionRenderTarget = currentRenderState.state.transmissionRenderTarget[ camera.id ];",
      "\t\t\tconst transmissionRenderTarget = currentRenderState.state.transmissionRenderTarget[ camera.id ];\n\n\t\t\tif ( transmissionRenderTarget === undefined ) return;",
      fileName,
      "WebGLRenderer transmission target guard",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\tconst cameras = camera.cameras;",
      "\t\t\t\t\tconst arrayCamera = /** @type {import('../cameras/ArrayCamera.js').ArrayCamera} */ ( camera );\n\t\t\t\t\tconst cameras = arrayCamera.cameras;",
      fileName,
      "WebGLRenderer array-camera render list",
    );
    transformed = replaceOne(
      transformed,
      "\t\tfunction projectObject( object, camera, groupOrder, sortObjects ) {",
      `\t\t/** @param {import('../core/Object3D.js').Object3D} object @param {import('../cameras/Camera.js').Camera} camera @param {number} groupOrder @param {boolean} sortObjects */
\t\tfunction projectObject( object, camera, groupOrder, sortObjects ) {`,
      fileName,
      "WebGLRenderer native project-object carriers",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\t\t\t\tconst geometry = objects.update( object );
\t\t\t\t\t\tconst material = object.material;

\t\t\t\t\t\tif ( material.visible ) {`,
      `\t\t\t\t\t\tconst geometry = objects.update( object );
\t\t\t\t\t\tconst material = /** @type {import('../materials/Material.js').Material} */ ( object.material );

\t\t\t\t\t\tif ( material.visible ) {`,
      fileName,
      "WebGLRenderer sprite material narrowing",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\t\t\t\tif ( Array.isArray( material ) ) {

\t\t\t\t\t\t\tconst groups = geometry.groups;

\t\t\t\t\t\t\tfor ( let i = 0, l = groups.length; i < l; i ++ ) {

\t\t\t\t\t\t\t\tconst group = groups[ i ];
\t\t\t\t\t\t\t\tconst groupMaterial = material[ group.materialIndex ];

\t\t\t\t\t\t\t\tif ( groupMaterial && groupMaterial.visible ) {

\t\t\t\t\t\t\t\t\tcurrentRenderList.push( object, geometry, groupMaterial, groupOrder, _vector4.z, group );

\t\t\t\t\t\t\t\t}

\t\t\t\t\t\t\t}

\t\t\t\t\t\t} else if ( material.visible ) {

\t\t\t\t\t\t\tcurrentRenderList.push( object, geometry, material, groupOrder, _vector4.z, null );

\t\t\t\t\t\t}`,
      `\t\t\t\t\t\tif ( Array.isArray( material ) ) {

\t\t\t\t\t\t\tconst materialArray = /** @type {Array<import('../materials/Material.js').Material>} */ ( material );
\t\t\t\t\t\t\tconst groups = geometry.groups;

\t\t\t\t\t\t\tfor ( let i = 0, l = groups.length; i < l; i ++ ) {

\t\t\t\t\t\t\t\tconst group = groups[ i ];
\t\t\t\t\t\t\t\tconst materialIndex = group.materialIndex;

\t\t\t\t\t\t\t\tif ( typeof materialIndex !== 'number' ) continue;

\t\t\t\t\t\t\t\tconst groupMaterial = materialArray[ materialIndex ];

\t\t\t\t\t\t\t\tif ( groupMaterial && groupMaterial.visible ) {

\t\t\t\t\t\t\t\t\tcurrentRenderList.push( object, geometry, groupMaterial, groupOrder, _vector4.z, group );

\t\t\t\t\t\t\t\t}

\t\t\t\t\t\t\t}

\t\t\t\t\t\t} else {

\t\t\t\t\t\t\tconst singleMaterial = /** @type {import('../materials/Material.js').Material} */ ( material );

\t\t\t\t\t\t\tif ( singleMaterial.visible ) currentRenderList.push( object, geometry, singleMaterial, groupOrder, _vector4.z, null );

\t\t\t\t\t\t}`,
      fileName,
      "WebGLRenderer project-object material narrowing",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\tcurrentRenderState = renderStates.get( targetScene );
\t\t\tcurrentRenderState.init( camera );

\t\t\trenderStateStack.push( currentRenderState );`,
      `\t\t\tconst compileRenderState = renderStates.get( targetScene );
\t\t\tcurrentRenderState = compileRenderState;
\t\t\tcompileRenderState.init( camera );

\t\t\trenderStateStack.push( compileRenderState );`,
      fileName,
      "WebGLRenderer compile render-state stack carrier",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\tcurrentRenderState = renderStates.get( scene, renderStateStack.length );
\t\t\tcurrentRenderState.init( camera );

\t\t\tcurrentRenderState.state.textureUnits = textures.getTextureUnits();
\t\t\trenderStateStack.push( currentRenderState );`,
      `\t\t\tconst nextRenderState = renderStates.get( scene, renderStateStack.length );
\t\t\tcurrentRenderState = nextRenderState;
\t\t\tnextRenderState.init( camera );

\t\t\tnextRenderState.state.textureUnits = textures.getTextureUnits();
\t\t\trenderStateStack.push( nextRenderState );`,
      fileName,
      "WebGLRenderer render-state stack carrier",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\tcurrentRenderList = renderLists.get( scene, renderListStack.length );
\t\t\tcurrentRenderList.init();

\t\t\trenderListStack.push( currentRenderList );`,
      `\t\t\tconst nextRenderList = renderLists.get( scene, renderListStack.length );
\t\t\tcurrentRenderList = nextRenderList;
\t\t\tnextRenderList.init();

\t\t\trenderListStack.push( nextRenderList );`,
      fileName,
      "WebGLRenderer render-list stack carrier",
    );
    transformed = replaceOne(
      transformed,
      "\t\tthis.renderBufferDirect = function ( camera, scene, geometry, material, object, group ) {\n\n\t\t\tif ( scene === null ) scene = _emptyScene; // renderBufferDirect second parameter used to be fog (could be null)",
      `\t\tthis.renderBufferDirect = function ( camera, scene, geometry, material, object, group ) {

\t\t\tconst renderScene = /** @type {Scene} */ ( scene !== null && scene.isScene === true ? scene : _emptyScene );`,
      fileName,
      "WebGLRenderer render-buffer scene carrier",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tconst program = setProgram( camera, scene, geometry, material, object );",
      "\t\t\tconst program = setProgram( camera, renderScene, geometry, material, object );",
      fileName,
      "WebGLRenderer render-buffer typed scene",
    );
    transformed = replaceOne(
      transformed,
      "\t\tfunction getProgram( material, scene, object ) {\n\n\t\t\tif ( scene.isScene !== true ) scene = _emptyScene; // scene could be a Mesh, Line, Points, ...",
      `\t\t/** @param {Object3D} scene */
\t\tfunction getProgram( material, scene, object ) {

\t\t\tconst renderScene = /** @type {Scene} */ ( scene.isScene === true ? scene : _emptyScene );`,
      fileName,
      "WebGLRenderer program scene carrier",
    );
    for (const [source, replacement, label] of [
      [
        "programCache.getParameters( material, lights.state, shadowsArray, scene, object, currentRenderState.state.lightProbeGridArray )",
        "programCache.getParameters( material, lights.state, shadowsArray, renderScene, object, currentRenderState.state.lightProbeGridArray )",
        "program parameters scene",
      ],
      ["scene.environment", "renderScene.environment", "program environment"],
      ["scene.fog", "renderScene.fog", "program fog"],
      [
        "scene.environmentRotation",
        "renderScene.environmentRotation",
        "program environment rotation",
      ],
    ]) {
      transformed = replaceOne(
        transformed,
        source,
        replacement,
        fileName,
        `WebGLRenderer ${label}`,
      );
    }
    transformed = replaceOne(
      transformed,
      "\t\tfunction setProgram( camera, scene, geometry, material, object ) {\n\n\t\t\tif ( scene.isScene !== true ) scene = _emptyScene; // scene could be a Mesh, Line, Points, ...",
      `\t\t/** @param {Scene} scene @param {import('../materials/Material.js').Material} material */
\t\tfunction setProgram( camera, scene, geometry, material, object ) {`,
      fileName,
      "WebGLRenderer set-program scene carrier",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tuniforms.clippingPlanes = clipping.uniform;",
      "\t\t\t\tmaterialProperties.clippingPlanes = clipping.uniform;",
      fileName,
      "WebGLRenderer native clipping uniform slot",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tmaterialProperties.uniformsList = WebGLUniforms.seqWithValue( progUniforms.seq, materialProperties.uniforms );",
      "\t\t\t\tmaterialProperties.uniformsList = WebGLUniforms.seqWithValue( progUniforms.seq, materialProperties.uniforms, materialProperties.clippingPlanes );",
      fileName,
      "WebGLRenderer clipping uniform sequence",
    );
    transformed = replaceOne(
      transformed,
      "import { WebGLUniforms } from './webgl/WebGLUniforms.js';",
      "import { WebGLUniforms } from './webgl/WebGLUniforms.js';\nimport { uniformVector3 } from './shaders/UniformsUtils.js';",
      fileName,
      "WebGLRenderer uniform accessor import",
    );
    transformed = replaceOne(
      transformed,
      "\t\tfunction markUniformsLightsNeedsUpdate( uniforms, value ) {",
      "\t\t/** @param {import('./shaders/UniformsLib.js').NativeUniforms} uniforms @param {boolean} value */\n\t\tfunction markUniformsLightsNeedsUpdate( uniforms, value ) {",
      fileName,
      "WebGLRenderer lights needs-update table",
    );
    transformed = replaceOne(
      transformed,
      "import { WebGLRenderStates } from './webgl/WebGLRenderStates.js';",
      "import { WebGLRenderStates, NativeLightProbeGrid } from './webgl/WebGLRenderStates.js';",
      fileName,
      "WebGLRenderer light-probe grid class import",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t} else if ( object.isLightProbeGrid ) {\n\n\t\t\t\t\tcurrentRenderState.pushLightProbeGrid( object );",
      "\t\t\t\t} else if ( object instanceof NativeLightProbeGrid ) {\n\n\t\t\t\t\tcurrentRenderState.pushLightProbeGrid( object );",
      fileName,
      "WebGLRenderer light-probe grid projection",
    );
    transformed = replaceOne(
      transformed,
      "\t\tfunction findLightProbeGrid( volumes, object ) {",
      "\t\t/** @param {NativeLightProbeGrid[]} volumes @param {import('../core/Object3D.js').Object3D} object @return {NativeLightProbeGrid|null} */\n\t\tfunction findLightProbeGrid( volumes, object ) {",
      fileName,
      "WebGLRenderer light-probe grid lookup",
    );
    // The slot is written as a boolean at init and as a grid-or-null per
    // frame; the frame write always precedes this read, so the instanceof
    // test is three's truthiness test with the grid's type attached.
    transformed = replaceOne(
      transformed,
      "\t\t\t\tif ( materialProperties.needsLights && materialProperties.lightProbeGrid ) {\n\n\t\t\t\t\tconst volume = materialProperties.lightProbeGrid;\n\n\t\t\t\t\tm_uniforms.probesSH.value = volume.texture;",
      "\t\t\t\tconst volume = materialProperties.lightProbeGrid;\n\n\t\t\t\tif ( materialProperties.needsLights && volume instanceof NativeLightProbeGrid ) {\n\n\t\t\t\t\tm_uniforms.probesSH.value = volume.texture;",
      fileName,
      "WebGLRenderer light-probe grid uniforms",
    );
    // The light-probe volume bounds are Vector3 uniforms the renderer copies
    // into; over the union each copy target is a narrowing read.
    transformed = rewriteUniformValueMethods(transformed, fileName, {
      probesMin: "uniformVector3",
      probesMax: "uniformVector3",
      probesResolution: "uniformVector3",
    });

    const rendererUniformUploadSource =
      "\t\t\t\tWebGLUniforms.upload( _gl, getUniformList( materialProperties ), m_uniforms, textures );";
    const rendererUniformUploadCount =
      transformed.split(rendererUniformUploadSource).length - 1;
    if (rendererUniformUploadCount !== 2) {
      throw new Error(
        "Three WebGLRenderer source at " +
          fileName +
          " has " +
          rendererUniformUploadCount +
          " uniform uploads; expected 2",
      );
    }
    transformed = transformed.replaceAll(
      rendererUniformUploadSource,
      "\t\t\t\tWebGLUniforms.upload( _gl, getUniformList( materialProperties ), m_uniforms, textures, materialProperties.clippingPlanes );",
    );
    transformed = replaceOne(
      transformed,
      rendererReleaseProgramsSource,
      nativeRendererReleaseProgramsSource,
      fileName,
      "WebGLRenderer program collection traversal",
    );
    const compileAsyncStart = transformed.indexOf(
      rendererCompileAsyncStartSource,
    );
    const compileAsyncEnd = transformed.indexOf(
      rendererCompileAsyncEndSource,
      compileAsyncStart,
    );
    if (
      compileAsyncStart < 0 ||
      compileAsyncEnd < 0 ||
      transformed.indexOf(
        rendererCompileAsyncStartSource,
        compileAsyncStart + 1,
      ) >= 0
    ) {
      throw new Error(
        `Three WebGLRenderer compileAsync source at ${fileName} no longer matches the native adaptation`,
      );
    }
    transformed =
      transformed.slice(0, compileAsyncStart) +
      nativeRendererCompileAsyncSource +
      transformed.slice(compileAsyncEnd + "\n\t\t};".length);
    transformed = replaceOne(
      transformed,
      "@return {Promise} A Promise that resolves when the given scene can be rendered without unnecessary stalling due to shader compilation.",
      "@return {Promise<Object3D>} A Promise that resolves when the given scene can be rendered without unnecessary stalling due to shader compilation.",
      fileName,
      "WebGLRenderer.compileAsync result",
    );
    transformed = replaceOne(
      transformed,
      "this.setClearColor = function () {\n\n\t\t\tbackground.setClearColor( ...arguments );",
      "this.setClearColor = function ( color, alpha = 1 ) {\n\n\t\t\tbackground.setClearColor( color, alpha );",
      fileName,
      "WebGLRenderer.setClearColor forwarding wrapper",
    );
    transformed = replaceOne(
      transformed,
      "this.setClearAlpha = function () {\n\n\t\t\tbackground.setClearAlpha( ...arguments );",
      "this.setClearAlpha = function ( alpha ) {\n\n\t\t\tbackground.setClearAlpha( alpha );",
      fileName,
      "WebGLRenderer.setClearAlpha forwarding wrapper",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\toutput.end( _this );",
      "\t\t\t\toutput.end( _this, 0 );",
      fileName,
      "WebGLRenderer output delta time",
    );
    transformed = replaceOne(
      transformed,
      "Returns the current viewport definition.\n\t\t *\n\t\t * @param {Vector2} target - The method writes the result in this target object.\n\t\t * @return {Vector2}",
      "Returns the current viewport definition.\n\t\t *\n\t\t * @param {Vector4} target - The method writes the result in this target object.\n\t\t * @return {Vector4}",
      fileName,
      "WebGLRenderer current viewport target",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\tstate.setLineWidth( material.wireframeLinewidth * getTargetPixelRatio() );",
      "\t\t\t\t\tconst wireframeLinewidth = material.wireframeLinewidth;\n\t\t\t\t\tstate.setLineWidth( ( typeof wireframeLinewidth === 'number' ? wireframeLinewidth : 1 ) * getTargetPixelRatio() );",
      fileName,
      "WebGLRenderer numeric wireframe line width",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tstate.setLineWidth( lineWidth * getTargetPixelRatio() );",
      "\t\t\t\tconst resolvedLineWidth = typeof lineWidth === 'number' ? lineWidth : 1;\n\t\t\t\tstate.setLineWidth( resolvedLineWidth * getTargetPixelRatio() );",
      fileName,
      "WebGLRenderer numeric line width",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\tconst starts = object._multiDrawStarts;\n\t\t\t\t\tconst counts = object._multiDrawCounts;\n\t\t\t\t\tconst drawCount = object._multiDrawCount;",
      "\t\t\t\t\tconst starts = object._multiDrawStarts;\n\t\t\t\t\tconst counts = object._multiDrawCounts;\n\t\t\t\t\tconst multiDrawCount = object._multiDrawCount;\n\t\t\t\t\tconst drawCount = typeof multiDrawCount === 'number' ? multiDrawCount : 0;",
      fileName,
      "WebGLRenderer numeric multi-draw count",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tstate.setPolygonOffset( false );",
      "\t\t\tstate.setPolygonOffset( false, 0, 0 );",
      fileName,
      "WebGLRenderer disabled polygon offset arguments",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tif ( _currentClearAlpha < 1 ) _this.setClearColor( 0xffffff, 0.5 );",
      "\t\t\tif ( _currentClearAlpha < 1 ) _this.setClearColor( new Color( 0xffffff ), 0.5 );",
      fileName,
      "WebGLRenderer transmission clear color",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tif ( capabilities.logarithmicDepthBuffer ) {\n\n\t\t\t\t\tp_uniforms.setValue( _gl, 'logDepthBufFC',\n\t\t\t\t\t\t2.0 / ( Math.log( camera.far + 1.0 ) / Math.LN2 ) );",
      "\t\t\t\tif ( capabilities.logarithmicDepthBuffer ) {\n\n\t\t\t\t\tconst cameraFar = camera.far;\n\n\t\t\t\t\tif ( typeof cameraFar === 'number' ) {\n\n\t\t\t\t\t\tp_uniforms.setValue( _gl, 'logDepthBufFC',\n\t\t\t\t\t\t\t2.0 / ( Math.log( cameraFar + 1.0 ) / Math.LN2 ) );\n\n\t\t\t\t\t}",
      fileName,
      "WebGLRenderer logarithmic camera far plane",
    );
    for (const [uniformName, value] of [
      ["projectionMatrix", "camera.projectionMatrix"],
      ["viewMatrix", "camera.matrixWorldInverse"],
      ["modelViewMatrix", "object.modelViewMatrix"],
      ["normalMatrix", "object.normalMatrix"],
      ["modelMatrix", "object.matrixWorld"],
    ]) {
      transformed = replaceOne(
        transformed,
        `p_uniforms.setValue( _gl, '${uniformName}', ${value} );`,
        nativeUniformNamesEnabled
          ? `p_uniforms.set_${uniformName}( _gl, ${value} );`
          : `p_uniforms.${uniformName === "normalMatrix" ? "setMatrix3Value" : "setMatrix4Value"}( _gl, '${uniformName}', ${value} );`,
        fileName,
        `WebGLRenderer direct ${uniformName} uniform`,
      );
    }
    for (const name of nativeUniformNamesEnabled
      ? ["toneMappingExposure", "cameraPosition"]
      : []) {
      transformed = replaceOne(
        transformed,
        `p_uniforms.setValue( _gl, '${name}', `,
        `p_uniforms.set_${name}( _gl, `,
        fileName,
        `WebGLRenderer fixed ${name} uniform`,
      );
    }
    transformed = replaceOne(
      transformed,
      "\t\t\tif ( materialProperties.needsLights ) {\n\n\t\t\t\t// Set shadow map uniforms first to ensure they get the first texture units",
      "\t\t\tif ( materialProperties.needsLights ) {\n\n\t\t\t\tconst directionalShadowMaps = /** @type {Array<import('../textures/Texture.js').Texture|null>} */ ( lights.state.directionalShadowMap );\n\t\t\t\tconst spotShadowMaps = /** @type {Array<import('../textures/Texture.js').Texture|null>} */ ( lights.state.spotShadowMap );\n\t\t\t\tconst pointShadowMaps = /** @type {Array<import('../textures/Texture.js').Texture|null>} */ ( lights.state.pointShadowMap );\n\n\t\t\t\t// Set shadow map uniforms first to ensure they get the first texture units",
      fileName,
      "WebGLRenderer typed shadow-map arrays",
    );
    for (const [field, local] of [
      ["directionalShadowMap", "directionalShadowMaps"],
      ["spotShadowMap", "spotShadowMaps"],
      ["pointShadowMap", "pointShadowMaps"],
    ]) {
      transformed = replaceOne(
        transformed,
        `if ( lights.state.${field}.length > 0 )`,
        `if ( ${local}.length > 0 )`,
        fileName,
        `WebGLRenderer ${field} length`,
      );
      transformed = replaceOne(
        transformed,
        `p_uniforms.setValue( _gl, '${field}', lights.state.${field}, textures );`,
        nativeUniformNamesEnabled && nativeUniformBindingsEnabled
          ? `p_uniforms.set_${field}( _gl, ${local}, textures );`
          : `p_uniforms.setValue( _gl, '${field}', ${local}, textures );`,
        fileName,
        `WebGLRenderer ${field} uniform`,
      );
    }
    // Three tests a tag and then reads fields off the untyped object; a
    // class test narrows the object to the class that declares those fields,
    // so each read has a type and each uniform value arrives already typed.
    // `setOptional` only existed to tolerate a program without the uniform,
    // which the typed setters already do.
    transformed = replaceOne(
      transformed,
      "\t\t\tif ( object.isSkinnedMesh ) {\n\n\t\t\t\tp_uniforms.setOptional( _gl, object, 'bindMatrix' );\n\t\t\t\tp_uniforms.setOptional( _gl, object, 'bindMatrixInverse' );\n\n\t\t\t\tconst skeleton = object.skeleton;",
      "\t\t\tif ( object.isSkinnedMesh ) {\n\n\t\t\t\tconst skinnedObject = /** @type {import('../objects/SkinnedMesh.js').SkinnedMesh} */ ( object );\n\n\t\t\t\tp_uniforms.setMatrix4Value( _gl, 'bindMatrix', skinnedObject.bindMatrix );\n\t\t\t\tp_uniforms.setMatrix4Value( _gl, 'bindMatrixInverse', skinnedObject.bindMatrixInverse );\n\n\t\t\t\tconst skeleton = skinnedObject.skeleton;",
      fileName,
      "WebGLRenderer skinned mesh uniforms",
    );
    // BatchedMesh is not on this target yet: its body indexes DataTexture
    // image data through the base Texture's image union at fifteen sites and
    // compares typed-array constructors, none of which lower natively today.
    // Referencing the class type from here would pull that whole body into the
    // program, and the old form read three fields off an untyped object through
    // the dynamic sidecar. A program that renders a BatchedMesh finds out here,
    // loudly, instead of drawing it with unset uniforms.
    transformed = replaceOne(
      transformed,
      "\t\t\tif ( object.isBatchedMesh ) {\n\n\t\t\t\tp_uniforms.setOptional( _gl, object, 'batchingTexture' );\n\t\t\t\tp_uniforms.setValue( _gl, 'batchingTexture', object._matricesTexture, textures );\n\n\t\t\t\tp_uniforms.setOptional( _gl, object, 'batchingIdTexture' );\n\t\t\t\tp_uniforms.setValue( _gl, 'batchingIdTexture', object._indirectTexture, textures );\n\n\t\t\t\tp_uniforms.setOptional( _gl, object, 'batchingColorTexture' );\n\t\t\t\tif ( object._colorsTexture !== null ) {\n\n\t\t\t\t\tp_uniforms.setValue( _gl, 'batchingColorTexture', object._colorsTexture, textures );\n\n\t\t\t\t}\n\n\t\t\t}",
      "\t\t\tif ( object.isBatchedMesh ) {\n\n\t\t\t\tthrow new Error( 'THREE.WebGLRenderer: BatchedMesh is not supported by the native target.' );\n\n\t\t\t}",
      fileName,
      "WebGLRenderer batched mesh unsupported",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tmorphtargets.update( object, geometry, program );",
      `\t\t\t\tif ( object.isInstancedMesh ) {

\t\t\t\t\tconst morphObject = /** @type {import('../objects/InstancedMesh.js').InstancedMesh} */ ( object );
\t\t\t\t\tmorphtargets.update( morphObject, geometry, program );

\t\t\t\t} else if ( object.isMesh ) {

\t\t\t\t\tconst morphObject = /** @type {import('../objects/Mesh.js').Mesh} */ ( object );
\t\t\t\t\tmorphtargets.update( morphObject, geometry, program );

\t\t\t\t} else if ( object.isLine ) {

\t\t\t\t\tconst morphObject = /** @type {import('../objects/Line.js').Line} */ ( object );
\t\t\t\t\tmorphtargets.update( morphObject, geometry, program );

\t\t\t\t} else if ( object.isPoints ) {

\t\t\t\t\tconst morphObject = /** @type {import('../objects/Points.js').Points} */ ( object );
\t\t\t\t\tmorphtargets.update( morphObject, geometry, program );

\t\t\t\t}`,
      fileName,
      "WebGLRenderer morph object narrowing",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tif ( material.uniformsGroups !== undefined ) {",
      `\t\t\tif ( material.isShaderMaterial === true ) {

\t\t\t\tconst shaderMaterial = /** @type {import('../materials/ShaderMaterial.js').ShaderMaterial} */ ( material );`,
      fileName,
      "WebGLRenderer uniform group material narrowing",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tconst groups = material.uniformsGroups;",
      "\t\t\t\tif ( program !== undefined ) {\n\n\t\t\t\t\tconst uniformsGroupProgram = requireUniformGroupProgram( program );\n\t\t\t\t\tconst groups = shaderMaterial.uniformsGroups;",
      fileName,
      "WebGLRenderer uniform group array",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\t\t\tuniformsGroups.bind( group, program );

\t\t\t\t}

\t\t\t}`,
      `\t\t\t\t\tuniformsGroups.bind( group, program );

\t\t\t\t\t}

\t\t\t\t} else {

\t\t\t\t\tthrow new Error( 'THREE.WebGLRenderer: Missing program for uniform group.' );

\t\t\t\t}

\t\t\t}`,
      fileName,
      "WebGLRenderer uniform group program branch",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\t\tfor ( let i = 0, l = groups.length; i < l; i ++ ) {

\t\t\t\t\tconst group = groups[ i ];

\t\t\t\t\tuniformsGroups.update( group, program );
\t\t\t\t\tuniformsGroups.bind( group, program );

\t\t\t\t\t}`,
      `\t\t\t\tfor ( const group of groups ) {

\t\t\t\t\tuniformsGroups.update( group, uniformsGroupProgram );
\t\t\t\t\tuniformsGroups.bind( group, uniformsGroupProgram );

\t\t\t\t}`,
      fileName,
      "WebGLRenderer uniform group traversal",
    );
    transformed = replaceOne(
      transformed,
      "\t\tthis.setRenderTarget = function ( renderTarget, activeCubeFace = 0, activeMipmapLevel = 0 ) {",
      "\t\tthis.setRenderTarget = function ( renderTarget, activeCubeFace = 0, activeMipmapLevel = 0 ) {\n\n\t\t\tif ( activeCubeFace === undefined ) activeCubeFace = 0;\n\t\t\tif ( activeMipmapLevel === undefined ) activeMipmapLevel = 0;",
      fileName,
      "WebGLRenderer numeric render-target indices",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\t\tconst __webglFramebuffer = properties.get( renderTarget ).__webglFramebuffer;

\t\t\t\tif ( renderTarget.isWebGLCubeRenderTarget ) {

\t\t\t\t\tif ( Array.isArray( __webglFramebuffer[ activeCubeFace ] ) ) {

\t\t\t\t\t\tframebuffer = __webglFramebuffer[ activeCubeFace ][ activeMipmapLevel ];

\t\t\t\t\t} else {

\t\t\t\t\t\tframebuffer = __webglFramebuffer[ activeCubeFace ];

\t\t\t\t\t}

\t\t\t\t\tisCube = true;

\t\t\t\t} else if ( ( renderTarget.samples > 0 ) && textures.useMultisampledRTT( renderTarget ) === false ) {

\t\t\t\t\tframebuffer = properties.get( renderTarget ).__webglMultisampledFramebuffer;

\t\t\t\t} else {

\t\t\t\t\tif ( Array.isArray( __webglFramebuffer ) ) {

\t\t\t\t\t\tframebuffer = __webglFramebuffer[ activeMipmapLevel ];

\t\t\t\t\t} else {

\t\t\t\t\t\tframebuffer = __webglFramebuffer;

\t\t\t\t\t}

\t\t\t\t}`,
      `\t\t\t\tif ( renderTarget.isWebGLCubeRenderTarget ) {

\t\t\t\t\tif ( texture.mipmaps && texture.mipmaps.length > 0 ) {

\t\t\t\t\t\tframebuffer = renderTargetProperties.__webglCubeMipmapFramebuffers[ activeCubeFace ][ activeMipmapLevel ];

\t\t\t\t\t} else {

\t\t\t\t\t\tframebuffer = renderTargetProperties.__webglCubeFramebuffers[ activeCubeFace ];

\t\t\t\t\t}

\t\t\t\t\tisCube = true;

\t\t\t\t} else if ( ( renderTarget.samples > 0 ) && textures.useMultisampledRTT( renderTarget ) === false ) {

\t\t\t\t\tframebuffer = renderTargetProperties.__webglMultisampledFramebuffer;

\t\t\t\t} else if ( texture.mipmaps && texture.mipmaps.length > 0 ) {

\t\t\t\t\tframebuffer = renderTargetProperties.__webglMipmapFramebuffers[ activeMipmapLevel ];

\t\t\t\t} else {

\t\t\t\t\tframebuffer = renderTargetProperties.__webglFramebuffer;

\t\t\t\t}`,
      fileName,
      "WebGLRenderer native framebuffer selection",
    );
    transformed = replaceOne(
      transformed,
      "\t\tthis.readRenderTargetPixels = function ( renderTarget, x, y, width, height, buffer, activeCubeFaceIndex, textureIndex = 0 ) {",
      "\t\tthis.readRenderTargetPixels = function ( renderTarget, x, y, width, height, buffer, activeCubeFaceIndex, textureIndex = 0 ) {\n\n\t\t\tif ( textureIndex === undefined ) textureIndex = 0;",
      fileName,
      "WebGLRenderer synchronous read texture index",
    );
    transformed = replaceOne(
      transformed,
      "\t\tthis.readRenderTargetPixelsAsync = async function ( renderTarget, x, y, width, height, buffer, activeCubeFaceIndex, textureIndex = 0 ) {",
      "\t\tthis.readRenderTargetPixelsAsync = async function ( renderTarget, x, y, width, height, buffer, activeCubeFaceIndex, textureIndex = 0 ) {\n\n\t\t\tif ( textureIndex === undefined ) textureIndex = 0;",
      fileName,
      "WebGLRenderer asynchronous read texture index",
    );
    transformed = replaceOne(
      transformed,
      "@param {FramebufferTexture} texture - The texture.",
      "@param {Texture} texture - The texture.",
      fileName,
      "WebGLRenderer framebuffer-copy texture contract",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\tlet framebuffer = properties.get( renderTarget ).__webglFramebuffer;

\t\t\tif ( renderTarget.isWebGLCubeRenderTarget && activeCubeFaceIndex !== undefined ) {

\t\t\t\tframebuffer = framebuffer[ activeCubeFaceIndex ];

\t\t\t}`,
      `\t\t\tconst renderTargetProperties = properties.get( renderTarget );
\t\t\tlet framebuffer = renderTargetProperties.__webglFramebuffer;

\t\t\tif ( renderTarget.isWebGLCubeRenderTarget && activeCubeFaceIndex !== undefined ) {

\t\t\t\tframebuffer = renderTarget.texture.mipmaps && renderTarget.texture.mipmaps.length > 0 ? renderTargetProperties.__webglCubeMipmapFramebuffers[ activeCubeFaceIndex ][ 0 ] : renderTargetProperties.__webglCubeFramebuffers[ activeCubeFaceIndex ];

\t\t\t} else if ( renderTarget.texture.mipmaps && renderTarget.texture.mipmaps.length > 0 ) {

\t\t\t\tframebuffer = renderTargetProperties.__webglMipmapFramebuffers[ 0 ];

\t\t\t}`,
      fileName,
      "WebGLRenderer synchronous read framebuffer",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\tlet framebuffer = properties.get( renderTarget ).__webglFramebuffer;
\t\t\tif ( renderTarget.isWebGLCubeRenderTarget && activeCubeFaceIndex !== undefined ) {

\t\t\t\tframebuffer = framebuffer[ activeCubeFaceIndex ];

\t\t\t}`,
      `\t\t\tconst renderTargetProperties = properties.get( renderTarget );
\t\t\tlet framebuffer = renderTargetProperties.__webglFramebuffer;

\t\t\tif ( renderTarget.isWebGLCubeRenderTarget && activeCubeFaceIndex !== undefined ) {

\t\t\t\tframebuffer = renderTarget.texture.mipmaps && renderTarget.texture.mipmaps.length > 0 ? renderTargetProperties.__webglCubeMipmapFramebuffers[ activeCubeFaceIndex ][ 0 ] : renderTargetProperties.__webglCubeFramebuffers[ activeCubeFaceIndex ];

\t\t\t} else if ( renderTarget.texture.mipmaps && renderTarget.texture.mipmaps.length > 0 ) {

\t\t\t\tframebuffer = renderTargetProperties.__webglMipmapFramebuffers[ 0 ];

\t\t\t}`,
      fileName,
      "WebGLRenderer asynchronous read framebuffer",
    );
    transformed = replaceOne(
      transformed,
      "@param {?number} [dstLevel=0] - The destination mipmap level.",
      "@param {number} [dstLevel=0] - The destination mipmap level.",
      fileName,
      "WebGLRenderer destination mipmap level",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tconst levelScale = Math.pow( 2, - level );\n\t\t\tconst width = Math.floor( texture.image.width * levelScale );\n\t\t\tconst height = Math.floor( texture.image.height * levelScale );",
      "\t\t\tconst framebufferTexture = /** @type {import('../textures/Texture.js').Texture} */ ( texture );\n\t\t\tconst framebufferImage = requireRendererTextureImageRecord( framebufferTexture.image );\n\t\t\tconst framebufferLevel = typeof level === 'number' ? level : 0;\n\t\t\tconst levelScale = Math.pow( 2, - framebufferLevel );\n\t\t\tconst width = Math.floor( framebufferImage.width * levelScale );\n\t\t\tconst height = Math.floor( framebufferImage.height * levelScale );",
      fileName,
      "WebGLRenderer framebuffer texture image dimensions",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\ttextures.setTexture2D( texture, 0 );\n\n\t\t\t_gl.copyTexSubImage2D( _gl.TEXTURE_2D, level, 0, 0, x, y, width, height );",
      "\t\t\ttextures.setTexture2D( framebufferTexture, 0 );\n\n\t\t\t_gl.copyTexSubImage2D( _gl.TEXTURE_2D, framebufferLevel, 0, 0, x, y, width, height );",
      fileName,
      "WebGLRenderer framebuffer base texture",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tconst image = srcTexture.isCompressedTexture ? srcTexture.mipmaps[ dstLevel ] : srcTexture.image;",
      `\t\t\tconst sourceLevel = resolveTextureLevel( srcLevel );
\t\t\tconst destinationLevel = resolveTextureLevel( dstLevel );
\t\t\tconst image = /** @type {{ data?: ${nativeTypedArrayType}, width?: number, height?: number, depth?: number }} */ ( srcTexture.isCompressedTexture ? srcTexture.mipmaps[ destinationLevel ] : srcTexture.image );
\t\t\tconst imageWidth = typeof image.width === 'number' ? image.width : 0;
\t\t\tconst imageHeight = typeof image.height === 'number' ? image.height : 0;
\t\t\tconst imageDepth = typeof image.depth === 'number' ? image.depth : 1;`,
      fileName,
      "WebGLRenderer copy texture image",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\t\t_gl.texSubImage3D( glTarget, dstLevel, dstX, dstY, dstZ, width, height, depth, glFormat, glType, image );",
      "\t\t\t\t\t\t_gl.texSubImage3D( glTarget, dstLevel, dstX, dstY, dstZ, width, height, depth, glFormat, glType, image.data );",
      fileName,
      "WebGLRenderer native 3D texture-copy data",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\t\t_gl.texSubImage2D( _gl.TEXTURE_2D, dstLevel, dstX, dstY, width, height, glFormat, glType, image );",
      "\t\t\t\t\t\t_gl.texSubImage2D( _gl.TEXTURE_2D, dstLevel, dstX, dstY, width, height, glFormat, glType, image.data );",
      fileName,
      "WebGLRenderer native 2D texture-copy data",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\t\twidth = srcRegion.max.x - srcRegion.min.x;
\t\t\t\theight = srcRegion.max.y - srcRegion.min.y;
\t\t\t\tdepth = srcRegion.isBox3 ? srcRegion.max.z - srcRegion.min.z : 1;
\t\t\t\tminX = srcRegion.min.x;
\t\t\t\tminY = srcRegion.min.y;
\t\t\t\tminZ = srcRegion.isBox3 ? srcRegion.min.z : 0;`,
      `\t\t\t\tconst regionMinX = requireTextureCoordinate( srcRegion.min.x );
\t\t\t\tconst regionMinY = requireTextureCoordinate( srcRegion.min.y );
\t\t\t\tconst regionMaxX = requireTextureCoordinate( srcRegion.max.x );
\t\t\t\tconst regionMaxY = requireTextureCoordinate( srcRegion.max.y );
\t\t\t\twidth = regionMaxX - regionMinX;
\t\t\t\theight = regionMaxY - regionMinY;
\t\t\t\tif ( srcRegion.isBox3 ) {

\t\t\t\t\tconst regionMinZ = requireTextureCoordinate( srcRegion.min.z );
\t\t\t\t\tconst regionMaxZ = requireTextureCoordinate( srcRegion.max.z );
\t\t\t\t\tdepth = regionMaxZ - regionMinZ;
\t\t\t\t\tminZ = regionMinZ;

\t\t\t\t} else {

\t\t\t\t\tdepth = 1;
\t\t\t\t\tminZ = 0;

\t\t\t\t}
\t\t\t\tminX = regionMinX;
\t\t\t\tminY = regionMinY;`,
      fileName,
      "WebGLRenderer numeric copy region",
    );
    transformed = transformed
      .replace(
        "width = Math.floor( image.width * levelScale );",
        "width = Math.floor( imageWidth * levelScale );",
      )
      .replace(
        "height = Math.floor( image.height * levelScale );",
        "height = Math.floor( imageHeight * levelScale );",
      )
      .replace("depth = image.depth;", "depth = imageDepth;")
      .replace(
        "depth = Math.floor( image.depth * levelScale );",
        "depth = Math.floor( imageDepth * levelScale );",
      )
      .replace(
        "state.pixelStorei( _gl.UNPACK_ROW_LENGTH, image.width );",
        "state.pixelStorei( _gl.UNPACK_ROW_LENGTH, imageWidth );",
      )
      .replace(
        "state.pixelStorei( _gl.UNPACK_IMAGE_HEIGHT, image.height );",
        "state.pixelStorei( _gl.UNPACK_IMAGE_HEIGHT, imageHeight );",
      )
      .replace(
        "image.width, image.height, glFormat, image.data );",
        "imageWidth, imageHeight, glFormat, image.data );",
      )
      .replace(
        "const levelScale = Math.pow( 2, - srcLevel );",
        "const levelScale = Math.pow( 2, - sourceLevel );",
      )
      .replaceAll(", srcLevel,", ", sourceLevel,")
      .replaceAll(", dstLevel,", ", destinationLevel,")
      .replace("srcLevel !== 0", "sourceLevel !== 0")
      .replace("if ( dstLevel === 0", "if ( destinationLevel === 0");
    for (const method of rendererReceiverMethods) {
      const before = `this.${method} = function (`;
      transformed = replaceOne(
        transformed,
        before,
        `this.${method} = /** @this {WebGLRenderer} */ function (`,
        fileName,
        `WebGLRenderer.${method} receiver`,
      );
    }
    transformed = replaceOne(
      transformed,
      "this.setAnimationLoop = function ( callback ) {",
      "this.setAnimationLoop = /** @param {((time: number) => void)|null} callback */ function ( callback ) {",
      fileName,
      "WebGLRenderer animation-loop callback",
    );
    transformed = replaceOne(
      transformed,
      "\t\tfunction onAnimationFrame( time ) {",
      "\t\t/** @param {number} time */\n\t\tfunction onAnimationFrame( time ) {",
      fileName,
      "WebGLRenderer animation-frame timestamp",
    );
    transformed = transformed.replaceAll(
      "_this.outputColorSpace",
      "_this.getOutputColorSpace()",
    );
    transformed = replaceOne(
      transformed,
      "this.renderBufferDirect = function ( camera, scene, geometry, material, object, group ) {",
      "/** @param {Object3D|null} scene @param {?{ start: number, count: number, materialIndex: (number|undefined) }} group */\n\t\tthis.renderBufferDirect = function ( camera, scene, geometry, material, object, group ) {",
      fileName,
      "WebGLRenderer nullable render group",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tconst vertexTangents = !! geometry.attributes.tangent && ( !! material.normalMap || material.anisotropy > 0 );",
      "\t\t\tconst anisotropy = material.anisotropy;\n\t\t\tconst vertexTangents = !! geometry.attributes.tangent && ( !! material.normalMap || ( typeof anisotropy === 'number' && anisotropy > 0 ) );",
      fileName,
      "WebGLRenderer numeric anisotropy",
    );
  }
  if (normalized.endsWith("/three/src/math/Euler.js")) {
    // Three spells the array `Array<number,number,number,?string>`, which is
    // not a type TypeScript can read: the extra arguments are dropped and the
    // fourth slot -- the ORDER STRING -- types as `number`. The emitter's
    // fail-closed field-store guard refused `this._order = array[ 3 ]` for
    // exactly that (a number into a string field); this states the element
    // type honestly and narrows the fourth slot before the store.
    transformed = replaceOne(
      transformed,
      "\t * @param {Array<number,number,number,?string>} array - An array holding the Euler component values.",
      "\t * @param {Array<number|string>} array - An array holding the Euler component values.",
      fileName,
      "Euler fromArray element type",
    );
    transformed = replaceOne(
      transformed,
      "\t\tthis._x = array[ 0 ];\n\t\tthis._y = array[ 1 ];\n\t\tthis._z = array[ 2 ];\n\t\tif ( array[ 3 ] !== undefined ) this._order = array[ 3 ];",
      "\t\tconst x = array[ 0 ];\n\t\tconst y = array[ 1 ];\n\t\tconst z = array[ 2 ];\n\t\tconst order = array[ 3 ];\n\t\tif ( typeof x === 'number' ) this._x = x;\n\t\tif ( typeof y === 'number' ) this._y = y;\n\t\tif ( typeof z === 'number' ) this._z = z;\n\t\tif ( typeof order === 'string' ) this._order = order;",
      fileName,
      "Euler fromArray narrowed stores",
    );
    transformed = replaceOne(
      transformed,
      "\t * @param {Array<number,number,number,string>} [array=[]] - The target array holding the Euler components.",
      "\t * @param {Array<number|string>} [array=[]] - The target array holding the Euler components.",
      fileName,
      "Euler toArray element type",
    );
    transformed = replaceOne(
      transformed,
      "\t * @return {Array<number,number,number,string>} The Euler components.",
      "\t * @return {Array<number|string>} The Euler components.",
      fileName,
      "Euler toArray return type",
    );
  }
  if (normalized.endsWith("/three/src/math/ColorManagement.js")) {
    transformed = replaceOne(
      transformed,
      "function createColorManagement() {",
      `/**
 * @typedef {{
 *   primaries: number[],
 *   whitePoint: number[],
 *   transfer: string,
 *   toXYZ: import('./Matrix3.js').Matrix3,
 *   fromXYZ: import('./Matrix3.js').Matrix3,
 *   luminanceCoefficients: number[],
 *   workingColorSpaceConfig?: { unpackColorSpace: string },
 *   outputColorSpaceConfig?: { drawingBufferColorSpace: string, toneMappingMode?: string }
 * }} NativeColorSpaceDefinition
 */
function createColorManagement() {`,
      fileName,
      "ColorManagement space definition",
    );
    transformed = replaceOne(
      transformed,
      "\t\tspaces: {},",
      "\t\tspaces: /** @type {Record<string, NativeColorSpaceDefinition>} */ ( {} ),",
      fileName,
      "ColorManagement typed space table",
    );
    transformed = replaceOne(
      transformed,
      "\tColorManagement.define( {",
      "\tColorManagement.define( /** @type {Record<string, NativeColorSpaceDefinition>} */ ( {",
      fileName,
      "ColorManagement typed built-in definitions",
    );
    transformed = replaceOne(
      transformed,
      "\n\t} );\n\n\treturn ColorManagement;",
      "\n\t} ) );\n\n\treturn ColorManagement;",
      fileName,
      "ColorManagement typed built-in definitions close",
    );
    const propertyFunction = /^(\s*)([A-Za-z_$][A-Za-z0-9_$]*): function \(/gm;
    const matches = transformed.match(propertyFunction)?.length ?? 0;
    if (matches !== 13)
      throw new Error(
        `Three ColorManagement source at ${fileName} has ${matches} function properties; expected 13`,
      );
    transformed = transformed.replace(propertyFunction, "$1$2( ");
    transformed = replaceOne(
      transformed,
      "getLuminanceCoefficients(  target, colorSpace = this.workingColorSpace ) {\n\n\t\t\treturn target.fromArray",
      "getLuminanceCoefficients(  target, colorSpace ) {\n\n\t\t\tif ( colorSpace === undefined ) colorSpace = this.workingColorSpace;\n\n\t\t\treturn target.fromArray",
      fileName,
      "ColorManagement luminance default",
    );
    transformed = replaceOne(
      transformed,
      "_getUnpackColorSpace(  colorSpace = this.workingColorSpace ) {\n\n\t\t\treturn this.spaces",
      "_getUnpackColorSpace(  colorSpace ) {\n\n\t\t\tif ( colorSpace === undefined ) colorSpace = this.workingColorSpace;\n\n\t\t\treturn this.spaces",
      fileName,
      "ColorManagement unpack default",
    );
    for (const name of [
      "getToneMappingMode",
      "getLuminanceCoefficients",
      "_getDrawingBufferColorSpace",
      "_getUnpackColorSpace",
    ]) {
      transformed = replaceOne(
        transformed,
        `\t\t${name}( `,
        `\t\t/** @param {string|undefined} colorSpace */\n\t\t${name}( `,
        fileName,
        `ColorManagement.${name} color-space key`,
      );
    }
    for (const name of ["getToneMappingMode", "_getDrawingBufferColorSpace"]) {
      transformed = transformed.replace(
        `/** @param {string|undefined} colorSpace */\n\t\t${name}( `,
        `/** @param {string} colorSpace */\n\t\t${name}( `,
      );
    }
  }
  if (normalized.endsWith("/three/src/math/MathUtils.js")) {
    const replacements = new Map([
      [
        "denormalize",
        [
          "\tif ( array instanceof Float32Array ) return value;",
          "\tif ( array instanceof Uint32Array ) return value / 4294967295.0;",
          "\tif ( array instanceof Uint16Array ) return value / 65535.0;",
          "\tif ( array instanceof Uint8Array ) return value / 255.0;",
          "\tif ( array instanceof Int32Array ) return Math.max( value / 2147483647.0, - 1.0 );",
          "\tif ( array instanceof Int16Array ) return Math.max( value / 32767.0, - 1.0 );",
          "\tif ( array instanceof Int8Array ) return Math.max( value / 127.0, - 1.0 );",
        ],
      ],
      [
        "normalize",
        [
          "\tif ( array instanceof Float32Array ) return value;",
          "\tif ( array instanceof Uint32Array ) return Math.round( value * 4294967295.0 );",
          "\tif ( array instanceof Uint16Array ) return Math.round( value * 65535.0 );",
          "\tif ( array instanceof Uint8Array ) return Math.round( value * 255.0 );",
          "\tif ( array instanceof Int32Array ) return Math.round( value * 2147483647.0 );",
          "\tif ( array instanceof Int16Array ) return Math.round( value * 32767.0 );",
          "\tif ( array instanceof Int8Array ) return Math.round( value * 127.0 );",
        ],
      ],
    ]);
    for (const [name, cases] of replacements) {
      const start = `function ${name}( value, array ) {`;
      const startIndex = transformed.indexOf(start);
      const endIndex = transformed.indexOf("\n}\n", startIndex);
      if (startIndex < 0 || endIndex < 0)
        throw new Error(
          `Three MathUtils.${name} source at ${fileName} no longer matches the native adaptation`,
        );
      transformed =
        transformed.slice(0, startIndex) +
        `${start}\n\n${cases.join("\n")}\n\n\tthrow new Error( 'THREE.MathUtils: Invalid component type.' );\n` +
        transformed.slice(endIndex);
    }
  }
  if (normalized.endsWith("/three/src/math/Quaternion.js")) {
    transformed = replaceOne(
      transformed,
      "@param {Matrix4} m - A 4x4 matrix of which the upper 3x3 of matrix is a pure rotation matrix (i.e. unscaled).",
      "@param {import('./Matrix4.js').Matrix4} m - A 4x4 matrix of which the upper 3x3 of matrix is a pure rotation matrix (i.e. unscaled).",
      fileName,
      "Quaternion rotation-matrix parameter",
    );
  }
  if (normalized.endsWith("/three/src/math/Vector3.js")) {
    transformed = replaceOne(
      transformed,
      "@param {Matrix4} m - The matrix to apply.",
      "@param {import('./Matrix4.js').Matrix4} m - The matrix to apply.",
      fileName,
      "Vector3 matrix parameter",
    );
    transformed = replaceOne(
      transformed,
      "@param {Vector3|Vector4} v - The vector.",
      "@param {{ x: number, y: number, z: number }} v - The vector.",
      fileName,
      "Vector3 scaled-vector components",
    );
    transformed = replaceOne(
      transformed,
      "@param {Array<number>} [array=[]] - The target array holding the vector components.\n\t * @param {number} [offset=0] - Index of the first element in the array.\n\t * @return {Array<number>} The vector components.",
      "@param {Array<number>|Float32Array} [array=[]] - The target array holding the vector components.\n\t * @param {number} [offset=0] - Index of the first element in the array.\n\t * @return {Array<number>|Float32Array} The vector components.",
      fileName,
      "Vector3.toArray native output",
    );
    transformed = replaceOne(
      transformed,
      "\ttoArray( array = [], offset = 0 ) {",
      "\ttoArray( array = /** @type {number[]} */ ( [] ), offset = 0 ) {",
      fileName,
      "Vector3.toArray default output",
    );
  }
  if (normalized.endsWith("/three/src/core/BufferGeometry.js")) {
    transformed = replaceOne(
      transformed,
      "import { BufferAttribute, Float32BufferAttribute, Uint16BufferAttribute, Uint32BufferAttribute } from './BufferAttribute.js';",
      "import { BufferAttribute, Float32BufferAttribute, Uint16BufferAttribute, Uint32BufferAttribute } from './BufferAttribute.js';\nimport { InterleavedBufferAttribute } from './InterleavedBufferAttribute.js';",
      fileName,
      "BufferGeometry interleaved attribute import",
    );
    transformed = replaceOne(
      transformed,
      "class BufferGeometry extends EventDispatcher {",
      `${nativeTypedArrayFactory("createTypedArrayWithLength", "number")}

/** @param {BufferAttribute|InterleavedBufferAttribute} attribute @param {number} index @param {number} x @param {number} y @param {number} z */
function setNativeAttributeXYZ( attribute, index, x, y, z ) {

\tif ( attribute instanceof InterleavedBufferAttribute ) {

\t\tattribute.setXYZ( index, x, y, z );
\t\treturn;

\t}

\tattribute.setXYZ( index, x, y, z );

}

class BufferGeometry extends EventDispatcher {`,
      fileName,
      "BufferGeometry typed-array factory",
    );
    for (const attributeName of [
      "positionAttribute",
      "normalAttribute",
      "normals",
    ]) {
      transformed = transformed.replaceAll(
        `${attributeName}.setXYZ( `,
        `setNativeAttributeXYZ( ${attributeName}, `,
      );
    }
    transformed = replaceOne(
      transformed,
      "\t\t\tconst array2 = new array.constructor( indices.length * itemSize );",
      "\t\t\tconst array2 = createTypedArrayWithLength( array, indices.length * itemSize );",
      fileName,
      "BufferGeometry typed-array allocation",
    );
    transformed = replaceOne(
      transformed,
      "\t\t * @type {Object}\n\t\t */\n\t\tthis.morphAttributes = {};",
      "\t\t * @type {Record<string, Array<import('./BufferAttribute.js').BufferAttribute|import('./InterleavedBufferAttribute.js').InterleavedBufferAttribute>|undefined>}\n\t\t */\n\t\tthis.morphAttributes = {};",
      fileName,
      "BufferGeometry morph-attribute table",
    );
    transformed = replaceOne(
      transformed,
      `\tgetAttribute( name ) {

\t\treturn this.attributes[ name ];

\t}`,
      `\tgetAttribute( name ) {

\t\tif ( this.hasAttribute( name ) ) return this.attributes[ name ];

\t\treturn undefined;

\t}`,
      fileName,
      "BufferGeometry missing attribute result",
    );
    transformed = replaceOne(
      transformed,
      "\t\treturn this.attributes[ name ] !== undefined;",
      "\t\treturn name in this.attributes;",
      fileName,
      "BufferGeometry attribute membership",
    );
    for (const attributeName of ["position", "normal", "tangent"]) {
      transformed = replaceOne(
        transformed,
        `\t\tconst ${attributeName} = this.attributes.${attributeName};

\t\tif ( ${attributeName} !== undefined ) {`,
        `\t\tif ( '${attributeName}' in this.attributes ) {

\t\t\tconst ${attributeName} = this.attributes.${attributeName};`,
        fileName,
        `BufferGeometry applyMatrix4 ${attributeName} membership`,
      );
    }
    const rawPositionArray = "\t\t\tconst position = [];";
    const numericPositionArray =
      "\t\t\t/** @type {number[]} */\n\t\t\tconst position = [];";
    if (
      transformed.includes(rawPositionArray) &&
      !transformed.includes(numericPositionArray)
    ) {
      transformed = replaceOne(
        transformed,
        rawPositionArray,
        numericPositionArray,
        fileName,
        "BufferGeometry setFromPoints numeric position array",
      );
    } else if (!transformed.includes(numericPositionArray)) {
      throw new Error(
        `Three BufferGeometry setFromPoints numeric position array source at ${fileName} no longer matches the native adaptation`,
      );
    }
  }
  if (normalized.endsWith("/three/src/core/InterleavedBuffer.js")) {
    transformed = replaceOne(
      transformed,
      "\tclone( data ) {",
      "\t/** @param {{ arrayBuffers?: Record<string, ArrayBuffer> }} data */\n\tclone( data ) {",
      fileName,
      "InterleavedBuffer shared native clone buffers",
    );
    transformed = replaceOne(
      transformed,
      "class InterleavedBuffer {",
      `${nativeTypedArrayFactory("createTypedArrayFromBuffer", "ArrayBuffer")}\n\nclass InterleavedBuffer {`,
      fileName,
      "InterleavedBuffer typed-array factory",
    );
    transformed = replaceOne(
      transformed,
      "\t\tconst array = new this.array.constructor( data.arrayBuffers[ this.array.buffer._uuid ] );",
      "\t\tconst sharedBuffer = data.arrayBuffers[ this.array.buffer._uuid ];\n\t\tconst array = createTypedArrayFromBuffer( this.array, sharedBuffer );",
      fileName,
      "InterleavedBuffer typed-array clone",
    );
  }
  if (normalized.endsWith("/three/src/core/InterleavedBufferAttribute.js")) {
    transformed = replaceOne(
      transformed,
      "\t\t * @type {InterleavedBuffer}\n\t\t */\n\t\tthis.normalized = normalized;",
      "\t\t * @type {boolean}\n\t\t */\n\t\tthis.normalized = normalized;",
      fileName,
      "InterleavedBufferAttribute normalized field type",
    );
    transformed = replaceOne(
      transformed,
      "\tclone( data ) {",
      "\t/** @param {{ interleavedBuffers?: Record<string, import('./InterleavedBuffer.js').InterleavedBuffer>, arrayBuffers?: Record<string, ArrayBuffer> }|undefined} data */\n\tclone( data ) {",
      fileName,
      "InterleavedBufferAttribute exact clone cache",
    );
    transformed = replaceOne(
      transformed,
      "class InterleavedBufferAttribute {",
      `${nativeTypedArrayFactory("createTypedArrayFromValues", "number[]")}\n\nclass InterleavedBufferAttribute {`,
      fileName,
      "InterleavedBufferAttribute typed-array factory",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tconst array = [];",
      "\t\t\t/** @type {number[]} */\n\t\t\tconst array = [];",
      fileName,
      "InterleavedBufferAttribute clone values",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\treturn new BufferAttribute( new this.array.constructor( array ), this.itemSize, this.normalized );",
      "\t\t\tconst clonedAttribute = new BufferAttribute( createTypedArrayFromValues( this.array, array ), this.itemSize );\n\t\t\tclonedAttribute.normalized = this.normalized;\n\t\t\treturn clonedAttribute;",
      fileName,
      "InterleavedBufferAttribute typed-array clone",
    );
    const vectorRead = "\t\t\t_vector.fromBufferAttribute( this, i );";
    const vectorReadCount = transformed.split(vectorRead).length - 1;
    if (vectorReadCount !== 3) {
      throw new Error(
        `Three InterleavedBufferAttribute source at ${fileName} has ${vectorReadCount} vector reads; expected 3`,
      );
    }
    transformed = transformed.replaceAll(
      vectorRead,
      "\t\t\t_vector.set( this.getX( i ), this.getY( i ), this.getZ( i ) );",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\treturn new InterleavedBufferAttribute( data.interleavedBuffers[ this.data.uuid ], this.itemSize, this.offset, this.normalized );",
      "\t\t\tconst clonedAttribute = new InterleavedBufferAttribute( data.interleavedBuffers[ this.data.uuid ], this.itemSize, this.offset );\n\t\t\tclonedAttribute.normalized = this.normalized;\n\t\t\treturn clonedAttribute;",
      fileName,
      "InterleavedBufferAttribute interleaved clone",
    );
  }
  if (normalized.endsWith("/three/src/core/EventDispatcher.js")) {
    transformed = replaceOne(
      transformed,
      "class EventDispatcher {",
      "/** @typedef {{ type: string, target?: EventDispatcher|null }} NativeEvent */\n/** @typedef {(this: EventDispatcher, event: NativeEvent) => void} NativeEventListener */\nclass EventDispatcher {",
      fileName,
      "EventDispatcher listener callable type",
    );
    for (const name of [
      "addEventListener",
      "hasEventListener",
      "removeEventListener",
    ]) {
      transformed = replaceOne(
        transformed,
        `\t${name}( type, listener ) {`,
        `\t/** @param {string} type @param {NativeEventListener} listener */\n\t${name}( type, listener ) {`,
        fileName,
        `EventDispatcher.${name} listener input`,
      );
    }
    transformed = replaceOne(
      transformed,
      "class EventDispatcher {",
      "class EventDispatcher {\n\n\t/** @type {Map<string, NativeEventListener[]>} */\n\t_listeners = new ( /** @type {new () => Map<string, NativeEventListener[]>} */ ( Map ) )();",
      fileName,
      "EventDispatcher listener field",
    );
    transformed = replaceOne(
      transformed,
      "\t\tif ( this._listeners === undefined ) this._listeners = {};",
      "",
      fileName,
      "EventDispatcher eager listener map",
    );
    transformed = replaceOne(
      transformed,
      "\t\tif ( listeners[ type ] === undefined ) {\n\n\t\t\tlisteners[ type ] = [];\n\n\t\t}\n\n\t\tif ( listeners[ type ].indexOf( listener ) === - 1 ) {\n\n\t\t\tlisteners[ type ].push( listener );",
      "\t\tlet listenerArray = listeners.get( type );\n\n\t\tif ( listenerArray === undefined ) {\n\n\t\t\tlistenerArray = /** @type {NativeEventListener[]} */ ( [] );\n\t\t\tlisteners.set( type, listenerArray );\n\n\t\t}\n\n\t\tif ( listenerArray.indexOf( listener ) === - 1 ) {\n\n\t\t\tlistenerArray.push( listener );",
      fileName,
      "EventDispatcher listener insertion",
    );
    transformed = replaceOne(
      transformed,
      "\t\treturn listeners[ type ] !== undefined && listeners[ type ].indexOf( listener ) !== - 1;",
      "\t\tconst listenerArray = listeners.get( type );\n\n\t\treturn listenerArray !== undefined && listenerArray.indexOf( listener ) !== - 1;",
      fileName,
      "EventDispatcher listener query",
    );
    transformed = transformed.replaceAll(
      "const listenerArray = listeners[ type ];",
      "const listenerArray = listeners.get( type );",
    );
    const absentListenerGuard = "\t\tif ( listeners === undefined ) return;";
    const absentListenerGuardCount =
      transformed.split(absentListenerGuard).length - 1;
    if (absentListenerGuardCount !== 2) {
      throw new Error(
        `Three EventDispatcher source at ${fileName} has ${absentListenerGuardCount} absent listener guards; expected 2`,
      );
    }
    transformed = transformed.replaceAll(`${absentListenerGuard}\n\n`, "");
    transformed = replaceOne(
      transformed,
      "\t\tif ( listeners === undefined ) return false;\n\n",
      "",
      fileName,
      "EventDispatcher present query map",
    );
    transformed = replaceOne(
      transformed,
      "\t\tconst listenerArray = listeners[ event.type ];",
      "\t\tconst listenerArray = listeners.get( event.type );",
      fileName,
      "EventDispatcher dispatch lookup",
    );
    transformed = replaceOne(
      transformed,
      "\tdispatchEvent( event ) {",
      "\t/** @param {NativeEvent} event */\n\tdispatchEvent( event ) {",
      fileName,
      "EventDispatcher exact event target",
    );
  }
  if (normalized.endsWith("/three/src/renderers/shaders/ShaderLib.js")) {
    const shaderNames = [
      "basic",
      "lambert",
      "phong",
      "standard",
      "toon",
      "matcap",
      "points",
      "dashed",
      "depth",
      "normal",
      "sprite",
      "background",
      "backgroundCube",
      "cube",
      "equirect",
      "distance",
      "shadow",
      "physical",
    ];
    const shaderLibraryType = `/** @typedef {{ uniforms: import('./UniformsLib.js').NativeUniforms, vertexShader: string, fragmentShader: string }} NativeShaderDescription
 * @typedef {{
${shaderNames.map((name) => ` *   ${name}: NativeShaderDescription,`).join("\n")}
 * }} NativeShaderLibrary
 */`;
    transformed = replaceOne(
      transformed,
      "const ShaderLib = {",
      `${shaderLibraryType}\n/** @type {NativeShaderLibrary} */\nconst ShaderLib = {`,
      fileName,
      "ShaderLib declared physical shader record",
    );
  }
  if (
    normalized.endsWith("/three/src/cameras/OrthographicCamera.js") ||
    normalized.endsWith("/three/src/cameras/PerspectiveCamera.js")
  ) {
    transformed = replaceOne(
      transformed,
      "\t\t * @type {?Object}\n\t\t * @default null\n\t\t */\n\t\tthis.view = null;",
      "\t\t * @type {?{ enabled: boolean, fullWidth: number, fullHeight: number, offsetX: number, offsetY: number, width: number, height: number }}\n\t\t * @default null\n\t\t */\n\t\tthis.view = null;",
      fileName,
      "camera numeric view specification",
    );
    for (const receiver of ["source.view", "this.view"]) {
      const viewCopy = `{ enabled: ${receiver}.enabled, fullWidth: ${receiver}.fullWidth, fullHeight: ${receiver}.fullHeight, offsetX: ${receiver}.offsetX, offsetY: ${receiver}.offsetY, width: ${receiver}.width, height: ${receiver}.height }`;
      transformed = replaceOne(
        transformed,
        `Object.assign( {}, ${receiver} )`,
        viewCopy,
        fileName,
        `camera ${receiver} copy`,
      );
    }
  }
  if (normalized.endsWith("/three/src/core/RenderTarget.js")) {
    transformed = replaceOne(
      transformed,
      "\tconstructor( width = 1, height = 1, options = {} ) {\n\n\t\tsuper();",
      "\tconstructor( width = 1, height = 1, options = {} ) {\n\n\t\tif ( width === undefined ) width = 1;\n\t\tif ( height === undefined ) height = 1;\n\n\t\tsuper();",
      fileName,
      "RenderTarget numeric dimensions",
    );
    transformed = replaceOne(
      transformed,
      "\t\tconst image = { width: width, height: height, depth: options.depth };",
      "\t\tconst image = /** @type {import('../textures/Texture.js').Texture['image']} */ ( { width: width, height: height, depth: options.depth } );",
      fileName,
      "RenderTarget texture image",
    );
    transformed = replaceOne(
      transformed,
      "\t\tconst count = options.count;",
      "\t\tconst count = typeof options.count === 'number' ? options.count : 1;",
      fileName,
      "RenderTarget attachment count",
    );
    transformed = replaceOne(
      transformed,
      `\t\tfor ( let i = 0; i < count; i ++ ) {

\t\t\tthis.textures[ i ] = texture.clone();
\t\t\tthis.textures[ i ].isRenderTargetTexture = true;
\t\t\tthis.textures[ i ].renderTarget = this;

\t\t}

\t\tthis._setTextureOptions( options );`,
      `\t\tfor ( let i = 0; i < count; i ++ ) {

\t\t\tthis.textures[ i ] = texture.clone();
\t\t\tthis.textures[ i ].isRenderTargetTexture = true;
\t\t\tthis.textures[ i ].renderTarget = this;

\t\t}

\t\t/** @type {Texture} */
\t\tthis.texture = this.textures[ 0 ];

\t\tthis._setTextureOptions( options );`,
      fileName,
      "RenderTarget concrete texture storage",
    );
    transformed = replaceOne(
      transformed,
      `\t/**
\t * The texture representing the default color attachment.
\t *
\t * @type {Texture}
\t */
\tget texture() {

\t\treturn this.textures[ 0 ];

\t}

\tset texture( value ) {

\t\tthis.textures[ 0 ] = value;

\t}

`,
      `\t/** @type {Texture} */
\ttexture;

`,
      fileName,
      "RenderTarget obsolete texture accessor",
    );
    transformed = replaceOne(
      transformed,
      "\t\tthis._depthTexture = null;\n\t\tthis.depthTexture = options.depthTexture;",
      "\t\t/** @type {Texture|null} */\n\t\tthis.depthTexture = null;\n\t\tthis.setDepthTexture( /** @type {Texture|null} */ ( options.depthTexture ) );",
      fileName,
      "RenderTarget depth texture storage",
    );
    transformed = replaceOne(
      transformed,
      "\tset depthTexture( current ) {",
      "\t/** @param {Texture|null} current */\n\tsetDepthTexture( current ) {",
      fileName,
      "RenderTarget depth texture setter",
    );
    transformed = replaceOne(
      transformed,
      "\t\tif ( this._depthTexture !== null ) this._depthTexture.renderTarget = null;\n\t\tif ( current !== null ) current.renderTarget = this;\n\n\t\tthis._depthTexture = current;",
      "\t\tif ( this.depthTexture !== null ) this.depthTexture.renderTarget = null;\n\t\tif ( current !== null ) current.renderTarget = this;\n\n\t\tthis.depthTexture = current;",
      fileName,
      "RenderTarget depth texture update",
    );
    transformed = replaceOne(
      transformed,
      `	/**
	 * Instead of saving the depth in a renderbuffer, a texture
	 * can be used instead which is useful for further processing
	 * e.g. in context of post-processing.
	 *
	 * @type {?DepthTexture}
	 * @default null
	 */
	get depthTexture() {

		return this._depthTexture;

	}

`,
      "",
      fileName,
      "RenderTarget obsolete depth texture getter",
    );
    transformed = replaceOne(
      transformed,
      "\t\tif ( source.depthTexture !== null ) this.depthTexture = source.depthTexture.clone();",
      "\t\tif ( source.depthTexture !== null ) this.setDepthTexture( source.depthTexture.clone() );",
      fileName,
      "RenderTarget copied depth texture update",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tconst image = Object.assign( {}, source.textures[ i ].image );",
      `\t\t\tconst sourceImage = source.textures[ i ].image;

\t\t\tif ( sourceImage === null || Array.isArray( sourceImage ) ) throw new Error( 'THREE.RenderTarget.copy: texture image must be a record.' );

\t\t\tconst image = /** @type {import('../textures/Texture.js').Texture['image']} */ ( { width: sourceImage.width, height: sourceImage.height, depth: sourceImage.depth } );`,
      fileName,
      "RenderTarget image copy",
    );
    transformed = replaceOne(
      transformed,
      "\t\t}\n\n\t\tthis.depthBuffer = source.depthBuffer;",
      "\t\t}\n\n\t\tthis.texture = this.textures[ 0 ];\n\n\t\tthis.depthBuffer = source.depthBuffer;",
      fileName,
      "RenderTarget copied texture storage",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tthis.textures[ i ].image.width = width;\n\t\t\t\tthis.textures[ i ].image.height = height;\n\t\t\t\tthis.textures[ i ].image.depth = depth;",
      `\t\t\t\tconst textureImage = this.textures[ i ].image;

\t\t\t\tif ( textureImage === null || Array.isArray( textureImage ) ) throw new Error( 'THREE.RenderTarget.setSize: texture image must be a record.' );

\t\t\t\ttextureImage.width = width;
\t\t\t\ttextureImage.height = height;
\t\t\t\ttextureImage.depth = depth;`,
      fileName,
      "RenderTarget exact mutable texture image",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\tthis.textures[ i ].isArrayTexture = this.textures[ i ].image.depth > 1;",
      "\t\t\t\t\tconst imageDepth = textureImage.depth;\n\t\t\t\t\tthis.textures[ i ].isArrayTexture = typeof imageDepth === 'number' && imageDepth > 1;",
      fileName,
      "RenderTarget numeric image depth",
    );
  }
  if (normalized.endsWith("/three/src/renderers/WebGLRenderTarget.js")) {
    const nativeOptionsAnnotation =
      "@param {{ generateMipmaps?: boolean, magFilter?: number, minFilter?: number, format?: number, type?: number, internalFormat?: string|null, wrapS?: number, wrapT?: number, anisotropy?: number, colorSpace?: string, depthBuffer?: boolean, stencilBuffer?: boolean, resolveDepthBuffer?: boolean, resolveStencilBuffer?: boolean, depthTexture?: import('../textures/Texture.js').Texture|null, samples?: number, count?: number, depth?: number, multiview?: boolean, useArrayDepthTexture?: boolean }} [options] - The configuration object.";
    if (!transformed.includes(nativeOptionsAnnotation)) {
      const upstreamOptionsAnnotation = transformed.includes(
        "@param {RenderTarget~Options} [options] - The configuration object.",
      )
        ? "@param {RenderTarget~Options} [options] - The configuration object."
        : "@param {RenderTarget_Options} [options] - The configuration object.";
      transformed = replaceOne(
        transformed,
        upstreamOptionsAnnotation,
        nativeOptionsAnnotation,
        fileName,
        "WebGLRenderTarget native options carrier",
      );
    }
  }
  if (normalized.endsWith("/three/src/cameras/CubeCamera.js")) {
    transformed = replaceOne(
      transformed,
      "@param {Scene} scene - The scene to render.",
      "@param {import('../core/Object3D.js').Object3D} scene - The scene graph root to render.",
      fileName,
      "CubeCamera render root input",
    );
    transformed = transformed.replaceAll(
      "renderer.coordinateSystem",
      "renderer.getCoordinateSystem()",
    );
  }
  if (normalized.endsWith("/three/src/objects/LOD.js")) {
    // A level literal's key order is its enumeration order, so the record it
    // allocates is a different layout from the `{object,distance,hysteresis}`
    // element the `levels` field declares; nothing enumerates a level, so the
    // literal spells the declared order.
    transformed = replaceOne(
      transformed,
      "\t\tlevels.splice( l, 0, { distance: distance, hysteresis: hysteresis, object: object } );",
      "\t\tlevels.splice( l, 0, { object: object, distance: distance, hysteresis: hysteresis } );",
      fileName,
      "LOD level record order",
    );
    // `zoom` lives on the two projecting cameras, not on `Camera`.
    transformed = replaceOne(
      transformed,
      "\t\t\tconst distance = _v1.distanceTo( _v2 ) / camera.zoom;",
      "\t\t\tconst distance = _v1.distanceTo( _v2 ) / /** @type {import('../cameras/PerspectiveCamera.js').PerspectiveCamera|import('../cameras/OrthographicCamera.js').OrthographicCamera} */ ( camera ).zoom;",
      fileName,
      "LOD projecting camera zoom",
    );
  }
  if (normalized.endsWith("/three/src/renderers/WebGLRenderer.js")) {
    // `isLOD` is a tag on `LOD` alone, so testing it on an `Object3D` leaves
    // `object.update( camera )` a dynamic call; the class test narrows.
    transformed = replaceOne(
      transformed,
      "import { Frustum } from '../math/Frustum.js';",
      "import { Frustum } from '../math/Frustum.js';\nimport { LOD } from '../objects/LOD.js';",
      fileName,
      "WebGLRenderer LOD import",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t} else if ( object.isLOD ) {\n\n\t\t\t\t\tif ( object.autoUpdate === true ) object.update( camera );",
      "\t\t\t\t} else if ( object instanceof LOD ) {\n\n\t\t\t\t\tif ( object.autoUpdate === true ) object.update( camera );",
      fileName,
      "WebGLRenderer LOD traversal narrowing",
    );
    // `updateProjectionMatrix` lives on the two projecting cameras, not on
    // `Camera`; the reversed-depth path calls it through the base.
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\tcamera._reversedDepth = true;\n\t\t\t\t\tcamera.updateProjectionMatrix();",
      "\t\t\t\t\tcamera._reversedDepth = true;\n\t\t\t\t\t/** @type {import('../cameras/PerspectiveCamera.js').PerspectiveCamera|import('../cameras/OrthographicCamera.js').OrthographicCamera} */ ( camera ).updateProjectionMatrix();",
      fileName,
      "WebGLRenderer projection camera update cast",
    );
  }
  if (normalized.endsWith("/three/src/lights/Light.js")) {
    // `shadow` is written only by the subclasses that cast one
    // (`DirectionalLight`, `PointLight`, `SpotLight`), so the base class the
    // renderer reads it through declares no such field and every
    // `light.shadow` off a `Light` is `any`: the shadow map's `shadow` local
    // was a box, and its first `shadow.getFrameExtents()` threw. Declared
    // here as the family's common carrier; each subclass's own write narrows
    // it within this statement.
    transformed = replaceOne(
      transformed,
      "\t\tthis.type = 'Light';",
      "\t\tthis.type = 'Light';\n\n\t\t/**\n\t\t * The shadow configuration a shadow-casting subclass installs.\n\t\t * @type {import('./LightShadow.js').LightShadow|null}\n\t\t */\n\t\tthis.shadow = null;",
      fileName,
      "Light shadow field",
    );
  }
  if (normalized.endsWith("/three/src/lights/LightShadow.js")) {
    transformed = replaceOne(
      transformed,
      "@return {LightShadow} A clone of this instance.\n\t */\n\tclone()",
      "@return {this} A clone of this instance.\n\t */\n\tclone()",
      fileName,
      "LightShadow subtype-preserving clone result",
    );
    transformed = replaceOne(
      transformed,
      "@param {Light} light - The light for which the shadow is being rendered.",
      "@param {import('./DirectionalLight.js').DirectionalLight|import('./SpotLight.js').SpotLight} light - The light for which the shadow is being rendered.",
      fileName,
      "LightShadow targeted light input",
    );
  }
  if (normalized.endsWith("/three/src/lights/SpotLightShadow.js")) {
    transformed = replaceOne(
      transformed,
      "import { LightShadow } from './LightShadow.js';",
      "import { LightShadow } from './LightShadow.js';\nimport { SpotLight } from './SpotLight.js';",
      fileName,
      "SpotLightShadow light type import",
    );
    transformed = replaceOne(
      transformed,
      "\tupdateMatrices( light ) {",
      "\t/** @param {SpotLight} light */\n\tupdateMatrices( light ) {",
      fileName,
      "SpotLightShadow numeric light input",
    );
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLLights.js")) {
    transformed = replaceOne(
      transformed,
      "import { RGFormat } from '../../constants.js';",
      "import { RGFormat } from '../../constants.js';\nimport { SpotLight } from '../../lights/SpotLight.js';\nimport { RectAreaLight } from '../../lights/RectAreaLight.js';",
      fileName,
      "WebGLLights numeric light class imports",
    );
    const spotLightBranchCount =
      transformed.split("} else if ( light.isSpotLight ) {").length - 1;
    if (spotLightBranchCount !== 2) {
      throw new Error(
        `Three WebGLLights source at ${fileName} has ${spotLightBranchCount} spot-light branches; expected 2`,
      );
    }
    transformed = transformed.replaceAll(
      "} else if ( light.isSpotLight ) {",
      "} else if ( light instanceof SpotLight ) {",
    );
    const rectAreaLightBranchCount =
      transformed.split("} else if ( light.isRectAreaLight ) {").length - 1;
    if (rectAreaLightBranchCount !== 2) {
      throw new Error(
        `Three WebGLLights source at ${fileName} has ${rectAreaLightBranchCount} rect-area-light branches; expected 2`,
      );
    }
    transformed = transformed.replaceAll(
      "} else if ( light.isRectAreaLight ) {",
      "} else if ( light instanceof RectAreaLight ) {",
    );
    transformed = replaceOne(
      transformed,
      "import { UniformsLib } from '../shaders/UniformsLib.js';",
      "import {\n\tUniformsLib,\n\tNativeDirectionalLightUniform,\n\tNativeSpotLightUniform,\n\tNativePointLightUniform,\n\tNativeHemisphereLightUniform,\n\tNativeRectAreaLightUniform,\n\tNativeShadowUniform,\n\tNativePointShadowUniform,\n} from '../shaders/UniformsLib.js';",
      fileName,
      "WebGLLights light uniform classes",
    );
    const lightCacheStart = transformed.indexOf("function UniformsCache() {");
    const lightCacheEnd = transformed.indexOf("let nextVersion = 0;");
    if (lightCacheStart < 0 || lightCacheEnd < lightCacheStart) {
      throw new Error(
        `Three WebGLLights source at ${fileName} no longer declares its uniform caches ahead of nextVersion`,
      );
    }
    transformed = `${transformed.slice(0, lightCacheStart)}${nativeLightUniformCaches}\n${transformed.slice(lightCacheEnd)}`;
    transformed = replaceOne(
      transformed,
      "\tconst cache = new UniformsCache();",
      "\tconst cache = UniformsCache();",
      fileName,
      "WebGLLights uniform cache construction",
    );
    transformed = replaceOne(
      transformed,
      "\t\tambient: [ 0, 0, 0 ],\n\t\tprobe: [],\n\t\tdirectional: [],\n\t\tdirectionalShadow: [],",
      "\t\tambient: [ 0, 0, 0 ],\n\t\tprobe: /** @type {Array<import('../../math/Vector3.js').Vector3>} */ ( [] ),\n\t\tdirectional: /** @type {NativeDirectionalLightUniform[]} */ ( [] ),\n\t\tdirectionalShadow: /** @type {NativeShadowUniform[]} */ ( [] ),",
      fileName,
      "WebGLLights typed probe, directional, and directional-shadow arrays",
    );
    transformed = replaceOne(
      transformed,
      "\t\tspotShadow: [],",
      "\t\tspotShadow: /** @type {NativeShadowUniform[]} */ ( [] ),",
      fileName,
      "WebGLLights typed spot-shadow array",
    );
    for (const [field, type, label] of [
      [
        "directionalShadowMap",
        "Array<import('../../textures/Texture.js').Texture|null>",
        "directional shadow maps",
      ],
      [
        "directionalShadowMatrix",
        "Array<import('../../math/Matrix4.js').Matrix4>",
        "directional shadow matrices",
      ],
      [
        "spotLightMap",
        "Array<import('../../textures/Texture.js').Texture|null>",
        "spot-light maps",
      ],
      [
        "spotShadowMap",
        "Array<import('../../textures/Texture.js').Texture|null>",
        "spot shadow maps",
      ],
      [
        "spotLightMatrix",
        "Array<import('../../math/Matrix4.js').Matrix4>",
        "spot-light matrices",
      ],
      [
        "pointShadowMap",
        "Array<import('../../textures/Texture.js').Texture|null>",
        "point shadow maps",
      ],
      [
        "pointShadowMatrix",
        "Array<import('../../math/Matrix4.js').Matrix4>",
        "point shadow matrices",
      ],
    ]) {
      transformed = replaceOne(
        transformed,
        `\t\t${field}: [],`,
        `\t\t${field}: /** @type {${type}} */ ( [] ),`,
        fileName,
        `WebGLLights ${label} storage`,
      );
    }
    for (const [source, replacement, label] of [
      [
        "\t\tspot: [],",
        "\t\tspot: /** @type {NativeSpotLightUniform[]} */ ( [] ),",
        "spot",
      ],
      [
        "\t\trectArea: [],",
        "\t\trectArea: /** @type {NativeRectAreaLightUniform[]} */ ( [] ),",
        "rect-area",
      ],
      // Written from UniformsLib's LTC slots, which are nullable textures.
      [
        "\t\trectAreaLTC1: null,",
        "\t\trectAreaLTC1: /** @type {import('../../textures/Texture.js').Texture|null} */ ( null ),",
        "rect-area-ltc1",
      ],
      [
        "\t\trectAreaLTC2: null,",
        "\t\trectAreaLTC2: /** @type {import('../../textures/Texture.js').Texture|null} */ ( null ),",
        "rect-area-ltc2",
      ],
      [
        "\t\tpoint: [],",
        "\t\tpoint: /** @type {NativePointLightUniform[]} */ ( [] ),",
        "point",
      ],
      [
        "\t\tpointShadow: [],",
        "\t\tpointShadow: /** @type {NativePointShadowUniform[]} */ ( [] ),",
        "point-shadow",
      ],
      [
        "\t\themi: [],",
        "\t\themi: /** @type {NativeHemisphereLightUniform[]} */ ( [] ),",
        "hemisphere",
      ],
    ]) {
      transformed = replaceOne(
        transformed,
        source,
        replacement,
        fileName,
        `WebGLLights ${label} storage`,
      );
    }
    const lightUniformRead = "\t\t\t\tconst uniforms = cache.get( light );";
    for (const [type, label] of [
      ["NativeDirectionalLightUniform", "directional"],
      ["NativeSpotLightUniform", "spot"],
      ["NativeRectAreaLightUniform", "rect-area"],
      ["NativePointLightUniform", "point"],
      ["NativeHemisphereLightUniform", "hemisphere"],
    ]) {
      transformed = replaceOne(
        transformed,
        lightUniformRead,
        `\t\t\t\tconst uniforms = require${type}( cache.get( light ) );`,
        fileName,
        `WebGLLights ${label} uniform`,
      );
    }
    const shadowUniformRead =
      "\t\t\t\t\tconst shadowUniforms = shadowCache.get( light );";
    for (const [type, label] of [
      ["NativeShadowUniform", "directional"],
      ["NativeShadowUniform", "spot"],
      ["NativePointShadowUniform", "point"],
    ]) {
      transformed = replaceOne(
        transformed,
        shadowUniformRead,
        `\t\t\t\t\tconst shadowUniforms = require${type}( shadowCache.get( light ) );`,
        fileName,
        `WebGLLights ${label} shadow uniform`,
      );
    }
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLShaderCache.js")) {
    transformed = replaceOne(
      transformed,
      "\t\tthis.shaderCache = new Map();\n\t\tthis.materialCache = new Map();",
      "\t\t/** @type {Map<string, WebGLShaderStage>} */\n\t\tthis.shaderCache = new Map();\n\t\t/** @type {Map<import('../../materials/Material.js').Material, Set<WebGLShaderStage>>} */\n\t\tthis.materialCache = new Map();",
      fileName,
      "WebGLShaderCache typed maps",
    );
    for (const name of ["update", "remove", "_getShaderCacheForMaterial"]) {
      transformed = replaceOne(
        transformed,
        `\t${name}( material`,
        `\t/** @param {import('../../materials/Material.js').Material} material */\n\t${name}( material`,
        fileName,
        `WebGLShaderCache ${name} material`,
      );
    }
    transformed = replaceOne(
      transformed,
      "\t\t\tset = new Set();",
      "\t\t\tset = new Set( /** @type {WebGLShaderStage[]} */ ( [] ) );",
      fileName,
      "WebGLShaderCache typed material set",
    );
    transformed = replaceOne(
      transformed,
      "\t_getShaderStage( code ) {",
      "\t/** @param {string} code */\n\t_getShaderStage( code ) {",
      fileName,
      "WebGLShaderCache shader source key",
    );
    for (const [name, field] of [
      ["getVertexShaderStage", "vertexShader"],
      ["getFragmentShaderStage", "fragmentShader"],
    ]) {
      transformed = replaceOne(
        transformed,
        `\t${name}( material ) {\n\n\t\treturn this._getShaderStage( material.${field} );`,
        `\t/** @param {import('../../materials/Material.js').Material} material */\n\t${name}( material ) {\n\n\t\tconst code = material.${field};\n\n\t\tif ( typeof code !== 'string' ) throw new Error( 'THREE.WebGLShaderCache: Missing shader source.' );\n\n\t\treturn this._getShaderStage( code );`,
        fileName,
        `WebGLShaderCache ${field} source`,
      );
    }
    transformed = replaceOne(
      transformed,
      "\tconstructor( code ) {",
      "\t/** @param {string} code */\n\tconstructor( code ) {",
      fileName,
      "WebGLShaderStage shader source key",
    );
  }
  if (normalized.endsWith("/three/src/materials/ShaderMaterial.js")) {
    // `defines` is a GLSL `#define` table: every write is `defines[ name ] =
    // 8 | 1 | '' | true`, every read is `for ( const name in defines )` in
    // WebGLProgram's `generateDefines`, which ToStrings the value. `@type
    // {Object}` states nothing, so the field boxed and every copy of it went
    // through the dynamic `ObjectConstructor::assign`.
    transformed = replaceOne(
      transformed,
      "\t\t * @type {Object}\n\t\t */\n\t\tthis.defines = {};",
      "\t\t * @type {Record<string, string|number|boolean>}\n\t\t */\n\t\tthis.defines = {};",
      fileName,
      "ShaderMaterial defines table",
    );
    transformed = replaceOne(
      transformed,
      "\t\t * @type {Object}\n\t\t */\n\t\tthis.uniforms = {};",
      "\t\t * @type {import('../renderers/shaders/UniformsLib.js').NativeUniforms}\n\t\t */\n\t\tthis.uniforms = {};",
      fileName,
      "ShaderMaterial native uniform table",
    );
    // `copy` overrides `Material.copy`, so the vtable widens `source` to
    // `Material` -- which declares none of the fields three then reads off it.
    // Every one of those reads becomes a dynamic get and an unbox that can only
    // fail loudly. three's own contract is that a ShaderMaterial is copied from
    // a ShaderMaterial (`clone()` is `new this.constructor().copy( this )`), so
    // state that once, bound to a const, and the whole body reads statically.
    transformed = replaceOne(
      transformed,
      "\tcopy( source ) {\n\n\t\tsuper.copy( source );\n",
      "\tcopy( source ) {\n\n\t\tsuper.copy( source );\n\n\t\tconst shaderSource = /** @type {ShaderMaterial} */ ( source );\n",
      fileName,
      "ShaderMaterial copy source is a ShaderMaterial",
    );
    transformed = replaceOne(
      transformed,
      "\t\tthis.uniforms = cloneUniforms( source.uniforms );",
      "\t\tthis.uniforms = cloneUniforms( shaderSource.uniforms );",
      fileName,
      "ShaderMaterial uniform clone from the shader source",
    );
    // `WebGLBindingStates` reads this back as `Record<string, number[]|undefined>`
    // -- an INDEX, because it looks the value up by attribute name. `@type
    // {Object}` states nothing, so the literal is laid out as a three-field
    // record and the read asserts a dictionary against it: two carriers for one
    // cell, and the assertion aborts the moment a ShaderMaterial is drawn.
    // The entry is `number[]|undefined`, the same spelling `WebGLBindingStates`
    // reads it back with: an attribute the material states no default for is
    // ABSENT, and a dynamic read unboxes by exact payload type, so the two
    // statements must be one.
    transformed = replaceOne(
      transformed,
      "\t\t * @type {Object}\n\t\t */\n\t\tthis.defaultAttributeValues = {",
      "\t\t * @type {Record<string, number[]|undefined>}\n\t\t */\n\t\tthis.defaultAttributeValues = {",
      fileName,
      "ShaderMaterial default attribute value index",
    );
    for (const field of ["defines", "extensions", "defaultAttributeValues"]) {
      transformed = replaceOne(
        transformed,
        `Object.assign( {}, source.${field} )`,
        `Object.assign( {}, shaderSource.${field} )`,
        fileName,
        `ShaderMaterial ${field} copy`,
      );
    }
    transformed = replaceOne(
      transformed,
      "\t\tthis.uniformsGroups = cloneUniformsGroups( source.uniformsGroups );",
      "\t\tthis.uniformsGroups = cloneUniformsGroups( shaderSource.uniformsGroups );",
      fileName,
      "ShaderMaterial copy uniformsGroups from the shader source",
    );
    for (const field of [
      "fragmentShader",
      "vertexShader",
      "wireframe",
      "wireframeLinewidth",
      "fog",
      "lights",
      "clipping",
      "glslVersion",
      "index0AttributeName",
      "uniformsNeedUpdate",
    ]) {
      transformed = replaceOne(
        transformed,
        `\t\tthis.${field} = source.${field};`,
        `\t\tthis.${field} = shaderSource.${field};`,
        fileName,
        `ShaderMaterial copy ${field} from the shader source`,
      );
    }
  }
  if (normalized.endsWith("/three/src/materials/Material.js")) {
    transformed = replaceOne(
      transformed,
      "import { Vector2 } from '../math/Vector2.js';",
      `import { Vector2 } from '../math/Vector2.js';
import { Vector3 } from '../math/Vector3.js';
import { Euler } from '../math/Euler.js';`,
      fileName,
      "Material exact setValues value imports",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\tif ( currentValue && currentValue.isColor ) {

\t\t\t\tcurrentValue.set( newValue );

\t\t\t} else if (
\t\t\t\t( ( currentValue && currentValue.isVector2 ) && ( newValue && newValue.isVector2 ) ) ||
\t\t\t\t( ( currentValue && currentValue.isEuler ) && ( newValue && newValue.isEuler ) ) ||
\t\t\t\t( ( currentValue && currentValue.isVector3 ) && ( newValue && newValue.isVector3 ) )
\t\t\t) {

\t\t\t\tcurrentValue.copy( newValue );

\t\t\t} else {`,
      `\t\t\tif ( currentValue && currentValue.isColor ) {

\t\t\t\tconst colorValue = { value: /** @type {Color} */ ( currentValue ) };
\t\t\t\tcolorValue.value.set( /** @type {number|string|Color|undefined} */ ( newValue ) );

\t\t\t} else if ( ( currentValue && currentValue.isVector2 ) && ( newValue && newValue.isVector2 ) ) {

\t\t\t\tconst currentVector2 = { value: /** @type {Vector2} */ ( currentValue ) };
\t\t\t\tconst newVector2 = { value: /** @type {Vector2} */ ( newValue ) };
\t\t\t\tcurrentVector2.value.copy( newVector2.value );

\t\t\t} else if ( ( currentValue && currentValue.isEuler ) && ( newValue && newValue.isEuler ) ) {

\t\t\t\tconst currentEuler = { value: /** @type {Euler} */ ( currentValue ) };
\t\t\t\tconst newEuler = { value: /** @type {Euler} */ ( newValue ) };
\t\t\t\tcurrentEuler.value.copy( newEuler.value );

\t\t\t} else if ( ( currentValue && currentValue.isVector3 ) && ( newValue && newValue.isVector3 ) ) {

\t\t\t\tconst currentVector3 = { value: /** @type {Vector3} */ ( currentValue ) };
\t\t\t\tconst newVector3 = { value: /** @type {Vector3} */ ( newValue ) };
\t\t\t\tcurrentVector3.value.copy( newVector3.value );

\t\t\t} else {`,
      fileName,
      "Material typed setValues method dispatch",
    );
    transformed = replaceOne(
      transformed,
      "@type {?Array<Plane>}",
      "@type {Array<import('../math/Plane.js').Plane>|null}",
      fileName,
      "Material clipping plane field",
    );
    transformed = replaceOne(
      transformed,
      "\t\tconst srcPlanes = source.clippingPlanes;\n\t\tlet dstPlanes = null;",
      "\t\tconst srcPlanes = source.clippingPlanes;\n\t\t/** @type {Array<import('../math/Plane.js').Plane>|null} */\n\t\tlet dstPlanes = null;",
      fileName,
      "Material clipping plane destination",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tdstPlanes = new Array( n );",
      "\t\t\tdstPlanes = /** @type {Array<import('../math/Plane.js').Plane>} */ ( [] );\n\t\t\tdstPlanes.length = n;",
      fileName,
      "Material clipping plane allocation",
    );
    transformed = replaceOne(
      transformed,
      "@return {Material} A clone of this instance.\n\t */\n\tclone()",
      "@return {this} A clone of this instance.\n\t */\n\tclone()",
      fileName,
      "Material subtype-preserving clone result",
    );
  }
  if (normalized.endsWith("/three/src/materials/MeshPhysicalMaterial.js")) {
    transformed = replaceOne(
      transformed,
      `\t\tObject.defineProperty( this, 'reflectivity', {
\t\t\tget: function () {

\t\t\t\treturn ( clamp( 2.5 * ( this.ior - 1 ) / ( this.ior + 1 ), 0, 1 ) );

\t\t\t},
\t\t\tset: function ( reflectivity ) {

\t\t\t\tthis.ior = ( 1 + 0.4 * reflectivity ) / ( 1 - 0.4 * reflectivity );

\t\t\t}
\t\t} );`,
      "",
      fileName,
      "MeshPhysicalMaterial reflectivity property definition",
    );
    transformed = replaceOne(
      transformed,
      "\t\tthis.setValues( parameters );\n\n\t}\n\n\t/**\n\t * The anisotropy strength",
      `\t\tthis.setValues( parameters );

\t}

\t/**
\t * Degree of reflectivity, from 0.0 to 1.0.
\t * @type {number}
\t */
\tget reflectivity() {

\t\treturn clamp( 2.5 * ( this.ior - 1 ) / ( this.ior + 1 ), 0, 1 );

\t}

\tset reflectivity( reflectivity ) {

\t\tthis.ior = ( 1 + 0.4 * reflectivity ) / ( 1 - 0.4 * reflectivity );

\t}

\t/**
\t * The anisotropy strength`,
      fileName,
      "MeshPhysicalMaterial native reflectivity accessors",
    );
    transformed = replaceOne(
      transformed,
      "\t\t * @type {Array<number,number>}",
      "\t\t * @type {Array<number>}",
      fileName,
      "MeshPhysicalMaterial iridescence range type",
    );
    transformed = replaceOne(
      transformed,
      "\t\tthis.iridescenceThicknessRange = [ ...source.iridescenceThicknessRange ];",
      "\t\tthis.iridescenceThicknessRange = [ source.iridescenceThicknessRange[ 0 ], source.iridescenceThicknessRange[ 1 ] ];",
      fileName,
      "MeshPhysicalMaterial iridescence range copy",
    );
  }
  if (normalized.endsWith("/three/src/core/Object3D.js")) {
    transformed = replaceOne(
      transformed,
      "Object.assign( {}, this.morphTargetDictionary )",
      "/** @type {Record<string, number>} */ ( JSON.parse( JSON.stringify( this.morphTargetDictionary ) ) )",
      fileName,
      "Object3D morph-target dictionary copy",
    );
  }
  if (normalized.endsWith("/three/src/objects/Mesh.js")) {
    transformed = replaceOne(
      transformed,
      "Object.assign( {}, source.morphTargetDictionary )",
      "/** @type {Record<string, number>} */ ( JSON.parse( JSON.stringify( source.morphTargetDictionary ) ) )",
      fileName,
      "Mesh morph-target dictionary copy",
    );
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLState.js")) {
    const bufferSourceType = nativeBufferSourceType;
    const imageSourceType = nativeImageSourceType;
    transformed = replaceOne(
      transformed,
      "import { error, ReversedDepthFuncs } from '../../utils.js';",
      `import { error, ReversedDepthFuncs } from '../../utils.js';

/**
 * Authenticate a value erased by an arguments-object read before it crosses
 * into the native WebGL BufferSourceLike carrier. Every forwarding call below
 * reads the upload's source position, which three fills only with typed pixel
 * data, \`null\` or \`undefined\`. The present arms are checked here against the
 * typed parameter rather than through the \`unknown\` record-data helper below,
 * so this path never widens the source.
 * @param {${bufferSourceType}} value
 * @return {${bufferSourceType}}
 */
function requireWebGLStateBufferSource( value ) {

\tif ( value === null ) return null;
\tif ( value === undefined ) return undefined;
\tif ( value instanceof Float32Array ) return value;
\tif ( value instanceof Float64Array ) return value;
\tif ( value instanceof Int8Array ) return value;
\tif ( value instanceof Uint8Array ) return value;
\tif ( value instanceof Uint8ClampedArray ) return value;
\tif ( value instanceof Int16Array ) return value;
\tif ( value instanceof Uint16Array ) return value;
\tif ( value instanceof Int32Array ) return value;
\tif ( value instanceof Uint32Array ) return value;
\tif ( Array.isArray( value ) ) return value;

\tthrow new Error( 'THREE.WebGLState: Expected a BufferSource.' );

}

/**
 * Authenticate a native texture image record's pixel data, which reaches the
 * record-form upload overloads. Only
 * requireWebGLStateTextureImageSource calls this.
 * @param {Exclude<${bufferSourceType}, null|undefined>} value
 * @return {Exclude<${bufferSourceType}, null|undefined>}
 */
function requireWebGLStatePresentBufferSource( value ) {

\tif ( value instanceof Float32Array ) return value;
\tif ( value instanceof Float64Array ) return value;
\tif ( value instanceof Int8Array ) return value;
\tif ( value instanceof Uint8Array ) return value;
\tif ( value instanceof Uint8ClampedArray ) return value;
\tif ( value instanceof Int16Array ) return value;
\tif ( value instanceof Uint16Array ) return value;
\tif ( value instanceof Int32Array ) return value;
\tif ( value instanceof Uint32Array ) return value;

\tif ( Array.isArray( value ) ) {

\t\t/** @type {number[]} */
\t\tconst numbers = [];

\t\tfor ( let i = 0; i < value.length; i ++ ) {

\t\t\tconst element = value[ i ];

\t\t\tif ( typeof element !== 'number' ) throw new Error( 'THREE.WebGLState: BufferSource array contains a non-number.' );

\t\t\tnumbers.push( element );

\t\t}

\t\treturn numbers;

\t}

\tthrow new Error( 'THREE.WebGLState: Expected a BufferSource.' );

}

/**
 * The browser overloads accept a TexImageSource and discover its dimensions.
 * Native Three carries that source as a dimensioned record with typed pixel
 * data, so recover and authenticate the fields before selecting the explicit
 * width/height overload exposed by NativeWebGL2RenderingContext.
 * @param {number|${imageSourceType}} value
 * @return {{ width: number, height: number, data: Exclude<${bufferSourceType}, null|undefined> }}
 */
function requireWebGLStateTextureImageSource( value ) {

\tif ( value === null || typeof value !== 'object' || Array.isArray( value ) ) {

\t\tthrow new Error( 'THREE.WebGLState: Expected a native texture image record.' );

\t}

\tconst image = value;

\tif ( typeof image.width !== 'number' || typeof image.height !== 'number' ) {

\t\tthrow new Error( 'THREE.WebGLState: Native texture image has no dimensions.' );

\t}

\tconst data = requireWebGLStatePresentBufferSource( image.data );

\treturn { width: image.width, height: image.height, data: data };

}`,
      fileName,
      "WebGLState authenticated BufferSource conversion",
    );
    // These forwarding helpers deliberately have no named parameters, so
    // Function#length remains zero. `arguments` is consequently `any` in
    // three's JavaScript source. Spell the observed overloads out and pass a
    // full-width overload's erased source through the checked helper above.
    // The two methods used in short and full-width forms branch on
    // arguments.length so neither overload selection nor argument positions
    // change.
    // Storage allocation has only numeric host arguments. A stated rest
    // frame preserves the zero function length and every forwarded argument
    // while carrying the same number contract as the native context methods.
    for (const [method, arity] of [
      ["texStorage2D", 5],
      ["texStorage3D", 6],
    ]) {
      transformed = replaceOne(
        transformed,
        `\tfunction ${method}() {`,
        `\t/** @param {[${Array(arity).fill("number").join(", ")}]} args */\n\tfunction ${method}( ...args ) {`,
        fileName,
        `WebGLState ${method} numeric frame`,
      );
      transformed = replaceOne(
        transformed,
        `gl.${method}( ...arguments );`,
        `gl.${method}( ...args );`,
        fileName,
        `WebGLState ${method} numeric forwarding`,
      );
    }
    const sourceArguments = (arity, sourceIndex, authenticateBufferSource) =>
      Array.from({ length: arity }, (_, index) =>
        index === sourceIndex
          ? authenticateBufferSource
            ? `requireWebGLStateBufferSource( arguments[ ${index} ] )`
            : `arguments[ ${index} ]`
          : `arguments[ ${index} ]`,
      ).join(", ");
    for (const [method, overloads] of [
      ["compressedTexImage2D", [[7, 6, true]]],
      ["compressedTexImage3D", [[10, 7, true]]],
      ["texSubImage2D", [[9, 8, true]]],
      ["compressedTexSubImage2D", [[8, 7, true]]],
      ["compressedTexSubImage3D", [[10, 9, true]]],
      ["texImage2D", [[9, 8, true]]],
    ]) {
      const calls = overloads.map(
        ([arity, sourceIndex, authenticateBufferSource]) =>
          `gl.${method}( ${sourceArguments(arity, sourceIndex, authenticateBufferSource)} );`,
      );
      const forwarded =
        calls.length === 1
          ? calls[0]
          : `if ( arguments.length === ${overloads[0][0]} ) {

\t\t\t\t${calls[0]}

\t\t\t} else {

\t\t\t\t${calls[1]}

\t\t\t}`;
      transformed = replaceOne(
        transformed,
        `\t\t\tgl.${method}( ...arguments );`,
        `\t\t\t${forwarded}`,
        fileName,
        `WebGLState ${method} BufferSource forwarding`,
      );
    }
    transformed = replaceOne(
      transformed,
      `\tfunction texSubImage2D() {

\t\ttry {

\t\t\tgl.texSubImage2D( ${sourceArguments(9, 8, true)} );`,
      `\tfunction texSubImage2D() {

\t\ttry {

\t\t\tif ( arguments.length === 7 ) {

\t\t\t\tconst source = requireWebGLStateTextureImageSource( arguments[ 6 ] );
\t\t\t\tgl.texSubImage2D( arguments[ 0 ], arguments[ 1 ], arguments[ 2 ], arguments[ 3 ], source.width, source.height, arguments[ 4 ], arguments[ 5 ], source.data );

\t\t\t} else {

\t\t\t\tgl.texSubImage2D( ${sourceArguments(9, 8, true)} );

\t\t\t}`,
      fileName,
      "WebGLState native TexImageSource sub-image expansion",
    );
    transformed = replaceOne(
      transformed,
      `\tfunction texImage2D() {

\t\ttry {

\t\t\tgl.texImage2D( ${sourceArguments(9, 8, true)} );`,
      `\tfunction texImage2D() {

\t\ttry {

\t\t\tif ( arguments.length === 6 ) {

\t\t\t\tconst source = requireWebGLStateTextureImageSource( arguments[ 5 ] );
\t\t\t\tgl.texImage2D( arguments[ 0 ], arguments[ 1 ], arguments[ 2 ], source.width, source.height, 0, arguments[ 3 ], arguments[ 4 ], source.data );

\t\t\t} else {

\t\t\t\tgl.texImage2D( ${sourceArguments(9, 8, true)} );

\t\t\t}`,
      fileName,
      "WebGLState native TexImageSource image expansion",
    );
    // Preserve the actual argument count (and Function#length) while stating
    // the native upload protocol at the forwarding boundary. An arguments
    // object with no formal parameters otherwise erases every pixel source
    // and numeric coordinate before the native context receives them.
    const numericPrefix = (count) => Array(count).fill("number").join(", ");
    for (const [method, frame] of [
      ["compressedTexImage2D", `[${numericPrefix(6)}, ${bufferSourceType}]`],
      [
        "compressedTexImage3D",
        `[${numericPrefix(7)}, ${bufferSourceType}, number?, number?]`,
      ],
      ["texImage3D", `[${numericPrefix(9)}, ${bufferSourceType}]`],
      ["texSubImage3D", `[${numericPrefix(10)}, ${bufferSourceType}]`],
      ["compressedTexSubImage2D", `[${numericPrefix(7)}, ${bufferSourceType}]`],
      ["compressedTexSubImage3D", `[${numericPrefix(9)}, ${bufferSourceType}]`],
      [
        "texSubImage2D",
        `[${numericPrefix(6)}, number|${imageSourceType}, number?, (${bufferSourceType})?]`,
      ],
      [
        "texImage2D",
        `[${numericPrefix(5)}, number|${imageSourceType}, number?, number?, (${bufferSourceType})?]`,
      ],
    ]) {
      const pattern = new RegExp(
        `\\tfunction ${method}\\(\\) \\{([\\s\\S]*?)\\n\\t\\}\\n`,
      );
      const match = transformed.match(pattern);
      if (!match)
        throw new Error(
          `Three WebGLState source at ${fileName} has no ${method} forwarding body`,
        );
      transformed = replaceOne(
        transformed,
        match[0],
        `\t/** @param {${frame}} args */\n\tfunction ${method}( ...args ) {${match[1].replaceAll("arguments", "args")}\n\t}\n`,
        fileName,
        `WebGLState ${method} typed upload frame`,
      );
    }
    transformed = replaceOne(
      transformed,
      "\tlet enabledCapabilities = {};\n\tlet parameters = {};\n\n\tlet currentBoundFramebuffers = {};",
      "\t/** @type {Record<number, boolean|undefined>} */\n\tlet enabledCapabilities = {};\n\t/** @type {Record<number, number|boolean|undefined>} */\n\tlet parameters = {};\n\n\t/** @type {Record<number, import('@geastack/native-webgl-angle/nativeWebGL').NativeHandle|null|undefined>} */\n\tlet currentBoundFramebuffers = {};",
      fileName,
      "WebGLState numeric-key state tables",
    );
    transformed = replaceOne(
      transformed,
      "\tconst uboBindings = new WeakMap();\n\tconst uboProgramMap = new WeakMap();",
      "\t/** @type {WeakMap<import('@geastack/native-webgl-angle/nativeWebGL').NativeProgram, number>} */\n" +
        "\tconst uboBindings = new WeakMap();\n" +
        "\t/** @type {WeakMap<import('@geastack/native-webgl-angle/nativeWebGL').NativeProgram, WeakMap<import('../../core/UniformsGroup.js').UniformsGroup, number>>} */\n" +
        "\tconst uboProgramMap = new WeakMap();",
      fileName,
      "WebGLState uniform-block maps",
    );
    transformed = replaceOne(
      transformed,
      "\tlet currentDrawbuffers = new WeakMap();\n\tlet defaultDrawbuffers = [];",
      "\t/** @type {WeakMap<import('@geastack/native-webgl-angle/nativeWebGL').NativeHandle, number[]>} */\n" +
        "\tlet currentDrawbuffers = new WeakMap();\n" +
        "\t/** @type {number[]} */\n\tlet defaultDrawbuffers = [];",
      fileName,
      "WebGLState draw-buffer collections",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\tdrawBuffers = currentDrawbuffers.get( framebuffer );

\t\t\tif ( drawBuffers === undefined ) {

\t\t\t\tdrawBuffers = [];
\t\t\t\tcurrentDrawbuffers.set( framebuffer, drawBuffers );

\t\t\t}`,
      `\t\t\tif ( currentDrawbuffers.has( framebuffer ) ) {

\t\t\t\tdrawBuffers = /** @type {number[]} */ ( currentDrawbuffers.get( framebuffer ) );

\t\t\t} else {

\t\t\t\tdrawBuffers = [];
\t\t\t\tcurrentDrawbuffers.set( framebuffer, drawBuffers );

\t\t\t}`,
      fileName,
      "WebGLState draw-buffer cache membership",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tif ( drawBuffers.length !== textures.length || drawBuffers[ 0 ] !== gl.COLOR_ATTACHMENT0 ) {",
      "\t\t\tif ( drawBuffers.length !== textures.length || drawBuffers.length === 0 || drawBuffers[ 0 ] !== gl.COLOR_ATTACHMENT0 ) {",
      fileName,
      "WebGLState render-target draw-buffer presence",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tif ( drawBuffers[ 0 ] !== gl.BACK ) {",
      "\t\t\tif ( drawBuffers.length === 0 || drawBuffers[ 0 ] !== gl.BACK ) {",
      fileName,
      "WebGLState default draw-buffer presence",
    );
    transformed = replaceOne(
      transformed,
      `\tfunction uniformBlockBinding( uniformsGroup, program ) {

\t\tconst mapping = uboProgramMap.get( program );
\t\tconst blockIndex = mapping.get( uniformsGroup );

\t\tif ( uboBindings.get( program ) !== blockIndex ) {

\t\t\t// bind shader specific block index to global block point
\t\t\tgl.uniformBlockBinding( program, blockIndex, uniformsGroup.__bindingPointIndex );

\t\t\tuboBindings.set( program, blockIndex );

\t\t}

\t}`,
      `\tfunction uniformBlockBinding( uniformsGroup, program ) {

\t\tconst mapping = uboProgramMap.get( program );

\t\tif ( mapping === undefined ) throw new Error( 'THREE.WebGLState: Missing uniform-block mapping.' );

\t\tconst blockIndex = mapping.get( uniformsGroup );

\t\tif ( blockIndex === undefined ) throw new Error( 'THREE.WebGLState: Missing uniform-block index.' );

\t\tconst currentBlockIndex = uboBindings.get( program );
\t\tconst currentBlockIndexValue = currentBlockIndex === undefined ? - 1 : currentBlockIndex;

\t\tif ( currentBlockIndexValue !== blockIndex ) {

\t\t\t// bind shader specific block index to global block point
\t\t\tgl.uniformBlockBinding( program, blockIndex, uniformsGroup.__bindingPointIndex );

\t\t\tuboBindings.set( program, blockIndex );

\t\t}

\t}`,
      fileName,
      "WebGLState required uniform-block indices",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction setBlending( blending, blendEquation, blendSrc, blendDst, blendEquationAlpha, blendSrcAlpha, blendDstAlpha, blendColor, blendAlpha, premultipliedAlpha ) {",
      // `setMaterial` passes `material.blendEquationAlpha`/`blendSrcAlpha`/
      // `blendDstAlpha` straight through, and `Material` initializes all three
      // to `null` ("use the color factor"). Stating them `number=` left the
      // parameter no way to hold that `null`, and the first blended material
      // aborted selecting it; the body's `|| blendEquation` is what resolves it.
      "\t/** @param {number} blending @param {number=} blendEquation @param {number=} blendSrc @param {number=} blendDst @param {number|null=} blendEquationAlpha @param {number|null=} blendSrcAlpha @param {number|null=} blendDstAlpha @param {import('../../math/Color.js').Color=} blendColor @param {number=} blendAlpha @param {boolean=} premultipliedAlpha */\n" +
        "\tfunction setBlending( blending, blendEquation, blendSrc, blendDst, blendEquationAlpha, blendSrcAlpha, blendDstAlpha, blendColor, blendAlpha, premultipliedAlpha ) {",
      fileName,
      "WebGLState blending inputs",
    );
    transformed = replaceOne(
      transformed,
      "\t\t// custom blending\n\n\t\tblendEquationAlpha = blendEquationAlpha || blendEquation;\n\t\tblendSrcAlpha = blendSrcAlpha || blendSrc;\n\t\tblendDstAlpha = blendDstAlpha || blendDst;",
      "\t\t// custom blending\n\n\t\tblendEquation = /** @type {number} */ ( blendEquation );\n\t\tblendSrc = /** @type {number} */ ( blendSrc );\n\t\tblendDst = /** @type {number} */ ( blendDst );\n\t\tblendColor = /** @type {import('../../math/Color.js').Color} */ ( blendColor );\n\t\tblendAlpha = /** @type {number} */ ( blendAlpha );\n\t\tblendEquationAlpha = blendEquationAlpha || blendEquation;\n\t\tblendSrcAlpha = blendSrcAlpha || blendSrc;\n\t\tblendDstAlpha = blendDstAlpha || blendDst;",
      fileName,
      "WebGLState custom blending required values",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction setPolygonOffset( polygonOffset, factor, units ) {\n\n\t\tif ( polygonOffset ) {",
      "\t/** @param {boolean} polygonOffset @param {number} factor @param {number} units */\n\tfunction setPolygonOffset( polygonOffset, factor, units ) {\n\n\t\tif ( polygonOffset ) {",
      fileName,
      "WebGLState polygon offset inputs",
    );
    transformed = replaceOne(
      transformed,
      "\tlet currentBoundTextures = {};",
      "\t/** @type {Record<number, { type: number|undefined, texture: import('@geastack/native-webgl-angle/nativeWebGL').NativeHandle|null|undefined }>} */\n\tlet currentBoundTextures = {};",
      fileName,
      "WebGLState bound texture table",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction unbindTexture() {\n\n\t\tconst boundTexture = currentBoundTextures[ currentTextureSlot ];",
      "\tfunction unbindTexture() {\n\n\t\tif ( typeof currentTextureSlot !== 'number' ) return;\n\n\t\tconst textureSlot = currentTextureSlot;\n\t\tconst boundTexture = currentBoundTextures[ textureSlot ];",
      fileName,
      "WebGLState current texture slot narrowing",
    );
    transformed = replaceOne(
      transformed,
      "\t\tcurrentBoundTextures = {};",
      "\t\tcurrentBoundTextures = /** @type {Record<number, { type: number|undefined, texture: import('@geastack/native-webgl-angle/nativeWebGL').NativeHandle|null|undefined }>} */ ( {} );",
      fileName,
      "WebGLState bound texture reset",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tsetReversed: function ( reversed ) {",
      "\t\t\tsetReversed( reversed ) {",
      fileName,
      "WebGLState depth-buffer receiver",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tsetFunc: function ( depthFunc ) {",
      "\t\t\t/** @param {number} depthFunc */\n\t\t\tsetFunc( depthFunc ) {",
      fileName,
      "WebGLState numeric depth function",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tif ( currentReversed ) depthFunc = ReversedDepthFuncs[ depthFunc ];",
      "\t\t\t\tif ( currentReversed ) {\n\n\t\t\t\t\tconst reversedDepthFunc = ReversedDepthFuncs[ depthFunc ];\n\n\t\t\t\t\tif ( typeof reversedDepthFunc === 'number' ) depthFunc = reversedDepthFunc;\n\n\t\t\t\t}",
      fileName,
      "WebGLState reversed depth lookup",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\tconst oldDepth = currentDepthClear;\n\t\t\t\t\tcurrentDepthClear = null;\n\t\t\t\t\tthis.setClear( oldDepth );",
      "\t\t\t\t\tconst oldDepth = currentDepthClear;\n\t\t\t\t\tcurrentDepthClear = null;\n\t\t\t\t\tif ( oldDepth !== null ) this.setClear( oldDepth );",
      fileName,
      "WebGLState nullable reversed-depth clear",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tsetClear: function ( depth ) {",
      "\t\t\t/** @param {number} depth */\n\t\t\tsetClear( depth ) {",
      fileName,
      "WebGLState numeric depth clear",
    );
    transformed = replaceOne(
      transformed,
      "\tconst maxTextures = gl.getParameter( gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS );",
      "\tconst maxTextures = /** @type {number} */ ( gl.getParameter( gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS ) );",
      fileName,
      "WebGLState texture limit",
    );
    transformed = replaceOne(
      transformed,
      "\tconst emptyTextures = {};",
      "\t/** @type {Record<number, import('@geastack/native-webgl-angle/nativeWebGL').NativeHandle>} */\n\tconst emptyTextures = {};",
      fileName,
      "WebGLState empty texture table",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction activeTexture( webglSlot ) {",
      "\t/** @param {number|undefined} webglSlot */\n\tfunction activeTexture( webglSlot ) {",
      fileName,
      "WebGLState active texture slot",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction bindTexture( webglType, webglTexture, webglSlot ) {",
      "\t/** @param {number} webglType @param {import('@geastack/native-webgl-angle/nativeWebGL').NativeHandle|null|undefined} webglTexture @param {number|undefined} webglSlot */\n\tfunction bindTexture( webglType, webglTexture, webglSlot ) {",
      fileName,
      "WebGLState texture binding inputs",
    );
    transformed = replaceOne(
      transformed,
      "\t\tlet boundTexture = currentBoundTextures[ webglSlot ];",
      "\t\tconst textureSlot = /** @type {number} */ ( webglSlot );\n\n\t\tlet boundTexture = currentBoundTextures[ textureSlot ];",
      fileName,
      "WebGLState required texture slot",
    );
    const bindTextureStart = transformed.indexOf(
      "\tfunction bindTexture( webglType, webglTexture, webglSlot ) {",
    );
    const bindTextureEnd = transformed.indexOf(
      "\n\t}\n\n\tfunction unbindTexture()",
      bindTextureStart,
    );
    if (bindTextureStart < 0 || bindTextureEnd < 0) {
      throw new Error(
        `Three WebGLState texture binding source at ${fileName} no longer matches the native adaptation`,
      );
    }
    const bindTextureBody = transformed
      .slice(bindTextureStart, bindTextureEnd)
      .replace(
        "currentBoundTextures[ webglSlot ] = boundTexture;",
        "currentBoundTextures[ textureSlot ] = boundTexture;",
      )
      .replaceAll(
        "currentTextureSlot !== webglSlot",
        "currentTextureSlot !== textureSlot",
      )
      .replaceAll(
        "gl.activeTexture( webglSlot )",
        "gl.activeTexture( textureSlot )",
      )
      .replaceAll(
        "currentTextureSlot = webglSlot",
        "currentTextureSlot = textureSlot",
      );
    transformed =
      transformed.slice(0, bindTextureStart) +
      bindTextureBody +
      transformed.slice(bindTextureEnd);
    transformed = replaceOne(
      transformed,
      "\t\t\tgl.bindTexture( webglType, webglTexture || emptyTextures[ webglType ] );",
      "\t\t\tconst textureToBind = webglTexture || emptyTextures[ webglType ];\n\n\t\t\tif ( textureToBind === undefined ) throw new Error( 'THREE.WebGLState: Missing empty texture for binding target.' );\n\n\t\t\tgl.bindTexture( webglType, textureToBind );",
      fileName,
      "WebGLState bound texture fallback",
    );
    transformed = replaceOne(
      transformed,
      "\t\tcurrentDrawbuffers = new WeakMap();",
      "\t\tcurrentDrawbuffers = /** @type {WeakMap<import('@geastack/native-webgl-angle/nativeWebGL').NativeHandle, number[]>} */ ( new WeakMap() );",
      fileName,
      "WebGLState draw-buffer reset",
    );
    transformed = transformed
      .replace(
        "\t\tenabledCapabilities = {};",
        "\t\tenabledCapabilities = /** @type {Record<number, boolean|undefined>} */ ( {} );",
      )
      .replace(
        "\t\tparameters = {};",
        "\t\tparameters = /** @type {Record<number, number|boolean|undefined>} */ ( {} );",
      )
      .replace(
        "\t\tcurrentBoundFramebuffers = {};",
        "\t\tcurrentBoundFramebuffers = /** @type {Record<number, import('@geastack/native-webgl-angle/nativeWebGL').NativeHandle|null|undefined>} */ ( {} );",
      );
    transformed = replaceOne(
      transformed,
      "\tconst glVersion = gl.getParameter( gl.VERSION );",
      "\tconst glVersion = /** @type {string} */ ( gl.getParameter( gl.VERSION ) );",
      fileName,
      "WebGLState version string",
    );
    for (const parameter of ["SCISSOR_BOX", "VIEWPORT"]) {
      const local =
        parameter === "SCISSOR_BOX" ? "scissorParam" : "viewportParam";
      transformed = replaceOne(
        transformed,
        `\tconst ${local} = gl.getParameter( gl.${parameter} );`,
        `\tconst ${local} = /** @type {Int32Array} */ ( gl.getParameter( gl.${parameter} ) );`,
        fileName,
        `WebGLState ${parameter} vector`,
      );
    }
    transformed = replaceOne(
      transformed,
      "\tconst currentScissor = new Vector4().fromArray( scissorParam );",
      "\tconst currentScissor = new Vector4( scissorParam[ 0 ], scissorParam[ 1 ], scissorParam[ 2 ], scissorParam[ 3 ] );",
      fileName,
      "WebGLState scissor vector",
    );
    transformed = replaceOne(
      transformed,
      "\tconst currentViewport = new Vector4().fromArray( viewportParam );",
      "\tconst currentViewport = new Vector4( viewportParam[ 0 ], viewportParam[ 1 ], viewportParam[ 2 ], viewportParam[ 3 ] );",
      fileName,
      "WebGLState viewport vector",
    );
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLBindingStates.js")) {
    transformed = replaceOne(
      transformed,
      "import { IntType } from '../../constants.js';",
      "import { IntType } from '../../constants.js';\nimport { InterleavedBufferAttribute } from '../../core/InterleavedBufferAttribute.js';",
      fileName,
      "WebGLBindingStates interleaved attribute import",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tif ( index !== null ) {\n\n\t\t\t\tgl.bindBuffer( gl.ELEMENT_ARRAY_BUFFER, attributes.get( index ).buffer );",
      "\t\t\tif ( index !== null ) {\n\n\t\t\t\tconst indexAttribute = attributes.get( index );\n\n\t\t\t\tif ( indexAttribute !== undefined ) gl.bindBuffer( gl.ELEMENT_ARRAY_BUFFER, indexAttribute.buffer );",
      fileName,
      "WebGLBindingStates optional index buffer",
    );
    transformed = replaceOne(
      transformed,
      "\tconst maxVertexAttributes = gl.getParameter( gl.MAX_VERTEX_ATTRIBS );",
      "\tconst maxVertexAttributes = /** @type {number} */ ( gl.getParameter( gl.MAX_VERTEX_ATTRIBS ) );",
      fileName,
      "WebGLBindingStates vertex attribute limit",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction getBindingState( object, geometry, program, material ) {",
      "\t/** @param {{ id: number }} program */\n\tfunction getBindingState( object, geometry, program, material ) {",
      fileName,
      "WebGLBindingStates cache program identity",
    );
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLRenderLists.js")) {
    const renderItemType = nativeRenderItemType("../../");
    for (const name of ["painterSortStable", "reversePainterSortStable"]) {
      const startText = `function ${name}( a, b ) {`;
      const start = transformed.indexOf(startText);
      const end = transformed.indexOf("\n}\n\n", start);
      if (
        start < 0 ||
        end < 0 ||
        transformed.indexOf(startText, start + 1) >= 0
      ) {
        throw new Error(
          `Three WebGLRenderLists.${name} source at ${fileName} no longer matches the native adaptation`,
        );
      }
      const original = transformed.slice(start, end + 2);
      const typed = `/** @param {${renderItemType}} a @param {${renderItemType}} b */\n${original}`;
      transformed =
        transformed.slice(0, start) + typed + transformed.slice(end + 2);
    }
    transformed = replaceOne(
      transformed,
      "\tconst renderItems = [];\n\tlet renderItemsIndex = 0;\n\n\tconst opaque = [];\n\tconst transmissive = [];\n\tconst transparent = [];",
      `\t/** @type {Array<${renderItemType}>} */\n\tconst renderItems = [];\n` +
        "\tlet renderItemsIndex = 0;\n\n" +
        `\t/** @type {Array<${renderItemType}>} */\n\tconst opaque = [];\n` +
        `\t/** @type {Array<${renderItemType}>} */\n\tconst transmissive = [];\n` +
        `\t/** @type {Array<${renderItemType}>} */\n\tconst transparent = [];`,
      fileName,
      "WebGLRenderLists item arrays",
    );
    for (const [name, result] of [
      ["getNextRenderItem", ` @return {${renderItemType}}`],
      ["push", ""],
      ["unshift", ""],
    ]) {
      transformed = replaceOne(
        transformed,
        `\tfunction ${name}( object, geometry, material, groupOrder, z, group ) {`,
        `\t/** @param {import('../../core/Object3D.js').Object3D} object @param {import('../../core/BufferGeometry.js').BufferGeometry} geometry @param {import('../../materials/Material.js').Material} material @param {number} groupOrder @param {number} z @param {${renderGroupType}} group${result} */\n\tfunction ${name}( object, geometry, material, groupOrder, z, group ) {`,
        fileName,
        `WebGLRenderLists ${name} inputs`,
      );
    }
    transformed = replaceOne(
      transformed,
      `\t\tlet renderItem = renderItems[ renderItemsIndex ];

\t\tif ( renderItem === undefined ) {

\t\t\trenderItem = {
\t\t\t\tid: object.id,
\t\t\t\tobject: object,
\t\t\t\tgeometry: geometry,
\t\t\t\tmaterial: material,
\t\t\t\tmaterialVariant: materialVariant( object ),
\t\t\t\tgroupOrder: groupOrder,
\t\t\t\trenderOrder: object.renderOrder,
\t\t\t\tz: z,
\t\t\t\tgroup: group
\t\t\t};

\t\t\trenderItems[ renderItemsIndex ] = renderItem;

\t\t} else {

\t\t\trenderItem.id = object.id;
\t\t\trenderItem.object = object;
\t\t\trenderItem.geometry = geometry;
\t\t\trenderItem.material = material;
\t\t\trenderItem.materialVariant = materialVariant( object );
\t\t\trenderItem.groupOrder = groupOrder;
\t\t\trenderItem.renderOrder = object.renderOrder;
\t\t\trenderItem.z = z;
\t\t\trenderItem.group = group;

\t\t}`,
      `\t\t/** @type {${renderItemType}} */
\t\tlet renderItem;

\t\tif ( renderItemsIndex >= renderItems.length ) {

\t\t\trenderItem = {
\t\t\t\tid: object.id,
\t\t\t\tobject: object,
\t\t\t\tgeometry: geometry,
\t\t\t\tmaterial: material,
\t\t\t\tmaterialVariant: materialVariant( object ),
\t\t\t\tgroupOrder: groupOrder,
\t\t\t\trenderOrder: object.renderOrder,
\t\t\t\tz: z,
\t\t\t\tgroup: group
\t\t\t};

\t\t\trenderItems[ renderItemsIndex ] = renderItem;

\t\t} else {

\t\t\trenderItem = renderItems[ renderItemsIndex ];
\t\t\trenderItem.id = object.id;
\t\t\trenderItem.object = object;
\t\t\trenderItem.geometry = geometry;
\t\t\trenderItem.material = material;
\t\t\trenderItem.materialVariant = materialVariant( object );
\t\t\trenderItem.groupOrder = groupOrder;
\t\t\trenderItem.renderOrder = object.renderOrder;
\t\t\trenderItem.z = z;
\t\t\trenderItem.group = group;

\t\t}`,
      fileName,
      "WebGLRenderLists bounds-proven render-item cache read",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction sort( customOpaqueSort, customTransparentSort, reversedDepth ) {",
      `\t/**
\t * @param {((a: ${renderItemType}, b: ${renderItemType}) => number) | null} customOpaqueSort
\t * @param {((a: ${renderItemType}, b: ${renderItemType}) => number) | null} customTransparentSort
\t * @param {boolean} reversedDepth
\t */
\tfunction sort( customOpaqueSort, customTransparentSort, reversedDepth ) {`,
      fileName,
      "WebGLRenderLists nullable sort callbacks",
    );
    const finishStart = "\tfunction finish() {";
    const finishEnd = "\n\t}\n\n\treturn {\n\n\t\topaque: opaque,";
    const finishStartIndex = transformed.indexOf(finishStart);
    const finishEndIndex = transformed.indexOf(finishEnd, finishStartIndex);
    if (
      finishStartIndex < 0 ||
      finishEndIndex < 0 ||
      transformed.indexOf(finishStart, finishStartIndex + 1) >= 0
    ) {
      throw new Error(
        `Three WebGLRenderLists finish source at ${fileName} no longer matches the native adaptation`,
      );
    }
    transformed =
      transformed.slice(0, finishStartIndex) +
      "\tfunction finish() {\n\n\t\trenderItems.length = renderItemsIndex;\n\n\t}" +
      transformed.slice(finishEndIndex + "\n\t}".length);
    const transmissionCondition = "\t\tif ( material.transmission > 0.0 ) {";
    const transmissionConditionCount =
      transformed.split(transmissionCondition).length - 1;
    if (transmissionConditionCount !== 2) {
      throw new Error(
        `Three WebGLRenderLists source at ${fileName} has ${transmissionConditionCount} transmission branches; expected 2`,
      );
    }
    transformed = transformed.replaceAll(
      transmissionCondition,
      "\t\tconst transmission = material.transmission;\n\n\t\tif ( typeof transmission === 'number' && transmission > 0.0 ) {",
    );
    transformed = replaceOne(
      transformed,
      "\tlet lists = new WeakMap();",
      "\t/** @type {Map<number, Array<ReturnType<typeof WebGLRenderList>>>} */\n\tconst lists = new Map();",
      fileName,
      "WebGLRenderLists scene map",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction get( scene, renderCallDepth ) {",
      "\t/** @param {import('../../scenes/Scene.js').Scene} scene @param {number} renderCallDepth */\n\tfunction get( scene, renderCallDepth ) {",
      fileName,
      "WebGLRenderLists lookup inputs",
    );
    transformed = transformed
      .replace("lists.get( scene )", "lists.get( scene.id )")
      .replace(
        "lists.set( scene, [ list ] )",
        "lists.set( scene.id, /** @type {Array<ReturnType<typeof WebGLRenderList>>} */ ( [ list ] ) )",
      );
    transformed = replaceOne(
      transformed,
      "\t\tlists = new WeakMap();",
      "\t\tlists.clear();",
      fileName,
      "WebGLRenderLists map reset",
    );
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLMaterials.js")) {
    transformed = replaceOne(
      transformed,
      "function WebGLMaterials( renderer, properties ) {",
      "/** @typedef {import('../shaders/UniformsLib.js').NativeUniforms} NativeUniforms */\n/** @typedef {import('../shaders/UniformsLib.js').NativeUniformSlot} NativeUniformSlot */\n\nfunction WebGLMaterials( renderer, properties ) {",
      fileName,
      "WebGLMaterials native uniform table",
    );
    transformed = replaceOne(
      transformed,
      "import { getUnlitUniformColorSpace } from '../shaders/UniformsUtils.js';",
      "import { getUnlitUniformColorSpace, uniformColor, uniformMatrix3, uniformVector2, uniformVector3 } from '../shaders/UniformsUtils.js';",
      fileName,
      "WebGLMaterials uniform accessor imports",
    );
    transformed = replaceOne(
      transformed,
      "\t\tuniform.value.copy( map.matrix );",
      "\t\tuniformMatrix3( uniform ).copy( map.matrix );",
      fileName,
      "WebGLMaterials texture transform target",
    );
    transformed = replaceOne(
      transformed,
      "\t\tfog.color.getRGB( uniforms.fogColor.value, getUnlitUniformColorSpace( renderer ) );",
      "\t\tfog.color.getRGB( uniformColor( uniforms.fogColor ), getUnlitUniformColorSpace( renderer ) );",
      fileName,
      "WebGLMaterials fog color target",
    );

    transformed = replaceOne(
      transformed,
      "\tfunction refreshTransformUniform( map, uniform ) {",
      "\t/** @param {import('../../textures/Texture.js').Texture} map @param {NativeUniformSlot} uniform */\n\tfunction refreshTransformUniform( map, uniform ) {",
      fileName,
      "WebGLMaterials texture transform input",
    );
    const uniformHelperSignatures = [
      "refreshFogUniforms( uniforms, fog )",
      "refreshMaterialUniforms( uniforms, material, pixelRatio, height, transmissionRenderTarget )",
      "refreshUniformsLine( uniforms, material )",
      "refreshUniformsSprites( uniforms, material )",
      "refreshUniformsPhong( uniforms, material )",
      "refreshUniformsToon( uniforms, material )",
      "refreshUniformsStandard( uniforms, material )",
      "refreshUniformsMatcap( uniforms, material )",
      "refreshUniformsDistance( uniforms, material )",
    ];
    for (const signature of uniformHelperSignatures) {
      const materialAnnotation = signature.startsWith(
        "refreshMaterialUniforms(",
      )
        ? " @param {import('../../materials/Material.js').Material} material"
        : "";
      transformed = replaceOne(
        transformed,
        `\tfunction ${signature} {`,
        `\t/** @param {NativeUniforms} uniforms${materialAnnotation} */\n\tfunction ${signature} {`,
        fileName,
        `WebGLMaterials ${signature.slice(0, signature.indexOf("("))} uniform cache`,
      );
    }
    transformed = replaceOne(
      transformed,
      "\tfunction refreshUniformsCommon( uniforms, material ) {",
      "\t/** @param {NativeUniforms} uniforms @param {import('../../materials/Material.js').Material} material */\n\tfunction refreshUniformsCommon( uniforms, material ) {",
      fileName,
      "WebGLMaterials common material",
    );
    transformed = replaceOne(
      transformed,
      "\t\tif ( material.emissive ) {\n\n\t\t\tuniforms.emissive.value.copy( material.emissive ).multiplyScalar( material.emissiveIntensity );",
      "\t\tconst emissiveIntensity = material.emissiveIntensity;\n\n\t\tif ( material.emissive && typeof emissiveIntensity === 'number' ) {\n\n\t\t\tuniforms.emissive.value.copy( material.emissive ).multiplyScalar( emissiveIntensity );",
      fileName,
      "WebGLMaterials emissive intensity",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tuniforms.bumpScale.value *= - 1;",
      "\t\t\t\tconst bumpScale = uniforms.bumpScale.value;\n\n\t\t\t\tif ( typeof bumpScale === 'number' ) uniforms.bumpScale.value = - bumpScale;",
      fileName,
      "WebGLMaterials numeric back-side bump scale",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction refreshUniformsDash( uniforms, material ) {",
      "\t/** @param {NativeUniforms} uniforms @param {import('../../materials/LineDashedMaterial.js').LineDashedMaterial} material */\n\tfunction refreshUniformsDash( uniforms, material ) {",
      fileName,
      "WebGLMaterials dashed-line material",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction refreshUniformsPoints( uniforms, material, pixelRatio, height ) {",
      "\t/** @param {NativeUniforms} uniforms @param {import('../../materials/PointsMaterial.js').PointsMaterial} material @param {number} pixelRatio @param {number} height */\n\tfunction refreshUniformsPoints( uniforms, material, pixelRatio, height ) {",
      fileName,
      "WebGLMaterials points material",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction refreshUniformsPhysical( uniforms, material, transmissionRenderTarget ) {",
      "\t/** @param {NativeUniforms} uniforms @param {import('../../materials/MeshPhysicalMaterial.js').MeshPhysicalMaterial} material @param {import('../WebGLRenderTarget.js').WebGLRenderTarget} transmissionRenderTarget */\n\tfunction refreshUniformsPhysical( uniforms, material, transmissionRenderTarget ) {",
      fileName,
      "WebGLMaterials physical material",
    );
    // Every `uniforms.<name>.value.<method>(` in three trusts the shader
    // template to have put a Color/Vector/Matrix in that slot; over the union
    // the same trust is a narrowing read that fails loudly when misplaced.
    transformed = rewriteUniformValueMethods(transformed, fileName, {
      color: "uniformColor",
      diffuse: "uniformColor",
      emissive: "uniformColor",
      specular: "uniformColor",
      sheenColor: "uniformColor",
      attenuationColor: "uniformColor",
      specularColor: "uniformColor",
      normalScale: "uniformVector2",
      clearcoatNormalScale: "uniformVector2",
      transmissionSamplerSize: "uniformVector2",
      anisotropyVector: "uniformVector2",
      envMapRotation: "uniformMatrix3",
      referencePosition: "uniformVector3",
    });
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLCapabilities.js")) {
    const numericParameters = [
      ["maxTextures", "MAX_TEXTURE_IMAGE_UNITS"],
      ["maxVertexTextures", "MAX_VERTEX_TEXTURE_IMAGE_UNITS"],
      ["maxTextureSize", "MAX_TEXTURE_SIZE"],
      ["maxCubemapSize", "MAX_CUBE_MAP_TEXTURE_SIZE"],
      ["maxAttributes", "MAX_VERTEX_ATTRIBS"],
      ["maxVertexUniforms", "MAX_VERTEX_UNIFORM_VECTORS"],
      ["maxVaryings", "MAX_VARYING_VECTORS"],
      ["maxFragmentUniforms", "MAX_FRAGMENT_UNIFORM_VECTORS"],
      ["maxSamples", "MAX_SAMPLES"],
      ["samples", "SAMPLES"],
    ];
    for (const [local, parameter] of numericParameters) {
      transformed = replaceOne(
        transformed,
        `\tconst ${local} = gl.getParameter( gl.${parameter} );`,
        `\tconst ${local} = /** @type {number} */ ( gl.getParameter( gl.${parameter} ) );`,
        fileName,
        `WebGLCapabilities ${local}`,
      );
    }
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLAttributes.js")) {
    transformed = `import { BufferAttribute } from '../../core/BufferAttribute.js';
import { GLBufferAttribute } from '../../core/GLBufferAttribute.js';
import { InterleavedBuffer } from '../../core/InterleavedBuffer.js';
import { InterleavedBufferAttribute } from '../../core/InterleavedBufferAttribute.js';

/** @typedef {${nativeTypedArrayType}} NativeAttributeArray */
/** @typedef {{ buffer: import('@geastack/native-webgl-angle/nativeWebGL').NativeHandle, type: number, bytesPerElement: number, version: number, size?: number }} NativeAttributeBufferCache */
/** @param {NativeAttributeArray} array @return {number} */
function getAttributeArrayByteLength( array ) {

\tif ( array instanceof Int8Array ) return array.byteLength;
\tif ( array instanceof Uint8Array ) return array.byteLength;
\tif ( array instanceof Uint8ClampedArray ) return array.byteLength;
\tif ( array instanceof Int16Array ) return array.byteLength;
\tif ( array instanceof Uint16Array ) return array.byteLength;
\tif ( array instanceof Int32Array ) return array.byteLength;
\tif ( array instanceof Uint32Array ) return array.byteLength;
\tif ( array instanceof Float32Array ) return array.byteLength;
\tif ( array instanceof Float64Array ) return array.byteLength;

\tthrow new Error( 'Unsupported typed array.' );

}

/** @param {NativeAttributeArray} array @return {number} */
function getAttributeArrayBytesPerElement( array ) {

\tif ( array instanceof Int8Array ) return 1;
\tif ( array instanceof Uint8Array ) return 1;
\tif ( array instanceof Uint8ClampedArray ) return 1;
\tif ( array instanceof Int16Array ) return 2;
\tif ( array instanceof Uint16Array ) return 2;
\tif ( array instanceof Int32Array ) return 4;
\tif ( array instanceof Uint32Array ) return 4;
\tif ( array instanceof Float32Array ) return 4;
\tif ( array instanceof Float64Array ) return 8;

\tthrow new Error( 'Unsupported typed array.' );

}

/** @param {NativeAttributeArray} array @return {number} */
function getAttributeArrayKind( array ) {

	if ( array instanceof Float32Array ) return 1;
	if ( array instanceof Uint16Array ) return 2;
	if ( array instanceof Uint32Array ) return 3;
	if ( array instanceof Uint8Array ) return 4;
	if ( array instanceof Uint8ClampedArray ) return 4;
	if ( array instanceof Int8Array ) return 5;
	if ( array instanceof Int16Array ) return 6;
	if ( array instanceof Int32Array ) return 7;
	if ( array instanceof Float64Array ) return 8;

	throw new Error( 'Unsupported typed array.' );

}

${transformed}`;
    transformed = replaceOne(
      transformed,
      "\tconst buffers = new WeakMap();",
      "\t/** @type {WeakMap<BufferAttribute|InterleavedBuffer|GLBufferAttribute, NativeAttributeBufferCache>} */\n\tconst buffers = new ( /** @type {new () => WeakMap<BufferAttribute|InterleavedBuffer|GLBufferAttribute, NativeAttributeBufferCache>} */ ( WeakMap ) )();",
      fileName,
      "WebGLAttributes typed buffer cache",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction createBuffer(",
      "\t/** @param {BufferAttribute|InterleavedBuffer} attribute @return {NativeAttributeBufferCache} */\n\tfunction createBuffer(",
      fileName,
      "WebGLAttributes.createBuffer array input and cache result",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction updateBuffer(",
      "\t/** @param {BufferAttribute|InterleavedBuffer} attribute */\n\tfunction updateBuffer(",
      fileName,
      "WebGLAttributes.updateBuffer array input",
    );
    for (const name of ["get", "remove", "update"]) {
      transformed = replaceOne(
        transformed,
        `\tfunction ${name}( attribute`,
        `\t/** @param {BufferAttribute|InterleavedBufferAttribute|GLBufferAttribute} attribute */\n\tfunction ${name}( attribute`,
        fileName,
        `WebGLAttributes.${name} input`,
      );
    }
    const interleavedNormalization =
      "\t\tif ( attribute.isInterleavedBufferAttribute ) attribute = attribute.data;";
    const interleavedNormalizationCount =
      transformed.split(interleavedNormalization).length - 1;
    if (interleavedNormalizationCount !== 3) {
      throw new Error(
        `Three WebGLAttributes source at ${fileName} has ${interleavedNormalizationCount} interleaved normalizations; expected 3`,
      );
    }
    transformed = transformed.replaceAll(
      interleavedNormalization,
      "\t\tconst dataAttribute = attribute instanceof InterleavedBufferAttribute ? attribute.data : attribute;",
    );
    transformed = replaceOne(
      transformed,
      "\t\tconst size = array.byteLength;",
      "\t\tconst size = getAttributeArrayByteLength( array );",
      fileName,
      "WebGLAttributes array byte length",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tbytesPerElement: array.BYTES_PER_ELEMENT,",
      "\t\t\tbytesPerElement: getAttributeArrayBytesPerElement( array ),",
      fileName,
      "WebGLAttributes array element size",
    );
    transformed = replaceOne(
      transformed,
      "\t\tgl.bufferData( bufferType, array, usage );",
      "\t\tgl.bufferDataWithKind( bufferType, array, usage, getAttributeArrayKind( array ) );",
      fileName,
      "WebGLAttributes explicit buffer data kind",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tgl.bufferSubData( bufferType, 0, array );",
      "\t\t\tgl.bufferSubDataWithKind( bufferType, 0, array, getAttributeArrayKind( array ) );",
      fileName,
      "WebGLAttributes explicit full buffer update kind",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tgl.bufferSubData( bufferType, range.start * array.BYTES_PER_ELEMENT,",
      "\t\t\t\tgl.bufferSubDataWithKind( bufferType, range.start * getAttributeArrayBytesPerElement( array ),",
      fileName,
      "WebGLAttributes update range element size",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\tarray, range.start, range.count );",
      "\t\t\t\t\tarray, getAttributeArrayKind( array ), range.start, range.count );",
      fileName,
      "WebGLAttributes explicit ranged buffer update kind",
    );
    for (const name of ["get", "remove", "update"]) {
      const start = transformed.indexOf(`\tfunction ${name}( attribute`);
      const end = transformed.indexOf("\n\t}\n", start);
      if (start < 0 || end < 0)
        throw new Error(
          `Three WebGLAttributes.${name} source at ${fileName} no longer matches the native adaptation`,
        );
      let body = transformed.slice(start, end);
      body = body
        .replaceAll("attribute.", "dataAttribute.")
        .replaceAll("buffers.get( attribute )", "buffers.get( dataAttribute )")
        .replaceAll("buffers.set( attribute,", "buffers.set( dataAttribute,")
        .replaceAll(
          "buffers.delete( attribute )",
          "buffers.delete( dataAttribute )",
        )
        .replaceAll("createBuffer( attribute,", "createBuffer( dataAttribute,")
        .replaceAll(
          "updateBuffer( data.buffer, attribute,",
          "updateBuffer( data.buffer, dataAttribute,",
        )
        .replace(
          "attribute instanceof InterleavedBufferAttribute ? dataAttribute.data : attribute",
          "attribute instanceof InterleavedBufferAttribute ? attribute.data : attribute",
        )
        .replace(
          "if ( dataAttribute.isGLBufferAttribute )",
          "if ( dataAttribute instanceof GLBufferAttribute )",
        )
        .replace(
          "dataAttribute.array.byteLength",
          "getAttributeArrayByteLength( dataAttribute.array )",
        );
      transformed = transformed.slice(0, start) + body + transformed.slice(end);
    }
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLShadowMap.js")) {
    transformed = replaceOne(
      transformed,
      "\t\tuniforms: {\n\t\t\tshadow_pass:",
      "\t\tuniforms: /** @type {import('../shaders/UniformsLib.js').NativeUniforms} */ ( {\n\t\t\tshadow_pass:",
      fileName,
      "WebGLShadowMap VSM uniform table",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tradius: { value: 4.0 }\n\t\t},",
      "\t\t\tradius: { value: 4.0 }\n\t\t} ),",
      fileName,
      "WebGLShadowMap VSM uniform table close",
    );
    transformed = replaceOne(
      transformed,
      "import { CubeDepthTexture } from '../../textures/CubeDepthTexture.js';",
      "import { CubeDepthTexture } from '../../textures/CubeDepthTexture.js';\nimport { Line } from '../../objects/Line.js';\nimport { Points } from '../../objects/Points.js';\nimport { DirectionalLight } from '../../lights/DirectionalLight.js';\nimport { SpotLight } from '../../lights/SpotLight.js';\nimport { DirectionalLightShadow } from '../../lights/DirectionalLightShadow.js';\nimport { SpotLightShadow } from '../../lights/SpotLightShadow.js';\nimport { Material } from '../../materials/Material.js';",
      fileName,
      "WebGLShadowMap light class imports",
    );
    transformed = replaceOne(
      transformed,
      "function WebGLShadowMap( renderer, objects, capabilities ) {",
      `/** @typedef {{ [materialUuid: string]: MeshDepthMaterial|MeshDistanceMaterial }} NativeShadowMaterialVariants */
/** @typedef {{ [baseMaterialUuid: string]: NativeShadowMaterialVariants }} NativeShadowMaterialCache */
function WebGLShadowMap( renderer, objects, capabilities ) {`,
      fileName,
      "WebGLShadowMap shadow material caches",
    );
    transformed = replaceOne(
      transformed,
      "\t\t_materialCache = {},",
      "\t\t/** @type {NativeShadowMaterialCache} */\n\t\t_materialCache = {},",
      fileName,
      "WebGLShadowMap material variant cache",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tif ( object.material ) {",
      "\t\t\t\tconst objectMaterial = object.material;\n\n\t\t\t\tif ( objectMaterial ) {",
      fileName,
      "WebGLShadowMap traversed material read",
    );
    transformed = transformed
      .replace(
        "Array.isArray( object.material )",
        "Array.isArray( objectMaterial )",
      )
      .replace(
        "object.material.needsUpdate = true;",
        "objectMaterial.needsUpdate = true;",
      );
    transformed = replaceOne(
      transformed,
      "\tconst shadowMaterialHorizontal = shadowMaterialVertical.clone();",
      "\tconst shadowMaterialHorizontal = new ShaderMaterial();\n\tshadowMaterialHorizontal.copy( shadowMaterialVertical );",
      fileName,
      "WebGLShadowMap horizontal VSM material",
    );
    transformed = replaceOne(
      transformed,
      "this.render = function ( lights, scene, camera ) {",
      "this.render = /** @this {WebGLShadowMap} @param {Array<import('../../lights/Light.js').Light>} lights */ function ( lights, scene, camera ) {",
      fileName,
      "WebGLShadowMap.render receiver",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\tconst camera = shadow.camera;",
      "\t\t\t\t\tconst camera = /** @type {import('../../cameras/PerspectiveCamera.js').PerspectiveCamera} */ ( shadow.camera );",
      fileName,
      "WebGLShadowMap point-light camera",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tshadow.camera.updateProjectionMatrix();",
      `\t\t\t\tconst projectionCamera = shadow.camera;

\t\t\t\tif ( projectionCamera.isPerspectiveCamera === true ) {

\t\t\t\t\tconst perspectiveCamera = /** @type {import('../../cameras/PerspectiveCamera.js').PerspectiveCamera} */ ( projectionCamera );
\t\t\t\t\tperspectiveCamera.updateProjectionMatrix();

\t\t\t\t} else if ( projectionCamera.isOrthographicCamera === true ) {

\t\t\t\t\tconst orthographicCamera = /** @type {import('../../cameras/OrthographicCamera.js').OrthographicCamera} */ ( projectionCamera );
\t\t\t\t\torthographicCamera.updateProjectionMatrix();

\t\t\t\t} else {

\t\t\t\t\tthrow new Error( 'THREE.WebGLShadowMap: Unsupported shadow camera.' );

\t\t\t\t}`,
      fileName,
      "WebGLShadowMap projection camera dispatch",
    );
    const shadowDepthTextureUpdates = [
      [
        "shadow.map.depthTexture = null;",
        "shadow.map.setDepthTexture( null );",
        "release",
      ],
      [
        "shadow.map.depthTexture = new DepthTexture( _shadowMapSize.x, _shadowMapSize.y, FloatType );",
        "shadow.map.setDepthTexture( new DepthTexture( _shadowMapSize.x, _shadowMapSize.y, FloatType ) );",
        "VSM",
      ],
      [
        "shadow.map.depthTexture = new CubeDepthTexture( _shadowMapSize.x, UnsignedIntType );",
        "shadow.map.setDepthTexture( new CubeDepthTexture( _shadowMapSize.x, UnsignedIntType ) );",
        "cube",
      ],
      [
        "shadow.map.depthTexture = new DepthTexture( _shadowMapSize.x, _shadowMapSize.y, UnsignedIntType );",
        "shadow.map.setDepthTexture( new DepthTexture( _shadowMapSize.x, _shadowMapSize.y, UnsignedIntType ) );",
        "2D",
      ],
    ];
    for (const [before, after, kind] of shadowDepthTextureUpdates) {
      transformed = replaceOne(
        transformed,
        before,
        after,
        fileName,
        `WebGLShadowMap ${kind} depth texture update`,
      );
    }
    transformed = replaceOne(
      transformed,
      "\t\t\t\t} else {\n\n\t\t\t\t\tshadow.updateMatrices( light );",
      "\t\t\t\t} else if ( light instanceof DirectionalLight && shadow instanceof DirectionalLightShadow ) {\n\n\t\t\t\t\tshadow.updateMatrices( light );\n\n\t\t\t\t} else if ( light instanceof SpotLight && shadow instanceof SpotLightShadow ) {\n\n\t\t\t\t\tshadow.updateMatrices( light );\n\n\t\t\t\t} else {\n\n\t\t\t\t\tthrow new Error( 'THREE.WebGLShadowMap: Unsupported shadow light.' );",
      fileName,
      "WebGLShadowMap non-point light narrowing",
    );
    transformed = replaceOne(
      transformed,
      `\tfunction onMaterialDispose( event ) {

\t\tconst material = event.target;

\t\tmaterial.removeEventListener( 'dispose', onMaterialDispose );

\t\t// make sure to remove the unique distance/depth materials used for shadow map rendering

\t\tfor ( const id in _materialCache ) {

\t\t\tconst cache = _materialCache[ id ];

\t\t\tconst uuid = event.target.uuid;

\t\t\tif ( uuid in cache ) {

\t\t\t\tconst shadowMaterial = cache[ uuid ];
\t\t\t\tshadowMaterial.dispose();
\t\t\t\tdelete cache[ uuid ];

\t\t\t}

\t\t}

\t}`,
      `\tfunction onMaterialDispose( event ) {

\t\tconst material = event.target;

\t\tif ( ! ( material instanceof Material ) ) return;

\t\tmaterial.removeEventListener( 'dispose', onMaterialDispose );

\t\t// make sure to remove the unique distance/depth materials used for shadow map rendering

\t\tconst cacheIds = Object.keys( _materialCache );

\t\tfor ( let i = 0; i < cacheIds.length; i ++ ) {

\t\t\tconst cacheId = String( cacheIds[ i ] );

\t\t\tconst cache = _materialCache[ cacheId ];
\t\t\tconst shadowMaterial = cache[ material.uuid ];

\t\t\tif ( shadowMaterial !== undefined ) {

\t\t\t\tshadowMaterial.dispose();
\t\t\t\tdelete cache[ material.uuid ];

\t\t\t}

\t\t}

\t}`,
      fileName,
      "WebGLShadowMap material cache disposal",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\t\tobject.material.forEach( mat => mat.needsUpdate = true );",
      "\t\t\t\t\t\tconst objectMaterials = /** @type {Array<import('../../materials/Material.js').Material>} */ ( objectMaterial );\n\t\t\t\t\t\tobjectMaterials.forEach( mat => mat.needsUpdate = true );",
      fileName,
      "WebGLShadowMap traversed material array",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction getDepthMaterial( object, material, light, type ) {",
      "\t/** @param {import('../../core/Object3D.js').Object3D} object @param {import('../../materials/Material.js').Material} material @param {import('../../lights/Light.js').Light} light @param {number} type @return {MeshDepthMaterial|MeshDistanceMaterial} */\n\tfunction getDepthMaterial( object, material, light, type ) {",
      fileName,
      "WebGLShadowMap depth material inputs",
    );
    transformed = replaceOne(
      transformed,
      "\t\tconst customMaterial = ( light.isPointLight === true ) ? object.customDistanceMaterial : object.customDepthMaterial;",
      `\t\tconst customDistanceMaterial = light.isPointLight === true
\t\t\t? /** @type {MeshDistanceMaterial|undefined} */ ( object.customDistanceMaterial )
\t\t\t: undefined;
\t\tconst customDepthMaterial = light.isPointLight === true
\t\t\t? undefined
\t\t\t: /** @type {MeshDepthMaterial|undefined} */ ( object.customDepthMaterial );`,
      fileName,
      "WebGLShadowMap custom material types",
    );
    transformed = replaceOne(
      transformed,
      `\t\tif ( customMaterial !== undefined ) {

\t\t\tresult = customMaterial;

\t\t} else {`,
      `\t\tif ( customDistanceMaterial !== undefined ) {

\t\t\tresult = customDistanceMaterial;

\t\t} else if ( customDepthMaterial !== undefined ) {

\t\t\tresult = customDepthMaterial;

\t\t} else {`,
      fileName,
      "WebGLShadowMap custom material branch narrowing",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\tcachedMaterial = result.clone();",
      `\t\t\t\t\tif ( result instanceof MeshDepthMaterial ) {

\t\t\t\t\t\tconst clonedDepthMaterial = new MeshDepthMaterial();
\t\t\t\t\t\tclonedDepthMaterial.copy( result );
\t\t\t\t\t\tcachedMaterial = clonedDepthMaterial;

\t\t\t\t\t} else {

\t\t\t\t\t\tconst clonedDistanceMaterial = new MeshDistanceMaterial();
\t\t\t\t\t\tclonedDistanceMaterial.copy( result );
\t\t\t\t\t\tcachedMaterial = clonedDistanceMaterial;

\t\t\t\t\t}`,
      fileName,
      "WebGLShadowMap cloned material subtype",
    );
    transformed = replaceOne(
      transformed,
      "\t\tlet result = null;",
      "\t\tlet result = ( light.isPointLight === true ) ? _distanceMaterial : _depthMaterial;",
      fileName,
      "WebGLShadowMap non-optional depth material result",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\tresult = ( light.isPointLight === true ) ? _distanceMaterial : _depthMaterial;

\t\t\tif ( ( renderer.localClippingEnabled`,
      `\t\t\tif ( ( renderer.localClippingEnabled`,
      fileName,
      "WebGLShadowMap initialized depth material result",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\t\tlet cachedMaterial = materialsForVariant[ keyB ];

\t\t\t\tif ( cachedMaterial === undefined ) {

\t\t\t\t\tif ( result instanceof MeshDepthMaterial ) {

\t\t\t\t\t\tconst clonedDepthMaterial = new MeshDepthMaterial();
\t\t\t\t\t\tclonedDepthMaterial.copy( result );
\t\t\t\t\t\tcachedMaterial = clonedDepthMaterial;

\t\t\t\t\t} else {

\t\t\t\t\t\tconst clonedDistanceMaterial = new MeshDistanceMaterial();
\t\t\t\t\t\tclonedDistanceMaterial.copy( result );
\t\t\t\t\t\tcachedMaterial = clonedDistanceMaterial;

\t\t\t\t\t}
\t\t\t\t\tmaterialsForVariant[ keyB ] = cachedMaterial;
\t\t\t\t\tmaterial.addEventListener( 'dispose', onMaterialDispose );

\t\t\t\t}

\t\t\t\tresult = cachedMaterial;`,
      `\t\t\t\tconst cachedMaterial = materialsForVariant[ keyB ];

\t\t\t\tif ( cachedMaterial === undefined ) {

\t\t\t\t\tif ( result instanceof MeshDepthMaterial ) {

\t\t\t\t\t\tconst clonedDepthMaterial = new MeshDepthMaterial();
\t\t\t\t\t\tclonedDepthMaterial.copy( result );
\t\t\t\t\t\tmaterialsForVariant[ keyB ] = clonedDepthMaterial;
\t\t\t\t\t\tresult = clonedDepthMaterial;

\t\t\t\t\t} else {

\t\t\t\t\t\tconst clonedDistanceMaterial = new MeshDistanceMaterial();
\t\t\t\t\t\tclonedDistanceMaterial.copy( result );
\t\t\t\t\t\tmaterialsForVariant[ keyB ] = clonedDistanceMaterial;
\t\t\t\t\t\tresult = clonedDistanceMaterial;

\t\t\t\t\t}
\t\t\t\t\tmaterial.addEventListener( 'dispose', onMaterialDispose );

\t\t\t\t} else {

\t\t\t\t\tresult = cachedMaterial;

\t\t\t\t}`,
      fileName,
      "WebGLShadowMap variant material cache narrowing",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction renderObject( object, camera, shadowCamera, light, type ) {",
      "\t/** @param {import('../../core/Object3D.js').Object3D} object */\n\tfunction renderObject( object, camera, shadowCamera, light, type ) {",
      fileName,
      "WebGLShadowMap render object type",
    );
    transformed = replaceOne(
      transformed,
      "\t\tif ( visible && ( object.isMesh || object.isLine || object.isPoints ) ) {",
      "\t\tif ( visible && ( object instanceof Mesh || object instanceof Line || object instanceof Points ) ) {",
      fileName,
      "WebGLShadowMap drawable object narrowing",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tif ( Array.isArray( material ) ) {\n\n\t\t\t\t\tconst groups = geometry.groups;",
      "\t\t\t\tif ( Array.isArray( material ) ) {\n\n\t\t\t\t\tconst materialArray = /** @type {Array<import('../../materials/Material.js').Material>} */ ( material );\n\t\t\t\t\tconst groups = geometry.groups;",
      fileName,
      "WebGLShadowMap render material array",
    );
    transformed = transformed.replace(
      "\t\t\t\t\t\tconst groupMaterial = material[ group.materialIndex ];",
      "\t\t\t\t\t\tconst materialIndex = group.materialIndex;\n\n\t\t\t\t\t\tif ( typeof materialIndex !== 'number' ) continue;\n\n\t\t\t\t\t\tconst groupMaterial = materialArray[ materialIndex ];",
    );
    // The `else` of the same `Array.isArray` test, bound to a name for the
    // same reason the array side two statements up is. `Mesh.material` is
    // written unannotated in three's own JS, so the checker types it `any` --
    // and `Array.isArray` narrows nothing out of an `any`. The compiler's own
    // field census knows better (`Material | Material[]`), which is why the
    // union reaches emission and `visible` is read on a carrier one of whose
    // arms is an array.
    // `Material.setValues` is reflective -- `this[ key ] = newValue` -- and the
    // runtime stores a dynamic value into a declared field by EXACT carrier
    // identity. `defines` is a `Record<string, string|number|boolean>` on the
    // material; a bare `{ VSM_SAMPLES: 8 }` is laid out as a one-field struct,
    // so the store would refuse at run time. State the literal's type where it
    // is written and it is allocated as the same dictionary the field holds.
    transformed = replaceOne(
      transformed,
      "\tconst shadowMaterialVertical = new ShaderMaterial( {\n\t\tdefines: {\n\t\t\tVSM_SAMPLES: 8\n\t\t},",
      "\tconst shadowMaterialVertical = new ShaderMaterial( {\n\t\tdefines: /** @type {Record<string, string|number|boolean>} */ ( {\n\t\t\tVSM_SAMPLES: 8\n\t\t} ),",
      fileName,
      "WebGLShadowMap VSM defines table",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t} else if ( material.visible ) {\n\n\t\t\t\t\tconst depthMaterial = getDepthMaterial( object, material, light, type );\n\n\t\t\t\t\tobject.onBeforeShadow( renderer, object, camera, shadowCamera, geometry, depthMaterial, null );\n\n\t\t\t\t\trenderer.renderBufferDirect( shadowCamera, null, geometry, depthMaterial, object, null );\n\n\t\t\t\t\tobject.onAfterShadow( renderer, object, camera, shadowCamera, geometry, depthMaterial, null );\n\n\t\t\t\t}",
      "\t\t\t\t} else {\n\n\t\t\t\t\tconst singleMaterial = /** @type {import('../../materials/Material.js').Material} */ ( material );\n\n\t\t\t\t\tif ( singleMaterial.visible ) {\n\n\t\t\t\t\t\tconst depthMaterial = getDepthMaterial( object, singleMaterial, light, type );\n\n\t\t\t\t\t\tobject.onBeforeShadow( renderer, object, camera, shadowCamera, geometry, depthMaterial, null );\n\n\t\t\t\t\t\trenderer.renderBufferDirect( shadowCamera, null, geometry, depthMaterial, object, null );\n\n\t\t\t\t\t\tobject.onAfterShadow( renderer, object, camera, shadowCamera, geometry, depthMaterial, null );\n\n\t\t\t\t\t}\n\n\t\t\t\t}",
      fileName,
      "WebGLShadowMap render single material",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\t\tobjectMaterial.needsUpdate = true;\n\n\t\t\t\t\t}\n\n\t\t\t\t}\n\n\t\t\t} );",
      "\t\t\t\t\t\tobjectMaterial.needsUpdate = true;\n\n\t\t\t\t\t}\n\n\t\t\t\t}\n\n\t\t\t\treturn 0;\n\n\t\t\t} );",
      fileName,
      "WebGLShadowMap traversal result",
    );
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLUniforms.js")) {
    // Replaced whole -- see `geatsc-plugin-uniforms.mjs`.
    transformed = nativeWebGLUniformsSource;
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLBackground.js")) {
    transformed = replaceOne(
      transformed,
      "import { ShaderLib } from '../shaders/ShaderLib.js';",
      `import { ShaderLib } from '../shaders/ShaderLib.js';
import { Scene } from '../../scenes/Scene.js';
import { uniformMatrix3, uniformTexture } from '../shaders/UniformsUtils.js';

class WebGLBackgroundCubeMaterial extends ShaderMaterial {

\t/** @param {import('../../textures/Texture.js').Texture} texture */
\tsetEnvironment( texture ) {

\t\tthis.uniforms.envMap.value = texture;

\t}

\t/** @this {WebGLBackgroundCubeMaterial} */
\tget envMap() {

\t\treturn uniformTexture( this.uniforms.envMap );

\t}

}

class WebGLBackgroundPlaneMaterial extends ShaderMaterial {

\t/** @param {import('../../textures/Texture.js').Texture} texture */
\tsetMap( texture ) {

\t\tthis.uniforms.t2D.value = texture;

\t}

\t/** @this {WebGLBackgroundPlaneMaterial} */
\tget map() {

\t\treturn uniformTexture( this.uniforms.t2D );

\t}

}`,
      fileName,
      "WebGLBackground scene type import",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction getBackground( scene ) {",
      "\t/** @param {Scene} scene */\n\tfunction getBackground( scene ) {",
      fileName,
      "WebGLBackground background scene input",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction render( scene ) {",
      "\t/** @param {Scene} scene */\n\tfunction render( scene ) {",
      fileName,
      "WebGLBackground scene input",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction addToRenderList( renderList, scene ) {",
      "\t/** @param {Scene} scene */\n\tfunction addToRenderList( renderList, scene ) {",
      fileName,
      "WebGLBackground render-list scene input",
    );
    transformed = replaceOne(
      transformed,
      "\tlet planeMesh;\n\tlet boxMesh;",
      `\tlet planeMesh;
\tlet boxMesh;
\t/** @type {WebGLBackgroundPlaneMaterial|undefined} */
\tlet planeMaterial;
\t/** @type {WebGLBackgroundCubeMaterial|undefined} */
\tlet boxMaterial;`,
      fileName,
      "WebGLBackground retained material carriers",
    );
    transformed = replaceOne(
      transformed,
      "const _rgb = { r: 0, b: 0, g: 0 };",
      "const _rgb = /*@__PURE__*/ new Color();",
      fileName,
      "WebGLBackground temporary color",
    );
    transformed = replaceOne(
      transformed,
      "boxMesh.onBeforeRender = function ( renderer, scene, camera ) {",
      "boxMesh.onBeforeRender = /** @this {Mesh} */ function ( renderer, scene, camera ) {",
      fileName,
      "WebGLBackground box receiver",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\tif ( background.matrixAutoUpdate === true ) {

\t\t\t\tbackground.updateMatrix();

\t\t\t}

\t\t\tplaneMesh.material.uniforms.uvTransform.value.copy( background.matrix );`,
      `\t\t\tconst textureBackground = /** @type {import('../../textures/Texture.js').Texture} */ ( background );

\t\t\tif ( textureBackground.matrixAutoUpdate === true ) {

\t\t\t\ttextureBackground.updateMatrix();

\t\t\t}

\t\t\tplaneMesh.material.uniforms.uvTransform.value.copy( textureBackground.matrix );`,
      fileName,
      "WebGLBackground texture matrix carrier",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\t\t// add "envMap" material property so the renderer can evaluate it like for built-in materials
\t\t\t\tObject.defineProperty( boxMesh.material, 'envMap', {

\t\t\t\t\tget: function () {

\t\t\t\t\t\treturn this.uniforms.envMap.value;

\t\t\t\t\t}

\t\t\t\t} );

`,
      "",
      fileName,
      "WebGLBackground cube material descriptor",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\t\t// add "map" material property so the renderer can evaluate it like for built-in materials
\t\t\t\tObject.defineProperty( planeMesh.material, 'map', {

\t\t\t\t\tget: function () {

\t\t\t\t\t\treturn this.uniforms.t2D.value;

\t\t\t\t\t}

\t\t\t\t} );

`,
      "",
      fileName,
      "WebGLBackground plane material descriptor",
    );
    transformed = replaceOne(
      transformed,
      "new ShaderMaterial( {\n\t\t\t\t\t\tname: 'BackgroundCubeMaterial'",
      "new WebGLBackgroundCubeMaterial( {\n\t\t\t\t\t\tname: 'BackgroundCubeMaterial'",
      fileName,
      "WebGLBackground cube material class",
    );
    transformed = replaceOne(
      transformed,
      "new ShaderMaterial( {\n\t\t\t\t\t\tname: 'BackgroundMaterial'",
      "new WebGLBackgroundPlaneMaterial( {\n\t\t\t\t\t\tname: 'BackgroundMaterial'",
      fileName,
      "WebGLBackground plane material class",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\t\tboxMesh = new Mesh(
\t\t\t\t\tnew BoxGeometry( 1, 1, 1 ),
\t\t\t\t\tnew WebGLBackgroundCubeMaterial( {`,
      `\t\t\t\tconst material = new WebGLBackgroundCubeMaterial( {`,
      fileName,
      "WebGLBackground retained cube material construction",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\t\t\t\tallowOverride: false
\t\t\t\t\t} )
\t\t\t\t);

\t\t\t\tboxMesh.geometry.deleteAttribute( 'normal' );`,
      `\t\t\t\t\tallowOverride: false
\t\t\t\t} );
\t\t\t\tconst mesh = new Mesh( new BoxGeometry( 1, 1, 1 ), material );
\t\t\t\tboxMesh = mesh;
\t\t\t\tboxMaterial = material;

\t\t\t\tmesh.geometry.deleteAttribute( 'normal' );`,
      fileName,
      "WebGLBackground retained cube material assignment",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tboxMesh.geometry.deleteAttribute( 'uv' );",
      "\t\t\t\tmesh.geometry.deleteAttribute( 'uv' );",
      fileName,
      "WebGLBackground cube initialization geometry",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tboxMesh.onBeforeRender = /** @this {Mesh} */ function ( renderer, scene, camera ) {",
      "\t\t\t\tmesh.onBeforeRender = /** @this {Mesh} */ function ( renderer, scene, camera ) {",
      fileName,
      "WebGLBackground cube initialization receiver",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tobjects.update( boxMesh );",
      "\t\t\t\tobjects.update( mesh );",
      fileName,
      "WebGLBackground cube initialization update",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\t\tplaneMesh = new Mesh(
\t\t\t\t\tnew PlaneGeometry( 2, 2 ),
\t\t\t\t\tnew WebGLBackgroundPlaneMaterial( {`,
      `\t\t\t\tconst material = new WebGLBackgroundPlaneMaterial( {`,
      fileName,
      "WebGLBackground retained plane material construction",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\t\t\t\tallowOverride: false
\t\t\t\t\t} )
\t\t\t\t);

\t\t\t\tplaneMesh.geometry.deleteAttribute( 'normal' );`,
      `\t\t\t\t\tallowOverride: false
\t\t\t\t} );
\t\t\t\tconst mesh = new Mesh( new PlaneGeometry( 2, 2 ), material );
\t\t\t\tplaneMesh = mesh;
\t\t\t\tplaneMaterial = material;

\t\t\t\tmesh.geometry.deleteAttribute( 'normal' );`,
      fileName,
      "WebGLBackground retained plane material assignment",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tobjects.update( planeMesh );",
      "\t\t\t\tobjects.update( mesh );",
      fileName,
      "WebGLBackground plane initialization update",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tboxMesh.material.uniforms.envMap.value = background;",
      "\t\t\tboxMesh.material.setEnvironment( /** @type {import('../../textures/Texture.js').Texture} */ ( background ) );",
      fileName,
      "WebGLBackground exact cube texture uniform",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tplaneMesh.material.uniforms.t2D.value = background;",
      "\t\t\tplaneMesh.material.setMap( /** @type {import('../../textures/Texture.js').Texture} */ ( background ) );",
      fileName,
      "WebGLBackground exact plane texture uniform",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tboxMesh.material.setEnvironment( /** @type {import('../../textures/Texture.js').Texture} */ ( background ) );",
      `\t\t\tconst activeBoxMaterial = boxMaterial;
\t\t\tif ( activeBoxMaterial === undefined ) throw new Error( 'THREE.WebGLBackground: Missing cube background material.' );
\t\t\tactiveBoxMaterial.setEnvironment( /** @type {import('../../textures/Texture.js').Texture} */ ( background ) );`,
      fileName,
      "WebGLBackground exact cube material holder",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tplaneMesh.material.setMap( /** @type {import('../../textures/Texture.js').Texture} */ ( background ) );",
      `\t\t\tconst activePlaneMaterial = planeMaterial;
\t\t\tif ( activePlaneMaterial === undefined ) throw new Error( 'THREE.WebGLBackground: Missing plane background material.' );
\t\t\tactivePlaneMaterial.setMap( /** @type {import('../../textures/Texture.js').Texture} */ ( background ) );`,
      fileName,
      "WebGLBackground exact plane material holder",
    );
    for (const [source, target, expected] of [
      [
        "boxMesh.material.uniforms.backgroundBlurriness",
        "activeBoxMaterial.uniforms.backgroundBlurriness",
        1,
      ],
      [
        "boxMesh.material.uniforms.backgroundIntensity",
        "activeBoxMaterial.uniforms.backgroundIntensity",
        1,
      ],
      [
        "boxMesh.material.uniforms.backgroundRotation",
        "activeBoxMaterial.uniforms.backgroundRotation",
        2,
      ],
      ["boxMesh.material.toneMapped", "activeBoxMaterial.toneMapped", 1],
      ["boxMesh.material.needsUpdate", "activeBoxMaterial.needsUpdate", 1],
      [
        "planeMesh.material.uniforms.backgroundIntensity",
        "activePlaneMaterial.uniforms.backgroundIntensity",
        1,
      ],
      [
        "planeMesh.material.uniforms.uvTransform",
        "activePlaneMaterial.uniforms.uvTransform",
        1,
      ],
      ["planeMesh.material.toneMapped", "activePlaneMaterial.toneMapped", 1],
      ["planeMesh.material.needsUpdate", "activePlaneMaterial.needsUpdate", 1],
    ]) {
      const count = transformed.split(source).length - 1;
      if (count !== expected) {
        throw new Error(
          `Three WebGLBackground source at ${fileName} has ${count} ${source} accesses; expected ${expected}`,
        );
      }
      transformed = transformed.replaceAll(source, target);
    }
    const renderMaterialSource =
      "renderList.unshift( boxMesh, boxMesh.geometry, boxMesh.material, 0, 0, null );";
    if (transformed.split(renderMaterialSource).length - 1 !== 1) {
      throw new Error(
        `Three WebGLBackground source at ${fileName} no longer has one cube render-list material access`,
      );
    }
    transformed = transformed.replace(
      renderMaterialSource,
      "renderList.unshift( boxMesh, boxMesh.geometry, activeBoxMaterial, 0, 0, null );",
    );
    const planeRenderMaterialSource =
      "renderList.unshift( planeMesh, planeMesh.geometry, planeMesh.material, 0, 0, null );";
    if (transformed.split(planeRenderMaterialSource).length - 1 !== 1) {
      throw new Error(
        `Three WebGLBackground source at ${fileName} no longer has one plane render-list material access`,
      );
    }
    transformed = transformed.replace(
      planeRenderMaterialSource,
      "renderList.unshift( planeMesh, planeMesh.geometry, activePlaneMaterial, 0, 0, null );",
    );
    transformed = replaceOne(
      transformed,
      `\t\tif ( boxMesh !== undefined ) {

\t\t\tboxMesh.geometry.dispose();
\t\t\tboxMesh.material.dispose();

\t\t\tboxMesh = undefined;

\t\t}`,
      `\t\tif ( boxMesh !== undefined ) {

\t\t\tboxMesh.geometry.dispose();
\t\t\tboxMesh = undefined;

\t\t}

\t\tif ( boxMaterial !== undefined ) {

\t\t\tboxMaterial.dispose();
\t\t\tboxMaterial = undefined;

\t\t}`,
      fileName,
      "WebGLBackground cube disposal",
    );
    transformed = replaceOne(
      transformed,
      `\t\tif ( planeMesh !== undefined ) {

\t\t\tplaneMesh.geometry.dispose();
\t\t\tplaneMesh.material.dispose();

\t\t\tplaneMesh = undefined;

\t\t}`,
      `\t\tif ( planeMesh !== undefined ) {

\t\t\tplaneMesh.geometry.dispose();
\t\t\tplaneMesh = undefined;

\t\t}

\t\tif ( planeMaterial !== undefined ) {

\t\t\tplaneMaterial.dispose();
\t\t\tplaneMaterial = undefined;

\t\t}`,
      fileName,
      "WebGLBackground plane disposal",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction setClear( color, alpha ) {",
      "\t/** @param {Color} color @param {number} alpha */\n\tfunction setClear( color, alpha ) {",
      fileName,
      "WebGLBackground clear inputs",
    );
    transformed = rewriteUniformValueMethods(transformed, fileName, {
      backgroundRotation: "uniformMatrix3",
      uvTransform: "uniformMatrix3",
    });
  }
  if (normalized.endsWith("/three/src/renderers/shaders/UniformsLib.js")) {
    transformed = transformUniformsLib(transformed, fileName, replaceOne);
  }
  if (normalized.endsWith("/three/src/renderers/shaders/UniformsUtils.js")) {
    transformed = transformUniformsUtils(transformed, fileName);
  }
  if (normalized.endsWith("/three/src/utils.js")) {
    const probeStart = "function probeAsync( gl, sync, interval ) {";
    const probeEnd = "\n}\n\n/**\n * Converts a projection matrix";
    const probeStartIndex = transformed.indexOf(probeStart);
    const probeEndIndex = transformed.indexOf(probeEnd, probeStartIndex);
    if (
      probeStartIndex < 0 ||
      probeEndIndex < 0 ||
      transformed.indexOf(probeStart, probeStartIndex + 1) >= 0
    ) {
      throw new Error(
        `Three async WebGL probe source at ${fileName} no longer matches the native adaptation`,
      );
    }
    transformed =
      transformed.slice(0, probeStartIndex) +
      "function probeAsync( gl, sync, interval ) {\n\n\treturn Promise.resolve( undefined );" +
      transformed.slice(probeEndIndex);
    transformed = replaceOne(
      transformed,
      "\t\t\tparams[ 0 ] += ' ' + stackTrace.getLocation();",
      "\t\t\tparams[ 0 ] = message + ' ' + String( stackTrace.getLocation() );",
      fileName,
      "enhanced log message string narrowing",
    );
    transformed = replaceOne(
      transformed,
      "let _setConsoleFunction = null;",
      "/** @type {null | ((type: string, message: string, ...params: string[]) => void)} */\n" +
        "let _setConsoleFunction = null;\n\n" +
        "function stringifyParams( params ) {\n\n" +
        "\tlet message = '';\n\n" +
        "\tfor ( let i = 0; i < params.length; i ++ ) {\n\n" +
        "\t\tif ( i > 0 ) message += ' ';\n" +
        "\t\tmessage += String( params[ i ] );\n\n" +
        "\t}\n\n" +
        "\treturn message;\n\n" +
        "}",
      fileName,
      "console callback signature",
    );
    const shiftedMessage = "const message = 'THREE.' + params.shift();";
    const shiftedMessageCount = transformed.split(shiftedMessage).length - 1;
    if (shiftedMessageCount !== 3) {
      throw new Error(
        `Three utils source at ${fileName} has ${shiftedMessageCount} shifted console messages; expected 3`,
      );
    }
    transformed = transformed.replaceAll(
      shiftedMessage,
      "const message = 'THREE.' + String( params[ 0 ] );\n\tparams = params.slice( 1 );",
    );
    for (const method of ["log", "warn", "error"]) {
      transformed = replaceOne(
        transformed,
        `console.${method}( message, ...params );`,
        `console.${method}( message + ( params.length > 0 ? ' ' + stringifyParams( params ) : '' ) );`,
        fileName,
        `console.${method} rest forwarding`,
      );
      // The custom console callback receives the same stringified params the
      // native console does, so its rest carries strings rather than `any`.
      transformed = replaceOne(
        transformed,
        `_setConsoleFunction( '${method}', message, ...params );`,
        `_setConsoleFunction( '${method}', message, ...params.map( ( param ) => String( param ) ) );`,
        fileName,
        `custom console ${method} rest forwarding`,
      );
    }
    transformed = replaceOne(
      transformed,
      "const message = params.join( ' ' );",
      "const message = stringifyParams( params );",
      fileName,
      "warnOnce message stringification",
    );
    const warnCalls = transformed.split("console.warn(").length - 1;
    if (warnCalls !== 2)
      throw new Error(
        `Three utils source at ${fileName} has ${warnCalls} console.warn calls; expected 2`,
      );
    transformed = transformed.replaceAll("console.warn(", "console.error(");
    transformed = replaceOne(
      transformed,
      "@param {number} interval - The polling interval in milliseconds.\n * @return {Promise<void>} A promise that resolves when the sync completes or rejects if it fails.",
      "@param {number} interval - The polling interval in milliseconds.\n * @return {Promise<undefined>} A promise that resolves when the sync completes or rejects if it fails.",
      fileName,
      "probeAsync resolved payload",
    );
  }
  if (
    normalized.endsWith("/three/src/renderers/webgl/WebGLClipping.js") &&
    transformed.includes("this.setState = function")
  ) {
    transformed = replaceOne(
      transformed,
      "\t\tuniform = { value: null, needsUpdate: false };",
      "\t\tuniform = /** @type {{ value: Float32Array|null, needsUpdate: boolean }} */ ( { value: null, needsUpdate: false } );",
      fileName,
      "WebGLClipping uniform storage",
    );
    transformed = replaceOne(
      transformed,
      "this.setState = function ( material, camera, useCache ) {",
      "this.setState = /** @this {WebGLClipping} */ function ( material, camera, useCache ) {",
      fileName,
      "WebGLClipping.setState receiver",
    );
    transformed = replaceOne(
      transformed,
      "this.init = function ( planes, enableLocalClipping ) {",
      "this.init = /** @param {Array<import('../../math/Plane.js').Plane>} planes @param {boolean} enableLocalClipping */ function ( planes, enableLocalClipping ) {",
      fileName,
      "WebGLClipping.init inputs",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction projectPlanes( planes, camera, dstOffset, skipTransform ) {",
      "\t/** @param {Array<import('../../math/Plane.js').Plane>|null} planes @param {import('../../cameras/Camera.js').Camera|undefined} camera @param {number|undefined} dstOffset @param {boolean|undefined} skipTransform @return {Float32Array|null} */\n\tfunction projectPlanes( planes, camera, dstOffset, skipTransform ) {",
      fileName,
      "WebGLClipping.projectPlanes inputs",
    );
    transformed = replaceOne(
      transformed,
      "\t\tif ( nPlanes !== 0 ) {\n\n\t\t\tdstArray = uniform.value;",
      "\t\tif ( nPlanes !== 0 ) {\n\n\t\t\tif ( camera === undefined ) throw new Error( 'THREE.WebGLClipping: A camera is required when clipping planes are present.' );\n\n\t\t\tconst targetOffset = dstOffset === undefined ? 0 : dstOffset;\n\n\t\t\tdstArray = uniform.value;",
      fileName,
      "WebGLClipping optional projection inputs",
    );
    transformed = transformed
      .replace(
        "\t\t\t\tconst flatSize = dstOffset + nPlanes * 4,",
        "\t\t\t\tconst flatSize = targetOffset + nPlanes * 4,",
      )
      .replace(
        "\t\t\t\tfor ( let i = 0, i4 = dstOffset;",
        "\t\t\t\tfor ( let i = 0, i4 = targetOffset;",
      );
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLProgram.js")) {
    transformed = replaceOne(
      transformed,
      "function WebGLProgram( renderer, cacheKey, parameters, bindingStates ) {",
      `/** @typedef {{ runnable: boolean, programLog: string, vertexShader: { log: string, prefix: string }, fragmentShader: { log: string, prefix: string } }} NativeProgramDiagnostics */
/** @return {number} */
function webGLProgramNumberOrZero( value ) {

	return typeof value === 'number' ? value : 0;

}

function WebGLProgram( renderer, cacheKey, parameters, bindingStates ) {`,
      fileName,
      "WebGLProgram numeric feature values",
    );
    transformed = replaceOne(
      transformed,
      "\tlet prefixVertex, prefixFragment;",
      "\tlet prefixVertex = '';\n\tlet prefixFragment = '';",
      fileName,
      "WebGLProgram shader-prefix strings",
    );
    transformed = replaceOne(
      transformed,
      "\tthis.type = parameters.shaderType;",
      "\t/** @type {NativeProgramDiagnostics|undefined} */\n\tthis.diagnostics = undefined;\n\n\t/** @type {import('@geastack/native-webgl-angle/nativeWebGL').NativeProgram|undefined} */\n\tthis.program = program;\n\n\tthis.type = parameters.shaderType;",
      fileName,
      "WebGLProgram declared diagnostics and program fields",
    );
    transformed = transformed
      .replace(
        "\t\tif ( prefixVertex.length > 0 ) {\n\n\t\t\tprefixVertex += '\\n';\n\n\t\t}",
        "\t\tprefixVertex += '\\n';",
      )
      .replace(
        "\t\tif ( prefixFragment.length > 0 ) {\n\n\t\t\tprefixFragment += '\\n';\n\n\t\t}",
        "\t\tprefixFragment += '\\n';",
      );
    transformed = replaceOne(
      transformed,
      "function handleSource( string, errorLine ) {",
      "/** @param {string} string @param {number} errorLine @return {string} */\nfunction handleSource( string, errorLine ) {",
      fileName,
      "WebGLProgram source-error range",
    );
    transformed = replaceOne(
      transformed,
      "\tthis.usedTimes = 1;\n\tthis.program = program;",
      "\tthis.usedTimes = 1;",
      fileName,
      "WebGLProgram single typed program initialization",
    );
    transformed = replaceOne(
      transformed,
      "this.destroy = function () {",
      "this.destroy = /** @this {WebGLProgram} */ function () {",
      fileName,
      "WebGLProgram.destroy receiver",
    );
    for (const method of ["getUniforms", "getAttributes"]) {
      transformed = replaceOne(
        transformed,
        `this.${method} = function () {`,
        `this.${method} = /** @this {WebGLProgram} */ function () {`,
        fileName,
        `WebGLProgram.${method} receiver`,
      );
    }
  }
  if (
    normalized.endsWith("/three/src/renderers/webgl/WebGLUniformsGroups.js") &&
    transformed.includes("const maxBindingPoints")
  ) {
    transformed = replaceOne(
      transformed,
      "function WebGLUniformsGroups( gl, info, capabilities, state ) {\n\n\tlet buffers = {};\n\tlet updateList = {};\n\tlet allocatedBindingPoints = [];",
      `/** @typedef {Int8Array|Uint8Array|Uint8ClampedArray|Int16Array|Uint16Array|Int32Array|Uint32Array|Float32Array|Float64Array} NativeUniformTypedArray */
/** @param {unknown} value @return {value is NativeUniformTypedArray} */
function isNativeUniformTypedArray( value ) {

	return value instanceof Int8Array || value instanceof Uint8Array || value instanceof Uint8ClampedArray ||
		value instanceof Int16Array || value instanceof Uint16Array || value instanceof Int32Array ||
		value instanceof Uint32Array || value instanceof Float32Array || value instanceof Float64Array;

}

/** @param {NativeUniformTypedArray} value @param {Float32Array} data */
function copyNativeUniformTypedArray( value, data ) {

	if ( value instanceof Int8Array ) { for ( let i = 0; i < data.length; i ++ ) data[ i ] = value[ i ]; return; }
	if ( value instanceof Uint8Array ) { for ( let i = 0; i < data.length; i ++ ) data[ i ] = value[ i ]; return; }
	if ( value instanceof Uint8ClampedArray ) { for ( let i = 0; i < data.length; i ++ ) data[ i ] = value[ i ]; return; }
	if ( value instanceof Int16Array ) { for ( let i = 0; i < data.length; i ++ ) data[ i ] = value[ i ]; return; }
	if ( value instanceof Uint16Array ) { for ( let i = 0; i < data.length; i ++ ) data[ i ] = value[ i ]; return; }
	if ( value instanceof Int32Array ) { for ( let i = 0; i < data.length; i ++ ) data[ i ] = value[ i ]; return; }
	if ( value instanceof Uint32Array ) { for ( let i = 0; i < data.length; i ++ ) data[ i ] = value[ i ]; return; }
	if ( value instanceof Float32Array ) { for ( let i = 0; i < data.length; i ++ ) data[ i ] = value[ i ]; return; }
	if ( value instanceof Float64Array ) { for ( let i = 0; i < data.length; i ++ ) data[ i ] = value[ i ]; }

}

function WebGLUniformsGroups( gl, info, capabilities, state ) {

	/** @type {Map<number, import('@geastack/native-webgl-angle/nativeWebGL').NativeHandle>} */
	const buffers = new ( /** @type {new () => Map<number, import('@geastack/native-webgl-angle/nativeWebGL').NativeHandle>} */ ( Map ) )();
	/** @type {Map<number, number>} */
	const updateList = new ( /** @type {new () => Map<number, number>} */ ( Map ) )();
	/** @type {number[]} */
	let allocatedBindingPoints = [];
	/** @type {WeakMap<import('../../core/Uniform.js').Uniform, Float32Array>} */
	const uniformData = new ( /** @type {new () => WeakMap<import('../../core/Uniform.js').Uniform, Float32Array>} */ ( WeakMap ) )();
	/** @type {WeakMap<import('../../core/Uniform.js').Uniform, number>} */
	const uniformOffsets = new ( /** @type {new () => WeakMap<import('../../core/Uniform.js').Uniform, number>} */ ( WeakMap ) )();`,
      fileName,
      "WebGLUniformsGroups typed storage",
    );
    transformed = replaceOne(
      transformed,
      "\t\tif ( updateList[ uniformsGroup.id ] !== frame ) {",
      "\t\tif ( updateList.get( uniformsGroup.id ) !== frame ) {",
      fileName,
      "WebGLUniformsGroups frame lookup",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tupdateList[ uniformsGroup.id ] = frame;",
      "\t\t\tupdateList.set( uniformsGroup.id, frame );",
      fileName,
      "WebGLUniformsGroups frame insertion",
    );
    transformed = replaceOne(
      transformed,
      "\t\tlet buffer = buffers[ uniformsGroup.id ];",
      "\t\tlet buffer = buffers.get( uniformsGroup.id );",
      fileName,
      "WebGLUniformsGroups buffer lookup",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tbuffers[ uniformsGroup.id ] = buffer;",
      "\t\t\tbuffers.set( uniformsGroup.id, buffer );",
      fileName,
      "WebGLUniformsGroups buffer insertion",
    );
    transformed = replaceOne(
      transformed,
      "\t\tconst buffer = buffers[ uniformsGroup.id ];",
      "\t\tconst buffer = buffers.get( uniformsGroup.id );\n\n\t\tif ( buffer === undefined ) return;",
      fileName,
      "WebGLUniformsGroups update buffer lookup",
    );
    transformed = replaceOne(
      transformed,
      "\t\tgl.deleteBuffer( buffers[ uniformsGroup.id ] );\n\n\t\tdelete buffers[ uniformsGroup.id ];",
      "\t\tconst buffer = buffers.get( uniformsGroup.id );\n\n\t\tif ( buffer !== undefined ) gl.deleteBuffer( buffer );\n\n\t\tbuffers.delete( uniformsGroup.id );",
      fileName,
      "WebGLUniformsGroups disposed buffer",
    );
    transformed = replaceOne(
      transformed,
      "\t\tdelete updateList[ uniformsGroup.id ];",
      "\t\tupdateList.delete( uniformsGroup.id );",
      fileName,
      "WebGLUniformsGroups disposed frame entry",
    );
    transformed = replaceOne(
      transformed,
      "\t\tfor ( const id in buffers ) {\n\n\t\t\tgl.deleteBuffer( buffers[ id ] );\n\n\t\t}\n\n\t\tallocatedBindingPoints = [];\n\t\tbuffers = {};",
      "\t\tfor ( const bufferEntry of buffers.entries() ) {\n\n\t\t\tgl.deleteBuffer( bufferEntry[ 1 ] );\n\n\t\t}\n\n\t\tallocatedBindingPoints = [];\n\t\tbuffers.clear();\n\t\tupdateList.clear();",
      fileName,
      "WebGLUniformsGroups buffer disposal",
    );
    transformed = replaceOne(
      transformed,
      "\n\t\tupdateList = {};",
      "",
      fileName,
      "WebGLUniformsGroups frame cache reset",
    );
    transformed = transformed.replaceAll(
      "ArrayBuffer.isView( val )",
      "isNativeUniformTypedArray( val )",
    );
    transformed = transformed.replaceAll(
      "ArrayBuffer.isView( value )",
      "isNativeUniformTypedArray( value )",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tconst offset = uniform.__offset;\n\t\t\tconst value = uniform.value;",
      "\t\t\tconst offset = uniformOffsets.get( uniform );\n\t\t\tconst data = uniformData.get( uniform );\n\n\t\t\tif ( offset === undefined || data === undefined ) return;\n\n\t\t\tconst value = uniform.value;",
      fileName,
      "WebGLUniformsGroups uniform side storage read",
    );
    transformed = transformed
      .replaceAll(
        "writeUniformValue( val, uniform.__data, arrayOffset );",
        "writeUniformValue( val, data, arrayOffset );",
      )
      .replaceAll(
        "writeUniformValue( value, uniform.__data, 0 );",
        "writeUniformValue( value, data, 0 );",
      )
      .replaceAll(
        "gl.bufferSubData( gl.UNIFORM_BUFFER, offset, uniform.__data );",
        "gl.bufferSubData( gl.UNIFORM_BUFFER, offset, data );",
      );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\tuniform.__data = new Float32Array( info.storage / Float32Array.BYTES_PER_ELEMENT );\n\t\t\t\t\tuniform.__offset = offset;",
      "\t\t\t\t\tuniformData.set( uniform, new Float32Array( info.storage / Float32Array.BYTES_PER_ELEMENT ) );\n\t\t\t\t\tuniformOffsets.set( uniform, offset );",
      fileName,
      "WebGLUniformsGroups uniform side storage write",
    );
    const floatElementSize = "Float32Array.BYTES_PER_ELEMENT";
    const floatElementSizeCount =
      transformed.split(floatElementSize).length - 1;
    if (floatElementSizeCount !== 2) {
      throw new Error(
        `Three WebGLUniformsGroups source at ${fileName} has ${floatElementSizeCount} Float32 element-size reads; expected 2`,
      );
    }
    transformed = transformed.replaceAll(floatElementSize, "4");
    transformed = replaceOne(
      transformed,
      "\tconst maxBindingPoints = gl.getParameter( gl.MAX_UNIFORM_BUFFER_BINDINGS );",
      "\tconst maxBindingPoints = /** @type {number} */ ( gl.getParameter( gl.MAX_UNIFORM_BUFFER_BINDINGS ) );",
      fileName,
      "WebGLUniformsGroups binding-point limit",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tif ( allocatedBindingPoints.indexOf( i ) === - 1 ) {",
      "\t\t\tif ( allocatedBindingPoints.indexOf( Number( i ) ) === - 1 ) {",
      fileName,
      "WebGLUniformsGroups numeric binding-point lookup",
    );
    transformed = replaceOne(
      transformed,
      "\t\tconst frame = info.render.frame;",
      "\t\tconst frame = info.render.frame;\n\n\t\tif ( typeof frame !== 'number' ) return;",
      fileName,
      "WebGLUniformsGroups numeric frame counter",
    );
    for (const name of [
      "bind",
      "update",
      "createBuffer",
      "updateBufferData",
      "prepareUniformsGroup",
    ]) {
      transformed = replaceOne(
        transformed,
        `\tfunction ${name}( uniformsGroup`,
        `\t/** @param {import('../../core/UniformsGroup.js').UniformsGroup} uniformsGroup */\n\tfunction ${name}( uniformsGroup`,
        fileName,
        `WebGLUniformsGroups.${name} group input`,
      );
    }
    const programParameter =
      "/** @param {{ program: import('@geastack/native-webgl-angle/nativeWebGL').NativeProgram }} program */\n\t";
    for (const name of ["bind", "update"]) {
      transformed = replaceOne(
        transformed,
        `\tfunction ${name}( uniformsGroup, program ) {`,
        `\t${programParameter}function ${name}( uniformsGroup, program ) {`,
        fileName,
        `WebGLUniformsGroups.${name} program wrapper`,
      );
    }
    transformed = replaceOne(
      transformed,
      "\t\tuniformsGroup.__cache = {};\n\n\t\treturn this;",
      "\t\tuniformsGroup.__cache = {};\n\n\t\treturn;",
      fileName,
      "WebGLUniformsGroups unused strict-mode receiver return",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction writeUniformValue( value, data, offset ) {",
      "\t/** @param {Float32Array} data @param {number} offset */\n\tfunction writeUniformValue( value, data, offset ) {",
      fileName,
      "WebGLUniformsGroups uniform write target",
    );
    transformed = replaceOne(
      transformed,
      "\t\tif ( typeof value === 'number' || typeof value === 'boolean' ) {\n\n\t\t\tdata[ 0 ] = value;\n\n\t\t} else if ( value.isMatrix3 ) {\n\n\t\t\t// manually converting 3x3 to 3x4\n\n\t\t\tdata[ 0 ] = value.elements[ 0 ];\n\t\t\tdata[ 1 ] = value.elements[ 1 ];\n\t\t\tdata[ 2 ] = value.elements[ 2 ];\n\t\t\tdata[ 3 ] = 0;\n\t\t\tdata[ 4 ] = value.elements[ 3 ];\n\t\t\tdata[ 5 ] = value.elements[ 4 ];\n\t\t\tdata[ 6 ] = value.elements[ 5 ];\n\t\t\tdata[ 7 ] = 0;\n\t\t\tdata[ 8 ] = value.elements[ 6 ];\n\t\t\tdata[ 9 ] = value.elements[ 7 ];\n\t\t\tdata[ 10 ] = value.elements[ 8 ];\n\t\t\tdata[ 11 ] = 0;",
      "\t\tif ( typeof value === 'number' ) {\n\n\t\t\tdata[ 0 ] = value;\n\n\t\t} else if ( typeof value === 'boolean' ) {\n\n\t\t\tdata[ 0 ] = value ? 1 : 0;\n\n\t\t} else if ( value.isMatrix3 ) {\n\n\t\t\t// manually converting 3x3 to 3x4\n\t\t\tconst elements = /** @type {import('../../math/Matrix3.js').Matrix3} */ ( value ).elements;\n\n\t\t\tdata[ 0 ] = elements[ 0 ];\n\t\t\tdata[ 1 ] = elements[ 1 ];\n\t\t\tdata[ 2 ] = elements[ 2 ];\n\t\t\tdata[ 3 ] = 0;\n\t\t\tdata[ 4 ] = elements[ 3 ];\n\t\t\tdata[ 5 ] = elements[ 4 ];\n\t\t\tdata[ 6 ] = elements[ 5 ];\n\t\t\tdata[ 7 ] = 0;\n\t\t\tdata[ 8 ] = elements[ 6 ];\n\t\t\tdata[ 9 ] = elements[ 7 ];\n\t\t\tdata[ 10 ] = elements[ 8 ];\n\t\t\tdata[ 11 ] = 0;",
      fileName,
      "WebGLUniformsGroups exact scalar and Matrix3 writes",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tdata.set( new value.constructor( value.buffer, value.byteOffset, data.length ) );",
      "\t\t\tcopyNativeUniformTypedArray( value, data );",
      fileName,
      "WebGLUniformsGroups typed-array write",
    );
    for (const name of ["updateUniform", "hasUniformChanged"]) {
      transformed = replaceOne(
        transformed,
        `\tfunction ${name}( uniform,`,
        `\t/** @param {import('../../core/Uniform.js').Uniform} uniform @param {number} index @param {number} indexArray @param {Record<string, any>} cache */\n\tfunction ${name}( uniform,`,
        fileName,
        `WebGLUniformsGroups.${name} uniform`,
      );
    }
    transformed = replaceOne(
      transformed,
      "\tfunction getUniformSize( value ) {",
      "\t/** @return {{ boundary: number, storage: number }} */\n\tfunction getUniformSize( value ) {",
      fileName,
      "WebGLUniformsGroups uniform size result",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tconst uniformArray = Array.isArray( uniforms[ i ] ) ? uniforms[ i ] : [ uniforms[ i ] ];",
      "\t\t\tconst uniformEntry = uniforms[ i ];\n\t\t\tconst uniformArray = Array.isArray( uniformEntry )\n\t\t\t\t? /** @type {Array<import('../../core/Uniform.js').Uniform>} */ ( uniformEntry )\n\t\t\t\t: /** @type {Array<import('../../core/Uniform.js').Uniform>} */ ( [ uniformEntry ] );",
      fileName,
      "WebGLUniformsGroups uniform array narrowing",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tfor ( let k = 0, kl = values.length; k < kl; k ++ ) {\n\n\t\t\t\t\tconst value = values[ k ];",
      "\t\t\t\tfor ( const value of values ) {",
      fileName,
      "WebGLUniformsGroups dynamic uniform value iteration",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\tuniformData.set( uniform, new Float32Array( info.storage / 4 ) );\n\t\t\t\t\tuniformOffsets.set( uniform, offset );",
      "\t\t\t\t\tuniformData.set( uniform, new Float32Array( info.storage / 4 ) );\n\n\t\t\t\t\tif ( typeof offset !== 'number' ) throw new Error( 'THREE.WebGLUniformsGroups: Invalid uniform offset.' );\n\n\t\t\t\t\tuniformOffsets.set( uniform, offset );",
      fileName,
      "WebGLUniformsGroups numeric uniform offset",
    );
    transformed = replaceOne(
      transformed,
      "\t\tconst uniformsGroup = event.target;",
      "\t\tconst uniformsGroup = /** @type {import('../../core/UniformsGroup.js').UniformsGroup} */ ( event.target );",
      fileName,
      "WebGLUniformsGroups dispose target",
    );
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLMorphtargets.js")) {
    transformed = replaceOne(
      transformed,
      "import { FloatType } from '../../constants.js';",
      "import { FloatType } from '../../constants.js';\nimport { BufferAttribute } from '../../core/BufferAttribute.js';\nimport { InterleavedBufferAttribute } from '../../core/InterleavedBufferAttribute.js';\nimport { WebGLCapabilities } from './WebGLCapabilities.js';\nimport { WebGLTextures } from './WebGLTextures.js';",
      fileName,
      "WebGLMorphtargets constructor type imports",
    );
    transformed = replaceOne(
      transformed,
      "function WebGLMorphtargets( gl, capabilities, textures ) {",
      `/**
 * @typedef {(
 *   ((import('../../objects/Mesh.js').Mesh|import('../../objects/Line.js').Line|import('../../objects/Points.js').Points) & { morphTargetInfluences: number[], isInstancedMesh?: false })
 *   | (import('../../objects/InstancedMesh.js').InstancedMesh & { morphTargetInfluences: number[] })
 * )} NativeMorphObject
 */
/**
 * @param {import('@geastack/native-webgl-angle/nativeWebGL').NativeWebGL2RenderingContext} gl
 * @param {ReturnType<typeof WebGLCapabilities>} capabilities
 * @param {InstanceType<typeof WebGLTextures>} textures
 */
function WebGLMorphtargets( gl, capabilities, textures ) {`,
      fileName,
      "WebGLMorphtargets inputs",
    );
    transformed = replaceOne(
      transformed,
      "/**\n * @typedef {(",
      "/** @typedef {BufferAttribute|InterleavedBufferAttribute} NativeMorphAttribute */\n/**\n * @typedef {(",
      fileName,
      "WebGLMorphtargets attribute instance type",
    );
    transformed = replaceOne(
      transformed,
      "\tconst morphTextures = new WeakMap();",
      "\t/** @type {WeakMap<import('../../core/BufferGeometry.js').BufferGeometry, { count: number, texture: import('../../textures/DataArrayTexture.js').DataArrayTexture, size: import('../../math/Vector2.js').Vector2 }>} */\n" +
        "\tconst morphTextures = new WeakMap();",
      fileName,
      "WebGLMorphtargets texture cache",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction update( object, geometry, program ) {",
      "\t/**\n\t * @param {NativeMorphObject} object\n\t * @param {import('../../core/BufferGeometry.js').BufferGeometry} geometry\n\t * @param {InstanceType<typeof import('./WebGLProgram.js').WebGLProgram>} program\n\t */\n\tfunction update( object, geometry, program ) {",
      fileName,
      "WebGLMorphtargets update inputs",
    );
    transformed = replaceOne(
      transformed,
      "\t\tconst objectInfluences = object.morphTargetInfluences;",
      "\t\tconst objectInfluences = object.morphTargetInfluences;\n\n" +
        "\t\t/** @type {{ position?: NativeMorphAttribute[], normal?: NativeMorphAttribute[], color?: NativeMorphAttribute[] }} */\n" +
        "\t\tconst morphAttributes = geometry.morphAttributes;",
      fileName,
      "WebGLMorphtargets attribute table",
    );
    transformed = transformed.replaceAll(
      "geometry.morphAttributes.",
      "morphAttributes.",
    );
    for (const name of ["position", "normal", "color"]) {
      transformed = replaceOne(
        transformed,
        `morphAttributes.${name} || []`,
        `morphAttributes.${name} || /** @type {NativeMorphAttribute[]} */ ( [] )`,
        fileName,
        `WebGLMorphtargets ${name} fallback`,
      );
    }
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLGeometries.js")) {
    transformed = replaceOne(
      transformed,
      "\tconst wireframeAttributes = new WeakMap();",
      "\t/** @type {WeakMap<import('../../core/BufferGeometry.js').BufferGeometry, import('../../core/BufferAttribute.js').Uint16BufferAttribute | import('../../core/BufferAttribute.js').Uint32BufferAttribute>} */\n" +
        "\tconst wireframeAttributes = new WeakMap();",
      fileName,
      "WebGLGeometries wireframe attribute map",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction onGeometryDispose( event ) {\n\n\t\tconst geometry = event.target;",
      "\tfunction onGeometryDispose( event ) {\n\n\t\tconst geometry = /** @type {import('../../core/BufferGeometry.js').BufferGeometry} */ ( event.target );",
      fileName,
      "WebGLGeometries dispose target",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tdelete geometry._maxInstanceCount;",
      "\t\t\tgeometry._maxInstanceCount = undefined;",
      fileName,
      "WebGLGeometries optional instance count reset",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction updateWireframeAttribute( geometry ) {\n\n\t\tconst indices = [];",
      "\t/** @param {import('../../core/BufferGeometry.js').BufferGeometry} geometry */\n\tfunction updateWireframeAttribute( geometry ) {\n\n\t\t/** @type {number[]} */\n\t\tconst indices = [];",
      fileName,
      "WebGLGeometries wireframe inputs",
    );
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLBindingStates.js")) {
    transformed = replaceOne(
      transformed,
      "function WebGLBindingStates( gl, attributes ) {",
      `/** @typedef {import('../../core/BufferAttribute.js').BufferAttribute|import('../../core/InterleavedBufferAttribute.js').InterleavedBufferAttribute} NativeBindingAttribute */
/** @typedef {{ attribute: NativeBindingAttribute|undefined, data?: import('../../core/InterleavedBuffer.js').InterleavedBuffer }} NativeBindingAttributeCache */

function WebGLBindingStates( gl, attributes ) {

	/** @return {number} */
	function requireVertexScalar( value ) {

		if ( typeof value === 'number' ) return value;

		throw new Error( 'THREE.WebGLBindingStates: Vertex layout value must be numeric.' );

	}`,
      fileName,
      "WebGLBindingStates numeric layout guard",
    );
    // Keep each finite cache level as its own index-signature shape. Repeating
    // Record<K, V> here makes the structural walk re-enter the same generic
    // alias with a different V while the outer level is still active.
    transformed = replaceOne(
      transformed,
      "\tconst bindingStates = {};",
      `\t/** @typedef {ReturnType<typeof createBindingState>} NativeBindingState
\t * @typedef {{ [wireframe: string]: NativeBindingState|undefined }} NativeWireframeBindingStates
\t * @typedef {{ [programId: string]: NativeWireframeBindingStates|undefined }} NativeProgramBindingStates
\t * @typedef {{ [objectId: string]: NativeProgramBindingStates|undefined }} NativeObjectBindingStates
\t */
\t/** @type {{ [geometryId: string]: NativeObjectBindingStates|undefined }} */
\tconst bindingStates = {};`,
      fileName,
      "WebGLBindingStates nested cache representation",
    );
    const geometryCacheRead = "const objectMap = bindingStates[ geometryId ];";
    const geometryCacheReadCount =
      transformed.split(geometryCacheRead).length - 1;
    if (geometryCacheReadCount !== 3) {
      throw new Error(
        `Three WebGLBindingStates source at ${fileName} has ${geometryCacheReadCount} geometry cache cleanup reads; expected 3`,
      );
    }
    transformed = transformed.replaceAll(
      geometryCacheRead,
      `${geometryCacheRead}\n\n\t\t\tif ( objectMap === undefined ) continue;`,
    );
    transformed = replaceOne(
      transformed,
      "\t\tconst objectMap = bindingStates[ geometry.id ];",
      "\t\tconst objectMap = bindingStates[ geometry.id ];\n\n\t\tif ( objectMap === undefined ) return;",
      fileName,
      "WebGLBindingStates geometry cache narrowing",
    );
    transformed = transformed
      .replaceAll(
        "const programMap = objectMap[ objectId ];",
        "const programMap = objectMap[ objectId ];\n\n\t\t\t\tif ( programMap === undefined ) continue;",
      )
      .replaceAll(
        "const stateMap = programMap[ programId ];",
        "const stateMap = programMap[ programId ];\n\n\t\t\t\t\tif ( stateMap === undefined ) continue;",
      );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tconst stateMap = programMap[ program.id ];",
      "\t\t\t\tconst stateMap = programMap[ program.id ];\n\n\t\t\t\tif ( stateMap === undefined ) continue;",
      fileName,
      "WebGLBindingStates program cache narrowing",
    );
    const stateCleanupPattern =
      /^(\t+)for \( const wireframe in stateMap \) \{\n\n\1\tdeleteVertexArrayObject\( stateMap\[ wireframe \]\.object \);\n\n\1\tdelete stateMap\[ wireframe \];\n\n\1\}/gm;
    const stateCleanupCount = [...transformed.matchAll(stateCleanupPattern)]
      .length;
    if (stateCleanupCount !== 4) {
      throw new Error(
        `Three WebGLBindingStates source at ${fileName} has ${stateCleanupCount} state cleanup loops; expected 4`,
      );
    }
    transformed = transformed.replace(
      stateCleanupPattern,
      (_match, indent) => `${indent}for ( const wireframe in stateMap ) {

${indent}\tconst state = stateMap[ wireframe ];

${indent}\tif ( state === undefined ) continue;

${indent}\tdeleteVertexArrayObject( state.object );

${indent}\tstateMap[ wireframe ] = undefined;

${indent}}`,
    );
    transformed = transformed
      .replaceAll(
        "delete programMap[ programId ];",
        "programMap[ programId ] = undefined;",
      )
      .replaceAll(
        "delete programMap[ program.id ];",
        "programMap[ program.id ] = undefined;",
      )
      .replaceAll(
        "delete bindingStates[ geometryId ];",
        "bindingStates[ geometryId ] = undefined;",
      )
      .replaceAll(
        "delete bindingStates[ geometry.id ];",
        "bindingStates[ geometry.id ] = undefined;",
      )
      .replaceAll(
        "delete objectMap[ objectId ];",
        "objectMap[ objectId ] = undefined;",
      )
      .replaceAll(
        "\t\t\t\tif ( programMap === undefined ) continue;\n\n\t\t\tif ( programMap === undefined ) continue;",
        "\t\t\tif ( programMap === undefined ) continue;",
      );
    transformed = replaceOne(
      transformed,
      `\t\t\tif ( Object.keys( objectMap ).length === 0 ) {

\t\t\t\tbindingStates[ geometryId ] = undefined;

\t\t\t}`,
      `\t\t\tlet objectMapIsEmpty = true;

\t\t\tfor ( const remainingObjectId in objectMap ) {

\t\t\t\tif ( objectMap[ remainingObjectId ] !== undefined ) {

\t\t\t\t\tobjectMapIsEmpty = false;
\t\t\t\t\tbreak;

\t\t\t\t}

\t\t\t}

\t\t\tif ( objectMapIsEmpty ) bindingStates[ geometryId ] = undefined;`,
      fileName,
      "WebGLBindingStates optional object cache cleanup",
    );
    const programParameter =
      "/** @param {InstanceType<typeof import('./WebGLProgram.js').WebGLProgram>} program @param {import('../../core/BufferGeometry.js').BufferGeometry} geometry */\n\t";
    const programAndIndexParameter =
      "/** @param {InstanceType<typeof import('./WebGLProgram.js').WebGLProgram>} program @param {import('../../core/BufferGeometry.js').BufferGeometry} geometry @param {import('../../core/BufferAttribute.js').BufferAttribute|null} index */\n\t";
    for (const name of [
      "setup",
      "getBindingState",
      "needsUpdate",
      "saveCache",
      "setupVertexAttributes",
    ]) {
      transformed = replaceOne(
        transformed,
        `\tfunction ${name}(`,
        `\t${["setup", "needsUpdate", "saveCache"].includes(name) ? programAndIndexParameter : programParameter}function ${name}(`,
        fileName,
        `WebGLBindingStates.${name} program`,
      );
    }
    transformed = replaceOne(
      transformed,
      "\t\tconst materialDefaultAttributeValues = material.defaultAttributeValues;",
      "\t\t/** @type {Record<string, number[]|undefined>|undefined} */\n\t\tconst materialDefaultAttributeValues = material.defaultAttributeValues;",
      fileName,
      "WebGLBindingStates material default attribute vectors",
    );
    transformed = replaceOne(
      transformed,
      "\t\tlet state = stateMap[ wireframe ];",
      "\t\tconst wireframeKey = wireframe ? 'wireframe' : 'solid';\n\n\t\tlet state = stateMap[ wireframeKey ];",
      fileName,
      "WebGLBindingStates wireframe key",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tstateMap[ wireframe ] = state;",
      "\t\t\tstateMap[ wireframeKey ] = state;",
      fileName,
      "WebGLBindingStates wireframe cache write",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction releaseStatesOfGeometry( geometry ) {",
      "\t/** @param {import('../../core/BufferGeometry.js').BufferGeometry} geometry */\n\tfunction releaseStatesOfGeometry( geometry ) {",
      fileName,
      "WebGLBindingStates geometry release",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction releaseStatesOfObject( object ) {",
      "\t/** @param {import('../../core/Object3D.js').Object3D} object */\n\tfunction releaseStatesOfObject( object ) {",
      fileName,
      "WebGLBindingStates object release",
    );
    transformed = replaceOne(
      transformed,
      "\t\tconst cache = {};",
      "\t\t/** @type {Record<string, NativeBindingAttributeCache>} */\n\t\tconst cache = {};",
      fileName,
      "WebGLBindingStates exact attribute cache",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tattributes: {},",
      "\t\t\tattributes: /** @type {Record<string, NativeBindingAttributeCache>} */ ( {} ),",
      fileName,
      "WebGLBindingStates initial attribute cache",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tindex: null",
      "\t\t\tindex: /** @type {import('../../core/BufferAttribute.js').BufferAttribute|null} */ ( null )",
      fileName,
      "WebGLBindingStates index cache representation",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tconst data = {};\n\t\t\t\tdata.attribute = attribute;",
      "\t\t\t\t/** @type {NativeBindingAttributeCache} */\n\t\t\t\tconst data = { attribute };",
      fileName,
      "WebGLBindingStates exact cache entry",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tif ( geometryAttribute && cachedAttribute.data !== geometryAttribute.data ) return true;",
      `\t\t\t\tconst geometryAttributeData = geometryAttribute instanceof InterleavedBufferAttribute ? geometryAttribute.data : undefined;

\t\t\t\tif ( cachedAttribute.data !== geometryAttributeData ) return true;`,
      fileName,
      "WebGLBindingStates cached interleaved data comparison",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\t\tif ( attribute && attribute.data ) {

\t\t\t\t\tdata.data = attribute.data;

\t\t\t\t}`,
      "\t\t\t\tif ( attribute instanceof InterleavedBufferAttribute ) data.data = attribute.data;",
      fileName,
      "WebGLBindingStates cached interleaved data",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\tif ( geometryAttribute.isInterleavedBufferAttribute ) {",
      "\t\t\t\t\tif ( geometryAttribute instanceof InterleavedBufferAttribute ) {",
      fileName,
      "WebGLBindingStates interleaved attribute narrowing",
    );
    transformed = transformed
      .replace(
        "\t\treturn gl.bindVertexArray( vao );",
        "\t\tgl.bindVertexArray( vao );",
      )
      .replace(
        "\t\treturn gl.deleteVertexArray( vao );",
        "\t\tgl.deleteVertexArray( vao );",
      );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\t\tconst stride = data.stride;\n\t\t\t\t\t\tconst offset = geometryAttribute.offset;",
      "\t\t\t\t\t\tconst stride = requireVertexScalar( data.stride );\n\t\t\t\t\t\tconst offset = requireVertexScalar( geometryAttribute.offset );",
      fileName,
      "WebGLBindingStates interleaved scalar layout",
    );
    transformed = transformed
      .replace(
        "geometry._maxInstanceCount = data.meshPerAttribute * data.count;",
        "geometry._maxInstanceCount = requireVertexScalar( data.meshPerAttribute ) * requireVertexScalar( data.count );",
      )
      .replace(
        "geometry._maxInstanceCount = geometryAttribute.meshPerAttribute * geometryAttribute.count;",
        "geometry._maxInstanceCount = requireVertexScalar( geometryAttribute.meshPerAttribute ) * requireVertexScalar( geometryAttribute.count );",
      );
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLObjects.js")) {
    transformed = `import { BufferGeometry } from '../../core/BufferGeometry.js';\n\n${transformed}`;
    transformed = replaceOne(
      transformed,
      "\t\tconst instancedMesh = event.target;",
      "\t\tconst instancedMesh = event.target;\n\n\t\tinstancedMeshUpdateMap.delete( instancedMesh );",
      fileName,
      "WebGLObjects instance update-map cleanup",
    );
    transformed = replaceOne(
      transformed,
      "\tlet updateMap = new WeakMap();",
      "\t/** @type {WeakMap<import('../../core/BufferGeometry.js').BufferGeometry, number>} */\n" +
        "\tlet geometryUpdateMap = new WeakMap();\n" +
        "\t/** @type {WeakMap<import('../../objects/InstancedMesh.js').InstancedMesh, number>} */\n" +
        "\tlet instancedMeshUpdateMap = new WeakMap();\n" +
        "\t/** @type {WeakMap<import('../../objects/Skeleton.js').Skeleton, number>} */\n" +
        "\tlet skeletonUpdateMap = new WeakMap();",
      fileName,
      "WebGLObjects update maps",
    );
    transformed = transformed
      .replaceAll(
        "updateMap.get( buffergeometry )",
        "geometryUpdateMap.get( buffergeometry )",
      )
      .replaceAll(
        "updateMap.set( buffergeometry, frame )",
        "geometryUpdateMap.set( buffergeometry, frame )",
      )
      .replaceAll(
        "updateMap.get( object )",
        "instancedMeshUpdateMap.get( object )",
      )
      .replaceAll(
        "updateMap.set( object, frame )",
        "instancedMeshUpdateMap.set( object, frame )",
      )
      .replaceAll(
        "updateMap.get( skeleton )",
        "skeletonUpdateMap.get( skeleton )",
      )
      .replaceAll(
        "updateMap.set( skeleton, frame )",
        "skeletonUpdateMap.set( skeleton, frame )",
      );
    transformed = replaceOne(
      transformed,
      "\t\tif ( geometryUpdateMap.get( buffergeometry ) !== frame ) {",
      "\t\tconst geometryFrame = geometryUpdateMap.get( buffergeometry );\n\n\t\tif ( geometryFrame !== frame ) {",
      fileName,
      "WebGLObjects stable geometry frame lookup",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tgeometries.update( buffergeometry );",
      "\t\t\tgeometries.update( buffergeometry );\n\n\t\t\tif ( geometryFrame === undefined ) buffergeometry.addEventListener( 'dispose', onBufferGeometryDispose );",
      fileName,
      "WebGLObjects geometry update-map cleanup registration",
    );
    transformed = replaceOne(
      transformed,
      "\t\tconst buffergeometry = geometries.get( object, geometry );",
      "\t\tconst buffergeometry = geometries.get( object, geometry );\n\n\t\tif ( buffergeometry === undefined ) return geometry;",
      fileName,
      "WebGLObjects geometry result",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction dispose() {",
      `\t/** @param {{ type: string, target?: import('../../core/EventDispatcher.js').EventDispatcher|null }} event */
\tfunction onBufferGeometryDispose( event ) {

\t\tconst buffergeometry = event.target;

\t\tif ( ! ( buffergeometry instanceof BufferGeometry ) ) return;

\t\tbuffergeometry.removeEventListener( 'dispose', onBufferGeometryDispose );
\t\tgeometryUpdateMap.delete( buffergeometry );

\t}

\tfunction dispose() {`,
      fileName,
      "WebGLObjects geometry update-map cleanup",
    );
    transformed = replaceOne(
      transformed,
      "\t\tupdateMap = new WeakMap();",
      "\t\tgeometryUpdateMap = new WeakMap();\n\t\tinstancedMeshUpdateMap = new WeakMap();\n\t\tskeletonUpdateMap = new WeakMap();",
      fileName,
      "WebGLObjects map reset",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction update( object ) {",
      "\t/** @param {import('../../core/Object3D.js').Object3D & { geometry: import('../../core/BufferGeometry.js').BufferGeometry }} object */\n" +
        "\tfunction update( object ) {",
      fileName,
      "WebGLObjects renderable object",
    );
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLProperties.js")) {
    transformed = `import { Material } from '../../materials/Material.js';
import { RenderTarget } from '../../core/RenderTarget.js';
import { Source } from '../../textures/Source.js';
import { Texture } from '../../textures/Texture.js';
import { NativeHandle } from '@geastack/native-webgl-angle/nativeWebGL';

/** @typedef {Material|RenderTarget|Source|Texture} WebGLPropertyOwner */

// Three keeps renderer-private state in an otherwise open property bag. Keep
// the bag open for genuinely dynamic metadata, but declare every native GL
// resource slot exactly so a typed NativeHandle never travels through the
// dynamic carrier merely because Three stores it beside that metadata.
class NativeWebGLPropertyBag {

\tconstructor() {

\t\t/** @type {NativeHandle|null|undefined} */
\t\tthis.__webglTexture = undefined;
\t\t/** @type {NativeHandle|null|undefined} */
\t\tthis.__webglFramebuffer = undefined;
\t\t/** @type {Array<NativeHandle>} */
\t\tthis.__webglMipmapFramebuffers = [];
\t\t/** @type {Array<NativeHandle>} */
\t\tthis.__webglCubeFramebuffers = [];
\t\t/** @type {Array<Array<NativeHandle>>} */
\t\tthis.__webglCubeMipmapFramebuffers = [];
\t\t/** @type {NativeHandle|undefined} */
\t\tthis.__webglDepthbuffer = undefined;
\t\t/** @type {Array<NativeHandle>} */
\t\tthis.__webglDepthbuffers = [];
\t\t/** @type {NativeHandle|undefined} */
\t\tthis.__webglMultisampledFramebuffer = undefined;
\t\t/** @type {Array<NativeHandle>|undefined} */
\t\tthis.__webglColorRenderbuffer = undefined;
\t\t/** @type {NativeHandle|undefined} */
\t\tthis.__webglDepthRenderbuffer = undefined;
\t\t/** @type {Texture|null|undefined} */
\t\tthis.__boundDepthTexture = undefined;
\t\t/** @type {(()=>void)|undefined} */
\t\tthis.__depthDisposeCallback = undefined;
\t\t/** @type {RenderTarget|null|undefined} */
\t\tthis.__renderTarget = undefined;
\t\t/** @type {Texture|null|undefined} */
\t\tthis.environment = undefined;
\t\t/** @type {Texture|null} */
\t\tthis.envMap = null;
\t\t/** @type {import('../../scenes/Fog.js').Fog|import('../../scenes/FogExp2.js').FogExp2|null} */
\t\tthis.fog = null;
\t\t/** @type {import('../../math/Euler.js').Euler|undefined} */
\t\tthis.envMapRotation = undefined;
\t\t/** @type {InstanceType<typeof import('./WebGLProgram.js').WebGLProgram>|undefined} */
\t\tthis.currentProgram = undefined;
\t\t/** @type {Record<string, InstanceType<typeof import('./WebGLProgram.js').WebGLProgram>|undefined>|undefined} */
\t\tthis.programs = undefined;
\t\t/** @type {{ value: Float32Array|null, needsUpdate: boolean }|undefined} */
\t\tthis.clippingPlanes = undefined;

\t\t// Material state. Three writes these on the bag from setProgram and
\t\t// getProgram; declared here they are fields, not sidecar lookups. An
\t\t// initial value replaces three's \`undefined\` only where every read of
\t\t// the member is guarded so the two are indistinguishable: a fresh
\t\t// material's first setProgram always refreshes.
\t\t// \`needsLights\` holds \`materialNeedsLights( material )\`, whose flag chain
\t\t// ends on \`material.isShaderMaterial && ...\` and so WRITES \`undefined\`
\t\t// for every material without lights (\`MeshBasicMaterial\`). Stating it
\t\t// \`boolean\` laid the slot out as a bare \`bool\` with nowhere to hold that
\t\t// value, and the first frame threw storing it.
\t\t/** @type {boolean|undefined} */
\t\tthis.needsLights = undefined;
\t\t/** @type {number} */
\t\tthis.lightsStateVersion = -1;
\t\t/** @type {boolean|import('./WebGLRenderStates.js').NativeLightProbeGrid|null} */
\t\tthis.lightProbeGrid = null;
\t\t/** @type {import('../shaders/UniformsLib.js').NativeUniforms} */
\t\tthis.uniforms = {};
\t\t/** @type {Array<import('./WebGLUniforms.js').NativeUniform>|null} */
\t\tthis.uniformsList = null;
\t\t/** @type {string} */
\t\tthis.outputColorSpace = '';
\t\t/** @type {boolean} */
\t\tthis.batching = false;
\t\t/** @type {boolean} */
\t\tthis.batchingColor = false;
\t\t/** @type {boolean} */
\t\tthis.instancing = false;
\t\t/** @type {boolean} */
\t\tthis.instancingColor = false;
\t\t/** @type {boolean} */
\t\tthis.instancingMorph = false;
\t\t/** @type {boolean} */
\t\tthis.skinning = false;
\t\t/** @type {boolean} */
\t\tthis.morphTargets = false;
\t\t/** @type {boolean} */
\t\tthis.morphNormals = false;
\t\t/** @type {boolean} */
\t\tthis.morphColors = false;
\t\t/** @type {number} */
\t\tthis.morphTargetsCount = 0;
\t\t/** @type {number|undefined} */
\t\tthis.numClippingPlanes = undefined;
\t\t/** @type {number} */
\t\tthis.numIntersection = 0;
\t\t/** @type {boolean} */
\t\tthis.vertexAlphas = false;
\t\t/** @type {boolean} */
\t\tthis.vertexTangents = false;
\t\t/** @type {number} */
\t\tthis.toneMapping = 0;
\t\t/** @type {boolean} */
\t\tthis.receiveShadow = false;
\t\t/** @type {Float32Array|null} */
\t\tthis.clippingState = null;
\t\t// Shared by materials (\`material.version\`) and texture sources, whose
\t\t// upload path asks whether it was ever written.
\t\t/** @type {number|undefined} */
\t\tthis.__version = undefined;
\t\t/** @type {import('../../lights/Light.js').Light|null} */
\t\tthis.light = null;

\t\t// Texture, source and render-target state.
\t\t/** @type {boolean|undefined} */
\t\tthis.__webglInit = undefined;
\t\t/** @type {string} */
\t\tthis.__cacheKey = '';
\t\t/** @type {number} */
\t\tthis.__currentAnisotropy = 0;
\t\t/** @type {boolean} */
\t\tthis.__hasExternalTextures = false;
\t\t/** @type {boolean|undefined} */
\t\tthis.__useDefaultFramebuffer = undefined;
\t\t/** @type {boolean} */
\t\tthis.__useRenderToTexture = false;
\t\t/** @type {boolean|undefined} */
\t\tthis.__autoAllocateDepthBuffer = undefined;

\t}

}

function WebGLProperties() {

\t/** @type {Map<string, NativeWebGLPropertyBag>} */
\tconst properties = new Map();

\t/** @param {WebGLPropertyOwner} object */
\tfunction propertyKey( object ) {

\t\tif ( object instanceof Material ) return 'material:' + object.id;
\t\tif ( object instanceof Source ) return 'source:' + object.id;
\t\tif ( object instanceof Texture ) return 'texture:' + object.id;
\t\treturn 'target:' + object.texture.id;

\t}

\t/** @param {WebGLPropertyOwner} object */
\tfunction has( object ) {

\t\treturn properties.has( propertyKey( object ) );

\t}

\t/** @param {WebGLPropertyOwner} object */
\tfunction get( object ) {

\t\tconst key = propertyKey( object );
\t\tlet map = properties.get( key );

\t\tif ( map === undefined ) {

\t\t\tmap = new NativeWebGLPropertyBag();
\t\t\tproperties.set( key, map );

\t\t}

\t\treturn map;

\t}

\t/** @param {WebGLPropertyOwner} object */
\tfunction remove( object ) {

\t\tproperties.delete( propertyKey( object ) );

\t}

\t/**
\t * @param {WebGLPropertyOwner} object
\t * @param {keyof NativeWebGLPropertyBag} key
\t * @param {NativeWebGLPropertyBag[keyof NativeWebGLPropertyBag]} value
\t */
\tfunction update( object, key, value ) {

\t\tget( object )[ key ] = value;

\t}

\tfunction dispose() {

\t\tproperties.clear();

\t}

\treturn { has, get, remove, update, dispose };

}

export { WebGLProperties };
`;
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLInfo.js")) {
    transformed = replaceOne(
      transformed,
      "\t\tprograms: null,",
      "\t\tprograms: /** @type {Array<InstanceType<typeof import('./WebGLProgram.js').WebGLProgram>>|null} */ ( null ),",
      fileName,
      "WebGLInfo exact program collection",
    );
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLPrograms.js")) {
    transformed = replaceOne(
      transformed,
      "\tfunction releaseShaderCache( material ) {",
      "\t/** @param {import('../../materials/Material.js').Material} material */\n\tfunction releaseShaderCache( material ) {",
      fileName,
      "WebGLPrograms material shader release",
    );
    transformed = transformed.replaceAll(
      "renderer.outputColorSpace",
      "renderer.getOutputColorSpace()",
    );
    transformed = replaceOne(
      transformed,
      "function WebGLPrograms( renderer, environments, extensions, capabilities, bindingStates, clipping ) {",
      `/** @param {ReturnType<typeof import('./WebGLBindingStates.js').WebGLBindingStates>} bindingStates */
function WebGLPrograms( renderer, environments, extensions, capabilities, bindingStates, clipping ) {

	/** @return {number} */
	function programNumberOrZero( value ) {

		return typeof value === 'number' ? value : 0;

	}

	/** @param {import('../../textures/Texture.js').Texture['image']} image @return {number|null} */
	function environmentImageHeight( image ) {

		if ( Array.isArray( image ) ) return null;

		if ( image !== null ) {

			const imageHeight = image.height;
			return typeof imageHeight === 'number' ? imageHeight : null;

		}

		return null;

	}`,
      fileName,
      "WebGLPrograms numeric feature values",
    );
    transformed = replaceOne(
      transformed,
      "\tconst shaderIDs = {",
      `\t/** @type {Record<string, string>} */
\tconst shaderIDs = {`,
      fileName,
      "WebGLPrograms shader ID table",
    );
    // The table is keyed by `material.type`, and every `ShaderMaterial` misses
    // it: the lookup yields `undefined`, which `getParameters` tests and then
    // stores as `parameters.shaderID`. The index read on `Record<string,
    // string>` checks as `string`, which laid that field out as a bare
    // `std::string` and threw on the first shader material's frame. Both
    // lookups of the table (`getParameters`, `getUniforms`) state the miss.
    for (const lookup of ["getParameters", "getUniforms"]) {
      transformed = replaceOne(
        transformed,
        "\t\tconst shaderID = shaderIDs[ material.type ];",
        "\t\tconst shaderID = /** @type {string|undefined} */ ( shaderIDs[ material.type ] );",
        fileName,
        `WebGLPrograms ${lookup} shader ID lookup miss`,
      );
    }
    transformed = replaceOne(
      transformed,
      "\tfunction getChannel( value ) {",
      `\t/** @param {string} shaderID */
\tfunction getShader( shaderID ) {

\t\tswitch ( shaderID ) {

\t\t\tcase 'depth': return ShaderLib.depth;
\t\t\tcase 'distance': return ShaderLib.distance;
\t\t\tcase 'normal': return ShaderLib.normal;
\t\t\tcase 'basic': return ShaderLib.basic;
\t\t\tcase 'lambert': return ShaderLib.lambert;
\t\t\tcase 'phong': return ShaderLib.phong;
\t\t\tcase 'toon': return ShaderLib.toon;
\t\t\tcase 'physical': return ShaderLib.physical;
\t\t\tcase 'matcap': return ShaderLib.matcap;
\t\t\tcase 'dashed': return ShaderLib.dashed;
\t\t\tcase 'points': return ShaderLib.points;
\t\t\tcase 'shadow': return ShaderLib.shadow;
\t\t\tcase 'sprite': return ShaderLib.sprite;

\t\t}

\t\tthrow new Error( 'THREE.WebGLPrograms: Unsupported shader ID.' );

\t}

\tfunction getChannel( value ) {`,
      fileName,
      "WebGLPrograms shader lookup",
    );
    transformed = transformed.replaceAll(
      "const shader = ShaderLib[ shaderID ];",
      "const shader = getShader( shaderID );",
    );
    transformed = replaceOne(
      transformed,
      "\t\tlet uniforms;",
      "\t\t/** @type {import('../shaders/UniformsLib.js').NativeUniforms} */\n\t\tlet uniforms;",
      fileName,
      "WebGLPrograms uniform table binding",
    );
    transformed = replaceOne(
      transformed,
      "import { UniformsUtils } from '../shaders/UniformsUtils.js';",
      "import { cloneUniforms } from '../shaders/UniformsUtils.js';\nimport { ShaderMaterial } from '../../materials/ShaderMaterial.js';",
      fileName,
      "WebGLPrograms uniform clone import",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tuniforms = UniformsUtils.clone( shader.uniforms );",
      "\t\t\tuniforms = cloneUniforms( shader.uniforms );",
      fileName,
      "WebGLPrograms template uniform clone",
    );
    // A material with no shader ID supplies its own uniforms, which only a
    // ShaderMaterial declares; three reads the field off an untyped parameter
    // and trusts the caller.
    transformed = replaceOne(
      transformed,
      "\t\t\tuniforms = material.uniforms;",
      "\t\t\tif ( ! ( material instanceof ShaderMaterial ) ) throw new Error( 'THREE.WebGLPrograms: a material without a shader ID must be a ShaderMaterial.' );\n\n\t\t\tuniforms = material.uniforms;",
      fileName,
      "WebGLPrograms custom uniform source",
    );

    transformed = replaceOne(
      transformed,
      "\tconst programs = [];\n\tconst programsMap = new Map();",
      "\t/** @type {Array<InstanceType<typeof import('./WebGLProgram.js').WebGLProgram>>} */\n" +
        "\tconst programs = [];\n" +
        "\t/** @type {Map<string, InstanceType<typeof import('./WebGLProgram.js').WebGLProgram>>} */\n" +
        "\tconst programsMap = new Map();",
      fileName,
      "WebGLPrograms program collections",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction getParameters( material, lights, shadows, scene, object, lightProbeGrids ) {",
      "\t/** @param {import('../../core/Object3D.js').Object3D & { geometry: import('../../core/BufferGeometry.js').BufferGeometry }} object */\n" +
        "\tfunction getParameters( material, lights, shadows, scene, object, lightProbeGrids ) {",
      fileName,
      "WebGLPrograms renderable object",
    );
    transformed = replaceOne(
      transformed,
      "\t\tconst envMap = environments.get( material.envMap || environment, usePMREM );\n\t\tconst envMapCubeUVHeight = ( !! envMap ) && ( envMap.mapping === CubeUVReflectionMapping ) ? envMap.image.height : null;",
      `\t\tconst envMap = environments.get( material.envMap || environment, usePMREM );
\t\t/** @type {number|null} */
\t\tlet envMapCubeUVHeight = null;

\t\tif ( envMap !== null && envMap.mapping === CubeUVReflectionMapping ) envMapCubeUVHeight = environmentImageHeight( envMap.image );`,
      fileName,
      "WebGLPrograms environment image height",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tenvMapMode: HAS_ENVMAP && envMap.mapping,",
      "\t\t\tenvMapMode: HAS_ENVMAP ? envMap.mapping : 0,",
      fileName,
      "WebGLPrograms numeric absent environment-map mode",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction getProgramCacheKey( parameters ) {",
      "\t/** @param {ReturnType<typeof getParameters>} parameters */\n\tfunction getProgramCacheKey( parameters ) {",
      fileName,
      "WebGLPrograms cache-key parameters",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction acquireProgram( parameters, cacheKey ) {",
      "\t/** @param {ReturnType<typeof getParameters>} parameters @param {string} cacheKey */\n\tfunction acquireProgram( parameters, cacheKey ) {",
      fileName,
      "WebGLPrograms acquisition parameters",
    );
    transformed = replaceOne(
      transformed,
      "\t\tif ( parameters.numLightProbeGrids > 0 )",
      "\t\tif ( programNumberOrZero( parameters.numLightProbeGrids ) > 0 )",
      fileName,
      "WebGLPrograms light-probe-grid count",
    );
    for (const property of [
      "anisotropy",
      "clearcoat",
      "dispersion",
      "iridescence",
      "sheen",
      "transmission",
    ]) {
      transformed = replaceOne(
        transformed,
        `material.${property} > 0`,
        `programNumberOrZero( material.${property} ) > 0`,
        fileName,
        `WebGLPrograms ${property} feature scalar`,
      );
    }
    transformed = replaceOne(
      transformed,
      "material.depthPacking >= 0",
      "typeof material.depthPacking === 'number' && programNumberOrZero( material.depthPacking ) >= 0",
      fileName,
      "WebGLPrograms depth-packing scalar",
    );
    transformed = replaceOne(
      transformed,
      "\t\treturn array.join();",
      "\t\tlet key = '';\n\n\t\tfor ( let i = 0; i < array.length; i ++ ) {\n\n\t\t\tif ( i > 0 ) key = key + ',';\n\t\t\tkey = key + String( array[ i ] );\n\n\t\t}\n\n\t\treturn key;",
      fileName,
      "WebGLPrograms cache key join",
    );
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLProgram.js")) {
    transformed = replaceOne(
      transformed,
      "function fetchAttributeLocations( gl, program ) {\n\n\tconst attributes = {};",
      "/** @typedef {{ type: number, location: number, locationSize: number }} NativeProgramAttribute */\n/** @return {Record<string, NativeProgramAttribute>} */\nfunction fetchAttributeLocations( gl, program ) {\n\n\tconst attributes = /** @type {Record<string, NativeProgramAttribute>} */ ( {} );",
      fileName,
      "WebGLProgram attribute table",
    );
    transformed = replaceOne(
      transformed,
      "\tconst n = gl.getProgramParameter( program, gl.ACTIVE_ATTRIBUTES );",
      "\tconst n = /** @type {number} */ ( gl.getProgramParameter( program, gl.ACTIVE_ATTRIBUTES ) );",
      fileName,
      "WebGLProgram active-attribute count",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tprogramReady = gl.getProgramParameter( program, COMPLETION_STATUS_KHR );",
      "\t\t\tprogramReady = /** @type {boolean} */ ( gl.getProgramParameter( program, COMPLETION_STATUS_KHR ) );",
      fileName,
      "WebGLProgram completion status",
    );
    transformed = replaceOne(
      transformed,
      "function replaceLightNums( string, parameters ) {",
      "/** @param {string} string @param {{ numSpotLightShadows: number, numSpotLightMaps: number, numSpotLightShadowsWithMaps: number, numDirLights: number, numSpotLights: number, numRectAreaLights: number, numPointLights: number, numHemiLights: number, numDirLightShadows: number, numPointLightShadows: number }} parameters */\nfunction replaceLightNums( string, parameters ) {",
      fileName,
      "WebGLProgram light-count substitutions",
    );
    for (const property of [
      "numDirLights",
      "numSpotLights",
      "numSpotLightMaps",
      "numRectAreaLights",
      "numPointLights",
      "numHemiLights",
      "numDirLightShadows",
      "numSpotLightShadowsWithMaps",
      "numSpotLightShadows",
      "numPointLightShadows",
    ]) {
      transformed = replaceOne(
        transformed,
        `.replace( /${property
          .replace("num", "NUM_")
          .replaceAll(/([a-z])([A-Z])/g, "$1_$2")
          .toUpperCase()
          .replace("NUM__", "NUM_")}/g, parameters.${property} )`,
        `.replace( /${property
          .replace("num", "NUM_")
          .replaceAll(/([a-z])([A-Z])/g, "$1_$2")
          .toUpperCase()
          .replace("NUM__", "NUM_")}/g, String( parameters.${property} ) )`,
        fileName,
        `WebGLProgram ${property} string substitution`,
      );
    }
    transformed = replaceOne(
      transformed,
      "function replaceClippingPlaneNums( string, parameters ) {",
      "/** @param {string} string @param {{ numClippingPlanes: number, numClipIntersection: number }} parameters @return {string} */\nfunction replaceClippingPlaneNums( string, parameters ) {",
      fileName,
      "WebGLProgram clipping-plane substitutions",
    );
    transformed = transformed
      .replace(
        ".replace( /NUM_CLIPPING_PLANES/g, parameters.numClippingPlanes )",
        ".replace( /NUM_CLIPPING_PLANES/g, String( parameters.numClippingPlanes ) )",
      )
      .replace(
        ".replace( /UNION_CLIPPING_PLANES/g, ( parameters.numClippingPlanes - parameters.numClipIntersection ) )",
        ".replace( /UNION_CLIPPING_PLANES/g, String( parameters.numClippingPlanes - parameters.numClipIntersection ) )",
      );
    transformed = replaceOne(
      transformed,
      `const includePattern = /^[ \\t]*#include +<([\\w\\d./]+)>/gm;

function resolveIncludes( string ) {

\treturn string.replace( includePattern, includeReplacer );

}

const shaderChunkMap = new Map();

function includeReplacer( match, include ) {

\tlet string = ShaderChunk[ include ];

\tif ( string === undefined ) {

\t\tconst newInclude = shaderChunkMap.get( include );

\t\tif ( newInclude !== undefined ) {

\t\t\tstring = ShaderChunk[ newInclude ];
\t\t\twarn( 'WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.', include, newInclude );

\t\t} else {

\t\t\tthrow new Error( 'THREE.WebGLProgram: Can not resolve #include <' + include + '>' );

\t\t}

\t}

\treturn resolveIncludes( string );

}`,
      `/** @param {string} include @return {string|undefined} */
function getShaderChunkAlias( include ) {

\treturn undefined;

}

/** @param {string} character @return {boolean} */
function isShaderChunkNameCharacter( character ) {

\tconst code = character.charCodeAt( 0 );

\treturn ( code >= 48 && code <= 57 ) ||
\t\t( code >= 65 && code <= 90 ) ||
\t\t( code >= 97 && code <= 122 ) ||
\t\tcharacter === '_' || character === '.' || character === '/';

}

/** @param {string} include @return {string} */
function resolveInclude( include ) {

\tlet string = /** @type {string|undefined} */ ( ShaderChunk[ include ] );

\tif ( string === undefined ) {

\t\tconst newInclude = getShaderChunkAlias( include );

\t\tif ( newInclude !== undefined ) {

\t\t\tstring = /** @type {string|undefined} */ ( ShaderChunk[ newInclude ] );
\t\t\twarn( 'WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.', include, newInclude );

\t\t}

\t}

\tif ( string === undefined ) {

\t\tthrow new Error( 'THREE.WebGLProgram: Can not resolve #include <' + include + '>' );

\t}

\treturn resolveIncludes( string );

}

/** @param {string} string @return {string} */
function resolveIncludes( string ) {

\tlet result = '';
\tlet cursor = 0;
\tlet lineStart = 0;

\twhile ( lineStart < string.length ) {

\t\tlet position = lineStart;

\t\twhile ( position < string.length && ( string.charAt( position ) === ' ' || string.charAt( position ) === '\\t' ) ) position ++;

\t\tlet matched = string.startsWith( '#include', position );

\t\tif ( matched ) position += 8;

\t\tconst spacingStart = position;

\t\twhile ( matched && position < string.length && string.charAt( position ) === ' ' ) position ++;

\t\tmatched = matched && position > spacingStart && string.charAt( position ) === '<';

\t\tif ( matched ) position ++;

\t\tconst nameStart = position;

\t\twhile ( matched && position < string.length && isShaderChunkNameCharacter( string.charAt( position ) ) ) position ++;

\t\tmatched = matched && position > nameStart && string.charAt( position ) === '>';

\t\tif ( matched ) {

\t\t\tconst include = string.slice( nameStart, position );
\t\t\tresult += string.slice( cursor, lineStart );
\t\t\tresult += resolveInclude( include );
\t\t\tcursor = position + 1;
\t\t\tposition = cursor;

\t\t}

\t\tconst newline = string.indexOf( '\\n', position );

\t\tif ( newline === - 1 ) break;

\t\tlineStart = newline + 1;

\t}

\treturn result + string.slice( cursor );

}`,
      fileName,
      "WebGLProgram native include resolver",
    );
    transformed = replaceOne(
      transformed,
      "function unrollLoops( string ) {",
      "/** @param {string} string @return {string} */\nfunction unrollLoops( string ) {",
      fileName,
      "WebGLProgram unroll replacement result",
    );
    transformed = replaceOne(
      transformed,
      "function loopReplacer( match, start, end, snippet ) {",
      "/** @param {string} match @param {string} start @param {string} end @param {string} snippet @return {string} */\nfunction loopReplacer( match, start, end, snippet ) {",
      fileName,
      "WebGLProgram unroll callback",
    );
    transformed = transformed.replace(
      ".replace( /UNROLLED_LOOP_INDEX/g, i );",
      ".replace( /UNROLLED_LOOP_INDEX/g, String( i ) );",
    );
    transformed = replaceOne(
      transformed,
      ".replace( /NUM_SPOT_LIGHT_COORDS/g, numSpotLightCoords )",
      ".replace( /NUM_SPOT_LIGHT_COORDS/g, String( numSpotLightCoords ) )",
      fileName,
      "WebGLProgram spot-light coordinate substitution",
    );
    transformed = replaceOne(
      transformed,
      "\t\treturn cachedAttributes;",
      "\t\treturn cachedAttributes === undefined ? /** @type {Record<string, NativeProgramAttribute>} */ ( {} ) : cachedAttributes;",
      fileName,
      "WebGLProgram attribute cache result",
    );
    transformed = replaceOne(
      transformed,
      "\tlet cachedAttributes;",
      "\t/** @type {Record<string, NativeProgramAttribute>|undefined} */\n\tlet cachedAttributes;",
      fileName,
      "WebGLProgram attribute cache storage",
    );
    transformed = replaceOne(
      transformed,
      "\tlet cachedUniforms;",
      "\t/** @type {InstanceType<typeof WebGLUniforms>|undefined} */\n\tlet cachedUniforms;",
      fileName,
      "WebGLProgram uniform cache storage",
    );
    transformed = replaceOne(
      transformed,
      "\t\treturn cachedUniforms;",
      "\t\tif ( cachedUniforms === undefined ) throw new Error( 'WebGLProgram uniforms were not initialized.' );\n\n\t\treturn cachedUniforms;",
      fileName,
      "WebGLProgram uniform cache invariant",
    );
    transformed = transformed
      .replaceAll(
        "( parameters.morphTargetsCount > 0 )",
        "( webGLProgramNumberOrZero( parameters.morphTargetsCount ) > 0 )",
      )
      .replaceAll(
        "parameters.numLightProbes > 0",
        "webGLProgramNumberOrZero( parameters.numLightProbes ) > 0",
      )
      .replaceAll(
        "parameters.numLightProbeGrids > 0",
        "webGLProgramNumberOrZero( parameters.numLightProbeGrids ) > 0",
      )
      .replace(
        "'#define MORPHTARGETS_TEXTURE_STRIDE ' + parameters.morphTextureStride",
        "'#define MORPHTARGETS_TEXTURE_STRIDE ' + String( parameters.morphTextureStride )",
      )
      .replace(
        "'#define MORPHTARGETS_COUNT ' + parameters.morphTargetsCount",
        "'#define MORPHTARGETS_COUNT ' + String( parameters.morphTargetsCount )",
      );
  }
  if (normalized.endsWith("/three/src/objects/Skeleton.js")) {
    // `boneMatrices` is null until `init` runs; `Float32Array.prototype.set`
    // throws on null, and so does this, by name.
    transformed = replaceOne(
      transformed,
      "\t\tconst boneMatrices = new Float32Array( size * size * 4 ); // 4 floats per RGBA pixel\n\t\tboneMatrices.set( this.boneMatrices ); // copy current values",
      "\t\tconst currentMatrices = this.boneMatrices;\n\t\tif ( currentMatrices === null ) throw new Error( 'THREE.Skeleton: computeBoneTexture() requires an initialized skeleton.' );\n\n\t\tconst boneMatrices = new Float32Array( size * size * 4 ); // 4 floats per RGBA pixel\n\t\tboneMatrices.set( currentMatrices ); // copy current values",
      fileName,
      "Skeleton bone texture source",
    );
  }
  if (normalized.endsWith("/three/src/objects/SkinnedMesh.js")) {
    // Three assigns `skeleton` only in `bind`, so the checker sees no field
    // and every read of it is `any`, while the declaration overlay knows the
    // type -- two authorities. Declaring it in the constructor states what the
    // instance holds before `bind`: nothing.
    transformed = replaceOne(
      transformed,
      "\t\tthis.bindMatrixInverse = new Matrix4();\n",
      "\t\tthis.bindMatrixInverse = new Matrix4();\n\n\t\t/**\n\t\t * The skeleton bound to this mesh, once `bind` has been called.\n\t\t *\n\t\t * @type {import('./Skeleton.js').Skeleton|undefined}\n\t\t */\n\t\tthis.skeleton = undefined;\n",
      fileName,
      "SkinnedMesh skeleton field",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tthis.skeleton.calculateInverses();",
      "\t\t\tskeleton.calculateInverses();",
      fileName,
      "SkinnedMesh bind inverses",
    );
    // Three would throw a TypeError reading `bones` off `undefined`; the
    // same failure, named.
    transformed = replaceOne(
      transformed,
      "\tapplyBoneTransform( index, target ) {\n\n\t\tconst skeleton = this.skeleton;\n",
      "\tapplyBoneTransform( index, target ) {\n\n\t\tconst skeleton = this.skeleton;\n\t\tif ( skeleton === undefined ) throw new Error( 'THREE.SkinnedMesh: applyBoneTransform() requires a bound skeleton.' );\n",
      fileName,
      "SkinnedMesh bone transform skeleton",
    );
    // `...target` iterates a Vector3's generator into `Vector4.set`; the
    // components are the three fields the generator yields, read directly.
    // Three's tag test does not narrow `Vector3|Vector4`, so every call on
    // `target` dispatched over both arms -- and `Vector4.set` has no fourth
    // argument to receive in the three-argument call. The class test narrows.
    transformed = replaceOne(
      transformed,
      "\t\tif ( target.isVector4 ) {\n\n\t\t\t_baseVector.copy( target );\n\t\t\ttarget.set( 0, 0, 0, 0 );\n\n\t\t} else {\n\n\t\t\t_baseVector.set( ...target, 1 );\n\t\t\ttarget.set( 0, 0, 0 );",
      "\t\tif ( target instanceof Vector4 ) {\n\n\t\t\t_baseVector.copy( target );\n\t\t\ttarget.set( 0, 0, 0, 0 );\n\n\t\t} else {\n\n\t\t\t_baseVector.set( target.x, target.y, target.z, 1 );\n\t\t\ttarget.set( 0, 0, 0 );",
      fileName,
      "SkinnedMesh base vector components",
    );
    transformed = replaceOne(
      transformed,
      "\t\tif ( target.isVector4 ) {\n\n\t\t\t// ensure the homogenous coordinate remains unchanged after vector operations\n\t\t\ttarget.w = _baseVector.w;",
      "\t\tif ( target instanceof Vector4 ) {\n\n\t\t\t// ensure the homogenous coordinate remains unchanged after vector operations\n\t\t\ttarget.w = _baseVector.w;",
      fileName,
      "SkinnedMesh homogenous coordinate",
    );
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLRenderStates.js")) {
    // three's WebGL renderer reads light-probe grids (`object.isLightProbeGrid`,
    // `.texture`, `.boundingBox`, `.resolution`) but the class that carries them
    // is an addon this build does not ship. State that shape as a class, so
    // the renderer's reads are field reads and the per-material slot holding
    // one is a typed union instead of a dynamic member.
    transformed = replaceOne(
      transformed,
      "import { WebGLLights } from './WebGLLights.js';",
      `import { WebGLLights } from './WebGLLights.js';
import { Object3D } from '../../core/Object3D.js';
import { Box3 } from '../../math/Box3.js';
import { Vector3 } from '../../math/Vector3.js';

export class NativeLightProbeGrid extends Object3D {

\tconstructor() {

\t\tsuper();

\t\tthis.isLightProbeGrid = true;
\t\t/** @type {import('../../textures/Data3DTexture.js').Data3DTexture|null} */
\t\tthis.texture = null;
\t\tthis.boundingBox = new Box3();
\t\tthis.resolution = new Vector3();

\t}

}`,
      fileName,
      "WebGLRenderStates light-probe grid class",
    );

    transformed = replaceOne(
      transformed,
      "function WebGLRenderState( extensions ) {",
      `/** @typedef {{
 *   lightsArray: Array<import('../../lights/Light.js').Light>,
 *   shadowsArray: Array<import('../../lights/Light.js').Light>,
 *   lightProbeGridArray: NativeLightProbeGrid[],
 *   camera: import('../../cameras/Camera.js').Camera|null,
 *   lights: ReturnType<typeof WebGLLights>,
 *   transmissionRenderTarget: Record<string, import('../WebGLRenderTarget.js').WebGLRenderTarget|undefined>,
 *   textureUnits: number
 * }} NativeWebGLRenderState
 */
function WebGLRenderState( extensions ) {`,
      fileName,
      "WebGLRenderState exact state record",
    );
    transformed = replaceOne(
      transformed,
      "\tconst lightsArray = [];",
      "\t/** @type {Array<import('../../lights/Light.js').Light>} */\n\tconst lightsArray = [];",
      fileName,
      "WebGLRenderState lights array",
    );
    transformed = replaceOne(
      transformed,
      "\tconst shadowsArray = [];",
      "\t/** @type {Array<import('../../lights/Light.js').Light>} */\n\tconst shadowsArray = [];",
      fileName,
      "WebGLRenderState shadows array",
    );
    transformed = replaceOne(
      transformed,
      "\tconst lightProbeGridArray = [];",
      "\t/** @type {NativeLightProbeGrid[]} */\n\tconst lightProbeGridArray = [];",
      fileName,
      "WebGLRenderState light-probe grid array",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction pushLight( light ) {",
      "\t/** @param {import('../../lights/Light.js').Light} light */\n\tfunction pushLight( light ) {",
      fileName,
      "WebGLRenderState light input",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction pushShadow( shadowLight ) {",
      "\t/** @param {import('../../lights/Light.js').Light} shadowLight */\n\tfunction pushShadow( shadowLight ) {",
      fileName,
      "WebGLRenderState shadow input",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction pushLightProbeGrid( volume ) {",
      "\t/** @param {NativeLightProbeGrid} volume */\n\tfunction pushLightProbeGrid( volume ) {",
      fileName,
      "WebGLRenderState light-probe grid input",
    );
    transformed = replaceOne(
      transformed,
      "\tconst state = {",
      "\tconst state = /** @type {NativeWebGLRenderState} */ ( {",
      fileName,
      "WebGLRenderState state carrier",
    );
    transformed = replaceOne(
      transformed,
      "\t};\n\n\treturn {\n\t\tinit: init,\n\t\tstate: state,",
      "\t} );\n\n\treturn {\n\t\tinit: init,\n\t\tstate: state,",
      fileName,
      "WebGLRenderState state carrier close",
    );
    transformed = replaceOne(
      transformed,
      "\tlet renderStates = new WeakMap();",
      "\t/** @type {Map<number, Array<ReturnType<typeof WebGLRenderState>>>} */\n\tconst renderStates = new Map();",
      fileName,
      "WebGLRenderStates scene map",
    );
    transformed = transformed
      .replace("renderStates.get( scene )", "renderStates.get( scene.id )")
      .replace(
        "renderStates.set( scene, [ renderState ] )",
        "renderStates.set( scene.id, /** @type {Array<ReturnType<typeof WebGLRenderState>>} */ ( [ renderState ] ) )",
      );
    transformed = replaceOne(
      transformed,
      "\tfunction get( scene, renderCallDepth = 0 ) {",
      "\t/** @param {import('../../scenes/Scene.js').Scene} scene @param {number} [renderCallDepth=0] */\n\tfunction get( scene, renderCallDepth = 0 ) {",
      fileName,
      "WebGLRenderStates lookup inputs",
    );
    transformed = replaceOne(
      transformed,
      "\t\trenderStates = new WeakMap();",
      "\t\trenderStates.clear();",
      fileName,
      "WebGLRenderStates map reset",
    );
  }
  if (normalized.endsWith("/three/src/math/Frustum.js")) {
    transformed = replaceOne(
      transformed,
      "\t * @param {Object3D} object - The 3D object to test.",
      "\t * @param {Object3D & { geometry: import('../core/BufferGeometry.js').BufferGeometry }} object - The 3D object to test.",
      fileName,
      "Frustum renderable object",
    );
  }
  if (normalized.endsWith("/three/src/core/UniformsGroup.js")) {
    transformed = replaceOne(
      transformed,
      "@type {Array<Uniform>}",
      "@type {Array<import('./Uniform.js').Uniform|Array<import('./Uniform.js').Uniform>>}",
      fileName,
      "UniformsGroup uniform element type",
    );
    transformed = replaceOne(
      transformed,
      "class UniformsGroup extends EventDispatcher {",
      "class UniformsGroup extends EventDispatcher {\n\n\t/** @type {number} */\n\tid = 0;\n\t__bindingPointIndex = 0;\n\t__size = 0;\n\t/** @type {Record<string, any>} */\n\t__cache = {};",
      fileName,
      "UniformsGroup renderer state fields",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tconst uniforms = Array.isArray( uniformsSource[ i ] ) ? uniformsSource[ i ] : [ uniformsSource[ i ] ];\n\n\t\t\tfor ( let j = 0; j < uniforms.length; j ++ ) {\n\n\t\t\t\tthis.uniforms.push( uniforms[ j ].clone() );\n\n\t\t\t}",
      "\t\t\tconst uniformEntry = uniformsSource[ i ];\n\n\t\t\tif ( Array.isArray( uniformEntry ) ) {\n\n\t\t\t\tconst uniforms = /** @type {Array<import('./Uniform.js').Uniform>} */ ( uniformEntry );\n\n\t\t\t\tfor ( let j = 0; j < uniforms.length; j ++ ) {\n\n\t\t\t\t\tthis.uniforms.push( uniforms[ j ].clone() );\n\n\t\t\t\t}\n\n\t\t\t} else {\n\n\t\t\t\tthis.uniforms.push( uniformEntry.clone() );\n\n\t\t\t}",
      fileName,
      "UniformsGroup clone element narrowing",
    );
    transformed = replaceOne(
      transformed,
      "\t\tconst index = this.uniforms.indexOf( uniform );",
      `\t\tlet index = - 1;

\t\tfor ( let i = 0; i < this.uniforms.length; i ++ ) {

\t\t\tconst entry = this.uniforms[ i ];

\t\t\tif ( ! Array.isArray( entry ) && entry === uniform ) {

\t\t\t\tindex = i;
\t\t\t\tbreak;

\t\t\t}

\t\t}`,
      fileName,
      "UniformsGroup exact uniform removal scan",
    );
  }
  if (normalized.endsWith("/three/src/geometries/PolyhedronGeometry.js")) {
    for (const name of ["vertexBuffer", "uvBuffer"]) {
      transformed = replaceOne(
        transformed,
        `\t\tconst ${name} = [];`,
        `\t\t/** @type {number[]} */\n\t\tconst ${name} = [];`,
        fileName,
        `PolyhedronGeometry ${name} element type`,
      );
    }
    transformed = replaceOne(
      transformed,
      "\t\t\tconst v = [];",
      "\t\t\t/** @type {Array<Array<Vector3>>} */\n\t\t\tconst v = [];",
      fileName,
      "PolyhedronGeometry subdivision grid type",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tv[ i ] = [];",
      "\t\t\t\tv[ i ] = /** @type {Array<Vector3>} */ ( [] );",
      fileName,
      "PolyhedronGeometry subdivision row type",
    );
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLTextures.js")) {
    transformed = replaceOne(
      transformed,
      "\tconst supportsInvalidateFramebuffer = typeof navigator === 'undefined' ? false : /OculusBrowser/g.test( navigator.userAgent );",
      "\tconst supportsInvalidateFramebuffer = false;",
      fileName,
      "WebGLTextures native framebuffer invalidation policy",
    );
    transformed = replaceOne(
      transformed,
      `\tlet useOffscreenCanvas = false;

\ttry {

\t\tuseOffscreenCanvas = typeof OffscreenCanvas !== 'undefined'
\t\t\t&& ( new OffscreenCanvas( 1, 1 ).getContext( '2d' ) ) !== null;


\t} catch ( err ) {

\t\t// Ignore any errors

\t}`,
      "",
      fileName,
      "WebGLTextures absent OffscreenCanvas probe",
    );
    transformed = replaceOne(
      transformed,
      `\t\treturn useOffscreenCanvas ?
\t\t\tnew OffscreenCanvas( width, height ) : createElementNS( 'canvas' );`,
      `\t\treturn createElementNS( 'canvas' );`,
      fileName,
      "WebGLTextures native canvas creation",
    );
    transformed = replaceOne(
      transformed,
      `		const source = texture.source;
		let webglTextures = _sources.get( source );

		if ( webglTextures === undefined ) {

			webglTextures = {};
			_sources.set( source, webglTextures );

		}`,
      `		const source = texture.source;
		/** @type {Record<string, { texture: import('@geastack/native-webgl-angle/nativeWebGL').NativeHandle, usedTimes: number }>} */
		let webglTextures;

		if ( _sources.has( source ) ) {

			webglTextures = /** @type {Record<string, { texture: import('@geastack/native-webgl-angle/nativeWebGL').NativeHandle, usedTimes: number }>} */ ( _sources.get( source ) );

		} else {

			webglTextures = {};
			_sources.set( source, webglTextures );

		}`,
      fileName,
      "WebGLTextures source cache membership",
    );
    transformed = replaceOne(
      transformed,
      `		const source = texture.source;
		const webglTextures = _sources.get( source );

		if ( webglTextures ) {`,
      `		const source = texture.source;

		if ( _sources.has( source ) ) {

			const webglTextures = /** @type {Record<string, { texture: import('@geastack/native-webgl-angle/nativeWebGL').NativeHandle, usedTimes: number }>} */ ( _sources.get( source ) );`,
      fileName,
      "WebGLTextures deallocation cache membership",
    );
    transformed = replaceOne(
      transformed,
      `		const source = texture.source;
		const webglTextures = _sources.get( source );
		delete webglTextures[ textureProperties.__cacheKey ];`,
      `		const source = texture.source;
		if ( ! _sources.has( source ) ) throw new Error( 'THREE.WebGLTextures: Missing source cache during texture deletion.' );
		const webglTextures = /** @type {Record<string, { texture: import('@geastack/native-webgl-angle/nativeWebGL').NativeHandle, usedTimes: number }>} */ ( _sources.get( source ) );
		delete webglTextures[ textureProperties.__cacheKey ];`,
      fileName,
      "WebGLTextures source cache deletion membership",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction getMipLevels( texture, image ) {",
      `\t/** @typedef {{ data?: ${nativeTypedArrayType}, width?: number, height?: number, depth?: number, complete?: boolean, isCompressedTexture?: boolean, isDataTexture?: boolean, image?: import('../../textures/Texture.js').NativeTextureImage, mipmaps?: Array<import('../../textures/Texture.js').NativeTextureMipmap> }} NativeWebGLTextureImage */

\t/**
\t * @param {import('../../textures/Texture.js').Texture['image']|NativeWebGLTextureImage|undefined} value
\t * @return {NativeWebGLTextureImage}
\t */
\tfunction requireTextureImageRecord( value ) {

\t\tif ( value !== null && value !== undefined && ! Array.isArray( value ) && typeof value.width === 'number' && typeof value.height === 'number' ) {

\t\t\treturn {
\t\t\t\tdata: value.data,
\t\t\t\twidth: value.width,
\t\t\t\theight: value.height,
\t\t\t\tdepth: value.depth,
\t\t\t\tcomplete: 'complete' in value ? value.complete : undefined,
\t\t\t\tisCompressedTexture: 'isCompressedTexture' in value ? value.isCompressedTexture : undefined,
\t\t\t\tisDataTexture: 'isDataTexture' in value ? value.isDataTexture : undefined,
\t\t\t\timage: 'image' in value ? value.image : undefined,
\t\t\t\tmipmaps: 'mipmaps' in value ? value.mipmaps : undefined
\t\t\t};

\t\t}

\t\tthrow new Error( 'THREE.WebGLTextures: Texture image must be a dimensioned native image record.' );

\t}

\t/**
\t * The frame for the 6-argument texImage2D/texSubImage2D forms REQUIRES width,
\t * height and data, because the shim reads all three off the source. Every
\t * record three hands it -- a cube face, a manually-supplied mip -- declares
\t * those members OPTIONAL, so no call site could satisfy it and all four were
\t * refused. requireTextureImageRecord cannot serve here: it returns the
\t * all-optional shape, which is the very thing being refused, and tightening it
\t * would change five other callers that legitimately have no data. This one
\t * checks all three and SAYS so in its return type.
\t * @param {{ data?: ${nativeTypedArrayType}, width?: number, height?: number, depth?: number }|undefined} value
\t * @return {${nativeImageSourceType}}
\t */
\tfunction requireTextureImageSource( value ) {

\t\tif ( value !== null && value !== undefined && typeof value.width === 'number' && typeof value.height === 'number' && value.data !== null && value.data !== undefined ) {

\t\t\treturn { width: value.width, height: value.height, data: value.data };

\t\t}

\t\tthrow new Error( 'THREE.WebGLTextures: Texture upload source must carry width, height and data.' );

\t}

\t/**
\t * @param {import('../../textures/Texture.js').Texture['image']} value
\t * @return {Array<NativeWebGLTextureImage>}
\t */
\tfunction requireTextureImageRecords( value ) {

\t\tif ( Array.isArray( value ) ) return value;

\t\tthrow new Error( 'THREE.WebGLTextures: Cube texture image must be a native image array.' );

\t}

\t/** @return {number} */
\tfunction requireMipLevelCount( value ) {

\t\tif ( typeof value === 'number' ) return value;

\t\tthrow new Error( 'THREE.WebGLTextures: Mipmap level count must be numeric.' );

\t}

\t/** @param {import('../../textures/Texture.js').Texture} texture @param {NativeWebGLTextureImage} image */
\tfunction getMipLevels( texture, image ) {`,
      fileName,
      "WebGLTextures native image guards",
    );
    // The plain (non-compressed, non-data) cube branch hands the upload frame a
    // record whose width/height/data are all OPTIONAL, which the 6-argument form
    // cannot accept -- these four calls were the last thing standing between
    // the reference app and an emitted program. The data branch two blocks above already
    // reads the three members off explicitly; this states the same requirement
    // once, at the boundary, instead of four times inside the frame.
    transformed = replaceOne(
      transformed,
      "state.texSubImage2D( _gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, 0, 0, glFormat, glType, cubeImage[ i ] );",
      "state.texSubImage2D( _gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, 0, 0, glFormat, glType, requireTextureImageSource( cubeImage[ i ] ) );",
      fileName,
      "cube face texSubImage2D source",
    );
    transformed = replaceOne(
      transformed,
      "state.texImage2D( _gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, glInternalFormat, glFormat, glType, cubeImage[ i ] );",
      "state.texImage2D( _gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, glInternalFormat, glFormat, glType, requireTextureImageSource( cubeImage[ i ] ) );",
      fileName,
      "cube face texImage2D source",
    );
    transformed = replaceOne(
      transformed,
      "state.texSubImage2D( _gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, j + 1, 0, 0, glFormat, glType, mipmap.image[ i ] );",
      "state.texSubImage2D( _gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, j + 1, 0, 0, glFormat, glType, requireTextureImageSource( mipmap.image[ i ] ) );",
      fileName,
      "cube mip texSubImage2D source",
    );
    transformed = replaceOne(
      transformed,
      "state.texImage2D( _gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, j + 1, glInternalFormat, glFormat, glType, mipmap.image[ i ] );",
      "state.texImage2D( _gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, j + 1, glInternalFormat, glFormat, glType, requireTextureImageSource( mipmap.image[ i ] ) );",
      fileName,
      "cube mip texImage2D source",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\tconst image = texture.image;

\t\t\tif ( image === null ) {

\t\t\t\twarn( 'WebGLRenderer: Texture marked for update but no image data found.' );

\t\t\t} else if ( image.complete === false ) {

\t\t\t\twarn( 'WebGLRenderer: Texture marked for update but image is incomplete' );

\t\t\t} else {

\t\t\t\tuploadTexture( textureProperties, texture, slot );
\t\t\t\treturn;

\t\t\t}`,
      `\t\t\tconst image = texture.image;

\t\t\tif ( image === null ) {

\t\t\t\twarn( 'WebGLRenderer: Texture marked for update but no image data found.' );

\t\t\t} else {

\t\t\t\tconst imageRecord = requireTextureImageRecord( image );

\t\t\t\tif ( imageRecord.complete === false ) {

\t\t\t\t\twarn( 'WebGLRenderer: Texture marked for update but image is incomplete' );

\t\t\t\t} else {

\t\t\t\t\tuploadTexture( textureProperties, texture, slot );
\t\t\t\t\treturn;

\t\t\t\t}

\t\t\t}`,
      fileName,
      "WebGLTextures 2D image record narrowing",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tlet image = resizeImage( texture.image, false, capabilities.maxTextureSize );",
      "\t\t\tlet image = requireTextureImageRecord( resizeImage( texture.image, false, capabilities.maxTextureSize ) );",
      fileName,
      "WebGLTextures upload image record",
    );
    transformed = replaceOne(
      transformed,
      `\tfunction uploadCubeTexture( textureProperties, texture, slot ) {

\t\tif ( texture.image.length !== 6 ) return;`,
      `\tfunction uploadCubeTexture( textureProperties, texture, slot ) {

\t\tconst textureImages = requireTextureImageRecords( texture.image );

\t\tif ( textureImages.length !== 6 ) return;`,
      fileName,
      "WebGLTextures cube image array narrowing",
    );
    const uploadCubeStart = transformed.indexOf(
      "\tfunction uploadCubeTexture( textureProperties, texture, slot ) {",
    );
    const uploadCubeEnd = transformed.indexOf(
      "\n\tfunction setupFrameBufferTexture",
      uploadCubeStart,
    );
    if (uploadCubeStart < 0 || uploadCubeEnd < 0)
      throw new Error(
        `Three WebGLTextures cube upload source at ${fileName} no longer matches the native adaptation`,
      );
    const uploadCubeSource = transformed.slice(uploadCubeStart, uploadCubeEnd);
    transformed =
      transformed.slice(0, uploadCubeStart) +
      uploadCubeSource.replaceAll("texture.image[", "textureImages[") +
      transformed.slice(uploadCubeEnd);
    // `cubeImage[ i ]` is one array cell written from two arms, and the array
    // census joins its writes the way a cell's are joined: the covering shape
    // wins. A data-texture face's nested `.image` record is covered by the
    // face record (every face-only member is optional), so the join would
    // settle on the NESTED shape and every `cubeImage[ i ].mipmaps` read below
    // would be untyped again. Lifting the data arm into the face record makes
    // both arms the same type -- the same lift `uploadTexture` applies to its
    // own image -- and the throw inside it is the fail-closed answer for a
    // data-texture face that carries no dimensioned image.
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\tcubeImage[ i ] = isDataTexture ? textureImages[ i ].image : textureImages[ i ];",
      "\t\t\t\t\tcubeImage[ i ] = isDataTexture ? requireTextureImageRecord( textureImages[ i ].image ) : textureImages[ i ];",
      fileName,
      "WebGLTextures cube data-texture face record",
    );
    // `resizeImage` and `verifyColorSpace` are unannotated identity shims: they
    // return the image they were handed, so their return type is the JOIN of
    // every caller's argument -- and `uploadTexture` hands them a bare
    // `texture.image`, whose declared shape still admits the ARRAY arm. That arm
    // travelled back into this cell and made `cubeImage[ i ].mipmaps` a read on
    // an array of records, which has no such member and cannot lower. Stating
    // the requirement at the write, with the guard the third arm already uses,
    // keeps all three arms one type instead of re-typing two shared helpers
    // whose other callers legitimately pass the union.
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\tcubeImage[ i ] = resizeImage( textureImages[ i ], true, capabilities.maxCubemapSize );",
      "\t\t\t\t\tcubeImage[ i ] = requireTextureImageRecord( resizeImage( textureImages[ i ], true, capabilities.maxCubemapSize ) );",
      fileName,
      "WebGLTextures cube resized face record",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tcubeImage[ i ] = verifyColorSpace( texture, cubeImage[ i ] );",
      "\t\t\t\tcubeImage[ i ] = requireTextureImageRecord( verifyColorSpace( texture, cubeImage[ i ] ) );",
      fileName,
      "WebGLTextures cube color-verified face record",
    );
    transformed = replaceOne(
      transformed,
      `\t\tconst textureProperties = properties.get( renderTarget.depthTexture );
\t\ttextureProperties.__renderTarget = renderTarget;

\t\t// upload an empty depth texture with framebuffer size
\t\tif ( ! textureProperties.__webglTexture ||
\t\t\t\trenderTarget.depthTexture.image.width !== renderTarget.width ||
\t\t\t\trenderTarget.depthTexture.image.height !== renderTarget.height ) {

\t\t\trenderTarget.depthTexture.image.width = renderTarget.width;
\t\t\trenderTarget.depthTexture.image.height = renderTarget.height;`,
      `\t\tconst textureProperties = properties.get( renderTarget.depthTexture );
\t\ttextureProperties.__renderTarget = renderTarget;
\t\tconst depthTextureImage = requireTextureImageRecord( renderTarget.depthTexture.image );

\t\t// upload an empty depth texture with framebuffer size
\t\tif ( ! textureProperties.__webglTexture ||
\t\t\t\tdepthTextureImage.width !== renderTarget.width ||
\t\t\t\tdepthTextureImage.height !== renderTarget.height ) {

\t\t\tdepthTextureImage.width = renderTarget.width;
\t\t\tdepthTextureImage.height = renderTarget.height;`,
      fileName,
      "WebGLTextures depth image record narrowing",
    );
    transformed = replaceOne(
      transformed,
      "\tconst wrappingToGL = {",
      `\t/** @param {Record<number, number>} table @param {number|undefined} key @return {number} */
\tfunction getTextureParameter( table, key ) {

\t\tif ( typeof key !== 'number' ) throw new Error( 'THREE.WebGLTextures: Missing numeric texture parameter.' );

\t\tconst numericKey = /** @type {number} */ ( key );
\t\tconst value = table[ numericKey ];

\t\tif ( typeof value !== 'number' ) throw new Error( 'THREE.WebGLTextures: Unsupported texture parameter.' );

\t\treturn value;

\t}

\t/** @type {Record<number, number>} */
\tconst wrappingToGL = {`,
      fileName,
      "WebGLTextures numeric texture-parameter lookup",
    );
    transformed = replaceOne(
      transformed,
      "\t\tconst textureUnit = textureUnits;\n\n\t\tif ( textureUnit >= capabilities.maxTextures ) {\n\n\t\t\twarn( 'WebGLTextures: Trying to use ' + textureUnit + ' texture units while this GPU supports only ' + capabilities.maxTextures );",
      "\t\tconst textureUnit = textureUnits;\n\t\tconst maximumTextureUnits = /** @type {number} */ ( capabilities.maxTextures );\n\n\t\tif ( typeof maximumTextureUnits !== 'number' ) throw new Error( 'THREE.WebGLTextures: Missing numeric texture unit limit.' );\n\n\t\tif ( textureUnit >= maximumTextureUnits ) {\n\n\t\t\twarn( 'WebGLTextures: Trying to use ' + textureUnit + ' texture units while this GPU supports only ' + maximumTextureUnits );",
      fileName,
      "WebGLTextures texture unit limit",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction setTextureParameters( textureType, texture ) {",
      "\t/** @param {number} textureType @param {import('../../textures/Texture.js').Texture} texture */\n\tfunction setTextureParameters( textureType, texture ) {",
      fileName,
      "WebGLTextures texture parameter inputs",
    );
    for (const table of ["filterToGL", "compareToGL"]) {
      transformed = replaceOne(
        transformed,
        `\tconst ${table} = {`,
        `\t/** @type {Record<number, number>} */\n\tconst ${table} = {`,
        fileName,
        `WebGLTextures ${table} table`,
      );
    }
    for (const table of ["wrappingToGL", "filterToGL", "compareToGL"]) {
      transformed = transformed.replaceAll(
        new RegExp(`${table}\\[ ([^\\]]+) \\]`, "g"),
        `getTextureParameter( ${table}, $1 )`,
      );
    }
    const resizeStart =
      "\tfunction resizeImage( image, needsNewCanvas, maxSize ) {";
    const resizeEnd = "\n\t}\n\n\tfunction textureNeedsGenerateMipmaps";
    const resizeStartIndex = transformed.indexOf(resizeStart);
    const resizeEndIndex = transformed.indexOf(resizeEnd, resizeStartIndex);
    if (resizeStartIndex < 0 || resizeEndIndex < 0)
      throw new Error(
        `Three native image resize source at ${fileName} no longer matches the native adaptation`,
      );
    transformed =
      transformed.slice(0, resizeStartIndex) +
      "\tfunction resizeImage( image, needsNewCanvas, maxSize ) {\n\n\t\treturn image;" +
      transformed.slice(resizeEndIndex);
    const dimensionsStart = "\tfunction getDimensions( image ) {";
    const dimensionsEnd = "\n\t}\n\n\t//\n\n\tthis.allocateTextureUnit";
    const dimensionsStartIndex = transformed.indexOf(dimensionsStart);
    const dimensionsEndIndex = transformed.indexOf(
      dimensionsEnd,
      dimensionsStartIndex,
    );
    if (dimensionsStartIndex < 0 || dimensionsEndIndex < 0)
      throw new Error(
        `Three native image dimensions source at ${fileName} no longer matches the native adaptation`,
      );
    transformed =
      transformed.slice(0, dimensionsStartIndex) +
      "\tfunction getDimensions( image ) {\n\n\t\tconst imageRecord = requireTextureImageRecord( image );\n\t\t_imageDimensions.width = imageRecord.width;\n\t\t_imageDimensions.height = imageRecord.height;\n\n\t\treturn _imageDimensions;" +
      transformed.slice(dimensionsEndIndex);
    transformed = replaceOne(
      transformed,
      "\tconst _videoTextures = new WeakMap();",
      "\t/** @type {WeakMap<import('../../textures/Texture.js').Texture, number>} */\n" +
        "\tconst _videoTextures = new WeakMap();",
      fileName,
      "WebGLTextures video frame map",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tif ( Array.isArray( renderTargetProperties.__webglFramebuffer[ i ] ) ) {\n\n\t\t\t\t\tfor ( let level = 0; level < renderTargetProperties.__webglFramebuffer[ i ].length; level ++ ) _gl.deleteFramebuffer( renderTargetProperties.__webglFramebuffer[ i ][ level ] );\n\n\t\t\t\t} else {\n\n\t\t\t\t\t_gl.deleteFramebuffer( renderTargetProperties.__webglFramebuffer[ i ] );",
      "\t\t\t\tif ( renderTargetProperties.__webglCubeMipmapFramebuffers.length > 0 ) {\n\n\t\t\t\t\tconst framebuffers = renderTargetProperties.__webglCubeMipmapFramebuffers[ i ];\n\t\t\t\t\tfor ( let level = 0; level < framebuffers.length; level ++ ) _gl.deleteFramebuffer( framebuffers[ level ] );\n\n\t\t\t\t} else {\n\n\t\t\t\t\t_gl.deleteFramebuffer( renderTargetProperties.__webglCubeFramebuffers[ i ] );",
      fileName,
      "WebGLTextures cube framebuffer disposal",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tif ( Array.isArray( renderTargetProperties.__webglFramebuffer ) ) {\n\n\t\t\t\tfor ( let level = 0; level < renderTargetProperties.__webglFramebuffer.length; level ++ ) _gl.deleteFramebuffer( renderTargetProperties.__webglFramebuffer[ level ] );\n\n\t\t\t} else {\n\n\t\t\t\t_gl.deleteFramebuffer( renderTargetProperties.__webglFramebuffer );",
      "\t\t\tif ( renderTargetProperties.__webglMipmapFramebuffers.length > 0 ) {\n\n\t\t\t\tfor ( let level = 0; level < renderTargetProperties.__webglMipmapFramebuffers.length; level ++ ) _gl.deleteFramebuffer( renderTargetProperties.__webglMipmapFramebuffers[ level ] );\n\n\t\t\t} else {\n\n\t\t\t\t_gl.deleteFramebuffer( renderTargetProperties.__webglFramebuffer );",
      fileName,
      "WebGLTextures framebuffer disposal",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tif ( renderTargetProperties.__webglColorRenderbuffer ) {\n\n\t\t\t\tfor ( let i = 0; i < renderTargetProperties.__webglColorRenderbuffer.length; i ++ ) {\n\n\t\t\t\t\tif ( renderTargetProperties.__webglColorRenderbuffer[ i ] ) _gl.deleteRenderbuffer( renderTargetProperties.__webglColorRenderbuffer[ i ] );",
      "\t\t\tif ( renderTargetProperties.__webglColorRenderbuffer ) {\n\n\t\t\t\tconst colorRenderbuffers = /** @type {Array<import('@geastack/native-webgl-angle/nativeWebGL').NativeHandle>} */ ( renderTargetProperties.__webglColorRenderbuffer );\n\t\t\t\tfor ( let i = 0; i < colorRenderbuffers.length; i ++ ) {\n\n\t\t\t\t\tif ( colorRenderbuffers[ i ] ) _gl.deleteRenderbuffer( colorRenderbuffers[ i ] );",
      fileName,
      "WebGLTextures color renderbuffer disposal",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\tif ( renderTargetProperties.__webglDepthbuffer ) _gl.deleteRenderbuffer( renderTargetProperties.__webglDepthbuffer[ i ] );",
      "\t\t\t\tif ( renderTargetProperties.__webglDepthbuffers[ i ] ) _gl.deleteRenderbuffer( renderTargetProperties.__webglDepthbuffers[ i ] );",
      fileName,
      "WebGLTextures cube depthbuffer disposal",
    );
    transformed = transformed
      .replace(
        "delete renderTargetProperties.__boundDepthTexture;",
        "renderTargetProperties.__boundDepthTexture = undefined;",
      )
      .replace(
        "delete renderTargetProperties.__depthDisposeCallback;",
        "renderTargetProperties.__depthDisposeCallback = undefined;",
      );
    transformed = replaceOne(
      transformed,
      `\t\t\tif ( isCube ) {

\t\t\t\t// For cube render targets with depth texture, setup each face
\t\t\t\tfor ( let i = 0; i < 6; i ++ ) {

\t\t\t\t\tsetupDepthTexture( renderTargetProperties.__webglFramebuffer[ i ], renderTarget, i );

\t\t\t\t}

\t\t\t} else {`,
      `\t\t\tif ( isCube ) {

\t\t\t\t// For cube render targets with depth texture, setup each face
\t\t\t\tfor ( let i = 0; i < 6; i ++ ) {

\t\t\t\t\tsetupDepthTexture( renderTarget.texture.mipmaps && renderTarget.texture.mipmaps.length > 0 ? renderTargetProperties.__webglCubeMipmapFramebuffers[ i ][ 0 ] : renderTargetProperties.__webglCubeFramebuffers[ i ], renderTarget, i );

\t\t\t\t}

\t\t\t} else {`,
      fileName,
      "WebGLTextures cube depth-texture framebuffers",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\t\trenderTargetProperties.__webglDepthbuffer = [];

\t\t\t\tfor ( let i = 0; i < 6; i ++ ) {

\t\t\t\t\tstate.bindFramebuffer( _gl.FRAMEBUFFER, renderTargetProperties.__webglFramebuffer[ i ] );

\t\t\t\t\tif ( renderTargetProperties.__webglDepthbuffer[ i ] === undefined ) {

\t\t\t\t\t\trenderTargetProperties.__webglDepthbuffer[ i ] = _gl.createRenderbuffer();
\t\t\t\t\t\tsetupRenderBufferStorage( renderTargetProperties.__webglDepthbuffer[ i ], renderTarget, false );

\t\t\t\t\t} else {

\t\t\t\t\t\t// attach buffer if it's been created already
\t\t\t\t\t\tconst glAttachmentType = renderTarget.stencilBuffer ? _gl.DEPTH_STENCIL_ATTACHMENT : _gl.DEPTH_ATTACHMENT;
\t\t\t\t\t\tconst renderbuffer = renderTargetProperties.__webglDepthbuffer[ i ];
\t\t\t\t\t\t_gl.bindRenderbuffer( _gl.RENDERBUFFER, renderbuffer );
\t\t\t\t\t\t_gl.framebufferRenderbuffer( _gl.FRAMEBUFFER, glAttachmentType, _gl.RENDERBUFFER, renderbuffer );

\t\t\t\t\t}

\t\t\t\t}`,
      `\t\t\t\trenderTargetProperties.__webglDepthbuffers = [];
\t\t\t\tconst cubeDepthbuffers = renderTargetProperties.__webglDepthbuffers;

\t\t\t\tfor ( let i = 0; i < 6; i ++ ) {

\t\t\t\t\tstate.bindFramebuffer( _gl.FRAMEBUFFER, renderTarget.texture.mipmaps && renderTarget.texture.mipmaps.length > 0 ? renderTargetProperties.__webglCubeMipmapFramebuffers[ i ][ 0 ] : renderTargetProperties.__webglCubeFramebuffers[ i ] );

\t\t\t\t\tif ( cubeDepthbuffers[ i ] === undefined ) {

\t\t\t\t\t\tcubeDepthbuffers[ i ] = _gl.createRenderbuffer();
\t\t\t\t\t\tsetupRenderBufferStorage( cubeDepthbuffers[ i ], renderTarget, false );

\t\t\t\t\t} else {

\t\t\t\t\t\t// attach buffer if it's been created already
\t\t\t\t\t\tconst glAttachmentType = renderTarget.stencilBuffer ? _gl.DEPTH_STENCIL_ATTACHMENT : _gl.DEPTH_ATTACHMENT;
\t\t\t\t\t\tconst renderbuffer = cubeDepthbuffers[ i ];
\t\t\t\t\t\t_gl.bindRenderbuffer( _gl.RENDERBUFFER, renderbuffer );
\t\t\t\t\t\t_gl.framebufferRenderbuffer( _gl.FRAMEBUFFER, glAttachmentType, _gl.RENDERBUFFER, renderbuffer );

\t\t\t\t\t}

\t\t\t\t}`,
      fileName,
      "WebGLTextures cube depth renderbuffers",
    );
    transformed = replaceOne(
      transformed,
      `\t\tif ( isCube ) {

\t\t\trenderTargetProperties.__webglFramebuffer = [];

\t\t\tfor ( let i = 0; i < 6; i ++ ) {

\t\t\t\tif ( texture.mipmaps && texture.mipmaps.length > 0 ) {

\t\t\t\t\trenderTargetProperties.__webglFramebuffer[ i ] = [];

\t\t\t\t\tfor ( let level = 0; level < texture.mipmaps.length; level ++ ) {

\t\t\t\t\t\trenderTargetProperties.__webglFramebuffer[ i ][ level ] = _gl.createFramebuffer();

\t\t\t\t\t}

\t\t\t\t} else {

\t\t\t\t\trenderTargetProperties.__webglFramebuffer[ i ] = _gl.createFramebuffer();

\t\t\t\t}

\t\t\t}

\t\t} else {`,
      `\t\tif ( isCube ) {

\t\t\trenderTargetProperties.__webglCubeFramebuffers = [];
\t\t\trenderTargetProperties.__webglCubeMipmapFramebuffers = [];

\t\t\tfor ( let i = 0; i < 6; i ++ ) {

\t\t\t\tif ( texture.mipmaps && texture.mipmaps.length > 0 ) {

\t\t\t\t\tconst mipmapFramebuffers = /** @type {Array<import('@geastack/native-webgl-angle/nativeWebGL').NativeHandle>} */ ( [] );
\t\t\t\t\trenderTargetProperties.__webglCubeMipmapFramebuffers[ i ] = mipmapFramebuffers;

\t\t\t\t\tfor ( let level = 0; level < texture.mipmaps.length; level ++ ) {

\t\t\t\t\t\tmipmapFramebuffers[ level ] = _gl.createFramebuffer();

\t\t\t\t\t}

\t\t\t\t} else {

\t\t\t\t\trenderTargetProperties.__webglCubeFramebuffers[ i ] = _gl.createFramebuffer();

\t\t\t\t}

\t\t\t}

\t\t} else {`,
      fileName,
      "WebGLTextures typed cube framebuffer allocation",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\tif ( texture.mipmaps && texture.mipmaps.length > 0 ) {

\t\t\t\trenderTargetProperties.__webglFramebuffer = [];

\t\t\t\tfor ( let level = 0; level < texture.mipmaps.length; level ++ ) {

\t\t\t\t\trenderTargetProperties.__webglFramebuffer[ level ] = _gl.createFramebuffer();

\t\t\t\t}

\t\t\t} else {

\t\t\t\trenderTargetProperties.__webglFramebuffer = _gl.createFramebuffer();

\t\t\t}`,
      `\t\t\tif ( texture.mipmaps && texture.mipmaps.length > 0 ) {

\t\t\t\trenderTargetProperties.__webglMipmapFramebuffers = [];

\t\t\t\tfor ( let level = 0; level < texture.mipmaps.length; level ++ ) {

\t\t\t\t\trenderTargetProperties.__webglMipmapFramebuffers[ level ] = _gl.createFramebuffer();

\t\t\t\t}

\t\t\t} else {

\t\t\t\trenderTargetProperties.__webglFramebuffer = _gl.createFramebuffer();

\t\t\t}`,
      fileName,
      "WebGLTextures typed mipmap framebuffer allocation",
    );
    transformed = transformed.replaceAll(
      "renderTargetProperties.__webglFramebuffer[ 0 ]",
      "renderTargetProperties.__webglMipmapFramebuffers[ 0 ]",
    );
    transformed = replaceOne(
      transformed,
      `\t\tif ( isCube ) {

\t\t\tstate.bindTexture( _gl.TEXTURE_CUBE_MAP, textureProperties.__webglTexture );`,
      `\t\tif ( isCube ) {

\t\t\tstate.bindTexture( _gl.TEXTURE_CUBE_MAP, textureProperties.__webglTexture );`,
      fileName,
      "WebGLTextures typed cube framebuffer setup",
    );
    transformed = transformed
      .replace(
        "setupFrameBufferTexture( renderTargetProperties.__webglFramebuffer[ i ][ level ], renderTarget, texture, _gl.COLOR_ATTACHMENT0, _gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, level );",
        "const mipmapFramebuffers = renderTargetProperties.__webglCubeMipmapFramebuffers[ i ];\n\t\t\t\t\t\tsetupFrameBufferTexture( mipmapFramebuffers[ level ], renderTarget, texture, _gl.COLOR_ATTACHMENT0, _gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, level );",
      )
      .replace(
        "setupFrameBufferTexture( renderTargetProperties.__webglFramebuffer[ i ], renderTarget, texture, _gl.COLOR_ATTACHMENT0, _gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0 );",
        "setupFrameBufferTexture( renderTargetProperties.__webglCubeFramebuffers[ i ], renderTarget, texture, _gl.COLOR_ATTACHMENT0, _gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0 );",
      )
      .replace(
        "setupFrameBufferTexture( renderTargetProperties.__webglFramebuffer[ level ], renderTarget, texture, _gl.COLOR_ATTACHMENT0, glTextureType, level );",
        "const mipmapFramebuffers = renderTargetProperties.__webglMipmapFramebuffers;\n\t\t\t\t\tsetupFrameBufferTexture( mipmapFramebuffers[ level ], renderTarget, texture, _gl.COLOR_ATTACHMENT0, glTextureType, level );",
      );
    transformed = replaceOne(
      transformed,
      "\tfunction getRow( index, rowLength, componentStride ) {",
      "\t/** @param {number} index @param {number} rowLength @param {number} componentStride */\n\tfunction getRow( index, rowLength, componentStride ) {",
      fileName,
      "WebGLTextures row calculation",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction updateTexture( texture, image, glFormat, glType ) {",
      "\t/** @param {import('../../textures/Texture.js').Texture} texture @param {{ width: number, height: number, data: (Int8Array|Uint8Array|Uint8ClampedArray|Int16Array|Uint16Array|Int32Array|Uint32Array|Float32Array|Float64Array) }} image @param {number} glFormat @param {number} glType */\n\tfunction updateTexture( texture, image, glFormat, glType ) {",
      fileName,
      "WebGLTextures data-image update",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\tlet width = image.width, height = image.height;",
      "\t\t\t\t\tlet width = /** @type {number} */ ( image.width ), height = /** @type {number} */ ( image.height );",
      fileName,
      "WebGLTextures framebuffer mip dimensions",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tconst levels = getMipLevels( texture, image );",
      "\t\t\tconst levels = requireMipLevelCount( getMipLevels( texture, image ) );",
      fileName,
      "WebGLTextures upload mip-level count",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tlet levels = getMipLevels( texture, image );",
      "\t\t\tlet levels = requireMipLevelCount( getMipLevels( texture, image ) );",
      fileName,
      "WebGLTextures cube upload mip-level count",
    );
    transformed = replaceOne(
      transformed,
      "\t\tconst textures = renderTarget.textures;",
      "\t\tconst textures = /** @type {Array<import('../../textures/Texture.js').Texture>} */ ( renderTarget.textures );",
      fileName,
      "WebGLTextures render-target attachment array",
    );
    const layerUpdateLoop =
      /^(\s*)for \( const layerIndex of texture\.layerUpdates \) \{/gm;
    const layerUpdateLoopCount = Array.from(
      transformed.matchAll(layerUpdateLoop),
    ).length;
    if (layerUpdateLoopCount !== 2) {
      throw new Error(
        `Three WebGLTextures source at ${fileName} has ${layerUpdateLoopCount} layer update loops; expected 2`,
      );
    }
    transformed = transformed.replaceAll(
      layerUpdateLoop,
      (_match, indentation) =>
        `${indentation}const layerUpdates = /** @type {Set<number>} */ ( texture.layerUpdates );\n\n${indentation}for ( const layerIndex of layerUpdates ) {`,
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\t\t\t\t\t\tconst layerByteLength = getByteLength( mipmap.width, mipmap.height, texture.format, texture.type );",
      "\t\t\t\t\t\t\t\t\t\tconst layerByteLength = getByteLength( mipmap.width, mipmap.height, texture.format, texture.type );\n\t\t\t\t\t\t\t\t\t\tconst bytesPerElement = /** @type {number} */ ( mipmap.data.BYTES_PER_ELEMENT );",
      fileName,
      "WebGLTextures compressed layer element size",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\t\t\tconst layerByteLength = getByteLength( image.width, image.height, texture.format, texture.type );",
      "\t\t\t\t\t\t\tconst layerByteLength = getByteLength( image.width, image.height, texture.format, texture.type );\n\t\t\t\t\t\t\tconst bytesPerElement = /** @type {number} */ ( image.data.BYTES_PER_ELEMENT );",
      fileName,
      "WebGLTextures data layer element size",
    );
    transformed = transformed
      .replaceAll(
        "layerByteLength / mipmap.data.BYTES_PER_ELEMENT",
        "layerByteLength / bytesPerElement",
      )
      .replaceAll(
        "layerByteLength / image.data.BYTES_PER_ELEMENT",
        "layerByteLength / bytesPerElement",
      );
    const externalTextureRead =
      "\t\t\ttextureProperties.__webglTexture = texture.sourceTexture ? texture.sourceTexture : null;";
    const externalTextureReadCount =
      transformed.split(externalTextureRead).length - 1;
    if (externalTextureReadCount !== 2) {
      throw new Error(
        `Three WebGLTextures source at ${fileName} has ${externalTextureReadCount} external texture reads; expected 2`,
      );
    }
    transformed = transformed.replaceAll(
      externalTextureRead,
      "\t\t\tconst externalTexture = /** @type {import('../../textures/ExternalTexture.js').ExternalTexture} */ ( texture );\n" +
        "\t\t\ttextureProperties.__webglTexture = externalTexture.sourceTexture ? externalTexture.sourceTexture : null;",
    );
    transformed = replaceOne(
      transformed,
      "\t\treturn array.join();",
      "\t\tlet key = '';\n\n\t\tfor ( let i = 0; i < array.length; i ++ ) {\n\n\t\t\tif ( i > 0 ) key = key + ',';\n\t\t\tkey = key + String( array[ i ] );\n\n\t\t}\n\n\t\treturn key;",
      fileName,
      "WebGLTextures cache key join",
    );
  }
  if (
    normalized.endsWith("/three/src/renderers/webgl/WebGLBufferRenderer.js")
  ) {
    transformed = replaceOne(
      transformed,
      "\tlet mode;",
      "\t/** @type {number} */\n\tlet mode = 0;",
      fileName,
      "WebGLBufferRenderer draw mode",
    );
    for (const [name, parameters] of [
      ["setMode", "@param {number} value"],
      ["render", "@param {number} start @param {number} count"],
      [
        "renderInstances",
        "@param {number} start @param {number} count @param {number} primcount",
      ],
      [
        "renderMultiDraw",
        "@param {Int32Array} starts @param {Int32Array} counts @param {number} drawCount",
      ],
    ]) {
      transformed = replaceOne(
        transformed,
        `\tfunction ${name}(`,
        `\t/** ${parameters} */\n\tfunction ${name}(`,
        fileName,
        `WebGLBufferRenderer.${name} inputs`,
      );
    }
  }
  if (
    normalized.endsWith(
      "/three/src/renderers/webgl/WebGLIndexedBufferRenderer.js",
    )
  ) {
    transformed = replaceOne(
      transformed,
      "\tfunction setIndex( value ) {\n\n\t\ttype = value.type;\n\t\tbytesPerElement = value.bytesPerElement;\n\n\t}",
      "\tfunction setIndex( value ) {\n\n\t\tsetIndexValues( value.type, value.bytesPerElement );\n\n\t}\n\n" +
        "\t/** @param {number} indexType @param {number} indexBytesPerElement */\n" +
        "\tfunction setIndexValues( indexType, indexBytesPerElement ) {\n\n\t\ttype = indexType;\n\t\tbytesPerElement = indexBytesPerElement;\n\n\t}",
      fileName,
      "WebGLIndexedBufferRenderer scalar index format",
    );
    transformed = replaceOne(
      transformed,
      "\tthis.setIndex = setIndex;",
      "\tthis.setIndex = setIndex;\n\tthis.setIndexValues = setIndexValues;",
      fileName,
      "WebGLIndexedBufferRenderer scalar index entry point",
    );
    transformed = replaceOne(
      transformed,
      "\tlet mode;",
      "\t/** @type {number} */\n\tlet mode = 0;",
      fileName,
      "WebGLIndexedBufferRenderer draw mode",
    );
    transformed = replaceOne(
      transformed,
      "\tlet type, bytesPerElement;",
      "\t/** @type {number} */\n\tlet type = 0;\n\t/** @type {number} */\n\tlet bytesPerElement = 0;",
      fileName,
      "WebGLIndexedBufferRenderer index representation",
    );
    for (const [name, parameters] of [
      ["setMode", "@param {number} value"],
      ["setIndex", "@param {{ type: number, bytesPerElement: number }} value"],
      ["render", "@param {number} start @param {number} count"],
      [
        "renderInstances",
        "@param {number} start @param {number} count @param {number} primcount",
      ],
      [
        "renderMultiDraw",
        "@param {Int32Array} starts @param {Int32Array} counts @param {number} drawCount",
      ],
    ]) {
      transformed = replaceOne(
        transformed,
        `\tfunction ${name}(`,
        `\t/** ${parameters} */\n\tfunction ${name}(`,
        fileName,
        `WebGLIndexedBufferRenderer.${name} inputs`,
      );
    }
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLShader.js")) {
    transformed = replaceOne(
      transformed,
      "function WebGLShader( gl, type, string ) {",
      "/** @param {number} type @param {string} string */\nfunction WebGLShader( gl, type, string ) {",
      fileName,
      "WebGLShader source parameters",
    );
  }
  if (normalized.endsWith("/three/src/cameras/CubeCamera.js")) {
    transformed = replaceOne(
      transformed,
      "const cameras = this.children.concat();",
      "const cameras = this.children.slice();",
      fileName,
      "CubeCamera child snapshot",
    );
  }
  if (normalized.endsWith("/three/src/renderers/WebGLCubeRenderTarget.js")) {
    transformed = replaceOne(
      transformed,
      "@type {DataArrayTexture}",
      "@type {CubeTexture}",
      fileName,
      "WebGLCubeRenderTarget cube texture field",
    );
    transformed = replaceOne(
      transformed,
      "\t\tconst images = [ image, image, image, image, image, image ];",
      `\t\tconst images = /** @type {Array<import('../textures/Texture.js').NativeTextureImage>} */ ( [ image, image, image, image, image, image ] );`,
      fileName,
      "WebGLCubeRenderTarget image array",
    );
    transformed = replaceOne(
      transformed,
      "\t\tthis.texture = new CubeTexture( images );\n\t\tthis._setTextureOptions( options );",
      "\t\tconst cubeTexture = new CubeTexture( images );\n\t\tthis.texture = cubeTexture;\n\t\tthis.textures[ 0 ] = cubeTexture;\n\t\tthis._setTextureOptions( options );",
      fileName,
      "WebGLCubeRenderTarget exact texture storage",
    );
    transformed = replaceOne(
      transformed,
      "\t\tthis.texture.isRenderTargetTexture = true;",
      "\t\tcubeTexture.isRenderTargetTexture = true;",
      fileName,
      "WebGLCubeRenderTarget exact texture flag",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tuniforms: {\n\t\t\t\ttEquirect: { value: null },\n\t\t\t},",
      "\t\t\tuniforms: /** @type {import('./shaders/UniformsLib.js').NativeUniforms} */ ( {\n\t\t\t\ttEquirect: { value: null },\n\t\t\t} ),",
      fileName,
      "WebGLCubeRenderTarget equirect uniform table",
    );

    transformed = replaceOne(
      transformed,
      "\t\tmesh.material.dispose();",
      "\t\tconst material = mesh.material;\n\n\t\tif ( ! ( material instanceof ShaderMaterial ) ) throw new Error( 'THREE.WebGLCubeRenderTarget: Invalid conversion material.' );\n\n\t\tmaterial.dispose();",
      fileName,
      "WebGLCubeRenderTarget material disposal",
    );
  }
  if (
    normalized.endsWith("/three/src/renderers/webgl/WebGLEnvironments.js") &&
    transformed.includes("let cubeMaps = new WeakMap")
  ) {
    transformed = replaceOne(
      transformed,
      "\tlet cubeMaps = new WeakMap();\n\tlet pmremMaps = new WeakMap();",
      "\t/** @type {Map<number, import('../WebGLCubeRenderTarget.js').WebGLCubeRenderTarget>} */\n" +
        "\tconst cubeMaps = new Map();\n" +
        "\t/** @type {Map<number, import('../WebGLRenderTarget.js').WebGLRenderTarget>} */\n" +
        "\tconst pmremMaps = new Map();",
      fileName,
      "WebGLEnvironments texture maps",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction get( texture, usePMREM = false ) {",
      "\t/** @return {import('../../textures/Texture.js').Texture|null} */\n\tfunction get( texture, usePMREM = false ) {",
      fileName,
      "WebGLEnvironments get result",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction getCube( texture ) {",
      "\t/** @return {import('../../textures/Texture.js').Texture|null} */\n\tfunction getCube( texture ) {",
      fileName,
      "WebGLEnvironments getCube result",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction getPMREM( texture ) {",
      "\t/** @return {import('../../textures/Texture.js').Texture|null} */\n\tfunction getPMREM( texture ) {",
      fileName,
      "WebGLEnvironments getPMREM result",
    );
    transformed = replaceOne(
      transformed,
      "\tfunction mapTextureMapping( texture, mapping ) {",
      `\t/** @param {import('../../textures/Texture.js').Texture} texture @return {number} */
\tfunction textureIdOf( texture ) {

\t\tconst id = texture.id;

\t\tif ( typeof id !== 'number' ) throw new Error( 'THREE.WebGLEnvironments: Texture ID must be numeric.' );

\t\treturn id;

\t}

\tfunction mapTextureMapping( texture, mapping ) {`,
      fileName,
      "WebGLEnvironments numeric texture key",
    );
    const eventTexture = "\t\tconst texture = event.target;";
    const eventTextureCount = transformed.split(eventTexture).length - 1;
    if (eventTextureCount !== 2)
      throw new Error(
        `Three WebGLEnvironments source at ${fileName} has ${eventTextureCount} dispose targets; expected 2`,
      );
    transformed = transformed.replaceAll(
      eventTexture,
      "\t\tconst texture = /** @type {import('../../textures/Texture.js').Texture} */ ( event.target );",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\t\t\trenderTarget = isEquirectMap ? pmremGenerator.fromEquirectangular( texture, renderTarget ) : pmremGenerator.fromCubemap( texture, renderTarget );
\t\t\t\t\trenderTarget.texture.pmremVersion = texture.pmremVersion;

\t\t\t\t\tpmremMaps.set( texture, renderTarget );

\t\t\t\t\treturn renderTarget.texture;`,
      `\t\t\t\t\tconst generatedRenderTarget = /** @type {import('../WebGLRenderTarget.js').WebGLRenderTarget} */ ( isEquirectMap ? pmremGenerator.fromEquirectangular( texture, renderTarget ) : pmremGenerator.fromCubemap( texture, renderTarget ) );
\t\t\t\t\tgeneratedRenderTarget.texture.pmremVersion = texture.pmremVersion;

\t\t\t\t\tpmremMaps.set( texture, generatedRenderTarget );

\t\t\t\t\treturn generatedRenderTarget.texture;`,
      fileName,
      "WebGLEnvironments refreshed PMREM target",
    );
    transformed = replaceOne(
      transformed,
      `\t\t\t\t\t\t\trenderTarget = isEquirectMap ? pmremGenerator.fromEquirectangular( texture ) : pmremGenerator.fromCubemap( texture );
\t\t\t\t\t\t\trenderTarget.texture.pmremVersion = texture.pmremVersion;

\t\t\t\t\t\t\tpmremMaps.set( texture, renderTarget );

\t\t\t\t\t\t\ttexture.addEventListener( 'dispose', onPMREMDispose );

\t\t\t\t\t\t\treturn renderTarget.texture;`,
      `\t\t\t\t\t\t\tconst generatedRenderTarget = /** @type {import('../WebGLRenderTarget.js').WebGLRenderTarget} */ ( isEquirectMap ? pmremGenerator.fromEquirectangular( texture ) : pmremGenerator.fromCubemap( texture ) );
\t\t\t\t\t\t\tgeneratedRenderTarget.texture.pmremVersion = texture.pmremVersion;

\t\t\t\t\t\t\tpmremMaps.set( texture, generatedRenderTarget );

\t\t\t\t\t\t\ttexture.addEventListener( 'dispose', onPMREMDispose );

\t\t\t\t\t\t\treturn generatedRenderTarget.texture;`,
      fileName,
      "WebGLEnvironments generated PMREM target",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\tconst image = texture.image;\n\n\t\t\t\t\tif ( image && image.height > 0 ) {\n\n\t\t\t\t\t\tconst renderTarget = new WebGLCubeRenderTarget( image.height );",
      "\t\t\t\t\tconst image = texture.image;\n\t\t\t\t\tlet imageHeight = 0;\n\n\t\t\t\t\tif ( image !== null && ! Array.isArray( image ) ) {\n\n\t\t\t\t\t\tconst imageRecord = /** @type {{ height?: number }} */ ( image );\n\t\t\t\t\t\tif ( typeof imageRecord.height === 'number' ) imageHeight = imageRecord.height;\n\n\t\t\t\t\t}\n\n\t\t\t\t\tif ( imageHeight > 0 ) {\n\n\t\t\t\t\t\tconst renderTarget = new WebGLCubeRenderTarget( imageHeight );",
      fileName,
      "WebGLEnvironments cube image height",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\t\tconst image = texture.image;\n\n\t\t\t\t\t\tif ( ( isEquirectMap && image && image.height > 0 ) ||",
      `\t\t\t\t\t\tconst image = texture.image;
\t\t\t\t\t\tlet imageHeight = 0;

\t\t\t\t\t\tif ( image !== null && ! Array.isArray( image ) ) {

\t\t\t\t\t\t\tconst imageRecord = /** @type {{ height?: number }} */ ( image );
\t\t\t\t\t\t\tif ( typeof imageRecord.height === 'number' ) imageHeight = imageRecord.height;

\t\t\t\t\t\t}

\t\t\t\t\t\tlet cubeTextureComplete = false;

\t\t\t\t\t\tif ( Array.isArray( image ) ) cubeTextureComplete = isCubeTextureComplete( image );

\t\t\t\t\t\tif ( ( isEquirectMap && imageHeight > 0 ) ||`,
      fileName,
      "WebGLEnvironments PMREM image height",
    );
    transformed = replaceOne(
      transformed,
      "( isCubeMap && image && isCubeTextureComplete( image ) )",
      "( isCubeMap && cubeTextureComplete )",
      fileName,
      "WebGLEnvironments cube image narrowing",
    );
    // The only caller passes an image already proven an array by the
    // `Array.isArray( image )` guard above, so the parameter states the
    // texture's own image element instead of an element nothing narrows.
    transformed = replaceOne(
      transformed,
      "\tfunction isCubeTextureComplete( image ) {",
      "\t/** @param {Array<import('../../textures/Texture.js').NativeTextureImage>} image */\n\tfunction isCubeTextureComplete( image ) {",
      fileName,
      "WebGLEnvironments cube image input",
    );
    for (const name of ["cubeMaps", "pmremMaps"]) {
      transformed = transformed
        .replaceAll(
          `${name}.has( texture )`,
          `${name}.has( textureIdOf( texture ) )`,
        )
        .replaceAll(
          `${name}.get( texture )`,
          `${name}.get( textureIdOf( texture ) )`,
        )
        .replaceAll(
          `${name}.set( texture,`,
          `${name}.set( textureIdOf( texture ),`,
        )
        .replaceAll(
          `${name}.delete( texture )`,
          `${name}.delete( textureIdOf( texture ) )`,
        );
    }
    transformed = replaceOne(
      transformed,
      "\t\tcubeMaps = new WeakMap();\n\t\tpmremMaps = new WeakMap();",
      "\t\tcubeMaps.clear();\n\t\tpmremMaps.clear();",
      fileName,
      "WebGLEnvironments map reset",
    );
  }
  if (normalized.endsWith("/three/src/renderers/webgl/WebGLOutput.js")) {
    transformed = transformed.replaceAll(
      "renderer.outputColorSpace",
      "renderer.getOutputColorSpace()",
    );
    transformed = replaceOne(
      transformed,
      "function WebGLOutput( type, width, height, antialias, depth, stencil ) {",
      `function WebGLOutput( type, width, height, antialias, depth, stencil ) {

	/** @return {number} */
	function requireToneMapping( value ) {

		if ( typeof value === 'number' ) return value;

		throw new Error( 'THREE.WebGLOutput: Tone mapping must be numeric.' );

	}`,
      fileName,
      "WebGLOutput tone-mapping guard",
    );
    transformed = replaceOne(
      transformed,
      "\tthis.end = function ( renderer, deltaTime ) {",
      "\tthis.end = /** @param {InstanceType<typeof import('../WebGLRenderer.js').WebGLRenderer>} renderer @param {number} deltaTime */ function ( renderer, deltaTime ) {",
      fileName,
      "WebGLOutput end inputs",
    );
    transformed = replaceOne(
      transformed,
      "\t\tuniforms: {\n\t\t\ttDiffuse: { value: null }\n\t\t},",
      "\t\tuniforms: /** @type {import('../shaders/UniformsLib.js').NativeUniforms} */ ( {\n\t\t\ttDiffuse: { value: null }\n\t\t} ),",
      fileName,
      "WebGLOutput uniform table",
    );
    transformed = replaceOne(
      transformed,
      "\t\tconst toneMapping = toneMappingMap[ _outputToneMapping ];",
      "\t\tconst toneMapping = toneMappingMap[ requireToneMapping( renderer.toneMapping ) ];",
      fileName,
      "WebGLOutput tone-mapping key",
    );
  }
  if (normalized.endsWith("/three/src/extras/PMREMGenerator.js")) {
    const uniformLiteralStarts =
      transformed.split("\t\tuniforms: {").length - 1;
    const uniformLiteralEnds =
      transformed.split("\t\t},\n\n\t\tvertexShader:").length - 1;
    if (uniformLiteralStarts !== 4 || uniformLiteralEnds !== 4) {
      throw new Error(
        `Three PMREMGenerator source at ${fileName} has ${uniformLiteralStarts} ShaderMaterial uniform starts and ${uniformLiteralEnds} closes; expected 4 of each`,
      );
    }
    transformed = transformed
      .replaceAll(
        "\t\tuniforms: {",
        "\t\tuniforms: /** @type {import('../renderers/shaders/UniformsLib.js').NativeUniforms} */ ( {",
      )
      .replaceAll(
        "\t\t},\n\n\t\tvertexShader:",
        "\t\t} ),\n\n\t\tvertexShader:",
      );
    transformed = replaceOne(
      transformed,
      "\t\tthis._renderer = renderer;\n\t\tthis._pingPongRenderTarget = null;",
      "\t\tthis._renderer = renderer;\n\t\t/** @type {WebGLRenderTarget|null} */\n\t\tthis._pingPongRenderTarget = null;",
      fileName,
      "PMREM ping-pong render target storage",
    );
    transformed = replaceOne(
      transformed,
      "class PMREMGenerator {",
      `/** @param {import('../textures/Texture.js').Texture['image']} image @return {number} */
function requirePMREMEquirectangularImageWidth( image ) {

	if ( Array.isArray( image ) ) {

		throw new Error( 'THREE.PMREMGenerator: Equirectangular texture image requires a numeric width.' );

	}

	if ( image !== null ) {

		const imageWidth = image.width;

		if ( typeof imageWidth === 'number' ) return imageWidth;

	}

	throw new Error( 'THREE.PMREMGenerator: Equirectangular texture image requires a numeric width.' );

}

class PMREMGenerator {`,
      fileName,
      "PMREM equirectangular image width helper",
    );
    transformed = replaceOne(
      transformed,
      "\t\tthis._sizeLods = [];\n\t\tthis._sigmas = [];\n\t\tthis._lodMeshes = [];",
      "\t\t/** @type {number[]} */\n\t\tthis._sizeLods = [];\n\t\t/** @type {number[]} */\n\t\tthis._sigmas = [];\n\t\t/** @type {Mesh[]} */\n\t\tthis._lodMeshes = [];",
      fileName,
      "WebGL PMREM typed LOD storage",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tthis._backgroundBox.material.dispose();",
      "\t\t\tif ( ! ( this._backgroundBox.material instanceof MeshBasicMaterial ) ) throw new Error( 'THREE.PMREMGenerator: Invalid background material.' );\n\n\t\t\tthis._backgroundBox.material.dispose();",
      fileName,
      "WebGL PMREM background material disposal",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tthis._setSize( texture.image.length === 0 ? 16 : ( texture.image[ 0 ].width || texture.image[ 0 ].image.width ) );",
      `\t\t\tconst cubeImages = texture.image;

\t\t\tif ( ! Array.isArray( cubeImages ) ) throw new Error( 'THREE.PMREMGenerator: Cubemap texture requires image records.' );

\t\t\tlet imageWidth = 16;

\t\t\tif ( cubeImages.length > 0 ) {

\t\t\t\tconst firstImage = cubeImages[ 0 ];
\t\t\t\tconst firstImageWidth = firstImage.width;
\t\t\t\tif ( typeof firstImageWidth === 'number' ) imageWidth = firstImageWidth;

\t\t\t}

\t\t\tthis._setSize( imageWidth );`,
      fileName,
      "WebGL PMREM cube image width",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tthis._setSize( texture.image.width / 4 );",
      "\t\t\tconst imageWidth = requirePMREMEquirectangularImageWidth( texture.image );\n\t\t\tthis._setSize( imageWidth / 4 );",
      fileName,
      "WebGL PMREM equirectangular image width",
    );
  }
  if (normalized.endsWith("/three/src/renderers/webxr/WebXRDepthSensing.js")) {
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\tuniforms: {\n\t\t\t\t\t\tdepthColor:",
      "\t\t\t\t\tuniforms: /** @type {import('../shaders/UniformsLib.js').NativeUniforms} */ ( {\n\t\t\t\t\t\tdepthColor:",
      fileName,
      "WebXRDepthSensing dictionary uniforms allocation",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\t\tdepthHeight: { value: viewport.w }\n\t\t\t\t\t}",
      "\t\t\t\t\t\tdepthHeight: { value: viewport.w }\n\t\t\t\t\t} )",
      fileName,
      "WebXRDepthSensing dictionary uniforms close",
    );
  }
  if (
    normalized.endsWith("/three/src/renderers/common/extras/PMREMGenerator.js")
  ) {
    transformed = replaceOne(
      transformed,
      "\t\tthis._sizeLods = [];\n\t\tthis._sigmas = [];\n\t\tthis._lodMeshes = [];",
      "\t\t/** @type {number[]} */\n\t\tthis._sizeLods = [];\n\t\t/** @type {number[]} */\n\t\tthis._sigmas = [];\n\t\t/** @type {Mesh[]} */\n\t\tthis._lodMeshes = [];",
      fileName,
      "PMREM typed LOD storage",
    );
    transformed = replaceOne(
      transformed,
      "\t\t\tthis._setSize( texture.image.width / 4 );",
      "\t\t\tconst image = texture.image;\n\t\t\tconst imageWidth = image !== null && ! Array.isArray( image ) && typeof image.width === 'number' ? image.width : 64;\n\t\t\tthis._setSize( imageWidth / 4 );",
      fileName,
      "PMREM equirectangular image width",
    );
  }
  if (
    normalized.endsWith("/three/src/core/BufferAttribute.js") ||
    normalized.endsWith("/three/src/core/InterleavedBuffer.js") ||
    normalized.endsWith("/three/src/core/InterleavedBufferAttribute.js")
  ) {
    transformed = transformed
      .replaceAll(
        "@param {TypedArray} array",
        `@param {${nativeTypedArrayType}} array`,
      )
      .replaceAll("@type {TypedArray}", `@type {${nativeTypedArrayType}}`)
      .replace(
        "\t\t * @type {Array<Object>}\n\t\t */\n\t\tthis.updateRanges = [];",
        "\t\t * @type {Array<{ start: number, count: number }>}\n\t\t */\n\t\tthis.updateRanges = [];",
      );
    const numericSetParameter = "|Array)} value - The array data to set.";
    if (transformed.includes(numericSetParameter)) {
      transformed = transformed.replace(
        numericSetParameter,
        "|Array<number>)} value - The array data to set.",
      );
    }
    if (
      transformed.includes(
        "this.array = new source.array.constructor( source.array );",
      )
    ) {
      transformed = transformed.replace(
        "this.array = new source.array.constructor( source.array );",
        "this.array = source.array.slice();",
      );
    }
  }
  if (normalized.endsWith("/three/src/core/BufferAttribute.js")) {
    const rawCopyArrayParameter =
      "@param {(TypedArray|Array)} array - The array to copy.";
    const realizedCopyArrayParameter =
      "@param {((Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array)|Array)} array - The array to copy.";
    const numericCopyArrayParameter = `@param {(${nativeTypedArrayType}|Array<number>)} array - The array to copy.`;
    const numericRealizedCopyArrayParameter =
      realizedCopyArrayParameter.replace("|Array)}", "|Array<number>)}");
    const sourceCopyArrayParameter = transformed.includes(rawCopyArrayParameter)
      ? rawCopyArrayParameter
      : transformed.includes(realizedCopyArrayParameter)
        ? realizedCopyArrayParameter
        : null;
    if (sourceCopyArrayParameter !== null) {
      transformed = replaceOne(
        transformed,
        sourceCopyArrayParameter,
        sourceCopyArrayParameter === rawCopyArrayParameter
          ? numericCopyArrayParameter
          : numericRealizedCopyArrayParameter,
        fileName,
        "BufferAttribute copyArray numeric input",
      );
    } else if (
      !transformed.includes(numericCopyArrayParameter) &&
      !transformed.includes(numericRealizedCopyArrayParameter)
    ) {
      throw new Error(
        `Three BufferAttribute copyArray numeric input source at ${fileName} no longer matches the native adaptation`,
      );
    }
    const rawCopyArraySet = "\t\tthis.array.set( array );";
    const arrayFromCopyArraySet = "\t\tthis.array.set( Array.from( array ) );";
    const concreteCopyArraySet =
      "\t\t/** @type {number[]} */\n" +
      "\t\tconst copyArrayValues = [];\n\n" +
      "\t\tfor ( let i = 0; i < array.length; i ++ ) copyArrayValues.push( array[ i ] );\n\n" +
      "\t\tthis.array.set( copyArrayValues );";
    const sourceCopyArraySet = transformed.includes(rawCopyArraySet)
      ? rawCopyArraySet
      : transformed.includes(arrayFromCopyArraySet)
        ? arrayFromCopyArraySet
        : null;
    if (sourceCopyArraySet !== null) {
      transformed = replaceOne(
        transformed,
        sourceCopyArraySet,
        concreteCopyArraySet,
        fileName,
        "BufferAttribute copyArray concrete numeric array",
      );
    } else if (!transformed.includes(concreteCopyArraySet)) {
      throw new Error(
        `Three BufferAttribute copyArray concrete numeric array source at ${fileName} no longer matches the native adaptation`,
      );
    }
    transformed = replaceOne(
      transformed,
      "@return {BufferAttribute} A clone of this instance.\n\t */\n\tclone()",
      "@return {this} A clone of this instance.\n\t */\n\tclone()",
      fileName,
      "BufferAttribute subtype-preserving clone result",
    );
  }
  if (normalized.endsWith("/three/src/animation/AnimationUtils.js")) {
    transformed = `${nativeTypedArrayFactory("createAnimationTypedArray", "number")}\n\n${transformed}`;
    transformed = replaceOne(
      transformed,
      " * @param {Array<number>} values - The values to sort.\n * @param {number} stride - The stride.\n * @param {Array<number>} order - The sort order.\n * @return {Array<number>} The sorted values.",
      ` * @param {Array<number>|${nativeTypedArrayType}} values - The values to sort.\n * @param {number} stride - The stride.\n * @param {Array<number>} order - The sort order.\n * @return {Array<number>|${nativeTypedArrayType}} The sorted values.`,
      fileName,
      "AnimationUtils sorted array type",
    );
    transformed = replaceOne(
      transformed,
      "\tconst result = new values.constructor( nValues );",
      "\tconst result = Array.isArray( values ) ? new Array( nValues ) : createAnimationTypedArray( values, nValues );",
      fileName,
      "AnimationUtils sorted array allocation",
    );
  }
  if (isThreeSource && transformed.includes(".prototype.is")) {
    const markerBlock =
      /\tstatic \{\n\n(\t\t\/\*\*[\s\S]*?\t\t \*\/)\n\t\t([A-Za-z_$][A-Za-z0-9_$]*)\.prototype\.(is[A-Za-z_$][A-Za-z0-9_$]*) = true;\n\n\t\}/g;
    let markers = 0;
    transformed = transformed.replace(
      markerBlock,
      (_whole, comment, className, fieldName) => {
        markers += 1;
        const fileClass = normalized.slice(normalized.lastIndexOf("/") + 1, -3);
        if (className !== fileClass) {
          throw new Error(
            `Three prototype marker in ${fileName} names ${className}; expected ${fileClass}`,
          );
        }
        return `${comment.replaceAll("\t\t", "\t")}\n\t${fieldName} = true;`;
      },
    );
    if (markers !== 1)
      throw new Error(
        `Three prototype marker source at ${fileName} has ${markers} marker blocks; expected 1`,
      );
  }
  if (normalized.endsWith("/three/src/textures/Texture.js")) {
    transformed = replaceOne(
      transformed,
      "@return {Texture} A clone of this instance.\n\t */\n\tclone()",
      "@return {this} A clone of this instance.\n\t */\n\tclone()",
      fileName,
      "Texture subtype-preserving clone result",
    );
    transformed = replaceOne(
      transformed,
      "@type {?(RenderTarget|WebGLRenderTarget)}",
      "@type {import('../core/RenderTarget.js').RenderTarget|null}",
      fileName,
      "Texture render-target back reference",
    );
    transformed = replaceOne(
      transformed,
      "class Texture extends EventDispatcher {",
      `/** @typedef {Int8Array|Uint8Array|Uint8ClampedArray|Int16Array|Uint16Array|Int32Array|Uint32Array|Float32Array|Float64Array} NativeTextureData */
/** @typedef {{ data?: NativeTextureData, width?: number, height?: number, depth?: number }} NativeTextureImage */
/** @typedef {NativeTextureImage|NativeTextureImage[]|null} NativeTextureSourceData */
/**
 * The shapes \`WebGLTextures.js\` (\`uploadTexture\`/\`uploadCubeTexture\`) actually
 * reads off a \`mipmaps\` element: \`width\`/\`height\`/\`data\` for every compressed
 * or manually-supplied data-texture level (\`CompressedTexture\` restates the
 * same field with the same shape -- see its own respell), and, only for a
 * plain (non-compressed) CUBE texture's manually-supplied mips, a per-face
 * \`image\` array whose entries carry a further nested \`image\` record
 * (\`mipmap.image[i].image\`). A canvas/bitmap-sourced plain-texture mip is read
 * with no property access at all (passed straight through to \`texSubImage2D\`),
 * so it needs no member here.
 * @typedef {{ width?: number, height?: number, data?: NativeTextureData, image?: Array<{ data?: NativeTextureData, width?: number, height?: number, depth?: number, image?: NativeTextureImage }> }} NativeTextureMipmap
 */
class Texture extends EventDispatcher {`,
      fileName,
      "Texture native image types",
    );
    transformed = replaceOne(
      transformed,
      "\t\t * An array holding user-defined mipmaps.\n\t\t *\n\t\t * @type {Array<Object>}\n\t\t */\n\t\tthis.mipmaps = [];",
      "\t\t * An array holding user-defined mipmaps.\n\t\t *\n\t\t * @type {Array<NativeTextureMipmap>}\n\t\t */\n\t\tthis.mipmaps = [];",
      fileName,
      "Texture native mipmap levels",
    );
    transformed = replaceOne(
      transformed,
      "@param {?Object} [image=Texture.DEFAULT_IMAGE] - The image holding the texture data.",
      "@param {NativeTextureSourceData} [image=Texture.DEFAULT_IMAGE] - The image holding the texture data.",
      fileName,
      "Texture native image input",
    );
    transformed = replaceOne(
      transformed,
      "\t * @type {?Object}\n\t */\n\tget image()",
      "\t * @type {NativeTextureSourceData}\n\t */\n\tget image()",
      fileName,
      "Texture native image accessor",
    );
    transformed = replaceOne(
      transformed,
      "\tset image( value ) {",
      "\t/** @param {NativeTextureSourceData} value */\n\tset image( value ) {",
      fileName,
      "Texture native image setter",
    );
    transformed = replaceOne(
      transformed,
      " * @type {?Image}\n * @default null\n */\nTexture.DEFAULT_IMAGE = null;",
      " * @type {NativeTextureSourceData}\n * @default null\n */\nTexture.DEFAULT_IMAGE = null;",
      fileName,
      "Texture default native image",
    );
    transformed = replaceOne(
      transformed,
      "\t\tthis.isArrayTexture = image && image.depth && image.depth > 1 ? true : false;",
      "\t\tthis.isArrayTexture = image !== null && ! Array.isArray( image ) && typeof image.depth === 'number' && image.depth > 1;",
      fileName,
      "Texture numeric image depth",
    );
    transformed = replaceOne(
      transformed,
      "\t\t * @type {Array<Object>}\n\t\t */\n\t\tthis.updateRanges = [];",
      "\t\t * @type {Array<{ start: number, count: number }>}\n\t\t */\n\t\tthis.updateRanges = [];",
      fileName,
      "Texture update ranges",
    );
  }
  if (normalized.endsWith("/three/src/textures/CompressedTexture.js")) {
    // Same per-level shape as the base `Texture.mipmaps` respell (`Texture.js`'s
    // `NativeTextureMipmap`) -- a `CompressedTexture` always populates it with
    // `{ width, height, data }` objects, never the cube-face `image` array
    // variant, but the wider typedef is imported rather than restated so the
    // two fields cannot drift.
    transformed = replaceOne(
      transformed,
      "\t * @param {Array<Object>} mipmaps - This array holds for all mipmaps (including the bases mip)",
      "\t * @param {Array<import('./Texture.js').NativeTextureMipmap>} mipmaps - This array holds for all mipmaps (including the bases mip)",
      fileName,
      "CompressedTexture native mipmap parameter",
    );
    transformed = replaceOne(
      transformed,
      "\t\t * This array holds for all mipmaps (including the bases mip) the data and dimensions.\n\t\t *\n\t\t * @type {Array<Object>}\n\t\t */\n\t\tthis.mipmaps = mipmaps;",
      "\t\t * This array holds for all mipmaps (including the bases mip) the data and dimensions.\n\t\t *\n\t\t * @type {Array<import('./Texture.js').NativeTextureMipmap>}\n\t\t */\n\t\tthis.mipmaps = mipmaps;",
      fileName,
      "CompressedTexture native mipmap levels",
    );
  }
  if (normalized.endsWith("/three/src/textures/CompressedArrayTexture.js")) {
    transformed = replaceOne(
      transformed,
      "\t * @param {Array<Object>} mipmaps - This array holds for all mipmaps (including the bases mip)",
      "\t * @param {Array<import('./Texture.js').NativeTextureMipmap>} mipmaps - This array holds for all mipmaps (including the bases mip)",
      fileName,
      "CompressedArrayTexture native mipmap parameter",
    );
  }
  if (normalized.endsWith("/three/src/objects/Mesh.js")) {
    transformed = replaceOne(
      transformed,
      meshMaterialParameterSource,
      nativeMeshMaterialParameterSource,
      fileName,
      "nullable Mesh material",
    );
  }
  if (
    normalized.endsWith("/three/src/objects/Mesh.js") ||
    normalized.endsWith("/three/src/objects/Line.js") ||
    normalized.endsWith("/three/src/objects/Points.js")
  ) {
    transformed = replaceOne(
      transformed,
      "this.material = Array.isArray( source.material ) ? source.material.slice() : source.material;",
      `const sourceMaterial = source.material;

		if ( Array.isArray( sourceMaterial ) ) {

			const sourceMaterials = /** @type {Array<import('../materials/Material.js').Material>} */ ( sourceMaterial );
			this.material = sourceMaterials.slice();

		} else {

			this.material = sourceMaterial;

		}`,
      fileName,
      "object material array copy",
    );
  }
  if (normalized.endsWith("/three/src/math/Plane.js")) {
    transformed = replaceOne(
      transformed,
      "@param {Matrix4} [optionalNormalMatrix] - A pre-computed normal matrix.",
      "@param {import('./Matrix3.js').Matrix3} [optionalNormalMatrix] - A pre-computed normal matrix.",
      fileName,
      "Plane normal-matrix input",
    );
  }
  if (normalized.endsWith("/three/src/math/Matrix4.js")) {
    transformed = replaceOne(
      transformed,
      "@param {Array<number>} array - The matrix elements in column-major order.",
      `@param {Array<number>|${nativeTypedArrayType}} array - The matrix elements in column-major order.`,
      fileName,
      "Matrix4.fromArray native array input",
    );
    transformed = replaceOne(
      transformed,
      "@param {Array<number>} [array=[]] - The target array holding the matrix elements in column-major order.\n\t * @param {number} [offset=0] - Index of the first element in the array.\n\t * @return {Array<number>} The matrix elements in column-major order.",
      `@param {Array<number>|${nativeTypedArrayType}} [array=[]] - The target array holding the matrix elements in column-major order.\n\t * @param {number} [offset=0] - Index of the first element in the array.\n\t * @return {Array<number>|${nativeTypedArrayType}} The matrix elements in column-major order.`,
      fileName,
      "Matrix4.toArray native array output",
    );
    transformed = replaceOne(
      transformed,
      "\ttoArray( array = [], offset = 0 ) {",
      "\ttoArray( array = /** @type {number[]} */ ( [] ), offset = 0 ) {",
      fileName,
      "Matrix4.toArray default array",
    );
  }
  if (
    normalized.endsWith("/three/src/math/Color.js") ||
    normalized.endsWith("/three/src/math/Vector4.js")
  ) {
    const color = normalized.endsWith("/Color.js");
    const inputDescription = color ? "RGB values" : "vector component values";
    const outputDescription = color ? "color components" : "vector components";
    transformed = replaceOne(
      transformed,
      `@param {Array<number>} array - An array holding the ${inputDescription}.`,
      `@param {Array<number>|${nativeTypedArrayType}} array - An array holding the ${inputDescription}.`,
      fileName,
      "math component native array input",
    );
    transformed = replaceOne(
      transformed,
      `@param {Array<number>} [array=[]] - The target array holding the ${outputDescription}.`,
      `@param {Array<number>|${nativeTypedArrayType}} [array=[]] - The target array holding the ${outputDescription}.`,
      fileName,
      "math component native array output",
    );
    transformed = replaceOne(
      transformed,
      `@return {Array<number>} The ${outputDescription}.`,
      `@return {Array<number>|${nativeTypedArrayType}} The ${outputDescription}.`,
      fileName,
      "math component native output identity",
    );
    transformed = replaceOne(
      transformed,
      "\ttoArray( array = [], offset = 0 ) {",
      "\ttoArray( array = /** @type {number[]} */ ( [] ), offset = 0 ) {",
      fileName,
      "math component default array",
    );
  }
  if (normalized.endsWith("/three/src/textures/DataTexture.js")) {
    transformed = replaceOne(
      transformed,
      "\t\tthis.image = { data: data, width: width, height: height };",
      `\t\tconst image = /** @type {import('./Texture.js').Texture['image']} */ ( { data: data, width: width, height: height } );
\t\tthis.source.data = image;`,
      fileName,
      "DataTexture exact native source image",
    );
    if (!transformed.includes(dataTextureUnpackAlignmentSource)) {
      throw new Error(
        `Three DataTexture source at ${fileName} no longer contains the expected unpackAlignment annotation`,
      );
    }
    transformed = transformed.replace(
      dataTextureUnpackAlignmentSource,
      nativeDataTextureUnpackAlignmentSource,
    );
    if (!transformed.includes(dataTextureOverlayUnpackAlignmentSource)) {
      throw new Error(
        `Three DataTexture source at ${fileName} no longer contains the expected overlaid unpackAlignment field`,
      );
    }
    transformed = transformed.replace(
      dataTextureOverlayUnpackAlignmentSource,
      nativeDataTextureOverlayUnpackAlignmentSource,
    );
  }
  if (
    normalized.endsWith("/three/src/textures/Data3DTexture.js") ||
    normalized.endsWith("/three/src/textures/DataArrayTexture.js")
  ) {
    transformed = replaceOne(
      transformed,
      "\t\tthis.image = { data, width, height, depth };",
      `\t\tconst image = /** @type {import('./Texture.js').Texture['image']} */ ( { data, width, height, depth } );
\t\tthis.source.data = image;`,
      fileName,
      "native volume texture source image",
    );
  }
  if (normalized.endsWith("/three/src/textures/ExternalTexture.js")) {
    transformed = replaceOne(
      transformed,
      "\tcopy( source ) {",
      "\t/** @param {ExternalTexture} source */\n\tcopy( source ) {",
      fileName,
      "ExternalTexture.copy source",
    );
  }
  if (normalized.endsWith("/three/src/textures/DepthTexture.js")) {
    transformed = replaceOne(
      transformed,
      "@type {?(NeverCompare|LessCompare|EqualCompare|LessEqualCompare|GreaterCompare|NotEqualCompare|GreaterEqualCompare|AlwaysCompare)}",
      "@type {number|null}",
      fileName,
      "DepthTexture numeric compare function",
    );
    transformed = replaceOne(
      transformed,
      "\t\tconst image = { width: width, height: height, depth: depth };",
      "\t\tconst image = /** @type {import('./Texture.js').Texture['image']} */ ( { width: width, height: height, depth: depth } );",
      fileName,
      "DepthTexture image record",
    );
    transformed = replaceOne(
      transformed,
      "\tcopy( source ) {\n\n\t\tsuper.copy( source );",
      `\tcopy( source ) {

\t\tif ( source instanceof DepthTexture ) {

\t\t\tsuper.copy( source );`,
      fileName,
      "DepthTexture copy source narrowing",
    );
    transformed = replaceOne(
      transformed,
      "\t\tthis.source = new Source( Object.assign( {}, source.image ) ); // see #30540",
      `\t\t\tconst sourceImage = source.image;

\t\t\tif ( sourceImage === null || Array.isArray( sourceImage ) ) throw new Error( 'THREE.DepthTexture.copy: source image must be a record.' );

\t\t\tif ( typeof sourceImage.width !== 'number' || typeof sourceImage.height !== 'number' || typeof sourceImage.depth !== 'number' ) throw new Error( 'THREE.DepthTexture.copy: source image must have numeric dimensions.' );

\t\t\tconst image = /** @type {import('./Texture.js').Texture['image']} */ ( { width: sourceImage.width, height: sourceImage.height, depth: sourceImage.depth } );
\t\t\tthis.source = new Source( image ); // see #30540
\t\t\tthis.compareFunction = source.compareFunction;

\t\t\treturn this;

\t\t}

\t\tthrow new Error( 'THREE.DepthTexture.copy: source must be a DepthTexture.' );`,
      fileName,
      "DepthTexture image copy",
    );
    transformed = replaceOne(
      transformed,
      "\t\tthis.compareFunction = source.compareFunction;\n\n\t\treturn this;",
      "",
      fileName,
      "DepthTexture copied fields handled in narrowed branch",
    );
  }
  if (normalized.endsWith("/three/src/textures/CubeTexture.js")) {
    transformed = replaceOne(
      transformed,
      "@param {Array<Image>} [images=[]] - An array holding a image for each side of a cube.",
      `@param {Array<import('./Texture.js').NativeTextureImage>} [images=[]] - An array holding an image for each side of a cube.`,
      fileName,
      "CubeTexture native image input",
    );
    transformed = replaceOne(
      transformed,
      "\tconstructor( images = [], mapping = CubeReflectionMapping,",
      `\tconstructor( images = /** @type {Array<import('./Texture.js').NativeTextureImage>} */ ( [] ), mapping = CubeReflectionMapping,`,
      fileName,
      "CubeTexture native image default",
    );
    transformed = replaceOne(
      transformed,
      "\t * @type {Array<Image>}\n\t */\n\tget images()",
      `\t * @type {Array<{ data?: ${nativeTypedArrayType}, width?: number, height?: number, depth?: number }>}\n\t */\n\tget images()`,
      fileName,
      "CubeTexture native image alias",
    );
    transformed = replaceOne(
      transformed,
      "\t\treturn this.image;",
      `\t\tconst images = this.image;

\t\tif ( images === null || ! Array.isArray( images ) ) throw new Error( 'THREE.CubeTexture: image must be an array.' );

\t\treturn images;`,
      fileName,
      "CubeTexture image array invariant",
    );
    transformed = replaceOne(
      transformed,
      "\tset images( value ) {",
      `\t/** @param {Array<{ data?: ${nativeTypedArrayType}, width?: number, height?: number, depth?: number }>} value */
\tset images( value ) {`,
      fileName,
      "CubeTexture image array setter",
    );
  }
  if (normalized.endsWith("/three/src/math/Color.js")) {
    transformed = replaceOne(
      transformed,
      "\t\treturn this.set( r, g, b );",
      "\t\tthis.set( r, g, b );\n\t\treturn;",
      fileName,
      "Color constructor preserves the constructed receiver",
    );
  }
  if (normalized.endsWith("/three/src/textures/Source.js")) {
    transformed = replaceOne(
      transformed,
      "class Source {",
      `/** @typedef {Int8Array|Uint8Array|Uint8ClampedArray|Int16Array|Uint16Array|Int32Array|Uint32Array|Float32Array|Float64Array} NativeTextureData */
/** @typedef {{ data?: NativeTextureData, width?: number, height?: number, depth?: number }} NativeTextureImage */
/** @typedef {NativeTextureImage|NativeTextureImage[]|null} NativeTextureSourceData */
class Source {

\t/** @type {NativeTextureSourceData} */
\tdata = null;`,
      fileName,
      "Source native image types",
    );
    transformed = transformed.replace(
      "@param {any} [data=null] - The data definition of a texture.",
      "@param {NativeTextureSourceData} data - The data definition of a texture.",
    );
    transformed = transformed.replace(
      "\t\t * @type {any}\n\t\t */\n\t\tthis.data = data;",
      "\t\t * @type {NativeTextureSourceData}\n\t\t */\n\t\tthis.data = data;",
    );
    transformed = replaceOne(
      transformed,
      "\tconstructor( data = null ) {",
      "\t/** @param {NativeTextureSourceData} data */\n\tconstructor( data ) {",
      fileName,
      "Source required native data signature",
    );
    const getSizeStart = "\tgetSize( target ) {";
    const getSizeEnd = "\n\t}\n\n\t/**\n\t * When the property is set";
    const getSizeStartIndex = transformed.indexOf(getSizeStart);
    const getSizeEndIndex = transformed.indexOf(getSizeEnd, getSizeStartIndex);
    if (getSizeStartIndex < 0 || getSizeEndIndex < 0)
      throw new Error(
        `Three Source.getSize source at ${fileName} no longer matches the native adaptation`,
      );
    transformed =
      transformed.slice(0, getSizeStartIndex) +
      "\tgetSize( target ) {\n\n\t\tconst data = this.data;\n\n\t\tif ( data === null || Array.isArray( data ) ) target.set( 0, 0, 0 );\n\t\telse target.set( data.width || 0, data.height || 0, data.depth || 0 );\n\n\t\treturn target;" +
      transformed.slice(getSizeEndIndex);
    transformed = replaceOne(
      transformed,
      "\t\t\t\t\tif ( data[ i ].isDataTexture ) {\n\n\t\t\t\t\t\turl.push( serializeImage( data[ i ].image ) );\n\n\t\t\t\t\t} else {\n\n\t\t\t\t\t\turl.push( serializeImage( data[ i ] ) );\n\n\t\t\t\t\t}",
      "\t\t\t\t\turl.push( serializeImage( data[ i ] ) );",
      fileName,
      "Source native cube image serialization",
    );
    transformed = replaceOne(
      transformed,
      "function serializeImage( image ) {",
      "/** @param {NativeTextureImage} image */\nfunction serializeImage( image ) {",
      fileName,
      "Source image serialization input",
    );
  }
  // An unannotated override receives a precise declaration-overlay parameter,
  // while Object3D's source explicitly accepts either the metadata object or
  // the string supplied by JSON.stringify. Preserve that real source contract
  // on every overlaid `toJSON` override so subclasses remain substitutable.
  transformed = transformed.replace(
    overlayToJSONParameterSource,
    "$1{?(Object|string)}$2",
  );
  // Three's implementation JavaScript carries the JSDoc types geatsc needs,
  // but the upstream package is not authored as a strict `checkJs` project.
  // Keep checkJs enabled so those annotations continue to define the program,
  // while suppressing diagnostics for the vendor bodies themselves. Consumer
  // TypeScript remains fully checked and still exposes any incompatible public
  // shape inferred from these sources.
  if (process.env.GEA_WEBGL_AUTO_INSTANCE === "1")
    transformed = transformCanonicalInstanceHooks(transformed, normalized);
  if (
    normalized.endsWith("/three/src/renderers/WebGLRenderer.js") &&
    process.env.GEA_WEBGL_AUTO_INSTANCE === "1"
  ) {
    transformed = transformAutomaticInstancing(
      transformed,
      fileName,
      replaceOne,
      nativeRenderItemType("../"),
    );
  }

  if (transformed !== text) transformed = foldAdjacentJSDocBlocks(transformed);

  if (isThreeSource && !transformed.startsWith("// @ts-nocheck\n"))
    transformed = `// @ts-nocheck\n${transformed}`;

  return transformed === text ? null : transformed;
};

export default {
  name: "native-webgl-angle-host",
  configure() {
    return {
      hostShims: {
        // The native bridge represents half-float buffers with Uint16Array;
        // it does not install an ECMAScript Float16Array constructor.
        absentGlobals: [
          "Float16Array",
          "HTMLCanvasElement",
          "HTMLImageElement",
          "HTMLVideoElement",
          "ImageBitmap",
          "OffscreenCanvas",
          "VideoFrame",
        ],
        embeddedHostFunctions,
        embeddedHostFunctionReturnTypes,
        embeddedHostNoThrowFunctions,
        hostNativeArrayFunctions: hostFunctions
          .filter(([, , , declaration]) =>
            declaration.includes("HostNumericArgument<"),
          )
          .map(([, cppName]) => cppName),
        hostArraySnapshotFunctions: hostFunctions
          .filter(([, , , declaration]) =>
            declaration.includes("std::span<const double>"),
          )
          .map(([, cppName]) => cppName),
        hostExternDeclarations,
        runtimeMemberCalls,
        runtimeMemberReads,
        ambientTypeRealizations,
        transformSource,
      },
    };
  },
};
