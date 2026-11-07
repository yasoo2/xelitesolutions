/**
 * THIS COMPUTER, AS JOE'S HANDS SEE IT (WINDOWS).
 *
 * The owner asks Joe to do things on his own machine: open an application,
 * fill a form in it, press its buttons, read what is on the screen. Joe acts
 * the way a person at the keyboard does, and looks before and after:
 *
 *   screenshot   every monitor, as one PNG, with the screen's origin, so a
 *                point Joe reads off the picture is the point he clicks
 *   ui           the foreground window's controls through UI Automation —
 *                each with its name, kind, place and what it can do — so a
 *                button is pressed by what it IS, not by a guessed pixel
 *   act          press / set a value / toggle / expand / select one of those
 *   click, type, key, scroll, move   the mouse and the keyboard, for what UI
 *                Automation cannot reach (a canvas, a game, a web page)
 *   windows, focus, open             which windows are open, bring one to
 *                the front, start an application / a file / an address
 *
 * Typing goes through SendInput with KEYEVENTF_UNICODE, one UTF-16 unit at a
 * time, so Arabic is typed as Arabic whatever the keyboard layout is.
 *
 * Everything runs as one Windows PowerShell 5.1 process per action, started
 * by the caller's executor (Joe's ExecutionGateway: the firewall, the run's
 * Stop and the audit apply). The C# helper is compiled once per machine into
 * the temp folder and loaded from there afterwards.
 */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const NL = String.fromCharCode(10);

export type PowerShellRunner =(script: string, timeoutMs: number) => Promise<{ exitCode: number | null; stdout: string; stderr: string }>;

