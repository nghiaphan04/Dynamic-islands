# Load WinRT assemblies and register types in PowerShell CLR
Add-Type -AssemblyName "System.Runtime.WindowsRuntime"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Register all WinRT types we will use
[void][System.Type]::GetType("Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime")
[void][System.Type]::GetType("Windows.Media.Control.GlobalSystemMediaTransportControlsSession, Windows.Media.Control, ContentType=WindowsRuntime")
[void][System.Type]::GetType("Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackInfo, Windows.Media.Control, ContentType=WindowsRuntime")
[void][System.Type]::GetType("Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime")
[void][System.Type]::GetType("Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus, Windows.Media.Control, ContentType=WindowsRuntime")
[void][System.Type]::GetType("Windows.Storage.Streams.Buffer, Windows.Storage.Streams, ContentType=WindowsRuntime")
[void][System.Type]::GetType("Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType=WindowsRuntime")
[void][System.Type]::GetType("Windows.Storage.Streams.InputStreamOptions, Windows.Storage.Streams, ContentType=WindowsRuntime")

try {
    # Lấy phương thức generic AsTask từ WindowsRuntimeSystemExtensions
    $asTaskMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | 
        Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*' } | 
        Select-Object -First 1

    if (-not $asTaskMethod) {
        Write-Output '{"status": "stopped", "debug": "AsTask method not found"}'
        exit
    }

    # 1. Gọi RequestAsync để lấy Session Manager
    $managerOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
    $genericAsTask = $asTaskMethod.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
    $managerTask = $genericAsTask.Invoke($null, @($managerOp))
    $manager = $managerTask.Result
    
    if (-not $manager) {
        Write-Output '{"status": "stopped"}'
        exit
    }

    $sessions = $manager.GetSessions()
    $size = if ($sessions.Size -ne $null) { $sessions.Size } else { $sessions.Count }
    if (-not $sessions -or $size -eq 0 -or $size -eq $null) {
        Write-Output '{"status": "stopped"}'
        exit
    }

    # Tìm session đang phát (Playing)
    $activeSession = $null
    foreach ($s in $sessions) {
        $playbackInfo = $s.GetPlaybackInfo()
        if ($playbackInfo -and $playbackInfo.PlaybackStatus.ToString() -eq 'Playing') {
            $activeSession = $s
            break
        }
    }

    # Nếu không tìm thấy session đang phát, lấy session đầu tiên có trong danh sách
    if (-not $activeSession) {
        foreach ($s in $sessions) {
            $activeSession = $s
            break
        }
    }

    if (-not $activeSession) {
        Write-Output '{"status": "stopped"}'
        exit
    }

    # 2. Gọi TryGetMediaPropertiesAsync để lấy thông tin bài hát
    $propsOp = $activeSession.TryGetMediaPropertiesAsync()
    $genericAsTaskProps = $asTaskMethod.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $propsTask = $genericAsTaskProps.Invoke($null, @($propsOp))
    $props = $propsTask.Result
    
    # Lấy trạng thái phát nhạc
    $playbackInfo = $activeSession.GetPlaybackInfo()
    $status = if ($playbackInfo) { $playbackInfo.PlaybackStatus.ToString() } else { "Stopped" }

    $base64Image = $null
    # 3. Trích xuất ảnh bìa Album/Video (Thumbnail)
    if ($props -and $props.Thumbnail) {
        try {
            $thumbnail = $props.Thumbnail
            
            # Mở luồng đọc ảnh
            $openOp = $thumbnail.OpenReadAsync()
            $genericAsTaskStream = $asTaskMethod.MakeGenericMethod([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
            $streamTask = $genericAsTaskStream.Invoke($null, @($openOp))
            $stream = $streamTask.Result
            
            if ($stream) {
                $streamSize = $stream.Size
                if ($streamSize -gt 0) {
                    # Tạo buffer để đọc dữ liệu
                    $buffer = New-Object Windows.Storage.Streams.Buffer($streamSize)
                    
                    # Tìm phương thức AsTask cho IAsyncOperationWithProgress
                    $asTaskWithProgressMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | 
                        Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperationWithProgress*' } | 
                        Select-Object -First 1
                    
                    $readOp = $stream.ReadAsync($buffer, $streamSize, [Windows.Storage.Streams.InputStreamOptions]::None)
                    $genericAsTaskRead = $asTaskWithProgressMethod.MakeGenericMethod([Windows.Storage.Streams.IBuffer], [System.UInt64])
                    $readTask = $genericAsTaskRead.Invoke($null, @($readOp))
                    $readResult = $readTask.Result
                    
                    if ($readResult) {
                        $reader = [Windows.Storage.Streams.DataReader]::FromBuffer($readResult)
                        $bytes = New-Object Byte[] $readResult.Length
                        $reader.ReadBytes($bytes)
                        $base64Image = "data:image/png;base64," + [Convert]::ToBase64String($bytes)
                    }
                }
            }
        } catch {
            $global:thumbError = $_.Exception.Message
        }
    }

    if ($props) {
        $result = @{
            status = $status.ToLower()
            title = $props.Title
            artist = $props.Artist
            album = $props.AlbumTitle
            image = $base64Image
            debug = $global:thumbError
        }
        Write-Output ($result | ConvertTo-Json -Compress)
    } else {
        Write-Output '{"status": "stopped"}'
    }
} catch {
    $err = $_.Exception.Message.Replace('"', '\"')
    $trace = $_.ScriptStackTrace.Replace('"', '\"').Replace("`r`n", " ")
    Write-Output "{\`"status\`": \`"error\`", \`"message\`": \`"$err\`", \`"trace\`": \`"$trace\`"}"
}
