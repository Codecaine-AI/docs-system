const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, dialog, shell } = require('electron');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const optionValue = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const dev = process.argv.includes('--dev') || process.env.DOCS_DEV === '1';
const docsRoot = optionValue('--root') || process.env.DOCS_ROOT || 'docs';
const portValue = optionValue('--port') || process.env.DOCS_PORT || (dev ? '4803' : '4802');
const port = Number(portValue);
const uiPortValue = dev
  ? optionValue('--ui-port') || process.env.DOCS_UI_PORT || String(port + 1)
  : undefined;
const uiPort = dev ? Number(uiPortValue) : undefined;
const serverUrl = `http://127.0.0.1:${dev ? uiPort : port}/`;

let serverProcess;
let mainWindow;
let cancelServerPoll;
let quitting = false;
let childKilled = false;
let failureShown = false;

function killServer() {
  if (childKilled) return;
  childKilled = true;

  if (serverProcess?.pid && serverProcess.exitCode === null && serverProcess.signalCode === null) {
    serverProcess.kill('SIGTERM');
  }
}

function beginShutdown() {
  if (quitting) return;
  quitting = true;
  cancelServerPoll?.();
  killServer();
}

function quitWithError(title, message) {
  if (quitting || failureShown) return;
  failureShown = true;
  quitting = true;
  cancelServerPoll?.();
  killServer();
  dialog.showErrorBox(title, message);
  app.quit();
}

function startServer() {
  const args = [
    'packages/docs-cli/src/index.ts',
    'serve',
    '--root',
    docsRoot,
    ...(dev ? ['--dev'] : []),
    '--port',
    String(port),
    ...(dev ? ['--ui-port', String(uiPort)] : []),
  ];

  serverProcess = spawn('bun', args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  serverProcess.once('error', (error) => {
    if (error.code === 'ENOENT') {
      quitWithError(
        'Bun is required',
        'Could not start the docs server because bun is not installed or is not on PATH.',
      );
      return;
    }

    quitWithError('Could not start docs server', error.message);
  });

  serverProcess.once('exit', (code, signal) => {
    if (quitting || failureShown) return;
    const reason = signal ? `signal ${signal}` : `exit code ${code}`;
    quitWithError('Docs server crashed', `The docs server exited unexpectedly (${reason}).`);
  });
}

function waitForServer(timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let lastError = 'no response received';
    let request;
    let retryTimer;

    const timeoutTimer = setTimeout(() => finish(new Error(lastError)), timeoutMs);

    function finish(error) {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutTimer);
      clearTimeout(retryTimer);
      if (error) request?.destroy();
      cancelServerPoll = undefined;
      error ? reject(error) : resolve();
    }

    function attempt() {
      if (finished) return;

      const currentRequest = http.get(serverUrl, (response) => {
        response.resume();
        finish();
      });
      request = currentRequest;
      currentRequest.setTimeout(2_000, () => {
        currentRequest.destroy(new Error('request timed out'));
      });
      currentRequest.once('error', (error) => {
        lastError = error.message;
        if (!finished) retryTimer = setTimeout(attempt, 250);
      });
    }

    cancelServerPoll = () => finish(new Error('application is quitting'));
    attempt();
  });
}

function isLocalUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function openExternal(url) {
  void shell.openExternal(url).catch(() => {});
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 800,
    title: 'Docs Workbench',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocalUrl(url)) return { action: 'allow' };
    openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isLocalUrl(url)) return;
    event.preventDefault();
    openExternal(url);
  });

  void mainWindow.loadURL(serverUrl);
}

async function startApplication() {
  if (quitting) return;

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    quitWithError('Invalid docs server port', `Expected a port from 1 to 65535, received "${portValue}".`);
    return;
  }

  if (dev && (!Number.isInteger(uiPort) || uiPort < 1 || uiPort > 65_535)) {
    quitWithError('Invalid docs UI port', `Expected a port from 1 to 65535, received "${uiPortValue}".`);
    return;
  }

  startServer();

  try {
    await waitForServer();
  } catch (error) {
    if (quitting || failureShown) return;
    quitWithError(
      'Docs server did not start',
      `Timed out after 90 seconds waiting for ${serverUrl}\n\nLast error: ${error.message}`,
    );
    return;
  }

  if (!quitting) createWindow();
}

app.on('before-quit', beginShutdown);
app.on('quit', beginShutdown);
app.on('window-all-closed', () => app.quit());

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    beginShutdown();
    app.quit();
  });
}

void app.whenReady().then(startApplication).catch((error) => {
  quitWithError('Could not start Docs Workbench', error.message);
});