const CS = String.raw`
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

public static class JoeDesktop {
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr p);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    delegate bool EnumProc(IntPtr h, IntPtr p);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint data, flags, time; public IntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort vk, scan; public uint flags, time; public IntPtr extra; }
    [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }

    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint flags);
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; public POINT(int x, int y) { X = x; Y = y; } }

    /* Per-monitor aware, so every rectangle and every cursor position is in
     * physical pixels; the old system-wide awareness when that is missing. */
    public static void Init() {
        try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return; } catch { }
        try { SetProcessDPIAware(); } catch { }
    }

    static IntPtr RootOf(IntPtr h) { return h == IntPtr.Zero ? h : GetAncestor(h, 2); }
    static string TitleOf(IntPtr h) { int len = GetWindowTextLength(h); StringBuilder t = new StringBuilder(len + 1); GetWindowText(h, t, len + 1); return t.ToString(); }

    /* ── THE GUARD: input reaches only the window Joe meant ──
     * 2026-11-07: a click computed with the wrong scale landed on the owner's
     * Claude window, and the keys that followed went into it. A click now
     * happens only when the point is on the window Joe named, keys only when
     * that window is the one in front; otherwise nothing is sent and the
     * answer says where the point or the focus really is. */
    public static string ClickIn(long handle, int x, int y, string button, int count) {
        if (handle != 0) {
            IntPtr at = RootOf(WindowFromPoint(new POINT(x, y)));
            if (at != RootOf(new IntPtr(handle))) return "REFUSED\tthe point " + x + "," + y + " is on «" + TitleOf(at) + "», not on the window asked for";
        }
        Click(x, y, button, count);
        return "OK";
    }
    public static string ScrollIn(long handle, int x, int y, int notches) {
        if (handle != 0 && RootOf(WindowFromPoint(new POINT(x, y))) != RootOf(new IntPtr(handle))) return "REFUSED\tthe point " + x + "," + y + " is not on the window asked for";
        Scroll(x, y, notches);
        return "OK";
    }
    static string FocusProblem(long handle) {
        if (handle == 0) return null;
        IntPtr fg = RootOf(GetForegroundWindow());
        return fg == RootOf(new IntPtr(handle)) ? null : "REFUSED\tthe window in front is «" + TitleOf(fg) + "», not the window asked for: bring it to the front first";
    }
    public static string TypeIn(long handle, string text) {
        for (int i = 0; i < text.Length; i += 16) {
            string problem = FocusProblem(handle);
            if (problem != null) return i == 0 ? problem : problem + " (stopped after " + i + " characters)";
            Type(text.Substring(i, Math.Min(16, text.Length - i)));
        }
        return "OK";
    }
    public static string KeysIn(long handle, ushort[] vks) {
        string problem = FocusProblem(handle);
        if (problem != null) return problem;
        Keys(vks);
        return "OK";
    }

    public static string Screenshot(string file) {
        Rectangle v = SystemInformation.VirtualScreen;
        using (Bitmap b = new Bitmap(v.Width, v.Height)) {
            using (Graphics g = Graphics.FromImage(b)) g.CopyFromScreen(v.Left, v.Top, 0, 0, b.Size);
            b.Save(file, ImageFormat.Png);
        }
        return v.Left + "," + v.Top + "," + v.Width + "," + v.Height;
    }

    /* A picture the model can read without being resized on the way: the
     * screen (or one window's rectangle) scaled down to at most maxW pixels
     * wide. Returns the region on the real screen and the picture's size, so
     * a point read off the picture maps back exactly. */
    public static string ScreenshotScaled(string file, int left, int top, int width, int height, int maxW) {
        if (width <= 0 || height <= 0) { Rectangle v = SystemInformation.VirtualScreen; left = v.Left; top = v.Top; width = v.Width; height = v.Height; }
        double s = width > maxW ? (double)maxW / width : 1.0;
        int ow = Math.Max(1, (int)Math.Round(width * s)), oh = Math.Max(1, (int)Math.Round(height * s));
        using (Bitmap full = new Bitmap(width, height)) {
            using (Graphics g = Graphics.FromImage(full)) g.CopyFromScreen(left, top, 0, 0, full.Size);
            using (Bitmap small = new Bitmap(ow, oh)) {
                using (Graphics g2 = Graphics.FromImage(small)) {
                    g2.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                    g2.DrawImage(full, 0, 0, ow, oh);
                }
                small.Save(file, ImageFormat.Png);
            }
        }
        return left + "," + top + "," + width + "," + height + "," + ow + "," + oh;
    }

    static INPUT Mouse(uint flags, uint data) { INPUT i = new INPUT(); i.type = 0; i.u.mi.flags = flags; i.u.mi.data = data; return i; }
    static INPUT Key(ushort vk, ushort scan, uint flags) { INPUT i = new INPUT(); i.type = 1; i.u.ki.vk = vk; i.u.ki.scan = scan; i.u.ki.flags = flags; return i; }
    static void Send(params INPUT[] a) { SendInput((uint)a.Length, a, Marshal.SizeOf(typeof(INPUT))); }

    public static void Click(int x, int y, string button, int count) {
        SetCursorPos(x, y);
        uint down = button == "right" ? 0x0008u : button == "middle" ? 0x0020u : 0x0002u;
        uint up = button == "right" ? 0x0010u : button == "middle" ? 0x0040u : 0x0004u;
        for (int n = 0; n < count; n++) { Send(Mouse(down, 0), Mouse(up, 0)); System.Threading.Thread.Sleep(60); }
    }
    public static void Move(int x, int y) { SetCursorPos(x, y); }
    public static void Drag(int x1, int y1, int x2, int y2) {
        SetCursorPos(x1, y1); Send(Mouse(0x0002, 0));
        for (int s = 1; s <= 12; s++) { SetCursorPos(x1 + (x2 - x1) * s / 12, y1 + (y2 - y1) * s / 12); System.Threading.Thread.Sleep(15); }
        Send(Mouse(0x0004, 0));
    }
    public static void Scroll(int x, int y, int notches) { SetCursorPos(x, y); Send(Mouse(0x0800, unchecked((uint)(notches * 120)))); }

    public static void Type(string text) {
        foreach (char c in text) {
            if (c == '\n') { Send(Key(0x0D, 0, 0), Key(0x0D, 0, 2)); continue; }
            if (c == '\r') continue;
            Send(Key(0, c, 0x0004), Key(0, c, 0x0004 | 0x0002));
        }
    }

    public static void Keys(ushort[] vks) {
        foreach (ushort vk in vks) Send(Key(vk, 0, IsExtended(vk) ? 1u : 0u));
        for (int n = vks.Length - 1; n >= 0; n--) Send(Key(vks[n], 0, (IsExtended(vks[n]) ? 1u : 0u) | 2u));
    }
    static bool IsExtended(ushort vk) { return (vk >= 0x21 && vk <= 0x28) || vk == 0x2D || vk == 0x2E || vk == 0x5B || vk == 0x5C; }

    public static string Windows() {
        StringBuilder o = new StringBuilder();
        IntPtr fg = GetForegroundWindow();
        EnumWindows(delegate (IntPtr h, IntPtr p) {
            if (!IsWindowVisible(h)) return true;
            int len = GetWindowTextLength(h); if (len == 0) return true;
            StringBuilder t = new StringBuilder(len + 1); GetWindowText(h, t, len + 1);
            uint pid; GetWindowThreadProcessId(h, out pid);
            RECT r; GetWindowRect(h, out r);
            if (r.R - r.L < 40 || r.B - r.T < 30) return true;
            string name = ""; try { name = Process.GetProcessById((int)pid).ProcessName; } catch { }
            o.Append(h.ToInt64()).Append('\t').Append(pid).Append('\t').Append(name).Append('\t')
             .Append(r.L).Append(',').Append(r.T).Append(',').Append(r.R - r.L).Append(',').Append(r.B - r.T).Append('\t')
             .Append(h == fg ? "1" : "0").Append('\t').Append(IsIconic(h) ? "1" : "0").Append('\t')
             .Append(t.ToString().Replace('\t', ' ').Replace('\n', ' ')).Append('\n');
            return true;
        }, IntPtr.Zero);
        return o.ToString();
    }

    public static bool Focus(long handle) {
        IntPtr h = new IntPtr(handle);
        if (IsIconic(h)) ShowWindow(h, 9);
        keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero);
        return SetForegroundWindow(h);
    }
    public static long Foreground() { return GetForegroundWindow().ToInt64(); }

    /* ── the controls of a window, through MSAA (IAccessible) ──
     * The managed UI Automation client saw every WinForms control on this
     * machine as a bare «Pane» with no pattern (measured, STA and MTA alike).
     * MSAA is what every Windows application answers: Win32, WinForms, WPF
     * through its bridge, Chrome and Edge, Office. */
    [DllImport("oleacc.dll")] static extern int AccessibleObjectFromWindow(IntPtr hwnd, uint id, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out object acc);
    [DllImport("oleacc.dll")] static extern int AccessibleChildren(Accessibility.IAccessible parent, int start, int count, [Out] object[] children, out int obtained);
    static Guid IID_IAccessible = new Guid("618736E0-3C3D-11CF-810C-00AA00389B71");
    const int SELF = 0;

    class Node { public Accessibility.IAccessible Acc; public object Child; }

    static string RoleName(int r) {
        switch (r) {
            case 43: return "Button"; case 42: return "Edit"; case 41: return "Text"; case 44: return "CheckBox"; case 45: return "RadioButton";
            case 46: return "ComboBox"; case 33: return "List"; case 34: return "ListItem"; case 30: return "Hyperlink"; case 12: return "MenuItem";
            case 11: return "Menu"; case 2: return "MenuBar"; case 37: return "TabItem"; case 60: return "Tab"; case 15: return "Document";
            case 10: return "Pane"; case 9: return "Window"; case 22: return "ToolBar"; case 36: return "Tree"; case 35: return "TreeItem";
            case 24: return "Table"; case 25: return "HeaderItem"; case 28: return "Row"; case 29: return "Cell"; case 40: return "Image";
            case 3: return "ScrollBar"; case 20: return "Group"; case 47: return "ProgressBar"; case 51: return "Slider"; case 52: return "Spinner";
            case 57: return "SplitButton"; case 62: return "SpinButton"; case 23: return "StatusBar"; case 4: return "Grip"; case 13: return "Separator";
            default: return "Role" + r;
        }
    }

    static string Safe(Func<string> f) { try { string s = f(); return s == null ? "" : s.Replace('\t', ' ').Replace('\r', ' ').Replace('\n', ' '); } catch { return ""; } }

    /** Breadth first, visible controls only, numbered from 1; target > 0 stops at that number. */
    static List<Node> Walk(long handle, int limit, int target, out string window) {
        window = "";
        List<Node> outList = new List<Node>();
        object rootObj;
        if (AccessibleObjectFromWindow(new IntPtr(handle), 0xFFFFFFFC, ref IID_IAccessible, out rootObj) != 0 || rootObj == null) return outList;
        Accessibility.IAccessible root = (Accessibility.IAccessible)rootObj;
        window = Safe(() => root.get_accName(SELF));
        Queue<Accessibility.IAccessible> q = new Queue<Accessibility.IAccessible>();
        q.Enqueue(root);
        int seen = 0;
        while (q.Count > 0 && outList.Count < limit) {
            Accessibility.IAccessible p = q.Dequeue();
            int count = 0; try { count = p.accChildCount; } catch { }
            if (count <= 0 || count > 2000) continue;
            object[] kids = new object[count]; int got = 0;
            try { AccessibleChildren(p, 0, count, kids, out got); } catch { continue; }
            for (int k = 0; k < got && outList.Count < limit; k++) {
                Node n = new Node();
                Accessibility.IAccessible asAcc = kids[k] as Accessibility.IAccessible;
                if (asAcc != null) { n.Acc = asAcc; n.Child = SELF; } else { n.Acc = p; n.Child = kids[k]; }
                int state = 0; try { state = Convert.ToInt32(n.Acc.get_accState(n.Child)); } catch { }
                if ((state & 0x8000) != 0) continue;           // invisible
                if (asAcc != null) q.Enqueue(asAcc);
                if ((state & 0x10000) != 0) continue;          // offscreen
                int l = 0, t = 0, w = 0, h = 0; try { n.Acc.accLocation(out l, out t, out w, out h, n.Child); } catch { }
                if (w <= 0 || h <= 0) continue;
                outList.Add(n);
                seen++;
                if (target > 0 && seen == target) return outList;
            }
        }
        return outList;
    }

    /* ── where MSAA's rectangles really are on the screen ──
     * For a window that is not DPI-aware, MSAA answers in that window's own
     * scaled units, while the cursor moves in physical pixels (measured: at
     * 150% a text box read at 410,269 was really at about 615,404, and the
     * click landed on another window). The window object's own MSAA rectangle
     * against GetWindowRect gives the scale and the offset, whatever they are. */
    struct Map { public double sx, sy; public int lx, ly, px, py; }
    static Map Calibrate(long handle) {
        Map m = new Map(); m.sx = 1; m.sy = 1;
        try {
            object o;
            if (AccessibleObjectFromWindow(new IntPtr(handle), 0, ref IID_IAccessible, out o) != 0 || o == null) return m;
            Accessibility.IAccessible win = (Accessibility.IAccessible)o;
            int l, t, w, h; win.accLocation(out l, out t, out w, out h, SELF);
            RECT r; GetWindowRect(new IntPtr(handle), out r);
            if (w <= 0 || h <= 0 || r.R <= r.L || r.B <= r.T) return m;
            m.sx = (double)(r.R - r.L) / w; m.sy = (double)(r.B - r.T) / h;
            m.lx = l; m.ly = t; m.px = r.L; m.py = r.T;
        } catch { }
        return m;
    }
    static int[] Physical(Map m, int l, int t, int w, int h) {
        return new int[] { m.px + (int)Math.Round((l - m.lx) * m.sx), m.py + (int)Math.Round((t - m.ly) * m.sy), (int)Math.Round(w * m.sx), (int)Math.Round(h * m.sy) };
    }

    public static string Ui(long handle, int limit) {
        string window;
        List<Node> nodes = Walk(handle, limit, 0, out window);
        Map map = Calibrate(handle);
        StringBuilder o = new StringBuilder();
        o.Append("WINDOW\t").Append(window).Append('\n');
        int i = 0;
        foreach (Node n in nodes) {
            i++;
            int role = 0; try { role = Convert.ToInt32(n.Acc.get_accRole(n.Child)); } catch { }
            int state = 0; try { state = Convert.ToInt32(n.Acc.get_accState(n.Child)); } catch { }
            int l = 0, t = 0, w = 0, h = 0; try { n.Acc.accLocation(out l, out t, out w, out h, n.Child); } catch { }
            int[] p = Physical(map, l, t, w, h); l = p[0]; t = p[1]; w = p[2]; h = p[3];
            string action = Safe(() => n.Acc.get_accDefaultAction(n.Child));
            string value = Safe(() => n.Acc.get_accValue(n.Child));
            List<string> can = new List<string>();
            if (action.Length > 0) can.Add("Invoke");
            if (role == 42 || role == 46) can.Add("Value");
            if (role == 44) can.Add("Toggle");
            if ((state & 0x100000) != 0) can.Add("Focusable");
            o.Append(i).Append('\t').Append(RoleName(role)).Append('\t').Append(Safe(() => n.Acc.get_accName(n.Child))).Append('\t').Append(action).Append('\t')
             .Append(l).Append(',').Append(t).Append(',').Append(w).Append(',').Append(h).Append('\t').Append(string.Join("|", can.ToArray())).Append('\t')
             .Append((state & 0x1) != 0 ? "0" : "1").Append('\t').Append(value).Append('\n');
        }
        return o.ToString();
    }

    public static string Act(long handle, int index, string action, string value, int limit) {
        string window;
        List<Node> nodes = Walk(handle, limit, index, out window);
        if (nodes.Count < index) return "NOTFOUND";
        Node n = nodes[index - 1];
        if (action == "invoke") n.Acc.accDoDefaultAction(n.Child);
        else if (action == "set_value") n.Acc.set_accValue(n.Child, value);
        else if (action == "focus" || action == "select") n.Acc.accSelect(action == "focus" ? 0x1 : 0x3, n.Child);
        else if (action == "toggle") n.Acc.accDoDefaultAction(n.Child);
        else return "UNKNOWN_ACTION";
        return "OK\t" + Safe(() => n.Acc.get_accName(n.Child));
    }

    /* ── THE HOST: one process that answers every action ──
     * One PowerShell per action spent 1.5 s starting and 2-3 s loading this
     * helper before it did anything (measured). The host loads once and
     * answers over a private named pipe: one line in, one line out. Strings
     * travel as base64 of UTF-8, numbers as they are, fields by tab. It ends
     * by itself after idleMs with no connection. */
    static string B64(string s) { return Convert.ToBase64String(Encoding.UTF8.GetBytes(s ?? "")); }
    static string Un64(string s) { return Encoding.UTF8.GetString(Convert.FromBase64String(s ?? "")); }
    static int I(string[] f, int k) { return k < f.Length ? int.Parse(f[k]) : 0; }
    static long L(string[] f, int k) { return k < f.Length ? long.Parse(f[k]) : 0; }

    public static string Dispatch(string line) {
        string[] f = line.Split('\t');
        switch (f[0]) {
            case "ping": return "pong";
            case "windows": return Windows();
            case "look": return "LOOK\t" + ScreenshotScaled(Un64(f[1]), I(f, 2), I(f, 3), I(f, 4), I(f, 5), I(f, 6));
            case "lookdata": return "LOOKDATA\t" + LookData(I(f, 1), I(f, 2), I(f, 3), I(f, 4), I(f, 5));
            case "focus": return "FOCUS\t" + Focus(L(f, 1));
            case "click": return ClickIn(L(f, 1), I(f, 2), I(f, 3), Un64(f[4]), I(f, 5));
            case "move": Move(I(f, 1), I(f, 2)); return "OK";
            case "drag": Drag(I(f, 1), I(f, 2), I(f, 3), I(f, 4)); return "OK";
            case "scroll": return ScrollIn(L(f, 1), I(f, 2), I(f, 3), I(f, 4));
            case "type": return TypeIn(L(f, 1), Un64(f[2]));
            case "key": {
                string[] parts = f[2].Split(',');
                ushort[] vks = new ushort[parts.Length];
                for (int k = 0; k < parts.Length; k++) vks[k] = ushort.Parse(parts[k]);
                return KeysIn(L(f, 1), vks);
            }
            case "open": {
                ProcessStartInfo si = new ProcessStartInfo(Un64(f[1])); si.UseShellExecute = true;
                Process.Start(si); return "OK";
            }
            case "ui": return Ui(L(f, 1) == 0 ? Foreground() : L(f, 1), I(f, 2));
            case "act": return Act(L(f, 1) == 0 ? Foreground() : L(f, 1), I(f, 2), Un64(f[3]), Un64(f[4]), I(f, 5));
            default: throw new Exception("unknown action " + f[0]);
        }
    }

    public static void Serve(string pipeName, int idleMs) {
        while (true) {
            using (System.IO.Pipes.NamedPipeServerStream server = new System.IO.Pipes.NamedPipeServerStream(pipeName, System.IO.Pipes.PipeDirection.InOut, 1, System.IO.Pipes.PipeTransmissionMode.Byte, System.IO.Pipes.PipeOptions.Asynchronous)) {
                IAsyncResult ar = server.BeginWaitForConnection(null, null);
                if (!ar.AsyncWaitHandle.WaitOne(idleMs)) return;
                server.EndWaitForConnection(ar);
                System.IO.StreamReader reader = new System.IO.StreamReader(server, new UTF8Encoding(false));
                System.IO.StreamWriter writer = new System.IO.StreamWriter(server, new UTF8Encoding(false));
                writer.AutoFlush = true;
                string line;
                try {
                    while ((line = reader.ReadLine()) != null) {
                        if (line == "quit") { writer.WriteLine("OK\t"); return; }
                        string res;
                        try { res = "OK\t" + B64(Dispatch(line)); } catch (Exception e) { res = "ERR\t" + B64(e.Message); }
                        writer.WriteLine(res);
                    }
                } catch (System.IO.IOException) { }
            }
        }
    }

    /* ── THE LINK: this computer, worked by the owner's Joe on another one ──
     * The computer calls out to Joe (nothing listens here), says what it is,
     * then answers each numbered line exactly as the pipe host does. Every
     * action is written to this window, so the person at this computer sees
     * what Joe does; closing the window ends the link. A picture travels
     * inline, since Joe cannot read a file on this disk. */
    public static string LookData(int left, int top, int width, int height, int maxW) {
        string file = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "joe-link-look-" + Process.GetCurrentProcess().Id + ".png");
        string frame = ScreenshotScaled(file, left, top, width, height, maxW <= 0 ? 1280 : maxW);
        string data = Convert.ToBase64String(System.IO.File.ReadAllBytes(file));
        try { System.IO.File.Delete(file); } catch { }
        return frame + "\t" + data;
    }

    static void LinkSend(System.Net.WebSockets.ClientWebSocket ws, string text) {
        byte[] b = Encoding.UTF8.GetBytes(text);
        ws.SendAsync(new ArraySegment<byte>(b), System.Net.WebSockets.WebSocketMessageType.Text, true, System.Threading.CancellationToken.None).Wait();
    }

    static string LinkReceive(System.Net.WebSockets.ClientWebSocket ws) {
        byte[] buf = new byte[65536];
        using (System.IO.MemoryStream ms = new System.IO.MemoryStream()) {
            while (true) {
                System.Net.WebSockets.WebSocketReceiveResult r = ws.ReceiveAsync(new ArraySegment<byte>(buf), System.Threading.CancellationToken.None).Result;
                if (r.MessageType == System.Net.WebSockets.WebSocketMessageType.Close) return null;
                ms.Write(buf, 0, r.Count);
                if (r.EndOfMessage) return Encoding.UTF8.GetString(ms.ToArray());
            }
        }
    }

    /* Returns why the link ended, for the window to say. */
    public static string Link(string url, string hello) {
        using (System.Net.WebSockets.ClientWebSocket ws = new System.Net.WebSockets.ClientWebSocket()) {
            ws.Options.KeepAliveInterval = TimeSpan.FromSeconds(20);
            try { ws.ConnectAsync(new Uri(url), System.Threading.CancellationToken.None).Wait(); }
            catch (Exception e) { return "could not reach Joe: " + (e.InnerException != null ? e.InnerException.Message : e.Message); }
            LinkSend(ws, "HELLO\t" + B64(hello));
            Console.WriteLine(DateTime.Now.ToString("HH:mm:ss") + "  connected");
            while (ws.State == System.Net.WebSockets.WebSocketState.Open) {
                string msg;
                try { msg = LinkReceive(ws); } catch (Exception) { return "the connection to Joe was lost"; }
                if (msg == null) return "Joe closed the link";
                int tab = msg.IndexOf('\t');
                if (tab <= 0) continue;
                string id = msg.Substring(0, tab), line = msg.Substring(tab + 1);
                if (line == "bye") return "the owner disconnected this computer";
                string res;
                try { res = "OK\t" + B64(Dispatch(line)); } catch (Exception e) { res = "ERR\t" + B64(e.Message); }
                Console.WriteLine(DateTime.Now.ToString("HH:mm:ss") + "  " + line.Split('\t')[0] + (res.StartsWith("OK") ? "" : "  (refused or failed)"));
                try { LinkSend(ws, id + "\t" + res); } catch (Exception) { return "the connection to Joe was lost"; }
            }
            return "the link ended";
        }
    }
}
`;

