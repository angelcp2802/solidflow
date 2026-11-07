import { Activity, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { assemblyDefinitionKey, validateAssemblyDocument, type AssemblyDocument, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import type { Document } from '../model/document'
import { prepareAssemblyEmbeddedPartReturn, resolveAssemblyEmbeddedPartEdit, retainAssemblyEmbeddedPartEdit,
  type AssemblyEmbeddedPartEditContext, type AssemblyEmbeddedPartEditTicket, type AssemblyEmbeddedPartReturn } from './assemblyEmbeddedPartEdit'
import type { EmbeddedPartBuildSnapshot, EmbeddedPartEditorProps } from './embeddedPartEditor'
import { createEmbeddedPartWork, type EmbeddedPartActivation, type EmbeddedPartWork } from './embeddedPartWork'

export interface AssemblyEmbeddedPartEditorOptions {
  getContext: () => AssemblyEmbeddedPartEditContext
  blocked: () => boolean
  canLeaveReview: () => boolean
  renderPartEditor?: (props: EmbeddedPartEditorProps) => ReactNode
  onEnter: () => void
  onRestore: () => void
  onReview: (prepared: AssemblyEmbeddedPartReturn, ticket: AssemblyEmbeddedPartEditTicket, isCurrent: () => boolean) => Promise<void>
  discardReview: () => Promise<unknown>
  onError: (message: string) => void
}

type Phase = 'editing' | 'suspending' | 'reviewpending' | 'reviewing' | 'failed' | 'resuming' | 'discarding'
interface EditSession {
  ticket: AssemblyEmbeddedPartEditTicket
  work: EmbeddedPartWork<EmbeddedPartBuildSnapshot>
  activation: EmbeddedPartActivation
  phase: Phase
  transition: number
  startedSuspension: number
  prepared: AssemblyEmbeddedPartReturn | null
  changed: boolean
  unfinished: boolean
  assemblyName: string
  componentName: string
  reviewPromise: Promise<void> | null
}

const message = (reason: unknown): string => reason instanceof Error ? reason.message : 'No se pudo completar la edición de la pieza.'

function componentName(ticket: AssemblyEmbeddedPartEditTicket): string {
  const document = validateAssemblyDocument(ticket.document)
  const definitions = new Map([document, ...document.definitions].map(value => [assemblyDefinitionKey(value), value]))
  let node: AssemblyDocument | EmbeddedAssemblyDefinition = document
  for (const [index, id] of ticket.occurrencePath.entries()) {
    const occurrence = node.occurrences.find(value => value.id === id)
    if (!occurrence) throw Error('La ocurrencia de la pieza ya no está disponible.')
    if (index === ticket.occurrencePath.length - 1) return occurrence.name
    const definition = definitions.get(assemblyDefinitionKey(occurrence.definition))
    if (definition?.kind !== 'assembly') throw Error('El ámbito de la pieza ya no está disponible.')
    node = definition
  }
  throw Error('Selecciona una ocurrencia de pieza.')
}

async function settled(promises: readonly Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(promises)
  for (const result of results) if (result.status === 'rejected') throw result.reason
}

function DiscardEmbeddedPartDialog({ onCancel, onDiscard }: { onCancel: () => void; onDiscard: () => void }) {
  const title = useId(), element = useRef<HTMLDivElement>(null), cancel = useRef<HTMLButtonElement>(null)
  const callbacks = useRef({ onCancel, onDiscard }); callbacks.current = { onCancel, onDiscard }
  useEffect(() => {
    const previous = document.activeElement
    cancel.current?.focus()
    const buttons = () => [...element.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []]
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); callbacks.current.onCancel(); return }
      if (event.key === 'Tab') {
        const targets = buttons(), index = targets.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.shiftKey ? (index <= 0 ? targets.length - 1 : index - 1) : (index + 1) % targets.length
        event.preventDefault(); event.stopImmediatePropagation(); targets[next]?.focus(); return
      }
      if (event.ctrlKey || event.metaKey || event.altKey || !element.current?.contains(event.target as Node)) {
        event.preventDefault(); event.stopImmediatePropagation(); return
      }
      event.stopPropagation()
    }
    const containFocus = (event: FocusEvent) => { if (!element.current?.contains(event.target as Node)) cancel.current?.focus() }
    const blockBackground = (event: Event) => { if (!element.current?.contains(event.target as Node)) { event.preventDefault(); event.stopImmediatePropagation() } }
    window.addEventListener('keydown', keyboard, true); window.addEventListener('focusin', containFocus, true)
    window.addEventListener('pointerdown', blockBackground, true); window.addEventListener('click', blockBackground, true)
    return () => {
      window.removeEventListener('keydown', keyboard, true); window.removeEventListener('focusin', containFocus, true)
      window.removeEventListener('pointerdown', blockBackground, true); window.removeEventListener('click', blockBackground, true)
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])
  return <div className="assembly-modal-backdrop"><div ref={element} className="assembly-modal" role="dialog" aria-modal="true" aria-labelledby={title}>
    <h2 id={title}>Descartar edición de pieza</h2>
    <p>Los cambios de esta pieza no se han aplicado al ensamblaje. ¿Quieres descartarlos?</p>
    <div><button ref={cancel} type="button" onClick={onCancel}>Seguir revisando</button><button type="button" onClick={onDiscard}>Descartar edición</button></div>
  </div></div>
}

