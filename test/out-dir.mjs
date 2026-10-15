// Compiled contract-test binaries land in this package's own build output,
// never in another package's directory.

import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Windows starts only a file with an executable suffix, and clang's `-o name`
// writes exactly `name`.
export const executableSuffix = process.platform === 'win32' ? '.exe' : ''

export function nativeTestOutDir() {
  const directory = fileURLToPath(new URL('../dist/cxx/', import.meta.url))
  mkdirSync(directory, { recursive: true })
  return directory
}