/** The helper's C# source, for a computer that compiles it itself (device-link.ts). */
export function helperSource(): string { return CS; }

/** The C# helper's file, named by its own hash so a changed helper is compiled again. */
export function helperDllPath(tmp: string = os.tmpdir()): string {
    const hash = crypto.createHash('sha256').update(CS).digest('hex').slice(0, 12);
    return path.join(tmp, `joe-desktop-${hash}.dll`);
}

/**
 * The helper's C# source, beside its DLL. It is compiled from this file, not
 * from the command line: inside -EncodedCommand it made the line longer than
 * Windows' 32,767 characters and PowerShell never started (measured).
 */
export function helperSourcePath(tmp: string = os.tmpdir()): string {
    return helperDllPath(tmp).replace(/\.dll$/u, '.cs');
}

/** Write the source once; a failure here only means the compile step reports it. */
export function ensureHelperSource(tmp: string = os.tmpdir()): string {
    const file = helperSourcePath(tmp);
    try { if (!fs.existsSync(file)) fs.writeFileSync(file, CS, 'utf8'); } catch { /* the script says the source is missing */ }
    return file;
}

/** PowerShell single-quoted: the only escape is a doubled quote. */
export function psQuote(s: string): string {
    return `'${String(s).replace(/'/gu, "''")}'`;
}

