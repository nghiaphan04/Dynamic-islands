using System;
using System.Collections.Generic;
using System.Text;
using System.Threading;
using Windows.Foundation;
using Windows.Media.Control;
using Windows.Storage.Streams;

class MediaHelper
{
    static GlobalSystemMediaTransportControlsSessionManager _manager;
    static string _cachedTitle = "";
    static string _cachedImage;

    static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        try
        {
            if (args.Length > 0 && args[0].Equals("daemon", StringComparison.OrdinalIgnoreCase))
                return RunDaemon();
            return RunOnce(args);
        }
        catch (Exception ex)
        {
            Console.WriteLine("{\"status\":\"error\",\"message\":\"" +
                              JsonEscape(ex.Message) + "\"}");
            return 1;
        }
    }

    // Chế độ nền: đọc lệnh từ stdin (get/play/next/prev), trả JSON theo từng dòng
    static int RunDaemon()
    {
        string line;
        while ((line = Console.ReadLine()) != null)
        {
            try
            {
                string[] parts = line.Split(new char[] { ' ' }, 2);
                string cmd = parts.Length > 0 ? parts[0].Trim().ToLower() : "get";
                switch (cmd)
                {
                    case "get":
                        Console.WriteLine(GetMediaJson());
                        break;
                    case "play":
                    case "next":
                    case "prev":
                        SendControl(cmd);
                        Console.WriteLine("{\"ok\":true}");
                        break;
                    default:
                        Console.WriteLine("{\"status\":\"stopped\"}");
                        break;
                }
                Console.Out.Flush();
            }
            catch (Exception ex)
            {
                Console.WriteLine("{\"status\":\"error\",\"message\":\"" +
                                  JsonEscape(ex.Message) + "\"}");
                Console.Out.Flush();
            }
        }
        return 0;
    }

    static int RunOnce(string[] args)
    {
        string command = args.Length > 0 ? args[0].ToLower() : "get";

        var manager = GetManager();
        if (manager == null) { OutputStatus("stopped"); return 0; }

        var sessions = manager.GetSessions();
        if (sessions == null || sessions.Count == 0) { OutputStatus("stopped"); return 0; }

        var active = FindActiveSession(sessions);
        if (active == null) { OutputStatus("stopped"); return 0; }

        if (command == "play") { AwaitOp(active.TryTogglePlayPauseAsync()); return 0; }
        if (command == "next") { AwaitOp(active.TrySkipNextAsync()); return 0; }
        if (command == "prev") { AwaitOp(active.TrySkipPreviousAsync()); return 0; }

        Console.WriteLine(BuildMediaJson(active));
        return 0;
    }

    static GlobalSystemMediaTransportControlsSessionManager GetManager()
    {
        if (_manager == null)
            _manager = AwaitOp(GlobalSystemMediaTransportControlsSessionManager.RequestAsync());
        return _manager;
    }

    static GlobalSystemMediaTransportControlsSession FindActiveSession(
        IReadOnlyList<GlobalSystemMediaTransportControlsSession> sessions)
    {
        foreach (var s in sessions)
        {
            var pi = s.GetPlaybackInfo();
            if (pi != null &&
                pi.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing)
                return s;
        }
        foreach (var s in sessions) return s;
        return null;
    }

    static string GetMediaJson()
    {
        var manager = GetManager();
        if (manager == null) return "{\"status\":\"stopped\"}";

        var sessions = manager.GetSessions();
        if (sessions == null || sessions.Count == 0) return "{\"status\":\"stopped\"}";

        var active = FindActiveSession(sessions);
        if (active == null) return "{\"status\":\"stopped\"}";

        return BuildMediaJson(active);
    }

    static void SendControl(string command)
    {
        var manager = GetManager();
        if (manager == null) return;

        var sessions = manager.GetSessions();
        if (sessions == null || sessions.Count == 0) return;

        var active = FindActiveSession(sessions);
        if (active == null) return;

        if (command == "play") AwaitOp(active.TryTogglePlayPauseAsync());
        else if (command == "next") AwaitOp(active.TrySkipNextAsync());
        else if (command == "prev") AwaitOp(active.TrySkipPreviousAsync());
    }

    static string BuildMediaJson(GlobalSystemMediaTransportControlsSession active)
    {
        var props = AwaitOp(active.TryGetMediaPropertiesAsync());
        var playbackInfo = active.GetPlaybackInfo();
        string status = playbackInfo != null ? playbackInfo.PlaybackStatus.ToString() : "Stopped";

        long positionMs = 0, durationMs = 0;
        long lastUpdatedMs = 0;
        try
        {
            var timeline = active.GetTimelineProperties();
            if (timeline != null && timeline.EndTime.TotalMilliseconds > 0)
            {
                durationMs = (long)timeline.EndTime.TotalMilliseconds;
                positionMs = (long)timeline.Position.TotalMilliseconds;
                if (positionMs < 0) positionMs = 0;
                if (positionMs > durationMs) positionMs = durationMs;
                lastUpdatedMs = timeline.LastUpdatedTime.ToUnixTimeMilliseconds();
            }
        }
        catch { }

        string base64 = null;
        if (props != null && props.Thumbnail != null)
        {
            string currentTitle = props.Title ?? "";
            if (currentTitle == _cachedTitle)
            {
                // Cùng bài hát → tái sử dụng ảnh đã đọc, tránh re-encode base64 mỗi lần poll
                base64 = _cachedImage;
            }
            else
            {
                try
                {
                    using (var stream = AwaitOp(props.Thumbnail.OpenReadAsync()))
                    {
                        ulong size = stream.Size;
                        if (size > 0)
                        {
                            var buffer = new Windows.Storage.Streams.Buffer((uint)size);
                            var readBuffer = AwaitProgress(stream.ReadAsync(buffer, (uint)size, InputStreamOptions.None));
                            var reader = DataReader.FromBuffer(readBuffer);
                            var bytes = new byte[readBuffer.Length];
                            reader.ReadBytes(bytes);
                            base64 = "data:image/png;base64," + Convert.ToBase64String(bytes);
                        }
                    }
                    _cachedTitle = currentTitle;
                    _cachedImage = base64;
                }
                catch { }
            }
        }

        StringBuilder sb = new StringBuilder();
        sb.Append("{\"status\":\"").Append(JsonEscape(status.ToLower())).Append("\"");
        if (props != null)
        {
            sb.Append(",\"title\":\"").Append(JsonEscape(props.Title)).Append("\"");
            sb.Append(",\"artist\":\"").Append(JsonEscape(props.Artist)).Append("\"");
            sb.Append(",\"album\":\"").Append(JsonEscape(props.AlbumTitle)).Append("\"");
        }
        else
        {
            sb.Append(",\"title\":null,\"artist\":null,\"album\":null");
        }
        sb.Append(",\"image\":").Append(base64 == null ? "null" : "\"" + base64 + "\"");
        sb.Append(",\"position\":").Append(positionMs);
        sb.Append(",\"duration\":").Append(durationMs);
        sb.Append(",\"lastUpdated\":").Append(lastUpdatedMs);
        sb.Append("}");
        return sb.ToString();
    }

    static void OutputStatus(string status)
    {
        Console.WriteLine("{\"status\":\"" + status + "\"}");
    }

    static T AwaitOp<T>(IAsyncOperation<T> op)
    {
        while (op.Status == AsyncStatus.Started) Thread.Sleep(5);
        return op.GetResults();
    }

    static T AwaitProgress<T, P>(IAsyncOperationWithProgress<T, P> op)
    {
        while (op.Status == AsyncStatus.Started) Thread.Sleep(5);
        return op.GetResults();
    }

    static string JsonEscape(string s)
    {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();
        foreach (char c in s)
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 32) sb.Append("\\u").Append(((int)c).ToString("X4"));
                    else sb.Append(c);
                    break;
            }
        }
        return sb.ToString();
    }
}
