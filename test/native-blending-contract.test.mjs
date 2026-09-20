import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Color } from "three/src/math/Color.js";
import * as constants from "three/src/constants.js";
import plugin from "../geatsc-plugin.mjs";

const fileName = fileURLToPath(
  import.meta.resolve("three/src/renderers/webgl/WebGLState.js"),
);
const upstream = readFileSync(fileName, "utf8");
const adapted = plugin
  .configure()
  .hostShims.transformSource({ fileName, text: upstream });

function runBlending(source) {
  const start = source.indexOf("\tfunction setBlending(");
  const end = source.indexOf("\n\tfunction setMaterial(", start);
  assert.ok(start >= 0 && end > start);
  const calls = [];
  const gl = {
    BLEND: 0x0be2,
    FUNC_ADD: 0x8006,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    ONE: 1,
  };
  for (const name of [
    "blendColor",
    "blendEquation",
    "blendEquationSeparate",
    "blendFunc",
    "blendFuncSeparate",
  ])
    gl[name] = (...args) => calls.push([name, ...args]);
  const environment = {
    ...constants,
    gl,
    equationToGL: {
      [constants.AddEquation]: 0x8006,
      [constants.SubtractEquation]: 0x800a,
    },
    factorToGL: { [constants.OneFactor]: 1, [constants.ZeroFactor]: 0 },
    currentBlendColor: new Color(0, 0, 0),
    enable: (value) => calls.push(["enable", value]),
    disable: (value) => calls.push(["disable", value]),
    error: (...args) => {
      throw new Error(args.join(" "));
    },
  };
  const factory = new Function(
    ...Object.keys(environment),
    `
    let currentBlendingEnabled = false;
    let currentBlending = null, currentPremultipledAlpha = false;
    let currentBlendEquation = null, currentBlendEquationAlpha = null;
    let currentBlendSrc = null, currentBlendDst = null;
    let currentBlendSrcAlpha = null, currentBlendDstAlpha = null, currentBlendAlpha = 0;
    ${source.slice(start, end)}
    return setBlending;
  `,
  );
  const setBlending = factory(...Object.values(environment));
  const color = new Color(0.25, 0.5, 0.75);
  const custom = [
    constants.CustomBlending,
    constants.AddEquation,
    constants.OneFactor,
    constants.ZeroFactor,
    undefined,
    undefined,
    undefined,
    color,
    0.5,
    false,
  ];
  setBlending(...custom);
  const afterFirst = calls.length;
  setBlending(...custom);
  assert.equal(
    calls.length,
    afterFirst,
    "unchanged custom blend state must remain cached",
  );
  setBlending(
    ...custom.slice(0, 4),
    constants.SubtractEquation,
    constants.ZeroFactor,
    constants.OneFactor,
    color,
    0.75,
    false,
  );
  setBlending(constants.NormalBlending);
  setBlending(constants.NoBlending);
  return calls;
}

const expected = runBlending(upstream);
assert.ok(expected.some(([name]) => name === "blendColor"));
assert.deepEqual(runBlending(adapted), expected);
console.log(
  "PASS native blending adaptation preserves upstream GL method calls, alpha defaults and state caching",
);
