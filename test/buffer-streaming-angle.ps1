param([Parameter(Mandatory=$true)][string]$AngleDirectory)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# An unpackaged validation process needs the UWP C++ runtime on its DLL path.
$runtime = Get-AppxPackage -AllUsers Microsoft.VCLibs.140.00 | Where-Object Architecture -eq 'X64' | Select-Object -First 1
if ($runtime) { $env:PATH = $runtime.InstallLocation + ';' + $env:PATH }

# Runs against the deployed Windows ANGLE DLLs, without rebuilding ANGLE or the
# compiler. Complements buffer-streaming-contract.test.mjs's exact-host tests
# with actual D3D11 copies/readback and non-aligned GL buffer sizes.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class BufferStreamingAngle {
  [DllImport("kernel32", CharSet=CharSet.Unicode)] static extern bool SetDllDirectory(string path);
  [DllImport("libGLESv2.dll", EntryPoint="EGL_GetDisplay") ] static extern IntPtr eglGetDisplay(IntPtr display);
  [DllImport("libGLESv2.dll", EntryPoint="EGL_Initialize") ] static extern int eglInitialize(IntPtr display, out int major, out int minor);
  [DllImport("libGLESv2.dll", EntryPoint="EGL_ChooseConfig") ] static extern int eglChooseConfig(IntPtr display, int[] attrs, out IntPtr config, int size, out int count);
  [DllImport("libGLESv2.dll", EntryPoint="EGL_CreateContext") ] static extern IntPtr eglCreateContext(IntPtr display, IntPtr config, IntPtr share, int[] attrs);
  [DllImport("libGLESv2.dll", EntryPoint="EGL_CreatePbufferSurface") ] static extern IntPtr eglCreatePbufferSurface(IntPtr display, IntPtr config, int[] attrs);
  [DllImport("libGLESv2.dll", EntryPoint="EGL_MakeCurrent") ] static extern int eglMakeCurrent(IntPtr display, IntPtr draw, IntPtr read, IntPtr context);
  [DllImport("libGLESv2.dll", EntryPoint="EGL_GetError") ] static extern int eglGetError();
  [DllImport("libGLESv2.dll", EntryPoint="EGL_Terminate") ] static extern int eglTerminate(IntPtr display);
  [DllImport("libGLESv2.dll")] static extern void glGenBuffers(int count, out uint buffer);
  [DllImport("libGLESv2.dll")] static extern void glDeleteBuffers(int count, ref uint buffer);
  [DllImport("libGLESv2.dll")] static extern void glBindBuffer(uint target, uint buffer);
  [DllImport("libGLESv2.dll")] static extern void glBufferData(uint target, IntPtr size, byte[] data, uint usage);
  [DllImport("libGLESv2.dll")] static extern void glBufferSubData(uint target, IntPtr offset, IntPtr size, byte[] data);
  [DllImport("libGLESv2.dll")] static extern void glCopyBufferSubData(uint from, uint to, IntPtr fromOffset, IntPtr toOffset, IntPtr size);
  [DllImport("libGLESv2.dll")] static extern IntPtr glMapBufferRange(uint target, IntPtr offset, IntPtr size, uint access);
  [DllImport("libGLESv2.dll")] static extern byte glUnmapBuffer(uint target);
  [DllImport("libGLESv2.dll")] static extern void glGetIntegerv(uint pname, out int result);
  [DllImport("libGLESv2.dll")] static extern void glGetBufferParameteriv(uint target, uint pname, out int result);
  [DllImport("libGLESv2.dll")] static extern uint glGetError();
  [DllImport("libGLESv2.dll")] static extern IntPtr glGetString(uint pname);
  static void Check(bool value, string message) {
    if (!value) throw new Exception(message + " EGL=0x" + eglGetError().ToString("x"));
  }
  static void CheckGL(string message) {
    uint error = glGetError();
    if(error != 0) throw new Exception(message + " GL=0x" + error.ToString("x"));
  }
  public static void Run(string directory) {
    Check(SetDllDirectory(directory), "SetDllDirectory");
    IntPtr display = eglGetDisplay(IntPtr.Zero);
    int major, minor, count;
    Check(eglInitialize(display, out major, out minor) != 0, "eglInitialize");
    IntPtr config;
    Check(eglChooseConfig(display, new int[] {0x3033,1,0x3040,0x40,0x3024,8,0x3023,8,0x3022,8,0x3038}, out config, 1, out count) != 0 && count > 0, "eglChooseConfig");
    IntPtr context = eglCreateContext(display, config, IntPtr.Zero, new int[] {0x3098,3,0x3038});
    Check(context != IntPtr.Zero, "eglCreateContext");
    IntPtr surface = eglCreatePbufferSurface(display, config, new int[] {0x3057,16,0x3056,16,0x3038});
    Check(surface != IntPtr.Zero && eglMakeCurrent(display,surface,surface,context) != 0, "eglMakeCurrent");
    string renderer = Marshal.PtrToStringAnsi(glGetString(0x1F01));
    Check(renderer.Contains("Direct3D11"), "Expected ANGLE D3D11, got " + renderer);
    int limit;
    glGetIntegerv(0x8A30, out limit);
    Check(limit >= 5280, "Uniform storage limit");
    Console.WriteLine(renderer + "; max uniform bytes=" + limit);
    foreach(int size in new int[] {1,2,3,4,15,17,5280,limit,limit+1}) {
      uint dest, uniformBinding, readBinding, writeBinding;
      glGenBuffers(1,out dest); glGenBuffers(1,out uniformBinding);
      glGenBuffers(1,out readBinding); glGenBuffers(1,out writeBinding);
      glBindBuffer(0x8892,dest);
      glBufferData(0x8892,(IntPtr)size,new byte[size],0x88E4);
      glBindBuffer(0x8A11,uniformBinding);
      glBindBuffer(0x8F36,readBinding); glBindBuffer(0x8F37,writeBinding);
      uint[] staging = new uint[3];
      for(int i=0;i<3;++i) {
        glGenBuffers(1,out staging[i]);
        glBindBuffer(0x8F36,staging[i]);
        glBufferData(0x8F36,(IntPtr)size,null,0x88E4);
      }
      byte[] expected = new byte[size];
      for(int round=0;round<7;++round) {
        for(int i=0;i<size;++i) expected[i]=(byte)((i*37+round*11)&255);
        glBindBuffer(0x8F36,staging[round%3]);
        if(size<=limit) {
          int uniform;
          glGetIntegerv(0x8A28,out uniform);
          glBindBuffer(0x8A11,staging[round%3]);
          glBufferSubData(0x8A11,IntPtr.Zero,(IntPtr)size,expected);
          glBindBuffer(0x8A11,(uint)uniform);
        } else glBufferSubData(0x8F36,IntPtr.Zero,(IntPtr)size,expected);
        glBindBuffer(0x8F37,dest);
        glCopyBufferSubData(0x8F36,0x8F37,IntPtr.Zero,IntPtr.Zero,(IntPtr)size);
        glBindBuffer(0x8F36,readBinding); glBindBuffer(0x8F37,writeBinding);
        CheckGL("copy bytes="+size);
      }
      int binding;
      glGetIntegerv(0x8A28,out binding); Check(binding==(int)uniformBinding,"uniform binding");
      glGetIntegerv(0x8F36,out binding); Check(binding==(int)readBinding,"read binding");
      glGetIntegerv(0x8F37,out binding); Check(binding==(int)writeBinding,"write binding");
      glGetBufferParameteriv(0x8892,0x8764,out binding); Check(binding==size,"destination size");
      IntPtr bytes = glMapBufferRange(0x8892,IntPtr.Zero,(IntPtr)size,1);
      CheckGL("map readback bytes="+size); Check(bytes!=IntPtr.Zero,"map readback");
      byte[] actual=new byte[size]; Marshal.Copy(bytes,actual,0,size);
      Check(glUnmapBuffer(0x8892)!=0,"unmap");
      for(int i=0;i<size;++i) Check(actual[i]==expected[i],"byte mismatch at "+i+" size "+size);
      foreach(uint value in staging) { uint mutable=value; glDeleteBuffers(1,ref mutable); }
      glDeleteBuffers(1,ref dest); glDeleteBuffers(1,ref uniformBinding);
      glDeleteBuffers(1,ref readBinding); glDeleteBuffers(1,ref writeBinding);
      CheckGL("cleanup");
      Console.WriteLine("PASS: "+size+" bytes, seven rotating copies, exact readback and restored bindings");
    }
    eglMakeCurrent(display,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);
    eglTerminate(display);
  }
}
'@
[BufferStreamingAngle]::Run((Resolve-Path $AngleDirectory).Path)
