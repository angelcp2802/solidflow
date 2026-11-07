import { describe, expect, it, vi } from 'vitest';
import { createKernelWorkerQueue, type KernelWorkerQueueOperations } from './kernel.worker-queue';
import type { KernelRequest, KernelResponse, KernelValue } from './kernel.types';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function fixture(overrides: Partial<KernelWorkerQueueOperations> = {}) {
  const replies: KernelResponse[] = [];
  const operations = {
    initialize: vi.fn(async () => undefined),
    handle: vi.fn((_request: KernelRequest): KernelValue => null),
    postMessage: vi.fn((reply: KernelResponse) => { replies.push(structuredClone(reply)); }),
    ...overrides,
  };
  return { ...createKernelWorkerQueue(operations), operations, replies };
}

describe('dedicated worker transport envelope and serial failure containment', () => {
  it('requires occurrence intent and rejects replacement authority on its dedicated envelope', async () => {
    const f = fixture(), current = { document: 'payload checked by dispatcher', generation: 1 }, edit = { change: 'payload checked by dispatcher' };
    await f.receive({ id: 1, action: 'preview-configured-assembly-occurrence-edit', current });
    await f.receive({ id: 2, action: 'preview-configured-assembly-occurrence-edit', current, edit, token: 'not-an-authoring-field' });
    await f.receive({ id: 3, action: 'preview-configured-assembly-occurrence-edit', current, edit });
    expect(f.replies.map(reply => reply.ok)).toEqual([false, false, true]);
    expect(f.operations.handle).toHaveBeenCalledTimes(1);
    expect(f.operations.handle).toHaveBeenCalledWith({ id: 3, action: 'preview-configured-assembly-occurrence-edit', current, edit });
  });
  it('discards null and uncorrelatable IDs without initialization or replies, then processes id zero', async () => {
    const f = fixture();
    for (const value of [null, undefined, false, 'init', {}, { action: 'init' },
      ...[-1, NaN, Infinity, 1.5, '1'].map(id => ({ id, action: 'init' }))]) await f.receive(value);
    expect(f.operations.initialize).not.toHaveBeenCalled();
    expect(f.operations.handle).not.toHaveBeenCalled();
    expect(f.replies).toEqual([]);
    await f.receive({ id: 0, action: 'init' });
    expect(f.replies).toEqual([{ id: 0, ok: true, value: null }]);
  });

  it('rejects unknown, inherited-looking and unbounded actions with correlated errors before init', async () => {
    const f = fixture();
    for (const action of ['', 'constructor', '__proto__', 'not-a-kernel-command', 'x'.repeat(129), null]) await f.receive({ id: 4, action });
    expect(f.operations.initialize).not.toHaveBeenCalled();
    expect(f.operations.handle).not.toHaveBeenCalled();
    expect(f.replies).toHaveLength(6);
    expect(f.replies.every(reply => reply.id === 4 && !reply.ok)).toBe(true);
  });

  it('uses own data descriptors without evaluating id, action or payload getters', async () => {
    const f = fixture(); let getters = 0;
    const read = () => { getters++; throw Error('Getter must not run'); };
    await f.receive({ get id() { return read(); }, action: 'init' });
    await f.receive({ id: 1, get action() { return read(); } });
    await f.receive({ id: 2, action: 'build', get features() { return read(); } });
    await f.receive({ id: 3, action: 'init', get unrelated() { return read(); } });
    expect(getters).toBe(0);
    expect(f.replies.map(reply => reply.id)).toEqual([1, 2, 3]);
    expect(f.replies.every(reply => !reply.ok)).toBe(true);
    expect(f.operations.initialize).not.toHaveBeenCalled();
  });

  it('rejects class, array, symbol and nonenumerable envelopes while accepting null-prototype records', async () => {
    const f = fixture();
    class Input { id = 1; action = 'init'; }
    await f.receive(new Input());
    await f.receive(Object.assign([], { id: 2, action: 'init' }));
    await f.receive({ id: 3, action: 'init', [Symbol('extra')]: true });
    await f.receive(Object.defineProperty({ id: 4 }, 'action', { value: 'init' }));
    const own = Object.assign(Object.create(null), { id: 5, action: 'init' });
    await f.receive(own);
    expect(f.replies.map(reply => [reply.id, reply.ok])).toEqual([[1, false], [2, false], [3, false], [4, false], [5, true]]);
    expect(f.operations.initialize).toHaveBeenCalledTimes(1);
  });

  it('enforces per-command required and allowed fields without treating optional values as global fields', async () => {
    const f = fixture();
    await f.receive({ id: 1, action: 'build' });
    await f.receive({ id: 2, action: 'build', features: undefined });
    await f.receive({ id: 3, action: 'init', token: 'not-an-init-capability' });
    await f.receive({ id: 4, action: 'apply-configured-assembly', current: {}, token: 'actual-token', reviewId: 'wrong-family' });
    expect(f.operations.initialize).not.toHaveBeenCalled();
    await f.receive({ id: 5, action: 'export', format: 'step', features: undefined });
    await f.receive({ id: 6, action: 'discard-assembly' });
    expect(f.operations.handle).toHaveBeenNthCalledWith(1, { id: 5, action: 'export', format: 'step', features: undefined });
    expect(f.operations.handle).toHaveBeenNthCalledWith(2, { id: 6, action: 'discard-assembly' });
    expect(f.replies.map(reply => reply.ok)).toEqual([false, false, false, false, true, true]);
  });

  it('leaves payload validation and exact tokens with the handler and never issues replacement capabilities', async () => {
    const f = fixture();
    const current = { document: 'deliberately not a valid configured document', generation: 9 };
    await f.receive({ id: 1, action: 'apply-configured-assembly', current, token: 'private-preview-token' });
    expect(f.operations.handle).toHaveBeenCalledWith({ id: 1, action: 'apply-configured-assembly', current, token: 'private-preview-token' });
    expect(f.replies).toEqual([{ id: 1, ok: true, value: null }]);
    expect(f.replies[0]).not.toHaveProperty('token');
  });

  it('captures top-level envelope values before awaiting and preserves serial handler/reply ordering', async () => {
    const gate = deferred(), calls: string[] = [];
    const f = fixture({ initialize: async () => { calls.push('init'); await gate.promise; },
      handle: request => { calls.push('handle:' + request.id + ':' + request.action); return null; },
      postMessage: reply => { calls.push('post:' + reply.id); } });
    const first = { id: 1, action: 'init' };
    const one = f.receive(first); first.id = 90; first.action = 'invalid-after-capture';
    const bad = f.receive({ id: 2, action: 'invalid' });
    const three = f.receive({ id: 3, action: 'init' });
    await Promise.resolve(); expect(calls).toEqual(['init']);
    gate.resolve(); await Promise.all([one, bad, three]);
    expect(calls).toEqual(['init', 'handle:1:init', 'post:1', 'post:2', 'init', 'handle:3:init', 'post:3']);
  });

  it('awaits each handler before initializing or invoking the next request', async () => {
    const gate = deferred(); let active = 0, maximum = 0;
    const f = fixture({ handle: async request => { active++; maximum = Math.max(maximum, active); if (request.id === 1) await gate.promise; active--; return null; } });
    const first = f.receive({ id: 1, action: 'init' }), second = f.receive({ id: 2, action: 'init' });
    await Promise.resolve(); await Promise.resolve();
    expect(f.operations.initialize).toHaveBeenCalledTimes(1);
    gate.resolve(); await Promise.all([first, second]);
    expect(maximum).toBe(1); expect(f.replies.map(reply => reply.id)).toEqual([1, 2]);
  });

  it('keeps initialization memoization and failed-initialization retry in the supplied factory', async () => {
    let initialized: Promise<void> | null = null, starts = 0;
    const initialize = () => {
      if (!initialized) initialized = Promise.resolve().then(() => { starts++; if (starts === 1) throw Error('original initialization failure'); }).catch(error => { initialized = null; throw error; });
      return initialized;
    };
    const f = fixture({ initialize });
    await Promise.all([f.receive({ id: 1, action: 'init' }), f.receive({ id: 2, action: 'init' }), f.receive({ id: 3, action: 'init' })]);
    expect(starts).toBe(2);
    expect(f.replies).toEqual([{ id: 1, ok: false, error: 'original initialization failure' }, { id: 2, ok: true, value: null }, { id: 3, ok: true, value: null }]);
    expect(f.operations.handle).toHaveBeenCalledTimes(2);
  });

  it('contains a synchronous initialization exception and handles the following request once', async () => {
    let attempt = 0;
    const f = fixture({ initialize: () => { if (++attempt === 1) throw Error('sync initialization'); return Promise.resolve(); } });
    await Promise.all([f.receive({ id: 1, action: 'init' }), f.receive({ id: 2, action: 'init' })]);
    expect(f.replies[0]).toEqual({ id: 1, ok: false, error: 'sync initialization' });
    expect(f.operations.handle).toHaveBeenCalledTimes(1); expect(f.replies[1].ok).toBe(true);
  });

  it('contains handler failures without repeating private actions or starving later requests', async () => {
    const seen: number[] = [];
    const f = fixture({ handle: request => { seen.push(request.id); if (request.id === 1) throw Error('private action failed'); return null; } });
    await Promise.all([f.receive({ id: 1, action: 'discard-configured-assembly', token: 'one-token' }), f.receive({ id: 2, action: 'init' })]);
    expect(seen).toEqual([1, 2]);
    expect(f.replies).toEqual([{ id: 1, ok: false, error: 'private action failed' }, { id: 2, ok: true, value: null }]);
  });

  it('contains asynchronous handler rejection and hostile error accessors', async () => {
    const hostile = Object.defineProperty(new Error(), 'message', { get() { throw Error('error getter'); } });
    const f = fixture({ handle: async request => { if (request.id === 1) throw hostile; return null; } });
    await f.receive({ id: 1, action: 'init' }); await f.receive({ id: 2, action: 'init' });
    expect(f.replies[0]).toMatchObject({ id: 1, ok: false });
    expect(f.replies[1]).toEqual({ id: 2, ok: true, value: null });
  });

  it('replaces a real structured-clone serialization failure with a correlated error, not successful geometry', async () => {
    const delivered: KernelResponse[] = [], handled: number[] = [], attempts: number[] = [];
    const f = fixture({ handle: request => { handled.push(request.id); return request.id === 1 ? (() => undefined) as unknown as KernelValue : null; },
      postMessage: reply => { attempts.push(reply.id); delivered.push(structuredClone(reply)); } });
    await f.receive({ id: 1, action: 'init' }); await f.receive({ id: 2, action: 'init' });
    expect(handled).toEqual([1, 2]); expect(attempts).toEqual([1, 1, 2]);
    expect(delivered[0]).toMatchObject({ id: 1, ok: false });
    expect(delivered[0]).not.toHaveProperty('value'); expect(delivered[1]).toEqual({ id: 2, ok: true, value: null });
  });

  it('contains failure of both response and fallback transport and continues after transport recovers', async () => {
    const delivered: KernelResponse[] = []; let broken = true, attempts = 0;
    const f = fixture({ postMessage: reply => { attempts++; if (broken) throw Error('closed transport'); delivered.push(structuredClone(reply)); } });
    await expect(f.receive({ id: 1, action: 'init' })).resolves.toBeUndefined();
    expect(attempts).toBe(2); broken = false;
    await f.receive({ id: 2, action: 'init' });
    expect(delivered).toEqual([{ id: 2, ok: true, value: null }]);
    expect(f.operations.handle).toHaveBeenCalledTimes(2);
  });

  it('contains rejection reply failure for malformed input without initializing it', async () => {
    let attempts = 0;
    const f = fixture({ postMessage: () => { attempts++; throw Error('cannot deliver'); } });
    await expect(f.receive({ id: 1, action: 'unknown' })).resolves.toBeUndefined();
    expect(attempts).toBe(2); expect(f.operations.initialize).not.toHaveBeenCalled(); expect(f.operations.handle).not.toHaveBeenCalled();
  });
});
