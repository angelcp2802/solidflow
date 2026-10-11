import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildModel, disposeKernel, exportCad, initKernel } from './kernel';
import type { CadResult, KernelRequest, KernelResponse } from './kernel.types';
import { createStepSource } from '../model/stepSource';

class ControlledWorker {
  static instances: ControlledWorker[] = [];
  messages: KernelRequest[] = [];
  onmessage: ((event: MessageEvent<KernelResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  constructor() { ControlledWorker.instances.push(this); }
  postMessage(message: KernelRequest) { this.messages.push(structuredClone(message)); }
  terminate() { this.terminated = true; }
  reply(index: number, value: CadResult | Blob | null = null) {
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

  it('sends the owned STEP source again after replacing a worker', async () => {
    const features = [{ type: 'importedSolid' as const, id: 'import', name: 'Imported', suppressed: false,
      source: createStepSource(new TextEncoder().encode('ISO-10303-21;')) }];
    const first = initKernel(); ControlledWorker.instances[0].reply(0); await first;
    disposeKernel();
    const rebuilding = buildModel(features);
    const worker = ControlledWorker.instances[1]; worker.reply(0);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(worker.messages[1]).toEqual({ id: expect.any(Number), action: 'build', features });
    const request = worker.messages[1];
    expect(request.action === 'build' && request.features).not.toBe(features);
    worker.reply(1, { volume: 240, vertices: [], normals: [], triangles: [], edgeLines: [], edges: [],
      bounds: { min: [0, 0, 0], max: [10, 6, 4] }, warnings: [], featureErrors: [] });
    expect((await rebuilding).volume).toBe(240);
  });

  it('exports an owned imported document independently of an unrelated build request', async () => {
    const initialized = initKernel(), worker = ControlledWorker.instances[0]; worker.reply(0); await initialized;
    const features = [{ type: 'importedSolid' as const, id: 'committed', name: 'Imported', suppressed: false,
      source: createStepSource(new TextEncoder().encode('ISO-10303-21;')) }];
    const rebuilding = buildModel([]), exporting = exportCad('step', features);
    await Promise.resolve();
    expect(worker.messages[2]).toEqual({ id: expect.any(Number), action: 'export', format: 'step', features });
    const blob = new Blob(['STEP bytes']); worker.reply(2, blob); worker.reply(1);
    expect(await exporting).toBe(blob);
    await rebuilding;
  });
});