/** The lines that load the helper (compiling it the first time) and make the process DPI-aware. */
function prelude(dll: string, source: string): string {
    return [
        "$ErrorActionPreference = 'Stop'",
        'try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}',
        'Add-Type -AssemblyName System.Windows.Forms, System.Drawing',
        `$dll = ${psQuote(dll)}`,
        'if (-not ("JoeDesktop" -as [type])) {',
        '  if (-not (Test-Path $dll)) {',
        `    $cs = [System.IO.File]::ReadAllText(${psQuote(source)}, [System.Text.Encoding]::UTF8)`,
        '    try { Add-Type -TypeDefinition $cs -ReferencedAssemblies System.Windows.Forms, System.Drawing, Accessibility, System.Core -OutputAssembly $dll -OutputType Library } catch { if (-not (Test-Path $dll)) { throw } }',
        '  }',
        '  Add-Type -Path $dll',
        '}',
        '[JoeDesktop]::Init()',
    ].join('\n');
}

/* ───────────────────────── keys ───────────────────────── */

const VK: Record<string, number> = {
    ctrl: 0x11, control: 0x11, shift: 0x10, alt: 0x12, win: 0x5b, windows: 0x5b, cmd: 0x5b, meta: 0x5b,
    enter: 0x0d, return: 0x0d, tab: 0x09, esc: 0x1b, escape: 0x1b, space: 0x20, backspace: 0x08, delete: 0x2e, del: 0x2e, insert: 0x2d,
    home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22, up: 0x26, down: 0x28, left: 0x25, right: 0x27,
    capslock: 0x14, printscreen: 0x2c, menu: 0x5d,
};

