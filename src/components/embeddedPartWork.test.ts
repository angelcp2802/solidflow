import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmbeddedPartWork, EmbeddedPartWorkError } from './embeddedPartWork'

// Original orchestration witnesses only. These tests create no CAD data,
// worker response, file capability or React lifecycle substitute.
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const witness = () => Object.freeze({ features: {}, source: {} })
afterEach(() => vi.useRealTimers())

describe('embedded part work accounting', () => {
  it('rejects foreign/inactive producers without evaluating their lazy sends', async () => {
    const work = createEmbeddedPartWork(), other = createEmbeddedPartWork().activate(), send = vi.fn(async () => 1)
    await expect(work.run(other, send)).rejects.toMatchObject({ code: 'inactive' })
    expect(work.registerTimer(other, vi.fn())).toBeNull()
    expect(work.setSnapshot(other, witness())).toBe(false)
    const current = work.activate()
    expect(current.epoch).toBe(other.epoch)
    await expect(work.run(other, send)).rejects.toBeInstanceOf(EmbeddedPartWorkError)
    expect(send).not.toHaveBeenCalled()
    expect(work.getState().pending).toBe(0)
  })

  it('counts an accepted producer before invoking send and preserves its result', async () => {
    const work = createEmbeddedPartWork(), epoch = work.activate(), snapshot = witness(), native = deferred<object>()
    work.setSnapshot(epoch, snapshot)
    const request = work.run(epoch, () => {
      expect(work.getState().pending).toBe(1)
      expect(work.markReady(epoch, snapshot)).toBe(false)
      return native.promise
    })
    const value = {}
    native.resolve(value)
    expect(await request).toBe(value)
    expect(work.markReady(epoch, snapshot)).toBe(true)
    expect(work.isReady(epoch, snapshot)).toBe(true)
  })

  it('requires successful work for the current input witness rather than work completed before it existed', async () => {
    const work = createEmbeddedPartWork(), epoch = work.activate(), snapshot = witness()
    await work.run(epoch, async () => 1)
    expect(work.markReady(epoch, snapshot)).toBe(false)
    work.setSnapshot(epoch, snapshot)
    expect(work.markReady(epoch, snapshot)).toBe(false)
    await work.run(epoch, async () => 2)
    expect(work.markReady(epoch, snapshot)).toBe(true)
    const timer = work.registerTimer(epoch, vi.fn())!
    work.cancelTimer(timer)
    expect(work.markReady(epoch, snapshot)).toBe(false)
  })

  it.each(['throw', 'reject'] as const)('propagates the exact %s reason and drains once without granting readiness', async mode => {
    const work = createEmbeddedPartWork(), epoch = work.activate(), snapshot = witness(), reason = new Error('original native failure')
    work.setSnapshot(epoch, snapshot)
    const request = work.run(epoch, () => { if (mode === 'throw') throw reason; return Promise.reject(reason) })
    work.suspend(epoch); work.acknowledgeCleanup(epoch)
    await expect(request).rejects.toBe(reason)
    await work.awaitSuspended(epoch)
    expect(work.getState().pending).toBe(0)
    expect(work.markReady(epoch, snapshot)).toBe(false)
  })

  it('tracks the complete producer through initialization and a later native send after effect cleanup', async () => {
    const work = createEmbeddedPartWork(), epoch = work.activate(), init = deferred<void>(), native = deferred<string>()
    const snapshot = witness(), send = vi.fn(() => native.promise)
    work.setSnapshot(epoch, snapshot)
    const request = work.run(epoch, async () => { await init.promise; return send() })
    work.suspend(epoch); work.acknowledgeCleanup(epoch)
    let drained = false
    const barrier = work.awaitSuspended(epoch).then(() => { drained = true })
    init.resolve(); await Promise.resolve()
    expect(send).toHaveBeenCalledTimes(1)
    expect(work.getState().pending).toBe(1)
    expect(drained).toBe(false)
    native.resolve('actual result')
    expect(await request).toBe('actual result')
    await barrier
    expect(work.markReady(epoch, snapshot)).toBe(false)
  })

  it('cancels a pending 120ms debounce and rejects an already-queued stale callback', async () => {
    vi.useFakeTimers()
    const work = createEmbeddedPartWork(), epoch = work.activate(), snapshot = witness(), send = vi.fn(async () => 1)
    work.setSnapshot(epoch, snapshot)
    await work.run(epoch, async () => 0)
    expect(work.markReady(epoch, snapshot)).toBe(true)
    let timeout: ReturnType<typeof setTimeout>
    const timer = work.registerTimer(epoch, () => clearTimeout(timeout))!
    timeout = setTimeout(() => { void work.runTimer(timer, send) }, 120)
    await vi.advanceTimersByTimeAsync(119)
    expect(work.isReady(epoch, snapshot)).toBe(false)
    expect(work.getState().timers).toBe(1)
    work.suspend(epoch)
    work.acknowledgeCleanup(epoch)
    await work.awaitSuspended(epoch)
    await vi.advanceTimersByTimeAsync(1)
    await expect(work.runTimer(timer, send)).rejects.toMatchObject({ code: 'inactive' })
    expect(send).not.toHaveBeenCalled()
    expect(work.getState()).toMatchObject({ pending: 0, timers: 0 })
  })

  it('transfers a firing timer to pending before a reentrant suspension can see a drain', async () => {
    const work = createEmbeddedPartWork(), epoch = work.activate(), native = deferred<number>(), cancel = vi.fn()
    const timer = work.registerTimer(epoch, cancel)!
    let barrier!: Promise<void>, drained = false
    const request = work.runTimer(timer, () => {
      expect(work.getState()).toMatchObject({ pending: 1, timers: 0 })
      work.suspend(epoch); work.acknowledgeCleanup(epoch)
      barrier = work.awaitSuspended(epoch).then(() => { drained = true })
      return native.promise
    })
    await Promise.resolve()
    expect(drained).toBe(false)
    expect(work.cancelTimer(timer)).toBe(false)
    expect(cancel).not.toHaveBeenCalled()
    native.resolve(5); expect(await request).toBe(5); await barrier
  })

  it('cancels each registered timer at most once and cannot cancel another ledger timer', async () => {
    const work = createEmbeddedPartWork(), epoch = work.activate(), other = createEmbeddedPartWork(), foreign = other.registerTimer(other.activate(), vi.fn())!
    const cancel = vi.fn(), timer = work.registerTimer(epoch, cancel)!
    expect(work.cancelTimer(foreign)).toBe(false)
    expect(work.cancelTimer(timer)).toBe(true)
    expect(work.cancelTimer(timer)).toBe(false)
    work.suspend(epoch); work.acknowledgeCleanup(epoch); await work.awaitSuspended(epoch)
    expect(cancel).toHaveBeenCalledTimes(1)
    other.dispose()
  })

  it.each(['cleanup-first', 'request-first'] as const)('requires both cleanup acknowledgement and settlement: %s', async order => {
    const work = createEmbeddedPartWork(), epoch = work.activate(), native = deferred<void>()
    const request = work.run(epoch, () => native.promise)
    expect(work.acknowledgeCleanup(epoch)).toBe(false)
    work.suspend(epoch)
    let drained = false
    const barrier = work.awaitSuspended(epoch).then(() => { drained = true })
    if (order === 'cleanup-first') work.acknowledgeCleanup(epoch)
    else { native.resolve(); await request }
    await Promise.resolve()
    expect(drained).toBe(false)
    expect(() => work.resume()).toThrowError(EmbeddedPartWorkError)
    if (order === 'cleanup-first') { native.resolve(); await request }
    else work.acknowledgeCleanup(epoch)
    await barrier
    expect(work.isSuspended(epoch)).toBe(true)
    expect(work.acknowledgeCleanup(epoch)).toBe(true)
  })

  it('freezes new producers synchronously even inside a timer cancellation callback', async () => {
    const work = createEmbeddedPartWork(), epoch = work.activate(), send = vi.fn(async () => 1)
    let rejected!: Promise<unknown>
    work.registerTimer(epoch, () => { rejected = work.run(epoch, send).catch(reason => reason) })
    work.suspend(epoch)
    expect(await rejected).toMatchObject({ code: 'inactive' })
    expect(send).not.toHaveBeenCalled()
    expect(work.registerTimer(epoch, vi.fn())).toBeNull()
    work.acknowledgeCleanup(epoch); await work.awaitSuspended(epoch)
  })

  it('does not authorize cached input after resume until current-activation work completes', async () => {
    const work = createEmbeddedPartWork(), previous = work.activate(), snapshot = witness()
    work.setSnapshot(previous, snapshot); await work.run(previous, async () => 1)
    expect(work.markReady(previous, snapshot)).toBe(true)
    work.suspend(previous); work.acknowledgeCleanup(previous); await work.awaitSuspended(previous)
    const current = work.resume()
    expect(current).not.toBe(previous)
    expect(current.epoch).toBeGreaterThan(previous.epoch)
    work.setSnapshot(current, snapshot)
    expect(work.markReady(current, snapshot)).toBe(false)
    expect(work.acknowledgeCleanup(previous)).toBe(false)
    expect(work.setSnapshot(previous, witness())).toBe(false)
    await work.run(current, async () => 2)
    expect(work.markReady(current, snapshot)).toBe(true)
    expect(work.markReady(previous, snapshot)).toBe(false)
    expect(work.isReady(current, snapshot)).toBe(true)
  })

  it('rejects equal-content replacement and an input-identity ABA while the old producer is pending', async () => {
    const work = createEmbeddedPartWork<{ id: string }>(), epoch = work.activate(), first = { id: 'same' }, equal = { id: 'same' }, native = deferred<void>()
    work.setSnapshot(epoch, first)
    const request = work.run(epoch, () => native.promise)
    work.setSnapshot(epoch, equal)
    expect(work.markReady(epoch, first)).toBe(false)
    work.setSnapshot(epoch, first)
    native.resolve(); await request
    expect(work.markReady(epoch, first)).toBe(false)
    await work.run(epoch, async () => {})
    expect(work.markReady(epoch, first)).toBe(true)
    work.setSnapshot(epoch, null)
    expect(work.isReady(epoch, first)).toBe(false)
  })

  it('rejects a stale queued timer after resume without changing the new ready state', async () => {
    const work = createEmbeddedPartWork(), previous = work.activate(), timer = work.registerTimer(previous, vi.fn())!
    work.suspend(previous); work.acknowledgeCleanup(previous); await work.awaitSuspended(previous)
    const current = work.resume(), snapshot = witness(), send = vi.fn(async () => 0)
    work.setSnapshot(current, snapshot); await work.run(current, async () => 1)
    expect(work.markReady(current, snapshot)).toBe(true)
    await expect(work.runTimer(timer, send)).rejects.toMatchObject({ code: 'inactive' })
    expect(send).not.toHaveBeenCalled()
    expect(work.isReady(current, snapshot)).toBe(true)
  })

  it('does not let an older success authorize a failed latest producer', async () => {
    const work = createEmbeddedPartWork(), epoch = work.activate(), snapshot = witness(), first = deferred<void>(), last = deferred<void>()
    work.setSnapshot(epoch, snapshot)
    const a = work.run(epoch, () => first.promise), b = work.run(epoch, () => last.promise)
    first.resolve(); await a
    const error = new Error('latest build failed'), rejected = expect(b).rejects.toBe(error)
    last.reject(error); await rejected
    expect(work.getState().pending).toBe(0)
    expect(work.markReady(epoch, snapshot)).toBe(false)
  })

  it('preserves all accepted concurrent requests in the suspension barrier', async () => {
    const work = createEmbeddedPartWork(), epoch = work.activate(), first = deferred<void>(), second = deferred<void>()
    const a = work.run(epoch, () => first.promise), b = work.run(epoch, () => second.promise)
    work.suspend(epoch); work.acknowledgeCleanup(epoch)
    let drained = false
    const barrier = work.awaitSuspended(epoch).then(() => { drained = true })
    second.resolve(); await b
    expect(work.getState().pending).toBe(1)
    expect(drained).toBe(false)
    first.resolve(); await a; await barrier
  })

  it('dispose invalidates waiters and tokens without pretending an accepted request was cancelled', async () => {
    const work = createEmbeddedPartWork(), epoch = work.activate(), native = deferred<number>(), send = vi.fn(async () => 9), cancel = vi.fn()
    const request = work.run(epoch, () => native.promise)
    work.registerTimer(epoch, cancel); work.suspend(epoch)
    const barrier = expect(work.awaitSuspended(epoch)).rejects.toMatchObject({ code: 'disposed' })
    work.dispose(); await barrier
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(work.getState()).toMatchObject({ phase: 'disposed', pending: 1, timers: 0, ready: false })
    await expect(work.run(epoch, send)).rejects.toMatchObject({ code: 'disposed' })
    expect(send).not.toHaveBeenCalled()
    native.resolve(7); expect(await request).toBe(7)
    expect(work.getState().pending).toBe(0)
    expect(work.acknowledgeCleanup(epoch)).toBe(false)
    expect(() => work.resume()).toThrowError(EmbeddedPartWorkError)
    work.dispose()
  })

  it('retains cancellation failure and cannot resolve a reentrant barrier before cancellation finishes', async () => {
    const work = createEmbeddedPartWork(), epoch = work.activate(), native = deferred<void>(), reason = new Error('timer cancellation failed')
    const request = work.run(epoch, () => native.promise)
    let barrier!: Promise<void>
    work.registerTimer(epoch, () => {
      work.acknowledgeCleanup(epoch)
      barrier = work.awaitSuspended(epoch)
      expect(work.isSuspended(epoch)).toBe(false)
      throw reason
    })
    expect(() => work.suspend(epoch)).toThrow(reason)
    const rejected = expect(barrier).rejects.toBe(reason)
    native.resolve(); await request; await rejected
    expect(work.isSuspended(epoch)).toBe(false)
    expect(() => work.resume()).toThrowError(EmbeddedPartWorkError)
    work.dispose()
  })

  it('requires a fresh suspension check after an awaited barrier has already resolved', async () => {
    const work = createEmbeddedPartWork(), previous = work.activate()
    await expect(work.awaitSuspended(previous)).rejects.toMatchObject({ code: 'not-suspended' })
    work.suspend(previous)
    const barrier = work.awaitSuspended(previous)
    work.acknowledgeCleanup(previous)
    const current = work.resume()
    await barrier
    expect(work.isSuspended(previous)).toBe(false)
    expect(work.getState().activation).toBe(current)
    await expect(work.awaitSuspended(previous)).rejects.toMatchObject({ code: 'not-suspended' })
  })
})
