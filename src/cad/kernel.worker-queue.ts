import type { KernelRequest, KernelResponse, KernelValue } from './kernel.types';

type Action = KernelRequest['action'];
type RequestFor<A extends Action> = Extract<KernelRequest, { action: A }>;
type Fields<A extends Action> = {
  [K in Exclude<keyof RequestFor<A>, 'id' | 'action'>]-?:
    {} extends Pick<RequestFor<A>, K> ? 'optional' : 'required';
};

// Only the transport envelope is checked here. Payload semantics and private
// capabilities remain with the existing command-specific dispatcher boundaries.
// This mapped type requires every action and its actual union fields, including
// optionality; a new command cannot silently inherit another command's fields.
const fields = {
  init: {},
  build: { features: 'required' },
  export: { format: 'required', features: 'optional' },
  'import-assembly-step': { source: 'required' },
  'insert-assembly-step': { current: 'required', source: 'required', scope: 'optional' },
  'export-assembly-step': { document: 'required' },
  'export-assembly': { document: 'required', format: 'required' },
  'build-configured-assembly': { current: 'required' },
  'preview-configured-assembly': { current: 'required', options: 'optional' },
  'apply-configured-assembly': { current: 'required', token: 'required' },
  'discard-configured-assembly': { token: 'required' },
  'build-assembly': { document: 'required' },
  'inspect-assembly-interferences': { current: 'required', options: 'optional' },
  'review-assembly-part-update': { current: 'required', source: 'required', part: 'required', revision: 'required', sourceLink: 'optional' },
  'preview-assembly-part-update': { current: 'required', reviewId: 'required', proposed: 'required' },
  'discard-assembly-part-update': { reviewId: 'optional' },
  'review-assembly-part-replacement': { current: 'required', request: 'required' },
  'preview-assembly-part-replacement': { current: 'required', reviewId: 'required', decisions: 'required' },
  'discard-assembly-part-replacement': { reviewId: 'optional' },
  'review-assembly-document-update': { current: 'required', source: 'required', incoming: 'required', sourceLink: 'optional' },
  'preview-assembly-document-update': { current: 'required', reviewId: 'required', decisions: 'required' },
  'discard-assembly-document-update': { reviewId: 'optional' },
  'preview-assembly': { current: 'required', proposed: 'required', options: 'optional' },
  'preview-assembly-root-revision': { current: 'required', revision: 'required' },
  'move-assembly-component': { current: 'required', move: 'required', options: 'optional' },
  'move-assembly-component-motion': { current: 'required', motion: 'required', options: 'optional' },
  'move-assembly-world-component': { current: 'required', move: 'required', options: 'optional' },
  'project-assembly-component': { current: 'required', drag: 'required', options: 'optional' },
  'translate-assembly-until-contact': { current: 'required', translation: 'required', stopOptions: 'optional', options: 'optional' },
  'apply-assembly': { current: 'required', token: 'required' },
  'discard-assembly': { token: 'optional' },
  'lock-assembly-rotation': { current: 'required', token: 'required', mateId: 'required', scope: 'optional' },
  'lock-assembly-components': { current: 'required', token: 'required', first: 'required', second: 'required', scope: 'optional' },
  'capture-assembly-gear': { current: 'required', token: 'required', request: 'required', scope: 'optional' },
  'capture-assembly-screw': { current: 'required', token: 'required', request: 'required', scope: 'optional' },
  'capture-assembly-rack-pinion': { current: 'required', token: 'required', request: 'required', scope: 'optional' },
  'measure-assembly-directed-angle': { current: 'required', request: 'required' },
} satisfies { [A in Action]: Fields<A> };

type Envelope = { id: number; request: KernelRequest } | { id: number; error: string } | null;
const invalidEnvelope = 'El mensaje del motor CAD no tiene un sobre válido.';

function captureEnvelope(value: unknown): Envelope {
  if (!value || typeof value !== 'object') return null;
  let id: number;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, 'id');
    if (!descriptor?.enumerable || !('value' in descriptor)
      || typeof descriptor.value !== 'number' || !Number.isSafeInteger(descriptor.value) || descriptor.value < 0) return null;
    id = descriptor.value;
  } catch { return null; }
  try {
    if (Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return { id, error: invalidEnvelope };
    const descriptors = Object.getOwnPropertyDescriptors(value), actionField = descriptors.action;
    if (!actionField?.enumerable || !('value' in actionField) || typeof actionField.value !== 'string'
      || !actionField.value.length || actionField.value.length > 128 || !Object.hasOwn(fields, actionField.value)) return { id, error: invalidEnvelope };
    const action = actionField.value as Action;
    const allowed: Record<string, 'required' | 'optional'> = fields[action];
    const entries: [string, unknown][] = [];
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== 'string' || key !== 'id' && key !== 'action' && !Object.hasOwn(allowed, key)) return { id, error: invalidEnvelope };
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !('value' in descriptor)) return { id, error: invalidEnvelope };
      entries.push([key, descriptor.value]);
    }
    for (const [key, requirement] of Object.entries(allowed)) {
      if (requirement === 'required' && (!Object.hasOwn(descriptors, key) || descriptors[key].value === undefined)) return { id, error: invalidEnvelope };
    }
    // A Worker already structured-cloned the payload. Own top-level values are
    // captured synchronously before the queue can yield; no caller getters run.
    return { id, request: Object.fromEntries(entries) as KernelRequest };
  } catch { return { id, error: invalidEnvelope }; }
}

function errorMessage(error: unknown): string {
  try {
    if (error instanceof Error && typeof error.message === 'string' && error.message) return error.message;
  } catch { /* An error object's accessor must not reject the queue. */ }
  return 'No se pudo inicializar o ejecutar el motor CAD.';
}

export interface KernelWorkerQueueOperations {
  initialize(): Promise<void>;
  handle(request: KernelRequest): KernelValue | Promise<KernelValue>;
  postMessage(response: KernelResponse): void;
}

/** Serial delivery only; no native ownership or geometric authority is issued.
 * Initialization memoization/retry remains in the existing worker factory. */
export function createKernelWorkerQueue(operations: KernelWorkerQueueOperations) {
  let queue: Promise<void> = Promise.resolve();
  const post = (response: KernelResponse) => {
    try { operations.postMessage(response); }
    catch {
      // A successful value may not be cloneable. Never publish it as a success
      // after serialization failed; send a small correlated failure at most once.
      try { operations.postMessage({ id: response.id, ok: false, error: 'No se pudo enviar la respuesta del motor CAD.' }); }
      catch { /* A closed/broken transport cannot be repaired by retrying work. */ }
    }
  };
  return {
    receive(value: unknown): Promise<void> {
      const envelope = captureEnvelope(value);
      const run = async () => {
        if (!envelope) return;
        if ('error' in envelope) { post({ id: envelope.id, ok: false, error: envelope.error }); return; }
        let response: KernelResponse;
        try {
          await operations.initialize();
          response = { id: envelope.id, ok: true, value: await operations.handle(envelope.request) };
        } catch (error) { response = { id: envelope.id, ok: false, error: errorMessage(error) }; }
        post(response);
      };
      // A transport failure must not leave later requests chained to a rejected
      // promise. No initialization, handler or private token is retried here.
      queue = queue.then(run, run).catch(() => undefined);
      return queue;
    },
  };
}
