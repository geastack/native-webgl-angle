// The Web Audio host alone, for a build that has no WebGL host.
//
// A three.js app on @geastack/native-webgpu turns this package's main plugin
// off (GEA_WEBGL_PLUGIN=0, or --no-webgl-plugin): its three.js source patches,
// its WebGL context and its canvas are WebGL's. Its sound design still runs
// on src/nativeAudioHost.ts over native/audio_host.mm, which only this
// package states. This entry states that part and nothing else:
//
//   - the `threeAudio*` host functions nativeAudioHost.ts declares, each to its
//     `gea_three_audio_*` C function, with the extern declaration a unit needs
//     before calling it;
//   - the Web Audio type realizations (`AudioContext` -> `NativeAudioContext`,
//     `GainNode` -> `NativeGainNode`, ...), so an app's code written against the
//     browser's names holds this package's classes.
//
// No source transform, no WebGL rows, no canvas realization, no absent
// globals. The rows are the main plugin's own (geatsc-plugin.mjs exports
// them), so the two entries cannot drift apart.
//
// Load one entry or the other, never both: both register the same host
// functions. A WebGL build keeps using ./geatsc-plugin, which includes these.
//
// The app still links native/audio_host.mm (plain C++ on _WIN32) as a native
// source, as it does for a WebGL build.

import { inertPluginInstance } from "@geastack/compiler/plugin";

import {
  audioAmbientTypeRealizations,
  audioHostFunctions,
  hostArraySnapshotFunctionsOf,
  hostExternDeclarationOf,
  hostNativeArrayFunctionsOf,
} from "./geatsc-plugin.mjs";

export const hostFunctions = new Map(
  audioHostFunctions.map(([tsName, cppName]) => [tsName, cppName]),
);
export const hostPreambles = new Map(
  audioHostFunctions.map((row) => [row[1], hostExternDeclarationOf(row)]),
);
export const ambientTypeRealizations = new Map(
  Object.entries(audioAmbientTypeRealizations).map(([name, realization]) => [
    name,
    { ...realization },
  ]),
);

export const audioPlugin = {
  name: "native-webgl-angle-audio",
  instantiate() {
    return {
      ...inertPluginInstance,
      capabilities: {
        ...inertPluginInstance.capabilities,
        hostFunctions,
        hostPreambles,
        hostNativeArrayFunctions: new Set(
          hostNativeArrayFunctionsOf(audioHostFunctions),
        ),
        hostArraySnapshotFunctions: new Set(
          hostArraySnapshotFunctionsOf(audioHostFunctions),
        ),
        ambientTypeRealizations,
      },
    };
  },
};

export default audioPlugin;
