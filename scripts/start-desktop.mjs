import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import electron from 'electron';

const projectDirectory = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root: projectDirectory, server: { host: '127.0.0.1', port: 5173, strictPort: true } });
let child;
let stopping = false;

async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  if (child && child.exitCode === null && !child.killed) child.kill();
  await server.close();
  process.exitCode = code;
}

process.once('SIGINT', () => { void shutdown(130); });
process.once('SIGTERM', () => { void shutdown(143); });

try {
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Vite no publicó una dirección local.');
  const environment = { ...process.env, SOLIDFLOW_DEV_URL: `http://127.0.0.1:${address.port}/` };
  // Electron must launch in application mode even when the host uses this flag.
  delete environment.ELECTRON_RUN_AS_NODE;
  child = spawn(electron, [projectDirectory], { cwd: projectDirectory, stdio: 'inherit', windowsHide: true, env: environment });
  child.once('error', (error) => { console.error('No se pudo abrir Electron:', error.message); void shutdown(1); });
  child.once('exit', (code, signal) => { void shutdown(code ?? (signal ? 1 : 0)); });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await shutdown(1);
}
