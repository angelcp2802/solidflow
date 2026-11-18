declare const activationBrand: unique symbol
declare const timerBrand: unique symbol

export interface EmbeddedPartActivation {
  readonly epoch: number
  readonly [activationBrand]: true
}

export interface EmbeddedPartTimer {
  readonly activation: EmbeddedPartActivation
  readonly id: number
  readonly [timerBrand]: true
}

export interface EmbeddedPartWorkState {
  readonly phase: 'idle' | 'active' | 'suspended' | 'disposed'
  readonly activation: EmbeddedPartActivation | null
  readonly pending: number
  readonly timers: number
  readonly cleanupAcknowledged: boolean
  readonly ready: boolean
}

export class EmbeddedPartWorkError extends Error {
  constructor(readonly code: 'inactive' | 'not-idle' | 'not-drained' | 'not-suspended' | 'disposed') {
    super('Embedded part work: ' + code)
    this.name = 'EmbeddedPartWorkError'
  }
}

export interface EmbeddedPartWork<Snapshot extends object = object> {
  activate(): EmbeddedPartActivation
  resume(): EmbeddedPartActivation
  setSnapshot(activation: EmbeddedPartActivation, snapshot: Snapshot | null): boolean
  run<T>(activation: EmbeddedPartActivation, send: () => Promise<T>): Promise<T>
  registerTimer(activation: EmbeddedPartActivation, cancel: () => void): EmbeddedPartTimer | null
  runTimer<T>(timer: EmbeddedPartTimer, send: () => Promise<T>): Promise<T>
  cancelTimer(timer: EmbeddedPartTimer): boolean
  markReady(activation: EmbeddedPartActivation, snapshot: Snapshot): boolean
  isReady(activation: EmbeddedPartActivation, snapshot: Snapshot): boolean
  suspend(activation: EmbeddedPartActivation): boolean
  acknowledgeCleanup(activation: EmbeddedPartActivation): boolean
  awaitSuspended(activation: EmbeddedPartActivation): Promise<void>
  isSuspended(activation: EmbeddedPartActivation): boolean
  dispose(): void
  getState(): EmbeddedPartWorkState
}

/** Owned outside the temporary editor's effects. Snapshots are immutable input
 * witnesses supplied by that editor, not CAD results or Apply capabilities.
 * Register before scheduling a timer; its callback must enter through runTimer.
 * Callers must handle the returned request promises and revalidate their own
 * source ticket after awaiting a suspension barrier. */
