import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { nativeModuleResolution, compilerFingerprint } from './native-module-resolution.mjs'
import { nativeTestOutDir } from './out-dir.mjs'
const runtimeInclude = dirname(fileURLToPath(import.meta.resolve('@geastack/compiler/src/targets/cpp/runtime/gea_runtime_builtins.cpp')))

const packageDir = fileURLToPath(new URL('..', import.meta.url))
const compilerBefore = compilerFingerprint()
process.env.GEATSC2_WEBGL_PLUGIN = path.join(packageDir, 'geatsc-plugin-batched-probe.mjs')
import { compile } from '@geastack/compiler/dist/compiler.js'
import { virtualDispatchVerdictOf } from '@geastack/compiler/dist/projection/dispatch.js'
const entry = path.join(packageDir, 'test/batched-mesh-native-entry.ts')
const callbacks = process.argv.includes('--callbacks')
const callbackSource = `
const camera = new PerspectiveCamera(60, 1, 0.1, 100);
camera.position.z = 10;
camera.updateMatrixWorld();
const shadowCamera = new OrthographicCamera(-8, 8, 8, -8, 0.1, 100);
shadowCamera.position.z = 10;
shadowCamera.updateMatrixWorld();
const depthMaterial = new MeshDepthMaterial();
batch.updateMatrixWorld();
function beforeRender(object: Object3D, renderCamera: Camera): void {
  object.onBeforeRender(null, null, renderCamera, batch.geometry, material, null);
}
function beforeShadow(object: Object3D): void {
  object.onBeforeShadow(null, object, camera, shadowCamera, batch.geometry, depthMaterial, null);
}
batch.setVisibleAt(second, false);
beforeRender(batch, camera);
console.log(batch._multiDrawCount);
batch.setVisibleAt(second, true);
beforeShadow(batch);
console.log(batch._multiDrawCount);
const arrayCamera = new ArrayCamera([camera]);
arrayCamera.updateMatrixWorld();
beforeRender(batch, arrayCamera);
console.log(batch._multiDrawCount);
arrayCamera.cameras.length = 0;
beforeRender(batch, arrayCamera);
console.log(batch._multiDrawCount);
beforeRender(batch, camera);
console.log(batch._multiDrawCount);
batch.setMatrixAt(second, new Matrix4().makeTranslation(1000, 0, 0));
beforeRender(batch, camera);
console.log(batch._multiDrawCount);
batch.setMatrixAt(second, new Matrix4());
batch.setVisibleAt(first, false);
batch.setVisibleAt(second, false);
beforeRender(batch, camera);
console.log(batch._multiDrawCount);
batch.setVisibleAt(first, true);
batch.setVisibleAt(second, true);
let sortCalls = 0;
batch.setCustomSort(function(this: BatchedMesh, list: { start: number, count: number, z: number, index: number }[], sortCamera: Camera): void {
  if (this !== batch || sortCamera !== camera) throw new Error('Custom sort lost its receiver or camera');
  if (list.length !== 2) throw new Error('Custom sort received an incorrect visible list');
  list.reverse();
  sortCalls++;
});
beforeRender(batch, camera);
console.log(sortCalls);
batch.setCustomSort(null);
material.wireframe = true;
beforeRender(batch, camera);
console.log(batch._multiDrawCounts[0]);
`
const source = `
import { BatchedMesh } from 'three/src/objects/BatchedMesh.js';
import { BoxGeometry } from 'three/src/geometries/BoxGeometry.js';
import { MeshBasicMaterial } from 'three/src/materials/MeshBasicMaterial.js';
import { Matrix4 } from 'three/src/math/Matrix4.js';
import { Vector4 } from 'three/src/math/Vector4.js';
${callbacks ? `import { PerspectiveCamera } from 'three/src/cameras/PerspectiveCamera.js';
import { Camera } from 'three/src/cameras/Camera.js';
import { ArrayCamera } from 'three/src/cameras/ArrayCamera.js';
import { OrthographicCamera } from 'three/src/cameras/OrthographicCamera.js';
import { MeshDepthMaterial } from 'three/src/materials/MeshDepthMaterial.js';
import { Object3D } from 'three/src/core/Object3D.js';` : ''}
const material = new MeshBasicMaterial();
const batch = new BatchedMesh(4, 128, 256, material);
const geometry = batch.addGeometry(new BoxGeometry());
const first = batch.addInstance(geometry);
const second = batch.addInstance(geometry);
batch.setMatrixAt(first, new Matrix4().makeTranslation(1, 2, 3));
batch.setColorAt(first, new Vector4(0.25, 0.5, 0.75, 0.5));
batch.setVisibleAt(second, false);
console.log(batch.getVisibleAt(second));
batch.setVisibleAt(second, true);
console.log(batch.getVisibleAt(second));
batch.setInstanceCount(8);
const clone = batch.clone();
if (!(clone instanceof BatchedMesh)) throw new Error("BatchedMesh clone lost its native class");
clone.setColorAt(first, new Vector4(1, 0, 0, 1));
const color = new Vector4();
batch.getColorAt(first, color);
console.log(color.x);
const matrix = new Matrix4();
clone.getMatrixAt(first, matrix);
console.log(matrix.elements[12]);
${callbacks ? callbackSource : ''}
batch.dispose();
clone.dispose();
`
const result = compile({ rootFileNames: [entry], projectFileName: null, includeIr: callbacks,
  moduleResolution: nativeModuleResolution(), sourceOverlay: new Map([[entry, source]]) })