/** This owner remains outside Activity. Only the temporary editor's effects are
 * suspended; no assembly history, file association or grant moves into it. */
export function useAssemblyEmbeddedPartEditor(options: AssemblyEmbeddedPartEditorOptions) {
  const handlers = useRef(options); handlers.current = options
  const current = useRef<EditSession | null>(null), mounted = useRef(true)
  const [revision, render] = useState(0), [confirmDiscard, setConfirmDiscard] = useState<EditSession | null>(null)
  const publish = () => { if (mounted.current) render(value => value + 1) }
  const report = (reason: unknown) => { if (mounted.current) handlers.current.onError(message(reason)) }
  const same = (session: EditSession, transition: number) => mounted.current && current.current === session && session.transition === transition
  const baseCurrent = (session: EditSession) => {
    try { return !!resolveAssemblyEmbeddedPartEdit(session.ticket, handlers.current.getContext()) }
    catch { return false }
  }
  const unapplied = (session: EditSession | null): boolean => !!session && (session.changed || session.unfinished || session.phase !== 'editing')
  const setPhase = (session: EditSession, phase: Phase) => { session.phase = phase; session.transition++; publish(); return session.transition }
  const clear = (session: EditSession, restore: boolean) => {
    if (current.current !== session) return
    session.transition++; session.work.dispose(); current.current = null
    setConfirmDiscard(null); publish()
    if (restore) handlers.current.onRestore()
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      const session = current.current; current.current = null
      if (session) { session.transition++; session.work.dispose() }
    }
  }, [])

  const begin = (occurrencePath: readonly string[]): boolean => {
    if (!mounted.current || current.current || !handlers.current.renderPartEditor || handlers.current.blocked()) return false
    let work: EmbeddedPartWork<EmbeddedPartBuildSnapshot> | null = null
    try {
      handlers.current.onEnter()
      const context = handlers.current.getContext(), ticket = retainAssemblyEmbeddedPartEdit(context, occurrencePath, crypto.randomUUID())
      if (!ticket || handlers.current.blocked()) return false
      work = createEmbeddedPartWork<EmbeddedPartBuildSnapshot>()
      const activation = work.activate()
      current.current = { ticket, work, activation, phase: 'editing', transition: 0, startedSuspension: -1, prepared: null,
        changed: false, unfinished: false, assemblyName: context.document.name, componentName: componentName(ticket), reviewPromise: null }
      publish(); return true
    } catch (reason) { work?.dispose(); report(reason); return false }
  }

  const returnPart = (session: EditSession, document: Document, activation: EmbeddedPartActivation, snapshot: EmbeddedPartBuildSnapshot): boolean => {
    if (current.current !== session || session.phase !== 'editing' || activation !== session.activation
      || snapshot.document !== document || !session.work.isReady(activation, snapshot)) return false
    try {
      const prepared = prepareAssemblyEmbeddedPartReturn(session.ticket, handlers.current.getContext(), document)
      if (snapshot.features !== document.features) return false
      session.prepared = prepared; session.changed = prepared.changed; session.unfinished = false
      setPhase(session, 'suspending')
      if (!session.work.suspend(activation)) throw Error('El editor de la pieza no está en una sesión activa.')
      return true
    } catch (reason) {
      if (current.current === session && current.current.phase === 'suspending') setPhase(session, 'failed')
      report(reason); return false
    }
  }

  // Effect timing is not the barrier: the ledger requires cleanup acknowledgement
  // and settlement of all requests registered outside the child effect lifecycle.
  useEffect(() => {
    const session = current.current
    if (!session || session.phase !== 'suspending' || session.startedSuspension === session.transition) return
    const transition = session.transition, activation = session.activation
    session.startedSuspension = transition
    const handoff = async () => {
      try {
        await session.work.awaitSuspended(activation)
        if (!same(session, transition) || session.phase !== 'suspending') return
        if (!session.work.isSuspended(activation) || !baseCurrent(session) || !session.prepared) throw Error('El origen cambió antes de revisar la pieza.')
        if (!session.prepared.changed) { clear(session, true); return }
        const prepared = session.prepared, attempt = setPhase(session, 'reviewpending')
        const isCurrent = () => same(session, attempt) && (session.phase === 'reviewpending' || session.phase === 'reviewing') && baseCurrent(session)
        // Store before invoking onReview, including if that callback requests Cancel.
        session.reviewPromise = Promise.resolve().then(async () => {
          try {
            if (!isCurrent()) return
            await handlers.current.onReview(prepared, session.ticket, isCurrent)
            if (!same(session, attempt) || session.phase !== 'reviewpending') return
            if (!baseCurrent(session)) throw Error('El origen cambió durante la revisión de la pieza.')
            session.phase = 'reviewing'; publish()
          } catch (reason) { if (same(session, attempt)) { setPhase(session, 'failed'); report(reason) } }
        })
      } catch (reason) { if (same(session, transition)) { setPhase(session, 'failed'); report(reason) } }
    }
    void handoff()
  }, [revision])

  const resumeAfter = (cleanup: Promise<unknown>): void => {
    const session = current.current
    if (session && (session.phase === 'reviewing' || session.phase === 'failed') && !handlers.current.canLeaveReview()) {
      void cleanup.catch(report); return
    }
    if (!session || session.phase === 'editing' || session.phase === 'resuming' || session.phase === 'discarding') {
      void cleanup.catch(report); return
    }
    const transition = setPhase(session, 'resuming'), activation = session.activation, review = session.reviewPromise
    const resume = async () => {
      try {
        await settled([cleanup, review ?? Promise.resolve(), session.work.awaitSuspended(activation)])
        if (!same(session, transition)) return
        if (!baseCurrent(session) || !session.work.isSuspended(activation)) throw Error('La sesión de la pieza cambió antes de reanudarla.')
        session.activation = session.work.resume(); session.prepared = null; session.reviewPromise = null
        setPhase(session, 'editing')
      } catch (reason) { if (same(session, transition)) { setPhase(session, 'failed'); report(reason) } }
    }
    void resume()
  }

  const discard = (): void => {
    const session = current.current
    if (!session || session.phase === 'discarding') return
    if ((session.phase === 'reviewing' || session.phase === 'failed') && !handlers.current.canLeaveReview()) return
    setConfirmDiscard(null)
    const transition = setPhase(session, 'discarding'), activation = session.activation, review = session.reviewPromise
    try { if (!session.work.suspend(activation)) throw Error('La sesión de la pieza no se puede suspender.') }
    catch (reason) { setPhase(session, 'failed'); report(reason); return }
    const finish = async () => {
      try {
        await settled([session.work.awaitSuspended(activation), review ?? Promise.resolve()])
        if (!same(session, transition)) return
        await handlers.current.discardReview()
        if (same(session, transition)) clear(session, true)
      } catch (reason) { if (same(session, transition)) { setPhase(session, 'failed'); report(reason) } }
    }
    void finish()
  }

  const session = current.current, visible = session?.phase === 'editing'
  const requestDiscard = () => {
    if (!session || current.current !== session || session.phase !== 'reviewing' && session.phase !== 'failed') return
    if (!handlers.current.canLeaveReview()) return
    if (session.changed || session.unfinished) setConfirmDiscard(session)
    else discard()
  }
  const editorProps: EmbeddedPartEditorProps | null = session ? {
    sessionId: session.ticket.nonce, assemblyName: session.assemblyName, componentName: session.componentName,
    initialDocument: session.ticket.initialDocument, baselineSerialized: session.ticket.baselineSerialized,
    work: session.work, activation: session.activation, active: visible,
    onReturn: (document, activation, snapshot) => returnPart(session, document, activation, snapshot),
    onDiscard: () => { if (current.current === session && session.phase === 'editing' && editorProps?.activation === session.activation) discard() },
    onDirtyChange: (changed, unfinished) => {
      if (current.current !== session || session.phase !== 'editing' || editorProps?.activation !== session.activation) return
      // Child compares baseline content, never its separate file-saved marker.
      if (session.changed !== changed || session.unfinished !== unfinished) { session.changed = changed; session.unfinished = unfinished; publish() }
    },
  } : null
  const editor = session && editorProps ? <div className="assembly-embedded-part-editor">
    <Activity key={session.ticket.nonce} mode={visible ? 'visible' : 'hidden'}>{handlers.current.renderPartEditor?.(editorProps)}</Activity>
    {!visible && !['reviewpending', 'reviewing', 'failed'].includes(session.phase) && <p role="status">Preparando la edición de la pieza…</p>}
  </div> : null
  const controls = session && (session.phase === 'reviewing' || session.phase === 'failed') ? <>
    <section className="assembly-embedded-part-controls" aria-label="Edición de pieza incorporada">
      <p>Los cambios de <strong>{session.componentName}</strong> siguen pendientes de aplicar al ensamblaje.</p>
      <button type="button" disabled={!handlers.current.canLeaveReview()} onClick={() => {
        if (current.current !== session || session.phase !== 'reviewing' && session.phase !== 'failed') return
        if (!handlers.current.canLeaveReview()) return
        // The cleanup runs after resumeAfter synchronously revokes this attempt.
        const cleanup = Promise.resolve().then(() => handlers.current.discardReview())
        resumeAfter(cleanup)
      }}>Volver a editar pieza</button>
      <button type="button" disabled={!handlers.current.canLeaveReview()} onClick={requestDiscard}>Descartar edición</button>
    </section>
    {confirmDiscard === session && <DiscardEmbeddedPartDialog
      onCancel={() => setConfirmDiscard(value => value === session ? null : value)}
      onDiscard={() => { if (current.current === session && (session.phase === 'reviewing' || session.phase === 'failed')) discard() }} />}
  </> : null

  return {
    open: !!session,
    isOpen: () => current.current !== null,
    isReviewing: () => current.current?.phase === 'reviewing',
    parentActive: !session || session.phase === 'reviewpending' || session.phase === 'reviewing' || session.phase === 'failed',
    dirty: unapplied(session),
    hasUnappliedWork: () => unapplied(current.current),
    begin, resumeAfter,
    complete: () => { const owned = current.current; if (owned) clear(owned, false) },
    discard, editor, controls,
  }
}
