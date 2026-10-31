import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const operations = vi.hoisted(() => ({ receive: vi.fn(async (_value: unknown) => undefined), initialize: vi.fn(), handle: vi.fn() }));
vi.mock('./kernel.worker-queue', () => ({ createKernelWorkerQueue: () => ({ receive: operations.receive }) }));
vi.mock('./kernel.dispatcher', () => ({ KernelDispatcher: class { handle = operations.handle; } }));
vi.mock('replicad-opencascadejs', () => ({ default: operations.initialize }));
vi.mock('replicad-opencascadejs/wasm?url', () => ({ default: 'original-test-only-wasm-url' }));
vi.mock('replicad', () => ({ setOC: vi.fn() }));

let scope: { onmessage: ((event: MessageEvent<unknown>) => void) | null; postMessage: ReturnType<typeof vi.fn> };
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  scope = { onmessage: null, postMessage: vi.fn() };
  vi.stubGlobal('self', scope);
  await import('./kernel.worker');
  expect(scope.onmessage).toBeTypeOf('function');
});
afterEach(() => vi.unstubAllGlobals());

// These unit metadata fixtures do not prove browser trust. Desktop smoke uses
// the actual production worker and a real transferred-port rejection/barrier.
function event(overrides: Partial<MessageEvent<unknown>> = {}): MessageEvent<unknown> {
  return { isTrusted: true, origin: '', source: null, ports: [], data: null, ...overrides } as MessageEvent<unknown>;
}

it('forwards the same dedicated-channel payload once without replacing queue envelope admission', () => {
  const message = Object.freeze({ id: 4, action: 'init' });
  scope.onmessage!(event({ data: message }));
  scope.onmessage!(event({ data: null }));
  expect(operations.receive).toHaveBeenCalledTimes(2);
  expect(operations.receive.mock.calls[0][0]).toBe(message);
  expect(operations.receive.mock.calls[1][0]).toBeNull();
  expect(operations.initialize).not.toHaveBeenCalled(); expect(scope.postMessage).not.toHaveBeenCalled();
});

it('ignores a real synthetic MessageEvent without forwarding its payload', () => {
  const synthetic = new MessageEvent('message', { data: { id: 4, action: 'init' } });
  expect(synthetic.isTrusted).toBe(false); scope.onmessage!(synthetic);
  expect(operations.receive).not.toHaveBeenCalled();
});

for (const metadata of [
  { isTrusted: false }, { origin: 'https://original-untrusted.invalid' }, { origin: 'null' },
  { origin: 'solidflow://app' }, { source: {} as MessageEventSource },
] satisfies Partial<MessageEvent<unknown>>[]) {
  it('rejects unexpected metadata before reading data: ' + JSON.stringify(metadata), () => {
    let reads = 0;
    const incoming = Object.defineProperty(event(metadata), 'data', { get() { reads++; throw Error('Rejected payload must not be read'); } });
    scope.onmessage!(incoming);
    expect(reads).toBe(0); expect(operations.receive).not.toHaveBeenCalled(); expect(operations.initialize).not.toHaveBeenCalled();
  });
}

it('closes every actually received extra port and withholds the request before reading data', () => {
  const first = { close: vi.fn() }, second = { close: vi.fn() };
  let reads = 0;
  const incoming = Object.defineProperty(event({ ports: [first, second] as unknown as MessagePort[] }), 'data', {
    get() { reads++; throw Error('Transferred channel cannot nominate a request'); },
  });
  scope.onmessage!(incoming);
  expect(first.close).toHaveBeenCalledTimes(1); expect(second.close).toHaveBeenCalledTimes(1);
  expect(reads).toBe(0); expect(operations.receive).not.toHaveBeenCalled();
});

it('does not close caller-owned ports from a synthetic event', () => {
  const port = { close: vi.fn() };
  scope.onmessage!(event({ isTrusted: false, ports: [port] as unknown as MessagePort[] }));
  expect(port.close).not.toHaveBeenCalled(); expect(operations.receive).not.toHaveBeenCalled();
});
