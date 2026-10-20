// Files the app ships in its Resources folder (native/resource_host.mm): the
// app bundle's resource directory on macOS, the Resources folder beside the
// executable elsewhere. Names are relative to it, with '/' between parts.

/** @gea-host-inert Reads its argument and the file system only; never calls back into script. */
declare function threeResourceSize(name: string): number
/** @gea-host-typed-array-element-writes Stores the file's bytes into the destination typed array's elements only; no other property of any object, no callbacks. */
declare function threeResourceRead(name: string, destination: Uint8Array): number

/** The size in bytes of a file in Resources, or -1 when there is none. */
export function nativeResourceSize(name: string): number {
  return threeResourceSize(name)
}

/** Reads a whole file from Resources; throws when it is missing or cannot be read. */
export function nativeReadResource(name: string): Uint8Array {
  const size = threeResourceSize(name)
  if (size < 0) throw new Error(`Missing resource: ${name}`)
  const bytes = new Uint8Array(size)
  if (threeResourceRead(name, bytes) !== size) throw new Error(`Could not read resource: ${name}`)
  return bytes
}
