// Compiled contract-test binaries land in this package's own build output,
// never in another package's directory.

import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function nativeTestOutDir() {
  const directory = fileURLToPath(new URL('../dist/cxx/', import.meta.url))
  mkdirSync(directory, { recursive: true })
  return directory
}
