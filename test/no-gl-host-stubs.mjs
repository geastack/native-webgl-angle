// The contract tests execute the compiled program on the build machine, where
// the ANGLE host (`native/angle_webgl_host.mm`, macOS only) does not exist.
// What they exercise -- matrix storage, counts, versions, disposal -- never
// reaches a GL call at run time, but the program still DECLARES the host's
// `extern "C"` entry points and the link needs a definition for each. Weak
// no-op definitions, generated from the declarations the program itself
// carries, satisfy the linker and are overridden by a real host when present.
export const noGlHostStubs = (source) => {
  const stubs = []
  for (const match of source.matchAll(/^extern "C" (void|double|bool|int|long long|unsigned int) (gea_three_webgl_\w+)\(([^)]*)\);$/gm)) {
    const [, returns, name, parameters] = match
    const body = returns === 'void' ? '{}' : '{ return 0; }'
    stubs.push(`extern "C" __attribute__((weak)) ${returns} ${name}(${parameters}) ${body}`)
  }
  return stubs.join('\n')
}
