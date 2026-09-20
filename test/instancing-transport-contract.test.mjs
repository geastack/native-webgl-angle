import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import plugin from '../geatsc-plugin.mjs'
import { createRequire } from 'node:module'

// The same TypeScript the compiler itself uses. This package's own
// devDependency is `latest`, and TypeScript 7 moved the compiler API behind
// ./unstable/*, so a bare `typescript` import resolves to a version stub.
const ts = createRequire(import.meta.resolve('@geastack/compiler/package.json'))('typescript')
const source=fs.readFileSync(new URL('../src/nativeWebGL.ts',import.meta.url),'utf8')
const host=fs.readFileSync(new URL('../src/nativeWebGLHost.ts',import.meta.url),'utf8')
const methods=['vertexAttribDivisor','drawElementsInstanced','drawArraysInstanced']
const bridges=['VertexAttribDivisor','DrawElementsInstanced','DrawArraysInstanced']
const lines=methods.map(name=>source.split('\n').find(line=>line.trimStart().startsWith(name+'(')))
assert.ok(lines.every(Boolean))
const calls=[]
const native=bridges.map(name=>(...args)=>calls.push([name,...args]))
const js=ts.transpile(`class Context {${lines.join('\n')}}`,{target:ts.ScriptTarget.ES2022})
const Context=new Function(...bridges.map(name=>'nativeWebGL'+name),js+'; return Context;')(...native)
const ctx=new Context()
ctx.vertexAttribDivisor(3,2)
ctx.drawElementsInstanced(4,6,5123,8,7)
ctx.drawArraysInstanced(4,2,6,9)
ctx.drawElementsInstanced(4,6,5123,8,0)
ctx.drawArraysInstanced(4,2,6,0)
assert.deepEqual(calls,[['VertexAttribDivisor',3,2],['DrawElementsInstanced',4,6,5123,8,7],['DrawArraysInstanced',4,2,6,9],['DrawElementsInstanced',4,6,5123,8,0],['DrawArraysInstanced',4,2,6,0]])
for(let i=0;i<bridges.length;i++) {
  const name=bridges[i]
  const line=host.split('\n').find(line=>line.startsWith('export function nativeWebGL'+name+'('))
  const body=ts.transpile(line.replace('export ',''),{target:ts.ScriptTarget.ES2022})
  const forwarded=[]
  const bridge=new Function('threeWebGL'+name,body+'; return nativeWebGL'+name)((...args)=>forwarded.push(args))
  bridge(...calls[i].slice(1))
  assert.deepEqual(forwarded,[calls[i].slice(1)])
}
const config=plugin.configure()
const serialized=JSON.stringify(config)
for(const name of ['gea_three_webgl_vertex_attrib_divisor','gea_three_webgl_draw_elements_instanced','gea_three_webgl_draw_arrays_instanced']) assert.ok(serialized.includes(name),name)
console.log('Instancing shim preserves divisor, index offset, instance counts and zero counts through typed host transport')
