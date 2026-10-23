const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID, createHash } = require('node:crypto');
const { TextDecoder } = require('node:util');

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_STEP_BYTES = 8 * 1024 * 1024;
const MAX_EXPORT_BYTES = 256 * 1024 * 1024;
const MAX_CSV_EXPORT_BYTES = 20 * 1024 * 1024;
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
// Read-only path capabilities never enter documentGrants or grant save access.
const sourceGrants = new Map();
const MAX_SOURCE_GRANTS = 512;

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

function requireSourceGrantId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new Error('Autorización de fuente no válida.');
  return value;
}
function sameSourceIdentity(a, b) { return a.dev === b.dev && a.ino === b.ino; }
function sameSourceState(a, b) {
  return sameSourceIdentity(a, b) && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}
// The capability authorizes a canonical pathname, permitting an editor's atomic
// replacement between reads. Within one read, path and handle identities must
// remain the same regular file; no renderer-supplied path reaches this helper.
async function readSourceGrant(event, grantId, grant) {
  let handle;
  try {
    assertSender(event);
    const canonical = await fs.realpath(grant.selectedPath);
    if (pathKey(canonical) !== pathKey(grant.canonicalPath) || pathKey(await fs.realpath(grant.canonicalPath)) !== pathKey(grant.canonicalPath)) throw new Error('Source path changed.');
    const before = await fs.lstat(grant.canonicalPath, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.ino <= 0n || before.size > BigInt(MAX_DOCUMENT_BYTES)) throw new Error('Source is not a bounded regular file.');
    handle = await fs.open(grant.canonicalPath, 'r');
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || !sameSourceState(before, opened)) throw new Error('Source changed before read.');
    const bytes = Buffer.alloc(Number(opened.size) + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = await handle.read(bytes, length, bytes.length - length, null);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (length !== Number(opened.size) || !sameSourceState(opened, after)) throw new Error('Source changed during read.');
    const current = await fs.lstat(grant.canonicalPath, { bigint: true });
    if (!current.isFile() || current.isSymbolicLink() || !sameSourceState(after, current)
      || pathKey(await fs.realpath(grant.selectedPath)) !== pathKey(grant.canonicalPath)
      || pathKey(await fs.realpath(grant.canonicalPath)) !== pathKey(grant.canonicalPath)) throw new Error('Source path changed during read.');
    // Decode an optional UTF-8 BOM for JSON consumption; the digest below is
    // still over the exact original bytes, including that BOM.
    const exact = bytes.subarray(0, length), content = new TextDecoder('utf-8', { fatal: true }).decode(exact);
    const sha256 = createHash('sha256').update(exact).digest('hex');
    assertSender(event);
    return { grantId, name: path.basename(grant.canonicalPath), content, sha256 };
  } catch {
    // Filesystem diagnostics can include absolute paths. Never send them to the
    // renderer, including failures after a native dialog or a path replacement.
    throw new Error('No se pudo leer la fuente autorizada; vuelve a elegirla.');
  } finally {
    if (handle) {
      try { await handle.close(); } catch { throw new Error('No se pudo cerrar la lectura de la fuente autorizada.'); }
    }
  }
}

function requireStepPath(filePath) {
  const extension = typeof filePath === 'string' ? path.extname(filePath).toLowerCase() : '';
  if (!['.step', '.stp'].includes(extension)) throw new Error('Selecciona un archivo .step o .stp.');
  return requireFilePath(filePath, extension.slice(1));
}

// The renderer owns full CAD schema/graph validation. This main-process gate
// admits only the bounded saved-document envelope, never native authority.
function isSavedDocumentEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  // Retain the existing v1 transport contract.
  if (value.version === 1) return Array.isArray(value.features);
  const fields = ['version', 'kind', 'id', 'revision', 'name', 'units', 'definitions', 'occurrences', 'mates', 'createdAt', 'updatedAt'];
  if (value.version !== 2 || value.kind !== 'assembly' || value.units !== 'mm' ||
      Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key)) ||
      Object.keys(value).some(key => !fields.includes(key))) return false;
  const text = (candidate, maximum) => typeof candidate === 'string' && candidate.trim().length > 0 && candidate.length <= maximum;
  const identifier = candidate => text(candidate, 128) && !/[\x00-\x1f\x7f]/.test(candidate);
  const stamp = candidate => {
    if (!text(candidate, 40)) return false;
    const date = new Date(candidate);
    return Number.isFinite(date.getTime()) && date.toISOString() === candidate;
  };
  return identifier(value.id) && identifier(value.revision) && text(value.name, 200) &&
    stamp(value.createdAt) && stamp(value.updatedAt) && Date.parse(value.updatedAt) >= Date.parse(value.createdAt) &&
    Array.isArray(value.definitions) && value.definitions.length <= 512 &&
    Array.isArray(value.occurrences) && value.occurrences.length <= 4096 &&
    Array.isArray(value.mates) && value.mates.length <= 4096;
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
    title: 'Abrir documento de SolidFlow', filters: [{ name: 'Documento SolidFlow', extensions: ['solidflow'] }], properties: ['openFile'],
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

