import assert from 'node:assert/strict'
import fs from 'node:fs'
import path, { join } from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {execFileSync} from 'node:child_process'
import {nativeModuleResolution, compilerFingerprint} from './native-module-resolution.mjs'
import { nativeTestOutDir } from './out-dir.mjs'
const runtimeInclude = dirname(fileURLToPath(import.meta.resolve('@geastack/compiler/src/targets/cpp/runtime/gea_runtime_builtins.cpp')))
const packageDir = fileURLToPath(new URL('../',import.meta.url))
process.env.GEATSC2_WEBGL_PLUGIN = path.join(packageDir,'geatsc-plugin.mjs')
import { compile } from '@geastack/compiler/dist/compiler.js'
const entry = path.join(packageDir,'test/instanced-mesh-native-entry.ts')
const source = `
import {Mesh} from 'three/src/objects/Mesh.js';
import {Material} from 'three/src/materials/Material.js';
import {InstancedMesh} from 'three/src/objects/InstancedMesh.js';
import {BoxGeometry} from 'three/src/geometries/BoxGeometry.js';
import {MeshPhongMaterial} from 'three/src/materials/MeshPhongMaterial.js';
import {Matrix4} from 'three/src/math/Matrix4.js';
const mesh = new InstancedMesh(new BoxGeometry(),new MeshPhongMaterial(),3);
const matrix = new Matrix4().makeTranslation(2,3,4);
mesh.setMatrixAt(1,matrix);
mesh.getMatrixAt(0,matrix);
console.log(matrix.elements[0]);
mesh.getMatrixAt(1,matrix);
console.log(matrix.elements[12]);
console.log(matrix.elements[13]);
console.log(matrix.elements[14]);
mesh.instanceMatrix.needsUpdate=true;
console.log(mesh.instanceMatrix.version);
console.log(mesh.instanceMatrix.count);
mesh.count=2;
console.log(mesh.count);
mesh.dispose();
const a = new Mesh();
const b = new Mesh();
console.log(a.onBeforeRender === b.onBeforeRender);
console.log(new MeshPhongMaterial().onBeforeRender === new Material().onBeforeRender);
a.onBeforeRender = () => {};
console.log(a.onBeforeRender === b.onBeforeRender);
`;
console.log('Canonical compiler provenance:',compilerFingerprint())
const result=compile({rootFileNames:[entry],projectFileName:null,moduleResolution:nativeModuleResolution(),sourceOverlay:new Map([[entry,source]])})
assert.ok(result.certificate && result.source, JSON.stringify({diagnostics:result.diagnostics,refusals:result.refusals.filter(x=>x.stage!=='census'),census:result.refusals.filter(x=>x.stage==='census').slice(0,8),emission:result.emissionRefusals,blockers:result.loweringBlockers}))
const binary=join(nativeTestOutDir(), 'instanced-mesh-contract-test')
fs.writeFileSync(binary+'.cpp',result.source+'\nint main(){__gea_top_level();}\n')
if(process.argv.includes('--emit-only')) process.exit(0)
// Quoted includes search the generated file's directory before -I. Refresh
// canonical runtime headers there so an earlier fixture cannot shadow them.
const runtimeDirectory=runtimeInclude
for(const name of fs.readdirSync(runtimeDirectory).filter(name=>name.endsWith('.h'))){
  const sourceHeader=fs.readFileSync(path.join(runtimeDirectory,name))
  const outputHeader=path.join(path.dirname(binary),name)
  if(!fs.existsSync(outputHeader)||!fs.readFileSync(outputHeader).equals(sourceHeader)) fs.writeFileSync(outputHeader,sourceHeader)
}
execFileSync(process.env.CXX??'clang++',['-std=c++20','-O0','-fsanitize=address,undefined',`-I${runtimeInclude}`,binary+'.cpp','-o',binary],{stdio:'inherit',env:{...process.env,TMPDIR:path.dirname(binary)}})
assert.equal(execFileSync(binary,{encoding:'utf8',env:{...process.env,UBSAN_OPTIONS:'halt_on_error=1'}}),'1\n2\n3\n4\n1\n3\n2\ntrue\ntrue\nfalse\n')
console.log('Native InstancedMesh matrix storage/count/version/disposal pass ASan/UBSan')
