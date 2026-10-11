const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_STEP_BYTES = 8 * 1024 * 1024;
const MAX_EXPORT_BYTES = 256 * 1024 * 1024;
const DIST_PATH = path.resolve(__dirname, '../dist');
const APP_URL = 'solidflow://app/index.html';
const DOCUMENT_CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
// This shipped Emscripten build creates Embind adapters with new Function.
// Permit that only inside the isolated CAD worker, which has no IPC bridge.
const KERNEL_CSP = "default-src 'none'; script-src 'self' 'unsafe-eval'; connect-src 'self'; object-src 'none'";
let mainWindow;
let expectedDocumentUrl;
let fileOperationRunning = false;
// Only paths chosen through this window's native dialogs grant write access.
const documentGrants = new Map();

app.setName('SolidFlow');
protocol.registerSchemesAsPrivileged([
  { scheme: 'solidflow', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, codeCache: true } },
]);

function getDevelopmentUrl() {
  if (app.isPackaged || !process.env.SOLIDFLOW_DEV_URL) return null;
  const url = new URL(process.env.SOLIDFLOW_DEV_URL);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash) {
    throw new Error('SOLIDFLOW_DEV_URL debe apuntar al servidor local de desarrollo.');
  }
  return url.href;
}

function isExpectedDocument(candidate) {
  try {
    const actual = new URL(candidate);
    const expected = new URL(expectedDocumentUrl);
    actual.hash = '';
    expected.hash = '';
    return actual.href === expected.href;
  } catch { return false; }
}

function assertSender(event) {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents ||
      !event.senderFrame || event.senderFrame !== mainWindow.webContents.mainFrame ||
      !isExpectedDocument(event.senderFrame.url)) {
    throw new Error('Solicitud de archivo no autorizada.');
  }
}

function pathKey(filePath) {
  const normalized = path.resolve(filePath);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function requireFilePath(filePath, extension) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || filePath.includes('\0') ||
      path.extname(filePath).toLowerCase() !== `.${extension}`) {
    throw new Error(`La extensión debe ser .${extension}.`);
  }
  return path.resolve(filePath);
}

function suggestedPath(name, extension) {
  let base = typeof name === 'string' ? name : 'Pieza';
  base = base.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().replace(/[. ]+$/g, '').slice(0, 120);
  if (!base || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) base = 'Pieza';
  return path.join(app.getPath('documents'), `${base}.${extension}`);
}

async function atomicWrite(target, data) {
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  let handle;
  let created = false;
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    created = true;
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporary, target);
  } finally {
    if (handle) await handle.close().catch(() => {});
    if (created) await fs.unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') console.error('No se pudo limpiar el archivo temporal:', error.message); });
  }
}

async function readBoundedFile(filePath, limit, description) {
  const handle = await fs.open(filePath, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) throw new Error(description);
    // Bound the read even if a different process grows the file after stat.
    const bytes = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, null);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length !== stat.size) throw new Error('El archivo cambió durante la lectura. Vuelve a abrirlo.');
    return bytes.subarray(0, length);
  } finally { await handle.close(); }
}

async function readDocument(filePath) {
  return (await readBoundedFile(filePath, MAX_DOCUMENT_BYTES, 'El documento debe ser un archivo de hasta 20 MB.')).toString('utf8');
}

function requireStepPath(filePath) {
  const extension = typeof filePath === 'string' ? path.extname(filePath).toLowerCase() : '';
  if (!['.step', '.stp'].includes(extension)) throw new Error('Selecciona un archivo .step o .stp.');
  return requireFilePath(filePath, extension.slice(1));
}

function handleFileOperation(channel, operation) {
  ipcMain.handle(channel, async (event, payload) => {
    assertSender(event);
    if (fileOperationRunning) throw new Error('Termina la operación de archivo actual antes de continuar.');
    fileOperationRunning = true;
    try { return await operation(event, payload); }
    finally { fileOperationRunning = false; }
  });
}

handleFileOperation('document:open', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Abrir pieza de SolidFlow', filters: [{ name: 'Pieza SolidFlow', extensions: ['solidflow'] }], properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  assertSender(event);
  const selectedPath = requireFilePath(result.filePaths[0], 'solidflow');
  const filePath = await fs.realpath(selectedPath);
  requireFilePath(filePath, 'solidflow');
  const content = await readDocument(filePath);
  assertSender(event);
  documentGrants.set(pathKey(filePath), filePath);
  return { path: filePath, content };
});

