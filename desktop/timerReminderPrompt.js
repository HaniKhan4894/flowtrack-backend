/**
 * Trackabi-style "Working right now?" prompt while timer is paused.
 */
const { BrowserWindow, ipcMain, screen } = require('electron');

const PROMPT_WIDTH = 400;
const PROMPT_HEIGHT = 168;
const COUNTDOWN_SEC = 20;

let promptWindow = null;
let countdownInterval = null;
let remainingSec = COUNTDOWN_SEC;
let responseHandler = null;

function buildHtml(seconds) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", system-ui, sans-serif;
    background: #1e1f24;
    color: #e8eaed;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.08);
    user-select: none;
    -webkit-app-region: drag;
  }
  .wrap { padding: 18px 20px 14px; }
  .title { font-size: 15px; font-weight: 600; margin-bottom: 6px; display: flex; align-items: center; gap: 10px; }
  .icon {
    width: 22px; height: 22px; border-radius: 50%;
    background: rgba(99,102,241,0.2); color: #818cf8;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 14px; flex-shrink: 0;
  }
  .subtitle { font-size: 13px; color: #9aa0a6; margin-left: 32px; margin-bottom: 14px; }
  .actions {
    display: flex; align-items: center; justify-content: flex-end; gap: 10px;
    -webkit-app-region: no-drag;
  }
  .countdown {
    width: 36px; height: 36px; border-radius: 50%;
    border: 2px solid #3b82f6;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; color: #60a5fa;
    margin-right: auto;
  }
  button {
    border: none; border-radius: 8px; padding: 8px 18px;
    font-size: 13px; font-weight: 600; cursor: pointer;
    background: rgba(255,255,255,0.06); color: #93c5fd;
  }
  button:hover { background: rgba(255,255,255,0.12); }
  button.primary { background: #4f46e5; color: #fff; }
  button.primary:hover { background: #6366f1; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="title"><span class="icon">⏱</span> Working right now?</div>
    <div class="subtitle">Want to start your timer?</div>
    <div class="actions">
      <div class="countdown" id="cd">${seconds}</div>
      <button class="primary" id="yes">Yes</button>
      <button id="no">No</button>
    </div>
  </div>
  <script>
    const { ipcRenderer } = require('electron');
    document.getElementById('yes').onclick = () => ipcRenderer.send('timer-reminder-response', 'yes');
    document.getElementById('no').onclick = () => ipcRenderer.send('timer-reminder-response', 'no');
  </script>
</body>
</html>`;
}

function clearCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

function closePrompt() {
    clearCountdown();
    if (promptWindow && !promptWindow.isDestroyed()) {
        promptWindow.close();
    }
    promptWindow = null;
    remainingSec = COUNTDOWN_SEC;
}

function isOpen() {
    return Boolean(promptWindow && !promptWindow.isDestroyed());
}

function show(onResponse) {
    if (isOpen()) {
        return;
    }

    responseHandler = onResponse;
    remainingSec = COUNTDOWN_SEC;

    const { workArea } = screen.getPrimaryDisplay();
    const x = workArea.x + workArea.width - PROMPT_WIDTH - 16;
    const y = workArea.y + workArea.height - PROMPT_HEIGHT - 16;

    promptWindow = new BrowserWindow({
        width: PROMPT_WIDTH,
        height: PROMPT_HEIGHT,
        x,
        y,
        frame: false,
        transparent: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        show: false,
        focusable: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    promptWindow.setMenuBarVisibility(false);
    promptWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildHtml(remainingSec))}`);

    promptWindow.once('ready-to-show', () => {
        if (promptWindow && !promptWindow.isDestroyed()) {
            promptWindow.show();
            promptWindow.focus();
        }
    });

    promptWindow.on('closed', () => {
        promptWindow = null;
        clearCountdown();
    });

    countdownInterval = setInterval(() => {
        remainingSec -= 1;
        if (remainingSec <= 0) {
            fireResponse('no');
            return;
        }
        if (promptWindow && !promptWindow.isDestroyed()) {
            promptWindow.webContents.executeJavaScript(
                `document.getElementById('cd').textContent = '${remainingSec}'`
            ).catch(() => undefined);
        }
    }, 1000);
}

function fireResponse(action) {
    const handler = responseHandler;
    responseHandler = null;
    closePrompt();
    if (typeof handler === 'function') {
        handler(action === 'yes' ? 'yes' : 'no');
    }
}

function registerIpc() {
    if (registerIpc.done) return;
    registerIpc.done = true;
    ipcMain.on('timer-reminder-response', (_event, action) => {
        fireResponse(action === 'yes' ? 'yes' : 'no');
    });
}

registerIpc();

module.exports = {
    show,
    close: closePrompt,
    isOpen,
};
