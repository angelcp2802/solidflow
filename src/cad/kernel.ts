import type { CadExportFormat, CadResult, Feature, KernelRequest, KernelResponse } from './kernel.types';

let worker: Worker | null = null;
let nextId = 0;
let generation = 0;
let initialization: Promise<void> | null = null;
const pending = new Map<number, {
  resolve: (value: CadResult | Blob | null) => void;
  reject: (error: Error) => void;
}>();

function getWorker(): Worker {
  if (worker) return worker;
  const activeWorker = new Worker(new URL('./kernel.worker.ts', import.meta.url), { type: 'module' });
  worker = activeWorker;
  activeWorker.onmessage = (event: MessageEvent<KernelResponse>) => {
    if (worker !== activeWorker) return;
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.ok) request.resolve(response.value);
    else request.reject(new Error(response.error));
  };
  activeWorker.onerror = (event) => {
    if (worker !== activeWorker) return;
    const error = new Error(event.message || 'El motor CAD dejó de responder. Vuelve a reconstruir la pieza.');
    pending.forEach((request) => request.reject(error));
    pending.clear();
    worker?.terminate();
    worker = null;
    initialization = null;
    generation++;
  };
  return worker;
}

type RequestInput = KernelRequest extends infer T
  ? T extends KernelRequest ? Omit<T, 'id'> : never
  : never;

function request<T extends CadResult | Blob | null>(input: RequestInput): Promise<T> {
  return new Promise((resolve, reject) => {
    const activeWorker = getWorker();
    const id = ++nextId;
    pending.set(id, { resolve: (value) => resolve(value as T), reject });
    try {
      activeWorker.postMessage({ ...input, id });
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}

export function initKernel(): Promise<void> {
  if (!initialization) {
    const initializing = request<null>({ action: 'init' })
      .then(() => undefined)
      .catch((error: unknown) => {
        if (initialization === initializing) initialization = null;
        throw error;
      });
    initialization = initializing;
  }
  return initialization;
}

export async function buildModel(features: Feature[]): Promise<CadResult> {
  const requestedGeneration = generation;
  await initKernel();
  if (requestedGeneration !== generation) throw new Error('El motor CAD se ha cerrado.');
  return request<CadResult>({ action: 'build', features });
}

/** Supply the committed document to export independently of debounced previews. */
export async function exportCad(format: CadExportFormat, features?: Feature[]): Promise<Blob> {
  const requestedGeneration = generation;
  await initKernel();
  if (requestedGeneration !== generation) throw new Error('El motor CAD se ha cerrado.');
  return request<Blob>({ action: 'export', format, features });
}

export function disposeKernel(): void {
  generation++;
  worker?.terminate();
  worker = null;
  initialization = null;
  pending.forEach((entry) => entry.reject(new Error('El motor CAD se ha cerrado.')));
  pending.clear();
}

if (import.meta.hot) import.meta.hot.dispose(disposeKernel);