handleFileOperation('document:import-step', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importar sólido STEP', filters: [{ name: 'Sólido STEP', extensions: ['step', 'stp'] }], properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  assertSender(event);
  const selectedPath = requireStepPath(result.filePaths[0]);
  const filePath = await fs.realpath(selectedPath);
  requireStepPath(filePath);
  const bytes = await readBoundedFile(filePath, MAX_STEP_BYTES, 'El STEP debe ser un archivo de hasta 8 MB.');
  if (!bytes.length) throw new Error('El archivo STEP está vacío.');
  assertSender(event);
  // Import never grants write access to the selected neutral file or returns its path.
  return { name: path.basename(filePath), data: new Uint8Array(bytes) };
});

handleFileOperation('document:save', async (event, payload) => {
  if (!payload || typeof payload !== 'object') throw new Error('Documento no válido.');
  const { content, name, filePath } = payload;
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_DOCUMENT_BYTES) throw new Error('El documento supera los 20 MB admitidos.');
  let parsed;
  try { parsed = JSON.parse(content); } catch { throw new Error('El documento no contiene JSON válido.'); }
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.features)) throw new Error('Documento SolidFlow no válido.');
  let target;
  if (filePath !== undefined && filePath !== null) {
    requireFilePath(filePath, 'solidflow');
    target = documentGrants.get(pathKey(filePath));
    if (!target) throw new Error('Utiliza Guardar como para elegir la ubicación del documento.');
  } else {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Guardar pieza', defaultPath: suggestedPath(name, 'solidflow'), filters: [{ name: 'Pieza SolidFlow', extensions: ['solidflow'] }],
    });
    if (result.canceled || !result.filePath) return null;
    assertSender(event);
    target = requireFilePath(result.filePath, 'solidflow');
  }
  assertSender(event);
  await atomicWrite(target, content);
  documentGrants.set(pathKey(target), target);
  return target;
});

handleFileOperation('document:export', async (event, payload) => {
  if (!payload || typeof payload !== 'object') throw new Error('Exportación no válida.');
  const { data, name, format } = payload;
  if (!['step', 'stl'].includes(format) || !(data instanceof Uint8Array) || data.byteLength === 0 || data.byteLength > MAX_EXPORT_BYTES) {
    throw new Error('Exportación no válida o superior a 256 MB.');
  }
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exportar geometría', defaultPath: suggestedPath(name, format), filters: [{ name: format.toUpperCase(), extensions: [format] }],
  });
  if (result.canceled || !result.filePath) return null;
  assertSender(event);
  const target = requireFilePath(result.filePath, format);
  await atomicWrite(target, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  return target;
});

function registerApplicationProtocol() {
  protocol.handle('solidflow', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host !== 'app' || url.username || url.password || !['GET', 'HEAD'].includes(request.method)) return new Response('Forbidden', { status: 403 });
      const decodedPath = decodeURIComponent(url.pathname);
      if (decodedPath.includes('\0') || decodedPath.includes('\\')) return new Response('Forbidden', { status: 403 });
      const target = path.resolve(DIST_PATH, `.${decodedPath === '/' ? '/index.html' : decodedPath}`);
      const relative = path.relative(DIST_PATH, target);
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return new Response('Forbidden', { status: 403 });
      const response = await net.fetch(pathToFileURL(target).href, { method: request.method });
      const headers = new Headers(response.headers);
      const isKernelWorker = /^kernel\.worker-[\w-]+\.js$/.test(path.basename(target));
      headers.set('Content-Security-Policy', isKernelWorker ? KERNEL_CSP : DOCUMENT_CSP);
      headers.set('X-Content-Type-Options', 'nosniff');
      if (path.extname(target) === '.wasm') headers.set('Content-Type', 'application/wasm');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch { return new Response('Not found', { status: 404 }); }
  });
}

async function createWindow() {
  expectedDocumentUrl = getDevelopmentUrl() || APP_URL;
  const window = new BrowserWindow({
    width: 1560, height: 980, minWidth: 1040, minHeight: 700, backgroundColor: '#edf1f5', show: false,
    title: 'SolidFlow', icon: path.join(__dirname, '../build/icon.ico'), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false, webSecurity: true },
  });
  mainWindow = window;
  const contents = window.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => { if (!isExpectedDocument(url)) event.preventDefault(); });
  contents.on('will-redirect', (event, url) => { if (!isExpectedDocument(url)) event.preventDefault(); });
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  contents.session.setPermissionCheckHandler(() => false);
  window.once('ready-to-show', () => { if (!window.isDestroyed()) window.show(); });
  window.on('closed', () => { if (mainWindow === window) mainWindow = null; documentGrants.clear(); });
  await window.loadURL(expectedDocumentUrl);
}

app.whenReady().then(async () => { registerApplicationProtocol(); await createWindow(); }).catch((error) => {
  console.error('No se pudo iniciar SolidFlow:', error);
  dialog.showErrorBox('SolidFlow no se pudo iniciar', error.message);
  app.quit();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow().catch((error) => dialog.showErrorBox('No se pudo abrir SolidFlow', error.message)); });
