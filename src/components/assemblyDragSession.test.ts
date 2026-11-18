import { expect, it, vi } from 'vitest'
import { createAssemblyDragSession } from './assemblyDragSession'
import type { RigidPose } from '../model/rigidPose'

// Symbolic transport lifecycle replies only. There is no CAD scene, worker,
// geometry, native proof or accepted assembly solve in these controlled tests.
type Reply = { status: 'ready'; token: string; label: string } | { status: 'rejected'; message: string }
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const pose = (x: number): RigidPose => ({ translation: [x, 2, 3], rotation: [0, 0, 0, 1] })
const response = (token: string): Reply => ({ status: 'ready', token, label: token })
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve() }
function harness() {
  const calls: { pose: RigidPose; result: ReturnType<typeof deferred<Reply>> }[] = []
  const request = vi.fn((value: RigidPose) => { const result = deferred<Reply>(); calls.push({ pose: value, result }); return result.promise })
  const discard = vi.fn(), onVerified = vi.fn(), onRejected = vi.fn(), onEmpty = vi.fn()
  return { calls, request, discard, onVerified, onRejected, onEmpty,
    session: createAssemblyDragSession<Reply>({ request, discard, onVerified, onRejected, onEmpty }) }
}
it('coalesces an arbitrary target burst into one in-flight RPC and the latest unsent target', async () => {
  const h = harness(); h.session.target(pose(1)); await flush()
  for (let x = 2; x <= 100; x++) h.session.target(pose(x))
  expect(h.calls).toHaveLength(1); expect(h.onVerified).not.toHaveBeenCalled()
  h.calls[0].result.resolve(response('first')); await flush()
  expect(h.calls).toHaveLength(2); expect(h.calls[1].pose.translation).toEqual([100, 2, 3])
  expect(h.onVerified).toHaveBeenCalledWith(response('first'), false); expect(h.discard).toHaveBeenCalledExactlyOnceWith('first')
  h.session.end(); h.calls[1].result.resolve(response('last')); await flush()
  expect(h.onVerified).toHaveBeenLastCalledWith(response('last'), true); expect(h.discard).not.toHaveBeenCalledWith('last')
  expect(h.onEmpty).not.toHaveBeenCalled(); expect(h.onRejected).not.toHaveBeenCalled()
})
it('keeps a verified reply intermediate until pointer end transfers the same genuine token', async () => {
  const h = harness(); h.session.target(pose(1)); await flush(); h.calls[0].result.resolve(response('one')); await flush()
  expect(h.onVerified.mock.calls).toEqual([[response('one'), false]])
  h.session.end(); h.session.end(); expect(h.onVerified.mock.calls).toEqual([[response('one'), false], [response('one'), true]])
  h.session.target(pose(2)); h.session.cancel(); await flush(); expect(h.calls).toHaveLength(1); expect(h.discard).not.toHaveBeenCalled()
})
it('waits for the latest pending request after pointer end instead of transferring an obsolete reply', async () => {
  const h = harness(); h.session.target(pose(1)); await flush(); h.session.target(pose(2)); h.session.end()
  h.calls[0].result.resolve(response('obsolete')); await flush()
  expect(h.onVerified).toHaveBeenCalledWith(response('obsolete'), false); expect(h.onVerified).not.toHaveBeenCalledWith(response('obsolete'), true)
  expect(h.calls).toHaveLength(2); h.calls[1].result.resolve(response('final')); await flush()
  expect(h.onVerified).toHaveBeenLastCalledWith(response('final'), true)
})
it('revokes an intermediate capability before sending a new target', async () => {
  const h = harness(); h.session.target(pose(1)); await flush(); h.calls[0].result.resolve(response('previous')); await flush()
  h.session.target(pose(2)); expect(h.discard).toHaveBeenCalledExactlyOnceWith('previous'); await flush(); expect(h.calls).toHaveLength(2)
  h.session.cancel(); h.calls[1].result.resolve(response('late')); await flush(); expect(h.discard).toHaveBeenCalledWith('late')
})
it('cancels a future reply and drops the unsent latest target without presenting either', async () => {
  const h = harness(); h.session.target(pose(1)); await flush(); h.session.target(pose(2)); h.session.cancel(); h.session.cancel()
  h.calls[0].result.resolve(response('late')); await flush()
  expect(h.calls).toHaveLength(1); expect(h.discard).toHaveBeenCalledExactlyOnceWith('late'); expect(h.onVerified).not.toHaveBeenCalled()
  expect(h.onRejected).not.toHaveBeenCalled(); expect(h.onEmpty).not.toHaveBeenCalled()
})
it('does not create a transport request if cancelled before its scheduled dispatch', async () => {
  const h = harness(); h.session.target(pose(1)); h.session.cancel(); await flush(); expect(h.request).not.toHaveBeenCalled()
})
it('cancels a known displayed reply exactly once without transferring Apply ownership', async () => {
  const h = harness(); h.session.target(pose(1)); await flush(); h.calls[0].result.resolve(response('displayed')); await flush()
  h.session.cancel(); h.session.end(); h.session.cancel(); expect(h.discard).toHaveBeenCalledExactlyOnceWith('displayed')
  expect(h.onVerified.mock.calls).toEqual([[response('displayed'), false]])
})
it('a latest rejected reply cannot transfer an earlier displayed capability', async () => {
  const h = harness(); h.session.target(pose(1)); await flush(); h.calls[0].result.resolve(response('old')); await flush()
  h.session.target(pose(2)); h.session.end(); await flush(); h.calls[1].result.resolve({ status: 'rejected', message: 'Actual target rejected' }); await flush()
  expect(h.onRejected).toHaveBeenCalledExactlyOnceWith('Actual target rejected'); expect(h.discard).toHaveBeenCalledWith('old')
  expect(h.onVerified.mock.calls).toEqual([[response('old'), false]])
})
it('continues to a newer queued target after an obsolete rejection without announcing it as final', async () => {
  const h = harness(); h.session.target(pose(1)); await flush(); h.session.target(pose(2)); h.session.end()
  h.calls[0].result.resolve({ status: 'rejected', message: 'Superseded target' }); await flush()
  expect(h.onRejected).not.toHaveBeenCalled(); h.calls[1].result.resolve(response('corrected')); await flush()
  expect(h.onVerified).toHaveBeenCalledExactlyOnceWith(response('corrected'), true)
})
it('can recover during the gesture after a latest rejection while preserving bounded requests', async () => {
  const h = harness(); h.session.target(pose(1)); await flush(); h.calls[0].result.resolve({ status: 'rejected', message: 'First target' }); await flush()
  expect(h.onRejected).toHaveBeenCalledWith('First target'); h.session.target(pose(2)); await flush(); h.calls[1].result.resolve(response('repaired')); await flush(); h.session.end()
  expect(h.calls).toHaveLength(2); expect(h.onVerified).toHaveBeenLastCalledWith(response('repaired'), true)
})
it('reports a final transport failure and ignores a cancelled transport failure', async () => {
  const h = harness(); h.session.target(pose(1)); h.session.end(); await flush(); h.calls[0].result.reject(new Error('Transport failed')); await flush()
  expect(h.onRejected).toHaveBeenCalledExactlyOnceWith('Transport failed')
  const cancelled = harness(); cancelled.session.target(pose(1)); await flush(); cancelled.session.cancel(); cancelled.calls[0].result.reject(new Error('Late error')); await flush()
  expect(cancelled.onRejected).not.toHaveBeenCalled()
})
it('contains a synchronously throwing transport adapter as a latest failure', async () => {
  const onRejected = vi.fn(), session = createAssemblyDragSession<Reply>({ request: () => { throw new Error('Synchronous failure') }, discard: vi.fn(), onVerified: vi.fn(), onEmpty: vi.fn(), onRejected })
  session.target(pose(1)); session.end(); await flush(); expect(onRejected).toHaveBeenCalledExactlyOnceWith('Synchronous failure')
})
it('ends an untouched gesture without requesting or fabricating a preview', () => {
  const h = harness(); h.session.end(); h.session.end(); expect(h.onEmpty).toHaveBeenCalledTimes(1); expect(h.request).not.toHaveBeenCalled(); expect(h.onVerified).not.toHaveBeenCalled()
})
it('detaches and validates intent before queuing it without silently fixing invalid quaternions', async () => {
  const h = harness(), input = pose(7); h.session.target(input); input.translation[0] = 999; await flush()
  expect(h.calls[0].pose.translation).toEqual([7, 2, 3]); expect(() => h.session.target({ ...pose(1), rotation: [0, 0, 0, 2] })).toThrow()
  expect(h.calls).toHaveLength(1); h.session.cancel(); h.calls[0].result.resolve(response('release')); await flush()
})
