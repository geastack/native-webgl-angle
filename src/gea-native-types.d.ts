declare const __gea_native_webgl_angle_f32_brand: unique symbol

type f32 = number & { readonly [__gea_native_webgl_angle_f32_brand]?: never }
declare function threeGamepadState(channel: number): number
