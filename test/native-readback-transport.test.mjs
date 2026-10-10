import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {nativeReadbackFunctions} from '../geatsc-plugin-readback.mjs';
import {nativeTestOutDir} from './out-dir.mjs';
const runtime=fileURLToPath(new URL('../../compiler/src/targets/cpp/runtime/',import.meta.url));
const native=fileURLToPath(new URL('../native/',import.meta.url));
const binary=nativeTestOutDir()+'/native-readback-test';
const source=`
#include "gea_runtime.h"
#include "webgl_readback.h"
#include <cassert>
static unsigned error = 0;
extern "C" void gea_three_webgl_read_pixels_bytes(double,double,double w,double h,double f,double t,void* p,double n,double e) {
 error=gea_webgl::validateReadPixels(w,h,f,t,n,e,4,0,0,0);
 if(error || !w || !h)return;
 if(t==0x1406){float values[]={-2,4,.125,1}; std::memcpy(p,values,sizeof(values));}
 else {unsigned char values[]={1,2,3,4};std::memcpy(p,values,4);}
}
${nativeReadbackFunctions[0][3]}
int main(){
 auto floats=gea::makeRef<gea::TypedArray<float>>(8);
 gea_three_webgl_read_pixels_native(0,0,1,1,0x1908,0x1406,floats,2);
 assert(!error && floats->data()[2]==-2 && floats->data()[3]==4 && floats->data()[0]==0 && floats->data()[6]==0);
 auto view=gea::makeRef<gea::TypedArray<float>>(gea::TypedArray<float>::fromBuffer(floats->buffer(),4,5));
 gea_three_webgl_read_pixels_native(0,0,1,1,0x1908,0x1406,view,1);
 assert(!error && floats->data()[2]==-2);
 gea_three_webgl_read_pixels_native(0,0,1,1,0x1908,0x1406,floats,7); assert(error==0x0502);
 gea_three_webgl_read_pixels_native(0,0,1,1,0x1908,0x1406,floats,-1); assert(error==0x0501);
 auto bytes=gea::makeRef<gea::TypedArray<std::uint8_t>>(8);
 std::variant<decltype(floats),decltype(bytes)> either=bytes;
 gea_three_webgl_read_pixels_native(0,0,1,1,0x1908,0x1401,either,2);
 assert(!error && bytes->data()[2]==1 && bytes->data()[5]==4 && bytes->data()[6]==0);
 gea_three_webgl_read_pixels_native(0,0,1,1,0x1908,0x1406,bytes,0);assert(error==0x0502);
 assert(gea_webgl::validateReadPixels(1,2,0x1908,0x1401,12,0x1401,8,0,0,0)==0);
 assert(gea_webgl::validateReadPixels(1,2,0x1908,0x1401,11,0x1401,8,0,0,0)==0x0502);
 assert(gea_webgl::validateReadPixels(1,2,0x1908,0x1401,40,0x1401,8,2,2,1)==0);
 assert(gea_webgl::validateReadPixels(1,2,0x1908,0x1401,31,0x1401,8,2,2,1)==0x0502);
 assert(gea_webgl::validateReadPixels(-1,1,0x1908,0x1401,10,0x1401,4,0,0,0)==0x0501);
 assert(gea_webgl::validateReadPixels(0,1,0x1908,0x1401,0,0x1401,4,0,0,0)==0);
}
`;
execFileSync('clang++',['-std=c++20','-O1','-fsanitize=address,undefined','-I'+runtime,'-I'+native,'-x','c++','-','-o',binary],{input:source,stdio:['pipe','inherit','inherit']});
execFileSync(binary,{stdio:'inherit'});
console.log('Readback mutates original typed views; offsets, bounds, format and pack layout pass ASan/UBSan');
