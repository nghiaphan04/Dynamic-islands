using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
using Windows.Foundation;
using Windows.Media.Control;
using Windows.Storage.Streams;

class MediaHelper
{
    static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        try
        {
            var manager = AwaitOp(GlobalSystemMediaTransportControlsSessionManager.RequestAsync());
            if (manager == null) { OutputStatus("stopped"); return 0; }

            var sessions = manager.GetSessions();
            if (sessions == null || sessions.Count == 0) { OutputStatus("stopped"); return 0; }

            GlobalSystemMediaTransportControlsSession active = FindActiveSession(sessions);
            if (active == null) { OutputStatus("stopped"); return 0; }

            string command = args.Length > 0 ? args[0].ToLower() : "get";

            if (command == "play") { AwaitOp(active.TryTogglePlayPauseAsync()); return 0; }
            if (command == "next") { AwaitOp(active.TrySkipNextAsync()); return 0; }
            if (command == "prev") { AwaitOp(active.TrySkipPreviousAsync()); return 0; }

            return OutputMediaInfo(active);
        }
        catch (Exception ex)
        {
            Console.WriteLine("{\"status\":\"error\",\"message\":\"" +
                              JsonEscape(ex.Message) + "\"}");
            return 1;
        }
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

    static int OutputMediaInfo(GlobalSystemMediaTransportControlsSession active)
    {
        var props = AwaitOp(active.TryGetMediaPropertiesAsync());
        var playbackInfo = active.GetPlaybackInfo();
        string status = playbackInfo != null ? playbackInfo.PlaybackStatus.ToString() : "Stopped";

        string base64 = null;
        if (props != null && props.Thumbnail != null)
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
            }
            catch { }
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
        sb.Append("}");
        Console.WriteLine(sb.ToString());
        return 0;
    }

    static void OutputStatus(string status)
    {
        Console.WriteLine("{\"status\":\"" + status + "\"}");
    }

    static T AwaitOp<T>(IAsyncOperation<T> op)
    {
        while (op.Status == AsyncStatus.Started) Thread.Sleep(10);
        return op.GetResults();
    }

    static T AwaitProgress<T, P>(IAsyncOperationWithProgress<T, P> op)
    {
        while (op.Status == AsyncStatus.Started) Thread.Sleep(10);
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
