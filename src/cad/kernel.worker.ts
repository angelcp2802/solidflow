import initOpenCascade from 'replicad-opencascadejs';
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import { setOC } from 'replicad';
import { KernelDispatcher } from './kernel.dispatcher';
import { createKernelWorkerQueue } from './kernel.worker-queue';

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
const queue = createKernelWorkerQueue({ initialize, handle: request => dispatcher.handle(request),
  postMessage: response => self.postMessage(response) });
self.onmessage = (event: MessageEvent<unknown>) => { void queue.receive(event.data); };