handleFileOperation('source:choose', async (event, payload) => {
  if (payload !== undefined) throw new Error('Solicitud de fuente no válida.');
  if (sourceGrants.size >= MAX_SOURCE_GRANTS) throw new Error('Se ha alcanzado el límite de fuentes enlazadas.');
  let result;
  try {
    result = await dialog.showOpenDialog(mainWindow, {
      title: 'Elegir fuente enlazada de SolidFlow', filters: [{ name: 'Documento SolidFlow', extensions: ['solidflow'] }], properties: ['openFile'],
    });
  } catch { throw new Error('No se pudo elegir una fuente enlazada.'); }
  assertSender(event);
  if (result.canceled || !result.filePaths[0]) return null;
  let grant;
  try {
    const selectedPath = requireFilePath(result.filePaths[0], 'solidflow'), canonicalPath = await fs.realpath(selectedPath);
    requireFilePath(canonicalPath, 'solidflow');
    grant = { selectedPath, canonicalPath };
  } catch { throw new Error('No se pudo autorizar la fuente seleccionada.'); }
  assertSender(event);
  const grantId = randomUUID(), resultValue = await readSourceGrant(event, grantId, grant);
  assertSender(event);
  sourceGrants.set(grantId, grant);
  return resultValue;
});
handleFileOperation('source:read', async (event, payload) => {
  const grantId = requireSourceGrantId(payload), grant = sourceGrants.get(grantId);
  if (!grant) throw new Error('Autorización de fuente no disponible. Vuelve a elegirla.');
  const value = await readSourceGrant(event, grantId, grant);
  assertSender(event);
  return value;
});
// Releasing a capability is bounded synchronous cleanup, not a file operation.
// It must remain available while a dialog/read is pending. An already-authorized
// read may finish its snapshot but cannot reinsert a released grant.
ipcMain.handle('source:release', async (event, payload) => {
  assertSender(event);
  sourceGrants.delete(requireSourceGrantId(payload));
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
  if (!isSavedDocumentEnvelope(parsed)) throw new Error('Documento SolidFlow no válido.');
  let target;
  if (filePath !== undefined && filePath !== null) {
    requireFilePath(filePath, 'solidflow');
    target = documentGrants.get(pathKey(filePath));
    if (!target) throw new Error('Utiliza Guardar como para elegir la ubicación del documento.');
  } else {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: parsed.version === 2 ? 'Guardar ensamblaje' : 'Guardar pieza', defaultPath: suggestedPath(name, 'solidflow'), filters: [{ name: 'Documento SolidFlow', extensions: ['solidflow'] }],
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
  const maximum = format === 'csv' ? MAX_CSV_EXPORT_BYTES : MAX_EXPORT_BYTES;
  if (!['step', 'stl', 'csv'].includes(format) || !(data instanceof Uint8Array) || data.byteLength === 0 || data.byteLength > maximum) {
    throw new Error(`Exportación no válida o superior a ${format === 'csv' ? 20 : 256} MB.`);
  }
  // Own the exact view before yielding to the native dialog. Neither a mutable
  // renderer payload nor bytes outside its offset/length can change the write.
  const bytes = Buffer.from(data);
  if (format === 'csv') {
    try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new Error('El CSV debe contener texto UTF-8 válido.'); }
  }
  const result = await dialog.showSaveDialog(mainWindow, {
    title: format === 'csv' ? 'Exportar lista de materiales' : 'Exportar geometría',
    defaultPath: suggestedPath(name, format), filters: [{ name: format.toUpperCase(), extensions: [format] }],
  });
  if (result.canceled || !result.filePath) return null;
  assertSender(event);
  const target = requireFilePath(result.filePath, format);
  await atomicWrite(target, bytes);
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
  contents.on('will-prevent-unload', (event) => {
    if (window.isDestroyed() || mainWindow !== window || window.webContents !== contents) return;
    try {
      const response = dialog.showMessageBoxSync(window, {
        type: 'question', title: 'Cerrar documento', message: 'Hay cambios sin guardar.',
        detail: 'Guarda el documento antes de cerrar si quieres conservar los cambios en un archivo. Las vistas previas sin aplicar se perderán.',
        buttons: ['Seguir editando', 'Cerrar sin guardar'], defaultId: 0, cancelId: 0, noLink: true,
      });
      // Electron blocks this unload by default. Explicitly ignoring the
      // renderer's prevention requires the second native button, never Escape.
      if (response === 1 && !window.isDestroyed() && mainWindow === window && window.webContents === contents) event.preventDefault();
    } catch (error) {
      // Keep unload prevented when the confirmation itself cannot be shown.
      console.error('No se pudo confirmar el cierre del documento:', error);
    }
  });
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  contents.session.setPermissionCheckHandler(() => false);
  window.once('ready-to-show', () => { if (!window.isDestroyed()) window.show(); });
  window.on('closed', () => { if (mainWindow === window) mainWindow = null; documentGrants.clear(); sourceGrants.clear(); });
  await window.loadURL(expectedDocumentUrl);
}

app.whenReady().then(async () => { registerApplicationProtocol(); await createWindow(); }).catch((error) => {
  console.error('No se pudo iniciar SolidFlow:', error);
  dialog.showErrorBox('SolidFlow no se pudo iniciar', error.message);
  app.quit();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow().catch((error) => dialog.showErrorBox('No se pudo abrir SolidFlow', error.message)); });
