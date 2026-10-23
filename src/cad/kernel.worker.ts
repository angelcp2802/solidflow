import initOpenCascade from 'replicad-opencascadejs';
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import { setOC } from 'replicad';
import { KernelDispatcher } from './kernel.dispatcher';
import type { KernelRequest, KernelResponse } from './kernel.types';

const dispatcher = new KernelDispatcher();
let initialized: Promise<void> | null = null;

function initialize(): Promise<void> {
  if (!initialized) {
    initialized = initOpenCascade({ locateFile: () => wasmUrl, print: () => undefined })
      .then((oc) => { setOC(oc); })
      .catch((error: unknown) => { initialized = null; throw error; });
  }
  return initialized;
}

// Serialize native commands. A committed export reconstructs its explicit
// snapshot independently of preceding display builds or assembly previews.
let queue: Promise<void> = Promise.resolve();
self.onmessage = (event: MessageEvent<KernelRequest>) => {
  const request = event.data;
  queue = queue.then(async () => {
    let response: KernelResponse;
    try {
      await initialize();
      const value = dispatcher.handle(request);
      response = { id: request.id, ok: true, value };
    } catch (error) {
      response = {
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : 'No se pudo inicializar o ejecutar el motor CAD.',
      };
    }
    self.postMessage(response);
  });
};
