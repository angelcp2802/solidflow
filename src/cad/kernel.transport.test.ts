import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildModel, disposeKernel, initKernel } from './kernel';
import type { CadResult, KernelRequest, KernelResponse } from './kernel.types';

class ControlledWorker {
  static instances: ControlledWorker[] = [];
  messages: KernelRequest[] = [];
  onmessage: ((event: MessageEvent<KernelResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  constructor() { ControlledWorker.instances.push(this); }
  postMessage(message: KernelRequest) { this.messages.push(structuredClone(message)); }
  terminate() { this.terminated = true; }
  reply(index: number, value: CadResult | null = null) {
    this.onmessage?.({ data: { id: this.messages[index].id, ok: true, value } } as MessageEvent<KernelResponse>);
  }
}

beforeEach(() => {
  ControlledWorker.instances = [];
  vi.stubGlobal('Worker', ControlledWorker);
});

afterEach(async () => {
  disposeKernel();
  await Promise.resolve();
  vi.unstubAllGlobals();
});

describe('CAD worker lifecycle', () => {
  it('shares initialization across duplicate StrictMode mounts', async () => {
    const first = initKernel(), second = initKernel();
    expect(first).toBe(second);
    const worker = ControlledWorker.instances[0];
    expect(worker.messages).toHaveLength(1);
    worker.reply(0);
    await Promise.all([first, second]);
    expect(ControlledWorker.instances).toHaveLength(1);
  });

  it('does not restart a disposed worker from a build waiting on resolved initialization', async () => {
    const initialized = initKernel();
    ControlledWorker.instances[0].reply(0);
    await initialized;
    const building = buildModel([]);
    // Attach the handler before disposal so a deliberate cancellation is handled.
    const outcome = building.then(() => 'resolved', (error: Error) => error.message);
    disposeKernel();
    await Promise.resolve();
    expect(ControlledWorker.instances).toHaveLength(1);
    expect(await outcome).toContain('cerrado');
  });

  it('correlates rapid build responses without mixing their geometry', async () => {
    const initialized = initKernel();
    const worker = ControlledWorker.instances[0];
    worker.reply(0);
    await initialized;
    const first = buildModel([]), second = buildModel([]);
    await Promise.resolve();
    const result = (volume: number): CadResult => ({
      volume, vertices: [], normals: [], triangles: [], edgeLines: [], edges: [],
      bounds: { min: [0, 0, 0], max: [0, 0, 0] }, warnings: [], featureErrors: [],
    });
    worker.reply(2, result(20));
    worker.reply(1, result(10));
    expect((await first).volume).toBe(10);
    expect((await second).volume).toBe(20);
  });

  it('keeps a replacement initialization when the cancelled initialization rejects later', async () => {
    const cancelled = initKernel().catch(() => undefined);
    disposeKernel();
    const replacement = initKernel();
    void replacement.catch(() => undefined);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const repeated = initKernel();
    void repeated.catch(() => undefined);
    expect(repeated).toBe(replacement);
    ControlledWorker.instances[1].reply(0);
    await Promise.all([cancelled, replacement]);
  });

  it('ignores late error events from a worker that has already been replaced', async () => {
    const cancelled = initKernel().catch(() => undefined);
    const oldWorker = ControlledWorker.instances[0];
    disposeKernel();
    const replacement = initKernel();
    const outcome = replacement.catch((error: Error) => error.message);
    const activeWorker = ControlledWorker.instances[1];
    oldWorker.onerror?.({ message: 'late error' } as ErrorEvent);
    expect(activeWorker.terminated).toBe(false);
    activeWorker.reply(0);
    expect(await outcome).toBeUndefined();
    await cancelled;
  });
});
