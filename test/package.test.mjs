import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { SourceTextModule, SyntheticModule, createContext } from "node:vm";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const archive = process.argv[2];
assert.ok(archive, "Pass the packed npm archive path");
// Read the archive in memory: no extracted compiler copy, scratch directory,
// or fallback to the checkout can conceal a missing published dependency.
const files = JSON.parse(
  execFileSync(
    "python3",
    [
      "-c",
      `
import json,sys,tarfile
with tarfile.open(sys.argv[1]) as archive:
 print(json.dumps({m.name.removeprefix('package/'):archive.extractfile(m).read().decode('utf-8') for m in archive.getmembers() if m.isfile()}))
`,
      resolve(archive),
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  ),
);
const manifest = JSON.parse(files["package.json"]);
assert.equal(manifest.private, undefined);
assert.equal(manifest.publishConfig.access, "public");
assert.equal(manifest.dependencies["@geastack/apple"], ">=0.2.8");
assert.equal(manifest.peerDependencies["@geastack/compiler"], "^1.0.17");
assert.equal(manifest.peerDependencies.three, "^0.185.0");
assert.equal(manifest.exports["./native/*"], "./native/*");
for (const specification of Object.values(manifest.dependencies))
  assert.doesNotMatch(specification, /^(file|link|workspace):/);
for (const entry of Object.values(manifest.exports)) {
  if (!entry.includes("*"))
    assert.ok(files[entry.slice(2)], `Missing exported file: ${entry}`);
}
for (const name of Object.keys(files)) {
  assert.match(
    name,
    /^(src\/|native\/|test\/[a-z-]+-scene\.ts$|geatsc-plugin(?:-uploads|-uniforms|-instancing|-batched-probe)?\.mjs$|package\.json$|README\.md$|LICENSE$)/,
  );
}
for (const required of [
  "src/gea-native-types.d.ts",
  "native/angle_webgl_host.mm",
  "native/audio_host.mm",
  "native/audio_uwp.h",
]) {
  assert.ok(files[required], `Missing native dependency: ${required}`);
}

const prefix = "file:///npm-package/";
const context = createContext({ URL, console, process: { env: {} } });
const modules = new Map();
const textAt = (url) => {
  const name = String(url).slice(prefix.length);
  assert.ok(
    String(url).startsWith(prefix) && Object.hasOwn(files, name),
    `Read outside published package: ${url}`,
  );
  return files[name];
};
const builtins = {
  "node:fs": {
    default: {
      readFileSync: (url, encoding) => {
        assert.equal(encoding, "utf8");
        return textAt(url);
      },
    },
  },
  "node:url": { fileURLToPath },
};
const moduleAt = (identifier) => {
  if (modules.has(identifier)) return modules.get(identifier);
  const builtin = builtins[identifier];
  const module = builtin
    ? new SyntheticModule(
        Object.keys(builtin),
        function () {
          for (const [name, value] of Object.entries(builtin))
            this.setExport(name, value);
        },
        { context, identifier },
      )
    : new SourceTextModule(textAt(identifier), {
        context,
        identifier,
        initializeImportMeta: (meta) => {
          meta.url = identifier;
        },
      });
  modules.set(identifier, module);
  return module;
};
const plugin = moduleAt(
  new URL(manifest.exports["./geatsc-plugin"], prefix).href,
);
await plugin.link((specifier, importer) =>
  moduleAt(
    specifier.startsWith("node:")
      ? specifier
      : new URL(specifier, importer.identifier).href,
  ),
);
await plugin.evaluate();
assert.equal(plugin.namespace.default.name, "native-webgl-angle-host");
const { hostShims } = plugin.namespace.default.configure();
assert.ok(hostShims.hostNativeArrayFunctions.length > 0);
assert.equal(typeof hostShims.transformSource, "function");
console.log(
  `Packed plugin loads and configures using only its ${Object.keys(files).length} published files; native sources and exports are present`,
);