export function createEmbeddedPartWork<Snapshot extends object = object>(): EmbeddedPartWork<Snapshot> {
  let phase: EmbeddedPartWorkState['phase'] = 'idle'
  let activation: EmbeddedPartActivation | null = null
  let epoch = 0, timerId = 0, producer = 0, pending = 0, cancelling = 0, snapshotVersion = 0
  let snapshot: Snapshot | null = null, ready: Snapshot | null = null, completed: Snapshot | null = null
  let cleanupAcknowledged = false
  let cancellationFailure: { reason: unknown } | null = null
  const timers = new Map<EmbeddedPartTimer, { cancel: () => void }>()
  const waiters = new Set<{ activation: EmbeddedPartActivation; resolve: () => void; reject: (reason: unknown) => void }>()

  const active = (value: EmbeddedPartActivation): boolean => phase === 'active' && activation === value
  function isSuspended(value: EmbeddedPartActivation): boolean {
    return phase === 'suspended' && activation === value && cleanupAcknowledged && pending === 0
      && timers.size === 0 && cancelling === 0 && cancellationFailure === null
  }
  function flush(): void {
    for (const waiter of waiters) {
      if (phase === 'disposed' || waiter.activation !== activation || phase !== 'suspended') {
        waiters.delete(waiter)
        waiter.reject(new EmbeddedPartWorkError(phase === 'disposed' ? 'disposed' : 'not-suspended'))
      } else if (cleanupAcknowledged && pending === 0 && timers.size === 0 && cancelling === 0) {
        waiters.delete(waiter)
        if (cancellationFailure) waiter.reject(cancellationFailure.reason)
        else waiter.resolve()
      }
    }
  }
  function beginActivation(): EmbeddedPartActivation {
    activation = Object.freeze({ epoch: ++epoch }) as EmbeddedPartActivation
    phase = 'active'; snapshot = null; ready = null; completed = null; cleanupAcknowledged = false
    snapshotVersion++
    flush()
    return activation
  }
  function activate(): EmbeddedPartActivation {
    if (phase !== 'idle') throw new EmbeddedPartWorkError(phase === 'disposed' ? 'disposed' : 'not-idle')
    return beginActivation()
  }
  function resume(): EmbeddedPartActivation {
    if (!activation || !isSuspended(activation)) throw new EmbeddedPartWorkError(phase === 'disposed' ? 'disposed' : 'not-drained')
    return beginActivation()
  }
  function setSnapshot(value: EmbeddedPartActivation, next: Snapshot | null): boolean {
    if (!active(value)) return false
    if (snapshot !== next) { snapshot = next; snapshotVersion++; ready = null; completed = null }
    return true
  }
  function run<T>(value: EmbeddedPartActivation, send: () => Promise<T>, timer?: EmbeddedPartTimer): Promise<T> {
    if (!active(value) || timer && (!timers.has(timer) || timer.activation !== value)) {
      return Promise.reject(new EmbeddedPartWorkError(phase === 'disposed' ? 'disposed' : 'inactive'))
    }
    const request = ++producer, version = snapshotVersion, requestedSnapshot = snapshot
    ready = null; completed = null; pending++
    // Pending is counted before removing a fired timer or invoking a producer.
    // Reentrant suspension inside send therefore cannot observe a false drain.
    if (timer) timers.delete(timer)
    const settle = (success: boolean): void => {
      pending--
      if (success && active(value) && request === producer && version === snapshotVersion) completed = requestedSnapshot
      flush()
    }
    let result: Promise<T>
    try { result = send() }
    catch (reason) { settle(false); return Promise.reject(reason) }
    // Return the rejection-bearing chain itself; no ignored finally promise.
    return Promise.resolve(result).then(value => { settle(true); return value }, reason => { settle(false); throw reason })
  }
  function registerTimer(value: EmbeddedPartActivation, cancel: () => void): EmbeddedPartTimer | null {
    if (!active(value)) return null
    ready = null; completed = null
    const timer = Object.freeze({ activation: value, id: ++timerId }) as EmbeddedPartTimer
    timers.set(timer, { cancel })
    return timer
  }
  function runTimer<T>(timer: EmbeddedPartTimer, send: () => Promise<T>): Promise<T> {
    return run(timer.activation, send, timer)
  }
  function cancelTimer(timer: EmbeddedPartTimer): boolean {
    const record = timers.get(timer)
    if (!record) return false
    cancelling++; timers.delete(timer)
    try { record.cancel() }
    catch (reason) { cancellationFailure ??= { reason }; throw reason }
    finally { cancelling--; flush() }
    return true
  }
  function cancelTimers(): void {
    const failures: unknown[] = []
    for (const timer of timers.keys()) {
      try { cancelTimer(timer) } catch (reason) { failures.push(reason) }
    }
    if (failures.length) {
      const reason = failures.length === 1 ? failures[0] : new AggregateError(failures, 'Embedded part timer cancellation failed', { cause: failures[0] })
      cancellationFailure = { reason }
      throw reason
    }
  }
  function markReady(value: EmbeddedPartActivation, witness: Snapshot): boolean {
    if (!active(value) || snapshot === null || completed === null || snapshot !== witness || completed !== witness
      || pending !== 0 || timers.size !== 0 || cancelling !== 0 || cancellationFailure) return false
    ready = witness
    return true
  }
  function isReady(value: EmbeddedPartActivation, witness: Snapshot): boolean {
    return active(value) && snapshot !== null && ready !== null && completed !== null && snapshot === witness && ready === witness && completed === witness
      && pending === 0 && timers.size === 0 && cancelling === 0 && cancellationFailure === null
  }
  function suspend(value: EmbeddedPartActivation): boolean {
    if (phase === 'suspended' && activation === value) return true
    if (!active(value)) return false
    phase = 'suspended'; ready = null; cleanupAcknowledged = false
    try { cancelTimers() } finally { flush() }
    return true
  }
  function acknowledgeCleanup(value: EmbeddedPartActivation): boolean {
    if (phase !== 'suspended' || activation !== value) return false
    cleanupAcknowledged = true; flush()
    return true
  }
  function awaitSuspended(value: EmbeddedPartActivation): Promise<void> {
    if (phase !== 'suspended' || activation !== value) return Promise.reject(new EmbeddedPartWorkError(phase === 'disposed' ? 'disposed' : 'not-suspended'))
    return new Promise((resolve, reject) => { waiters.add({ activation: value, resolve, reject }); flush() })
  }
  function dispose(): void {
    if (phase === 'disposed') return
    phase = 'disposed'; activation = null; snapshot = null; ready = null; completed = null; cleanupAcknowledged = false
    try { cancelTimers() } finally { flush() }
    // Requests already accepted remain counted until their original settlement.
  }
  function getState(): EmbeddedPartWorkState {
    return Object.freeze({ phase, activation, pending, timers: timers.size + cancelling, cleanupAcknowledged,
      ready: activation !== null && ready !== null && isReady(activation, ready) })
  }
  return { activate, resume, setSnapshot, run, registerTimer, runTimer, cancelTimer, markReady, isReady,
    suspend, acknowledgeCleanup, awaitSuspended, isSuspended, dispose, getState }
}