/**
 * «ctrl+s», «alt+f4», «enter», «ctrl+shift+t», «f5» → virtual-key codes, in
 * press order. A letter or digit is its own key. Null for a name it does not know.
 */
export function keyCodes(combo: string): number[] | null {
    const parts = String(combo || '').toLowerCase().split('+').map(p => p.trim()).filter(Boolean);
    if (!parts.length || parts.length > 4) return null;
    const out: number[] = [];
    for (const p of parts) {
        if (VK[p] !== undefined) out.push(VK[p]);
        else if (/^f([1-9]|1[0-9]|2[0-4])$/u.test(p)) out.push(0x6f + Number(p.slice(1)));
        else if (/^[a-z0-9]$/u.test(p)) out.push(p.toUpperCase().charCodeAt(0));
        else return null;
    }
    return out;
}

/* ───────────────────────── the scripts ───────────────────────── */

export interface DesktopWindow { handle: number; pid: number; process: string; x: number; y: number; width: number; height: number; foreground: boolean; minimized: boolean; title: string }

export function parseWindows(text: string): DesktopWindow[] {
    const out: DesktopWindow[] = [];
    for (const line of String(text || '').split(/\r?\n/u)) {
        const f = line.split('\t');
        if (f.length < 7) continue;
        const [x, y, w, h] = f[3].split(',').map(Number);
        out.push({ handle: Number(f[0]), pid: Number(f[1]), process: f[2], x, y, width: w, height: h, foreground: f[4] === '1', minimized: f[5] === '1', title: f.slice(6).join(' ').trim() });
    }
    return out.filter(w => Number.isFinite(w.handle) && w.title);
}

