// The audio-only plugin entry states the main plugin's Web Audio rows, the
// same rows and only those, and the compiler accepts it as a plugin.
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import mainPlugin, {
  audioAmbientTypeRealizations,
  audioHostFunctions,
} from "../geatsc-plugin.mjs";
import audioPlugin from "../geatsc-plugin-audio.mjs";

const read = (relative) =>
  fs.readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
const audioSource = read("../src/nativeAudioHost.ts");
const audioNative = read("../native/audio_host.mm");

const main = mainPlugin.configure().hostShims;
const audio = audioPlugin.instantiate(new Map()).capabilities;

// Every host function nativeAudioHost.ts declares, and nothing else.
const declared = [
  ...audioSource.matchAll(/^declare function (threeAudio\w+)\(/gm),
].map((match) => match[1]);
assert.equal(declared.length, 15);
assert.deepEqual([...audio.hostFunctions.keys()].sort(), [...declared].sort());
for (const cppName of audio.hostFunctions.values()) {
  assert.match(cppName, /^gea_three_audio_/);
  assert.ok(
    audioNative.includes(`${cppName}(`),
    `${cppName} is not defined in native/audio_host.mm`,
  );
}

// The same rows the main plugin states: the function, its declaration, the
// realizations.
for (const [tsName, cppName] of audio.hostFunctions) {
  assert.equal(main.embeddedHostFunctions[tsName], cppName);
  assert.deepEqual(
    audio.hostPreambles.get(cppName),
    main.hostExternDeclarations[cppName],
  );
}
assert.deepEqual(
  [...audio.hostPreambles.keys()],
  [...audio.hostFunctions.values()],
);
assert.deepEqual(
  Object.fromEntries(audio.ambientTypeRealizations),
  audioAmbientTypeRealizations,
);
for (const [name, realization] of audio.ambientTypeRealizations) {
  assert.deepEqual(main.ambientTypeRealizations[name], realization);
  assert.equal(
    realization.importedFrom,
    "@geastack/native-webgl-angle/nativeAudioHost",
  );
}
// The main plugin's audio rows are these, at the end of its tables.
const mainNames = Object.keys(main.embeddedHostFunctions);
assert.deepEqual(
  mainNames.slice(-audioHostFunctions.length),
  audioHostFunctions.map(([tsName]) => tsName),
);
assert.deepEqual(
  Object.keys(main.ambientTypeRealizations).slice(
    -audio.ambientTypeRealizations.size,
  ),
  [...audio.ambientTypeRealizations.keys()],
);

// Nothing of WebGL's: no WebGL function, no canvas or context realization, no
// source transform, no absent globals.
for (const tsName of audio.hostFunctions.keys())
  assert.match(tsName, /^threeAudio/);
for (const name of audio.ambientTypeRealizations.keys())
  assert.doesNotMatch(name, /^(WebGL|HTMLCanvasElement$|OffscreenCanvas$)/);
assert.equal(audioPlugin.instantiate(new Map()).transformSource, undefined);
assert.equal(audio.absentGlobals.size, 0);
assert.equal(audio.declarationModules?.size ?? 0, 0);

// The compiler loads it as a plugin: its instance passes the loader's checks.
const { loadCliPlugins } = await import(
  "@geastack/compiler/dist/plugins/load.js"
);
const loaded = await loadCliPlugins([
  fileURLToPath(new URL("../geatsc-plugin-audio.mjs", import.meta.url)),
]);
const loadedAudio = loaded.find(
  (plugin) => plugin.name === "native-webgl-angle-audio",
);
assert.ok(loadedAudio, "the compiler did not load the audio entry");
// The loader wraps instantiate with its instance validation.
assert.equal(loadedAudio.instantiate(new Map()).capabilities.hostFunctions.size, 15);

console.log(
  `audio plugin entry: ${audio.hostFunctions.size} host functions and ${audio.ambientTypeRealizations.size} realizations, the main plugin's own`,
);
