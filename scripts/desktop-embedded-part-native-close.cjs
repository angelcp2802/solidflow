'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const WM_CLOSE = 0x0010;
const TITLE = 'Cerrar documento';
const BUTTONS = Object.freeze(['Seguir editando', 'Cerrar sin guardar']);
const OWNER_TITLE_PREFIX = 'SolidFlow owned close test ';

// Test-only Win32 driver. It accepts exactly one HWND from the isolated
// Electron main process. Enumeration is restricted to that HWND's thread and
// to descendants of its exact owned Task Dialog. No desktop focus or input API.
// https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-close
// https://learn.microsoft.com/en-us/windows/win32/controls/bm-click
const WIN32_CLOSE = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class SolidFlowOwnedWindowClose
{
    const uint WmClose = 0x0010;
    const uint WmGetText = 0x000D;
    const uint BmClick = 0x00F5;
    const uint GwOwner = 4;
    const uint GaRoot = 2;
    const uint SmtoAbortIfHung = 2;
    const string DialogTitle = "Cerrar documento";
    const string KeepLabel = "Seguir editando";
    const string DiscardLabel = "Cerrar sin guardar";

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    [return: MarshalAs(UnmanagedType.Bool)]
    delegate bool EnumWindow(IntPtr window, IntPtr param);

    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsWindowEnabled(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll")] static extern bool EnumThreadWindows(uint thread, EnumWindow callback, IntPtr param);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumWindow callback, IntPtr param);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    static extern int GetWindowTextW(IntPtr window, StringBuilder text, int capacity);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    static extern int GetClassNameW(IntPtr window, StringBuilder text, int capacity);
    [DllImport("user32.dll", ExactSpelling = true)]
    static extern bool PostMessageW(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    static extern IntPtr SendMessageTimeoutW(IntPtr window, uint message, UIntPtr wParam,
        StringBuilder text, uint flags, uint timeout, out UIntPtr result);

    static string Title(IntPtr window)
    {
        var text = new StringBuilder(128);
        GetWindowTextW(window, text, text.Capacity);
        return text.ToString();
    }

    static string ClassName(IntPtr window)
    {
        var text = new StringBuilder(128);
        GetClassNameW(window, text, text.Capacity);
        return text.ToString();
    }

    static string ButtonLabel(IntPtr window)
    {
        var text = new StringBuilder(128);
        UIntPtr length;
        return SendMessageTimeoutW(window, WmGetText, new UIntPtr((uint)text.Capacity),
            text, SmtoAbortIfHung, 200, out length) != IntPtr.Zero ? text.ToString() : "";
    }

    static bool OnThread(IntPtr window, uint pid, uint thread)
    {
        uint actualPid;
        return IsWindow(window) && GetWindowThreadProcessId(window, out actualPid) == thread
            && actualPid == pid;
    }

    static void RequireOwner(IntPtr owner, uint pid, uint thread, string title)
    {
        if (!OnThread(owner, pid, thread) || GetAncestor(owner, GaRoot) != owner
            || GetWindow(owner, GwOwner) != IntPtr.Zero || Title(owner) != title)
            throw new InvalidOperationException("Lost exact isolated BrowserWindow ownership.");
    }

    static bool IsCloseDialog(IntPtr candidate, IntPtr owner, uint pid, uint thread)
    {
        return OnThread(candidate, pid, thread) && GetWindow(candidate, GwOwner) == owner
            && ClassName(candidate) == "#32770" && Title(candidate) == DialogTitle;
    }

    static List<IntPtr> CloseDialogs(IntPtr owner, uint pid, uint thread)
    {
        var matches = new List<IntPtr>();
        EnumThreadWindows(thread, delegate(IntPtr candidate, IntPtr unused) {
            if (IsCloseDialog(candidate, owner, pid, thread)) matches.Add(candidate);
            return matches.Count < 2;
        }, IntPtr.Zero);
        return matches;
    }

    static List<IntPtr> NamedButtons(IntPtr dialog, uint pid, uint thread, string label)
    {
        var matches = new List<IntPtr>();
        EnumChildWindows(dialog, delegate(IntPtr child, IntPtr unused) {
            if (OnThread(child, pid, thread) && GetAncestor(child, GaRoot) == dialog
                && ClassName(child) == "Button" && ButtonLabel(child) == label) matches.Add(child);
            return matches.Count < 2;
        }, IntPtr.Zero);
        return matches;
    }

    public static void Run(string rawHandle, string rawPid, string title, string decision)
    {
        const string prefix = "SolidFlow owned close test ";
        Guid nonce;
        if (title == null || !title.StartsWith(prefix, StringComparison.Ordinal)
            || !Guid.TryParseExact(title.Substring(prefix.Length), "D", out nonce)
            || (decision != "keep" && decision != "discard"))
            throw new InvalidOperationException("Invalid fixed native-close identity or decision.");
        var owner = new IntPtr(long.Parse(rawHandle, NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture));
        uint expectedPid = uint.Parse(rawPid, NumberStyles.None, CultureInfo.InvariantCulture);
        uint actualPid;
        uint thread = GetWindowThreadProcessId(owner, out actualPid);
        if (thread == 0 || actualPid != expectedPid) throw new InvalidOperationException("Unexpected native owner process.");
        RequireOwner(owner, expectedPid, thread, title);
        if (!IsWindowEnabled(owner) || IsWindowVisible(owner) || CloseDialogs(owner, expectedPid, thread).Count != 0)
            throw new InvalidOperationException("Expected the hidden test owner with no outstanding close prompt.");
        if (!PostMessageW(owner, WmClose, IntPtr.Zero, IntPtr.Zero))
            throw new InvalidOperationException("Windows rejected the owned WM_CLOSE.");

        var watch = Stopwatch.StartNew();
        while (watch.ElapsedMilliseconds < 6000)
        {
            RequireOwner(owner, expectedPid, thread, title);
            var dialogs = CloseDialogs(owner, expectedPid, thread);
            if (dialogs.Count > 1) throw new InvalidOperationException("Ambiguous owned close prompt.");
            if (dialogs.Count == 1 && IsWindowVisible(dialogs[0]))
            {
                IntPtr dialog = dialogs[0];
                var keep = NamedButtons(dialog, expectedPid, thread, KeepLabel);
                var discard = NamedButtons(dialog, expectedPid, thread, DiscardLabel);
                if (keep.Count > 1 || discard.Count > 1) throw new InvalidOperationException("Ambiguous close buttons.");
                if (keep.Count == 1 && discard.Count == 1)
                {
                    var chosen = decision == "keep" ? keep[0] : discard[0];
                    RequireOwner(owner, expectedPid, thread, title);
                    bool exactDialog = IsCloseDialog(dialog, owner, expectedPid, thread);
                    bool ownerEnabled = IsWindowEnabled(owner);
                    bool ownedThread = OnThread(chosen, expectedPid, thread);
                    bool dialogRoot = exactDialog && ownedThread && GetAncestor(chosen, GaRoot) == dialog;
                    bool visible = dialogRoot && IsWindowVisible(chosen);
                    bool enabled = dialogRoot && IsWindowEnabled(chosen);
                    bool buttonClass = dialogRoot && ClassName(chosen) == "Button";
                    bool expectedLabel = buttonClass && ButtonLabel(chosen) == (decision == "keep" ? KeepLabel : DiscardLabel);
                    if (!exactDialog || ownerEnabled || !ownedThread || !dialogRoot
                        || !visible || !enabled || !buttonClass || !expectedLabel)
                        throw new InvalidOperationException("Owned close selection rejected:"
                            + " exactDialog=" + exactDialog + " ownerEnabled=" + ownerEnabled
                            + " ownedThread=" + ownedThread + " dialogRoot=" + dialogRoot + " visible=" + visible
                            + " enabled=" + enabled + " buttonClass=" + buttonClass + " expectedLabel=" + expectedLabel);
                    if (!PostMessageW(chosen, BmClick, IntPtr.Zero, IntPtr.Zero))
                        throw new InvalidOperationException("Windows rejected the exact close-button action.");
                    Console.WriteLine("OWNED_WM_CLOSE_AND_TASK_DIALOG_ACTION_POSTED");
                    return;
                }
            }
            Thread.Sleep(25);
        }
        throw new TimeoutException("Exact owned close prompt or buttons were not visible.");
    }
}
'@
try {
    [SolidFlowOwnedWindowClose]::Run($env:SOLIDFLOW_CLOSE_HWND, $env:SOLIDFLOW_CLOSE_PID,
        $env:SOLIDFLOW_CLOSE_TITLE, $env:SOLIDFLOW_CLOSE_DECISION)
} catch {
    [Console]::Error.WriteLine("Native close driver: " + $_.Exception.GetBaseException().Message)
    exit 1
}
`;

function within(child, parent) {
  const relative = path.relative(parent, child);
  return !!relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function postOwnedNativeClose({ handle, markedTitle, decision, owned }) {
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot || !path.isAbsolute(systemRoot)) throw new Error('Windows system directory is required for the owned close driver.');
  const powershell = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const env = { ...process.env, TEMP: owned, TMP: owned,
    SOLIDFLOW_CLOSE_HWND: handle.toString(16), SOLIDFLOW_CLOSE_PID: String(process.pid),
    SOLIDFLOW_CLOSE_TITLE: markedTitle, SOLIDFLOW_CLOSE_DECISION: decision };
  const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(WIN32_CLOSE, 'utf16le').toString('base64')];
  return new Promise((resolve, reject) => {
    execFile(powershell, args, { cwd: owned, env, shell: false, windowsHide: true, timeout: 15000, maxBuffer: 4096 },
      (error, stdout, stderr) => {
        if (error || stdout.trim() !== 'OWNED_WM_CLOSE_AND_TASK_DIALOG_ACTION_POSTED') {
          const detail = stderr.split(/\r?\n/).find(line => line.startsWith('Native close driver: '))?.slice(0, 220);
          reject(new Error(detail || 'Owned Win32 close helper did not produce its exact receipt.'));
          return;
        }
        resolve();
      });
  });
}

function createNativeCloseDriver({ app, BaseWindow, getWindow, owned, token, check }) {
  check(process.platform === 'win32' && !!process.versions.electron, 'The native-close driver requires an owned Windows Electron child.');
  const isolated = fs.realpathSync.native(owned);
  check(within(isolated, fs.realpathSync.native(os.tmpdir())) && typeof token === 'string' && token.length > 0
    && JSON.parse(fs.readFileSync(path.join(isolated, '.test-owned.json'), 'utf8')).token === token
    && fs.realpathSync.native(app.getPath('userData')) === path.join(isolated, 'profile'),
  'Native close requires the exact launcher-owned profile and token.');
  let current = null;
  let completed = 0;

  async function request(decision) {
    const discard = decision === 'discard';
    check(!current && completed === (discard ? 1 : 0), 'Expected one native cancel followed by one native discard close.');
    const window = getWindow();
    // Electron's BrowserWindow inventory filters by the exact constructor
    // name, so the test's HiddenWindow subclass appears only in BaseWindow.
    const windows = BaseWindow.getAllWindows();
    const live = !!window && !window.isDestroyed();
    const hidden = live && !window.isVisible();
    const sameWrapper = windows.length === 1 && windows[0] === window;
    const productionDocument = live && window.webContents.getURL() === 'solidflow://app/index.html';
    const hookAvailable = live && !window.isWindowMessageHooked(WM_CLOSE);
    if (!hidden || !sameWrapper || !productionDocument || !hookAvailable) {
      const registeredIdMatches = live ? windows.filter(candidate => !candidate.isDestroyed() && candidate.id === window.id).length : 0;
      check(false, 'Expected exactly one hidden, owned production document window. ' + JSON.stringify({
        hasOwner: !!window, live, hidden, registeredCount: windows.length, sameWrapper, registeredIdMatches,
        productionDocument, hookAvailable,
      }));
    }
    const native = window.getNativeWindowHandle();
    check(Buffer.isBuffer(native) && (native.length === 8 || native.length === 4), 'Expected a native Windows handle from Electron.');
    const handle = native.length === 8 ? native.readBigUInt64LE() : BigInt(native.readUInt32LE());
    check(handle > 0n, 'Expected a non-null isolated HWND.');
    const originalTitle = window.getTitle();
    const markedTitle = OWNER_TITLE_PREFIX + randomUUID();
    const dialog = Promise.withResolvers(), unload = Promise.withResolvers(), closed = Promise.withResolvers();
    const attempt = { window, dialog, nativeCloseMessages: 0, closeEvents: 0, unloadPreventions: 0, closedEvents: 0, prompt: null };
    const contents = window.webContents;
    const onClose = () => { attempt.closeEvents++; };
    const onUnload = () => { attempt.unloadPreventions++; unload.resolve(); };
    const onClosed = () => { attempt.closedEvents++; closed.resolve(); };
    current = attempt;
    let timeout;
    try {
      window.hookWindowMessage(WM_CLOSE, () => { attempt.nativeCloseMessages++; });
      window.on('close', onClose);
      window.on('closed', onClosed);
      contents.on('will-prevent-unload', onUnload);
      window.setTitle(markedTitle);
      await postOwnedNativeClose({ handle, markedTitle, decision, owned: isolated });
      await Promise.race([
        Promise.all([dialog.promise, unload.promise, ...(discard ? [closed.promise] : [])]),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Expected owned native dialog response and close events.')), 6000); }),
      ]);
      check(attempt.nativeCloseMessages === 1 && attempt.closeEvents === 1 && attempt.unloadPreventions === 1
        && attempt.prompt?.result === (discard ? 1 : 0) && attempt.closedEvents === (discard ? 1 : 0)
        && window.isDestroyed() === discard,
      'Expected exactly one authentic WM_CLOSE, production unload prompt and selected native result.');
      completed++;
      return Object.freeze({ decision, message: 'WM_CLOSE', nativeDialogAction: 'BM_CLICK',
        nativeCloseMessages: attempt.nativeCloseMessages, closeEvents: attempt.closeEvents,
        unloadPreventions: attempt.unloadPreventions, closedEvents: attempt.closedEvents,
        destroyed: window.isDestroyed(), helperExited: true, prompt: attempt.prompt });
    } finally {
      clearTimeout(timeout);
      current = null;
      window.removeListener('close', onClose);
      window.removeListener('closed', onClosed);
      if (!window.isDestroyed()) {
        if (window.isWindowMessageHooked(WM_CLOSE)) window.unhookWindowMessage(WM_CLOSE);
        if (window.getTitle() === markedTitle) window.setTitle(originalTitle);
      }
      if (!contents.isDestroyed()) contents.removeListener('will-prevent-unload', onUnload);
    }
  }

  return Object.freeze({
    keepEditing: () => request('keep'),
    closeWithoutSaving: () => request('discard'),
    showMessageBoxSync(owner, options, original) {
      const attempt = current;
      check(attempt && owner === attempt.window && !attempt.prompt && attempt.nativeCloseMessages === 1
        && attempt.closeEvents === 1 && options?.type === 'question' && options.title === TITLE
        && options.message === 'Hay cambios sin guardar.' && options.defaultId === 0 && options.cancelId === 0
        && options.noLink === true && options.buttons?.length === BUTTONS.length
        && options.buttons.every((value, index) => value === BUTTONS[index]),
      'Unexpected production native unload prompt outside the owned close request.');
      const result = original(owner, options);
      attempt.prompt = Object.freeze({ title: options.title, buttons: BUTTONS,
        defaultId: options.defaultId, cancelId: options.cancelId, result });
      attempt.dialog.resolve();
      return result;
    },
  });
}

module.exports = Object.freeze({ createNativeCloseDriver });
