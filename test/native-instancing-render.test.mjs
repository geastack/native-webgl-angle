import assert from 'node:assert/strict'
import fs from 'node:fs'
import path, { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { nativeTestOutDir } from './out-dir.mjs'

// Exercise the shipping host bodies against real ANGLE/Metal pixels. The
// separate facade contract verifies TypeScript-to-host argument transport.
const packageDir = path.resolve(import.meta.dirname, '..')
const host = fs.readFileSync(path.join(packageDir, 'native/angle_webgl_host.mm'), 'utf8')
const start = host.indexOf('extern "C" void gea_three_webgl_vertex_attrib_divisor(')
const end = host.indexOf('extern "C" double gea_three_webgl_get_error()', start)
assert.ok(start >= 0 && end > start)
const directory = '/Applications/Visual Studio Code.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries'
const egl = process.env.GEA_ANGLE_EGL ?? path.join(directory, 'libEGL.dylib')
const gles = process.env.GEA_ANGLE_GLES ?? path.join(directory, 'libGLESv2.dylib')
const binary = join(nativeTestOutDir(), 'native-instancing-render-test')
const source = `
#include <algorithm>
#include <array>
#include <cassert>
#include <cstdint>
#include <cstdio>
#include <dlfcn.h>
using GLenum=unsigned; using GLuint=unsigned; using GLint=int; using GLsizei=int;
static GLenum asGLenum(double x){return static_cast<GLenum>(x);}
static GLuint asGLuint(double x){return static_cast<GLuint>(x);}
static GLint asGLint(double x){return static_cast<GLint>(x);}
static GLsizei asGLsizei(double x){return static_cast<GLsizei>(x);}
static bool current=false;
static void geaTrapCheck(const char*) {}
#define GEA_WEBGL_VOID(step) if(!current) return
struct Host {
 void (*glVertexAttribDivisor)(GLuint,GLuint);
 void (*glDrawElementsInstanced)(GLenum,GLsizei,GLenum,const void*,GLsizei);
 void (*glDrawArraysInstanced)(GLenum,GLint,GLsizei,GLsizei);
} gWebGL{};
${host.slice(start, end)}
template<class F> F symbol(void* lib,const char* name) {
 auto result=reinterpret_cast<F>(dlsym(lib,name));
 if(!result){std::fprintf(stderr,"missing %s: %s\\n",name,dlerror());std::abort();}
 return result;
}
int main(int argc,char** argv) {
 assert(argc==3);
 void* egl=dlopen(argv[1],RTLD_NOW|RTLD_LOCAL); assert(egl);
 void* gl=dlopen(argv[2],RTLD_NOW|RTLD_LOCAL); assert(gl);
#define EGL(name,type) auto name=symbol<type>(egl,#name)
#define GL(name,type) auto name=symbol<type>(gl,#name)
 EGL(eglGetProcAddress,void*(*)(const char*));
 auto getDisplay=reinterpret_cast<void*(*)(unsigned,void*,const int*)>(eglGetProcAddress("eglGetPlatformDisplayEXT")); assert(getDisplay);
 const int displayAttributes[]={0x3203,0x3489,0x3038};
 void* display=getDisplay(0x3202,nullptr,displayAttributes);assert(display);
 EGL(eglInitialize,unsigned(*)(void*,int*,int*));
 int major=0,minor=0;assert(eglInitialize(display,&major,&minor));
 EGL(eglBindAPI,unsigned(*)(unsigned));assert(eglBindAPI(0x30A0));
 EGL(eglChooseConfig,unsigned(*)(void*,const int*,void**,int,int*));
 const int configAttributes[]={0x3033,1,0x3040,0x40,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3038};
 void* config=nullptr;int count=0;assert(eglChooseConfig(display,configAttributes,&config,1,&count)&&count==1);
 EGL(eglCreatePbufferSurface,void*(*)(void*,void*,const int*));
 const int surfaceAttributes[]={0x3057,64,0x3056,32,0x3038};
 void* surface=eglCreatePbufferSurface(display,config,surfaceAttributes);assert(surface);
 EGL(eglCreateContext,void*(*)(void*,void*,void*,const int*));
 const int contextAttributes[]={0x3098,3,0x3038};
 void* context=eglCreateContext(display,config,nullptr,contextAttributes);assert(context);
 EGL(eglMakeCurrent,unsigned(*)(void*,void*,void*,void*));assert(eglMakeCurrent(display,surface,surface,context));current=true;
 GL(glCreateShader,unsigned(*)(unsigned)); GL(glShaderSource,void(*)(unsigned,int,const char*const*,const int*));
 GL(glCompileShader,void(*)(unsigned)); GL(glGetShaderiv,void(*)(unsigned,unsigned,int*));
 GL(glCreateProgram,unsigned(*)()); GL(glAttachShader,void(*)(unsigned,unsigned));GL(glLinkProgram,void(*)(unsigned));
 GL(glGetProgramiv,void(*)(unsigned,unsigned,int*));GL(glUseProgram,void(*)(unsigned));
 auto shader=[&](unsigned kind,const char* source){unsigned s=glCreateShader(kind);glShaderSource(s,1,&source,nullptr);glCompileShader(s);int ok=0;glGetShaderiv(s,0x8B81,&ok);assert(ok);return s;};
 const char* vertex="#version 300 es\\nlayout(location=0) in vec2 p;layout(location=1) in vec2 shift;out vec3 c;void main(){gl_Position=vec4(p+shift,0,1);c=shift.x<0.0?vec3(1,0,0):vec3(0,0,1);}";
 const char* fragment="#version 300 es\\nprecision highp float;in vec3 c;out vec4 color;void main(){color=vec4(c,1);}";
 unsigned program=glCreateProgram();glAttachShader(program,shader(0x8B31,vertex));glAttachShader(program,shader(0x8B30,fragment));glLinkProgram(program);
 int linked=0;glGetProgramiv(program,0x8B82,&linked);assert(linked);glUseProgram(program);
 GL(glGenBuffers,void(*)(int,unsigned*));GL(glBindBuffer,void(*)(unsigned,unsigned));GL(glBufferData,void(*)(unsigned,std::ptrdiff_t,const void*,unsigned));
 GL(glGenVertexArrays,void(*)(int,unsigned*));GL(glBindVertexArray,void(*)(unsigned));
 GL(glVertexAttribPointer,void(*)(unsigned,int,unsigned,unsigned char,int,const void*));
 GL(glEnableVertexAttribArray,void(*)(unsigned));GL(glDisableVertexAttribArray,void(*)(unsigned));GL(glVertexAttrib2f,void(*)(unsigned,float,float));
 GL(glDrawArrays,void(*)(unsigned,int,int));GL(glViewport,void(*)(int,int,int,int));GL(glClearColor,void(*)(float,float,float,float));GL(glClear,void(*)(unsigned));
 GL(glReadPixels,void(*)(int,int,int,int,unsigned,unsigned,void*));GL(glGetError,unsigned(*)());
 gWebGL.glVertexAttribDivisor=symbol<decltype(gWebGL.glVertexAttribDivisor)>(gl,"glVertexAttribDivisor");
 gWebGL.glDrawElementsInstanced=symbol<decltype(gWebGL.glDrawElementsInstanced)>(gl,"glDrawElementsInstanced");
 gWebGL.glDrawArraysInstanced=symbol<decltype(gWebGL.glDrawArraysInstanced)>(gl,"glDrawArraysInstanced");
 unsigned vao=0,buffers[3]{};glGenVertexArrays(1,&vao);glBindVertexArray(vao);glGenBuffers(3,buffers);
 const float vertices[]={-.3f,-.3f,.3f,-.3f,0,.3f};
 const float shifts[]={-.5f,0,.5f,0};const unsigned short indices[]={99,0,1,2};
 glBindBuffer(0x8892,buffers[0]);glBufferData(0x8892,sizeof(vertices),vertices,0x88E4);glVertexAttribPointer(0,2,0x1406,0,0,nullptr);glEnableVertexAttribArray(0);
 glBindBuffer(0x8892,buffers[1]);glBufferData(0x8892,sizeof(shifts),shifts,0x88E4);glVertexAttribPointer(1,2,0x1406,0,0,nullptr);
 glBindBuffer(0x8893,buffers[2]);glBufferData(0x8893,sizeof(indices),indices,0x88E4);
 glViewport(0,0,64,32);glClearColor(0,0,0,1);
 using Pixels=std::array<unsigned char,64*32*4>;
 auto read=[&](){Pixels pixels{};glReadPixels(0,0,64,32,0x1908,0x1401,pixels.data());assert(glGetError()==0);return pixels;};
 glClear(0x4000);const auto empty=read();
 glVertexAttrib2f(1,-.5f,0);glDrawArrays(4,0,3);const auto first=read();
 glVertexAttrib2f(1,.5f,0);glDrawArrays(4,0,3);const auto reference=read();assert(first!=empty&&reference!=first);
 glEnableVertexAttribArray(1);gea_three_webgl_vertex_attrib_divisor(1,1);
 glClear(0x4000);gea_three_webgl_draw_elements_instanced(4,3,0x1403,2,2);assert(read()==reference);
 glClear(0x4000);gea_three_webgl_draw_arrays_instanced(4,0,3,2);assert(read()==reference);
 glClear(0x4000);gea_three_webgl_draw_arrays_instanced(4,0,3,1);assert(read()==first);
 glClear(0x4000);gea_three_webgl_draw_arrays_instanced(4,0,3,0);gea_three_webgl_draw_elements_instanced(4,3,0x1403,2,0);assert(read()==empty);
 gea_three_webgl_vertex_attrib_divisor(1,2);gea_three_webgl_draw_arrays_instanced(4,0,3,4);assert(read()==reference);
 gea_three_webgl_vertex_attrib_divisor(1,0);glDisableVertexAttribArray(1);
 glClear(0x4000);glVertexAttrib2f(1,-.5f,0);glDrawArrays(4,0,3);assert(read()==first);
 current=false;gea_three_webgl_draw_arrays_instanced(4,0,3,2);assert(read()==first);
 std::puts("ANGLE/Metal: indexed and array instancing pixel-identical; offsets, counts 0/1/2, divisor 2 and reset passed");
}
`
execFileSync(process.env.CXX ?? 'clang++', ['-std=c++20', '-O1', '-x', 'c++', '-', '-o', binary], {
  input: source, env: { ...process.env, TMPDIR: path.dirname(binary) }, stdio: ['pipe', 'inherit', 'inherit'],
})
execFileSync(binary, [egl, gles], { stdio: 'inherit' })