assert.equal(compilerFingerprint(), compilerBefore, 'Canonical compiler changed during fixture compilation')
console.log('Canonical compiler:', compilerBefore)
if (callbacks && !result.source && result.irBodies) {
  const bodies = new Map(result.irBodies.map(body => [body.sourceOwner, body]))
  const verdict = virtualDispatchVerdictOf(result.projection.classes,
    callable => bodies.get(callable)?.abi ?? null,
    callable => {
      const facts = bodies.get(callable)?.facts
      return facts === undefined || (facts.capturedDeclarations.length === 0 && facts.capturedReceiver === null)
    }, result.conversionCensus)
  console.error('Callback dispatch:', JSON.stringify(verdict.refused.filter(item => item.key === 'onBeforeRender' || item.key === 'onBeforeShadow')))
}
assert.ok(result.certificate && result.source, JSON.stringify({
  diagnosticState: { clean: result.diagnostics.clean, planClean: result.diagnostics.planClean },
  certification: { certified: result.certification?.certified, refusals: result.certification?.refusals },
  diagnostics: result.diagnostics.diagnostics.map(item => ({ message: item.message, location: item.location })).slice(0, 12),
  blockers: result.loweringBlockers?.slice(0, 6), emission: result.emissionRefusals?.slice(0, 6),
  refusals: result.refusals.filter(item => item.stage !== 'census').map(item => ({
    ...item,
    operation: result.graph.operations.get(item.owner),
    sourceFile: result.sourceFileNames.get(item.owner.split('|')[2]),
  })),
  census: result.refusals.filter(item => item.stage === 'census').slice(0, 12),
  preflight: result.preflight.obligations.filter(item => !item.optional && item.status !== 'satisfied').slice(0, 12),
}))
const binary = path.join(nativeTestOutDir(), callbacks ? 'batched-mesh-callback-test' : 'batched-mesh-contract-test')
const cpp = `${binary}.cpp`
fs.writeFileSync(cpp, `${result.source}\nint main() {
  try { __gea_top_level(); }
  catch (const gea::Value& error) {
    std::fprintf(stderr, "%s\\n", gea::host::runtimeErrorString(error).c_str());
    return 1;
  }
}\n`)
if (process.argv.includes('--emit-only')) {
  console.log(`Generic BatchedMesh certifies and emits C++: ${cpp}; native execution skipped (--emit-only)`)
  process.exit(0)
}
// gea_sources.sh wants a directory per framework package. They are all npm
// packages, so each root is its own package.json's directory -- no checkout
// layout assumed.
const packageRoot = (name) => path.dirname(fileURLToPath(import.meta.resolve(`@geastack/${name}/package.json`)))
const nativeIncludes = callbacks ? execFileSync('bash', ['-c', 'source "$GEA_CORE/gea_sources.sh"; gea_fw_include_flags'], {
  encoding: 'utf8', env: { ...process.env, GEA_CORE: packageRoot('core'), GEA_HOST_DIR: packageRoot('host'),
    GEA_ENGINE_DIR: packageRoot('engine'), GEA_ELEMENTS_DIR: packageRoot('elements'), GEA_GEAOS_PACKAGE_DIR: packageRoot('geaos') },
}).trim().split('\n') : []
execFileSync(process.env.CXX ?? 'clang++', ['-std=c++20', '-O1', '-fsanitize=address,undefined', ...nativeIncludes,
  `-I${runtimeInclude}`, cpp, '-o', binary], {
  env: { ...process.env, TMPDIR: nativeTestOutDir() }, stdio: 'inherit',
})
assert.equal(execFileSync(binary, {
  encoding: 'utf8', env: { ...process.env, UBSAN_OPTIONS: 'halt_on_error=1' },
}), 'false\ntrue\n0.25\n1\n' + (callbacks ? '1\n2\n2\n0\n2\n1\n0\n1\n72\n' : ''))
console.log(callbacks
  ? 'Generic native BatchedMesh render/shadow callbacks through Object3D pass ASan/UBSan'
  : 'Generic native BatchedMesh visibility, resize and independent clone pass ASan/UBSan')
