$jdkHome = 'D:\Java JDK\jdk-21.0.9_windows-x64_bin\jdk-21.0.9'
$jdkBin = Join-Path $jdkHome 'bin'

# --- Machine PATH: gỡ forwarder Java 8 của Oracle, đưa jdk-21 lên đầu ---
$mPath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$parts = @($mPath -split ';' | Where-Object { $_ -and $_ -notmatch 'Oracle\\Java\\(java8path|javapath)$' })
$newPath = $jdkBin + ';' + ($parts -join ';')
[Environment]::SetEnvironmentVariable('Path', $newPath, 'Machine')
[Environment]::SetEnvironmentVariable('JAVA_HOME', $jdkHome, 'Machine')

# --- User PATH: đưa jdk-21 bin lên đầu, giữ nguyên phần còn lại ---
$uPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$uParts = @($uPath -split ';' | Where-Object { $_ -and $_ -ne $jdkBin })
$newUPath = $jdkBin + ';' + ($uParts -join ';')
[Environment]::SetEnvironmentVariable('Path', $newUPath, 'User')
[Environment]::SetEnvironmentVariable('JAVA_HOME', $jdkHome, 'User')

'OK'
