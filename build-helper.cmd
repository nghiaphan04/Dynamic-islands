@echo off
REM Build media-helper.exe from media-helper.cs using the .NET Framework C# compiler.
REM No PowerShell or SDK required - uses csc.exe shipped with Windows.
setlocal

set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe

if not exist "%CSC%" (
  echo ERROR: csc.exe not found. .NET Framework 4.x is required.
  exit /b 1
)

set WINMD=%WINDIR%\System32\WinMetadata

"%CSC%" /nologo /target:exe /out:media-helper.exe ^
  /r:"%WINDIR%\Microsoft.NET\assembly\GAC_MSIL\System.Runtime.InteropServices.WindowsRuntime\v4.0_4.0.0.0__b03f5f7f11d50a3a\System.Runtime.InteropServices.WindowsRuntime.dll" ^
  /r:"%WINDIR%\Microsoft.NET\assembly\GAC_MSIL\System.Runtime\v4.0_4.0.0.0__b03f5f7f11d50a3a\System.Runtime.dll" ^
  /r:"%WINMD%\Windows.Media.winmd" ^
  /r:"%WINMD%\Windows.Storage.winmd" ^
  /r:"%WINMD%\Windows.Devices.winmd" ^
  /r:"%WINMD%\Windows.Foundation.winmd" ^
  media-helper.cs

if errorlevel 1 (
  echo Build failed.
  exit /b 1
)

echo media-helper.exe built successfully.
endlocal
