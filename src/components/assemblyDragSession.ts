import { validateRigidPose, type RigidPose } from '../model/rigidPose'

type DragReply = { status: 'ready'; token: string } | { status: 'rejected'; message: string }
type Ready<T extends DragReply> = Extract<T, { status: 'ready' }>
export interface AssemblyDragSession { target(pose: RigidPose): void; end(): void; cancel(): void }
export interface AssemblyDragSessionOptions<T extends DragReply> {
  request: (pose: RigidPose) => Promise<T>
  discard: (token: string) => void
  /** An intermediate verified reply may be displayed but cannot enable Apply. */
  onVerified: (reply: Ready<T>, final: boolean) => void
  onRejected: (message: string) => void
  onEmpty: () => void
}
function ready<T extends DragReply>(reply: T): reply is Ready<T> { return reply.status === 'ready' }

/** Lifecycle/coalescing only: at most one RPC and one latest unsent target.
 * No provisional pose or geometry is emitted. A final callback transfers its
 * genuine token to the caller; cancellation also revokes future replies.
 */
export function createAssemblyDragSession<T extends DragReply>(options: AssemblyDragSessionOptions<T>): AssemblyDragSession {
  let closed = false, ended = false, inFlight = false, pending: RigidPose | null = null
  let verified: Ready<T> | null = null, failure: string | null = null, sent = false
  const release = () => { const previous = verified; verified = null; if (previous) options.discard(previous.token) }
  const finish = () => {
    if (closed || !ended || inFlight || pending) return
    closed = true
    if (verified) { const final = verified; verified = null; options.onVerified(final, true) }
    else if (failure !== null) options.onRejected(failure)
    else options.onEmpty()
  }
  const pump = () => {
    if (closed || inFlight || !pending) { finish(); return }
    const target = pending; pending = null; release(); failure = null; sent = true; inFlight = true
    // Starting on a microtask also handles a synchronously throwing adapter.
    void Promise.resolve().then(() => closed ? null : options.request(target)).then(reply => {
      inFlight = false
      if (reply === null) return
      if (closed) { if (ready(reply)) options.discard(reply.token); return }
      if (ready(reply)) {
        verified = reply
        if (ended && !pending) { finish(); return }
        options.onVerified(reply, false)
      } else if (reply.status === 'rejected') failure = reply.message
      if (pending) pump()
      else if (ended) finish()
      // A latest rejection while the pointer is down invalidates any prior
      // view, but the gesture can still send a subsequent corrected target.
      else if (failure !== null) options.onRejected(failure)
    }, reason => {
      inFlight = false
      if (closed) return
      failure = reason instanceof Error ? reason.message : 'No se pudo verificar el destino del arrastre.'
      if (pending) pump()
      else if (ended) finish()
      else options.onRejected(failure)
    })
  }
  return {
    target(pose) {
      if (closed || ended) return
      pending = validateRigidPose(pose); pump()
    },
    end() { if (closed || ended) return; ended = true; if (!sent && !pending) finish(); else pump() },
    cancel() { if (closed) return; closed = true; pending = null; failure = null; release() },
  }
}