export interface UiControl { index: number; kind: string; name: string; defaultAction: string; x: number; y: number; width: number; height: number; patterns: string[]; enabled: boolean; value: string }

export function parseUi(text: string): { window: string; controls: UiControl[] } {
    let window = '';
    const controls: UiControl[] = [];
    for (const line of String(text || '').split(/\r?\n/u)) {
        const f = line.split('\t');
        if (f[0] === 'WINDOW') { window = f.slice(1).join(' ').trim(); continue; }
        if (f.length < 7 || !/^\d+$/u.test(f[0])) continue;
        const [x, y, w, h] = f[4].split(',').map(Number);
        controls.push({ index: Number(f[0]), kind: f[1], name: f[2].trim(), defaultAction: f[3], x, y, width: w, height: h, patterns: f[5] ? f[5].split('|').filter(Boolean) : [], enabled: f[6] === '1', value: (f[7] || '').trim() });
    }
    return { window, controls };
}

/** One line per control, for the model: number, kind, name, what it can do, its centre. */
export function describeUi(ui: { window: string; controls: UiControl[] }, max = 150): string {
    const lines = ui.controls.slice(0, max).map(c => {
        const cx = Math.round(c.x + c.width / 2);
        const cy = Math.round(c.y + c.height / 2);
        const can = c.patterns.filter(p => /Invoke|Value|Toggle/u.test(p)).join(',');
        return `[${c.index}] ${c.kind} «${c.name}»${c.value ? ` = «${c.value.slice(0, 60)}»` : ''}${can ? ` (${can})` : ''}${c.enabled ? '' : ' (disabled)'} at ${cx},${cy}`;
    });
    const more = ui.controls.length > max ? `\n… and ${ui.controls.length - max} more` : '';
    return `Window «${ui.window}»: ${ui.controls.length} control(s)\n${lines.join('\n')}${more}`;
}

export type DesktopAction =
    | { op: 'screenshot'; file: string }
    | { op: 'look'; file: string; left?: number; top?: number; width?: number; height?: number; maxWidth?: number }
    | { op: 'windows' }
    | { op: 'focus'; handle: number }
    | { op: 'click'; x: number; y: number; button?: 'left' | 'right' | 'middle'; count?: number; window?: number }
    | { op: 'move'; x: number; y: number }
    | { op: 'drag'; x: number; y: number; toX: number; toY: number }
    | { op: 'scroll'; x: number; y: number; notches: number; window?: number }
    | { op: 'type'; text: string; window?: number }
    | { op: 'key'; codes: number[]; window?: number }
    | { op: 'open'; target: string }
    | { op: 'ui'; handle: number | null; limit: number }
    | { op: 'act'; handle: number | null; index: number; action: string; value: string; limit: number };

const int = (n: number) => String(Math.round(Number(n) || 0));

/** The whole PowerShell script for one action. */
export function desktopScript(a: DesktopAction, dll: string = helperDllPath(), source: string = helperSourcePath()): string {
    const body = ((): string => {
        switch (a.op) {
            case 'screenshot': return `'SHOT' + [char]9 + [JoeDesktop]::Screenshot(${psQuote(a.file)})`;
            case 'look': return `'LOOK' + [char]9 + [JoeDesktop]::ScreenshotScaled(${psQuote(a.file)}, ${int(a.left || 0)}, ${int(a.top || 0)}, ${int(a.width || 0)}, ${int(a.height || 0)}, ${int(a.maxWidth || 1280)})`;
            case 'windows': return '[JoeDesktop]::Windows()';
            case 'focus': return `'FOCUS' + [char]9 + [JoeDesktop]::Focus([long]${int(a.handle)})`;
            case 'click': return `[JoeDesktop]::ClickIn([long]${int(a.window || 0)}, ${int(a.x)}, ${int(a.y)}, ${psQuote(a.button || 'left')}, ${int(Math.max(1, Math.min(3, a.count || 1)))})`;
            case 'move': return `[JoeDesktop]::Move(${int(a.x)}, ${int(a.y)}); 'OK'`;
            case 'drag': return `[JoeDesktop]::Drag(${int(a.x)}, ${int(a.y)}, ${int(a.toX)}, ${int(a.toY)}); 'OK'`;
            case 'scroll': return `[JoeDesktop]::ScrollIn([long]${int(a.window || 0)}, ${int(a.x)}, ${int(a.y)}, ${int(a.notches)})`;
            case 'type': return `[JoeDesktop]::TypeIn([long]${int(a.window || 0)}, ${psQuote(a.text)})`;
            case 'key': return `[JoeDesktop]::KeysIn([long]${int(a.window || 0)}, [uint16[]]@(${a.codes.map(c => int(c)).join(',')}))`;
            case 'open': return `Start-Process ${psQuote(a.target)}; 'OK'`;
            case 'ui': return `[JoeDesktop]::Ui([long]${a.handle ? int(a.handle) : '[JoeDesktop]::Foreground()'}, ${int(Math.max(10, Math.min(400, a.limit)))})`;
            case 'act': return `[JoeDesktop]::Act([long]${a.handle ? int(a.handle) : '[JoeDesktop]::Foreground()'}, ${int(Math.max(1, a.index))}, ${psQuote(a.action)}, ${psQuote(a.value)}, ${int(Math.max(10, Math.min(400, a.limit)))})`;
        }
    })();
    return `${prelude(dll, source)}\n${body}`;
}

/** -EncodedCommand: the script as UTF-16LE base64, so nothing in it needs quoting for the command line. */
export function encodedCommand(script: string): string {
    return Buffer.from(script, 'utf16le').toString('base64');
}

/** Run one action through the caller's PowerShell runner. */
export async function runDesktop(run: PowerShellRunner, a: DesktopAction, timeoutMs = 60_000): Promise<{ ok: boolean; out: string; error?: string }> {
    ensureHelperSource();
    const r = await run(desktopScript(a), timeoutMs);
    const out = String(r.stdout || '').trim();
    //  The guard's refusal is an answer, not a crash: nothing was sent, and it says why.
    if (r.exitCode === 0 && /^REFUSED	/u.test(out)) return { ok: false, out, error: out.replace(/^REFUSED	/u, '') };
    if (r.exitCode === 0 && out === 'NOTFOUND') return { ok: false, out, error: 'that control number is not in the window any more: read the window again' };
    if (r.exitCode === 0) return { ok: true, out };
    return { ok: false, out, error: (String(r.stderr || '').trim() || out || `exit ${r.exitCode}`).slice(0, 600) };
}

/** Where a picture taken by «look» sits on the real screen, and how it was scaled. */
export interface LookFrame { left: number; top: number; width: number; height: number; pictureWidth: number; pictureHeight: number }

export function parseLook(out: string): LookFrame | null {
    const m = String(out || '').match(/LOOK\t(-?\d+),(-?\d+),(\d+),(\d+),(\d+),(\d+)/u);
    if (!m) return null;
    const [left, top, width, height, pictureWidth, pictureHeight] = m.slice(1).map(Number);
    return { left, top, width, height, pictureWidth, pictureHeight };
}

/** A point read off the picture → the point on the real screen. */
export function screenPoint(frame: LookFrame, x: number, y: number): { x: number; y: number } {
    const sx = frame.width / frame.pictureWidth;
    const sy = frame.height / frame.pictureHeight;
    return { x: Math.round(frame.left + x * sx), y: Math.round(frame.top + y * sy) };
}
