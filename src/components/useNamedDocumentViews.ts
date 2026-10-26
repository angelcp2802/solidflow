import { useLayoutEffect, useRef, useState } from 'react'
import { MAX_NAMED_VIEWS, normalizeNamedViewName, validateNamedViews, validateSavedCameraView, type NamedView, type SavedCameraView } from '../model/namedViews'
import type { ViewHistory } from './viewNavigation'

export interface NamedViewDocument { namedViews?: NamedView[] }
interface SelectionContext {
  documentSignature: string
  scopePath: readonly string[]
  sessionIdentity: unknown
  scene?: unknown
}

/** Only UI selection ownership may follow an exact root-metadata transaction.
 * Stale tickets remain stale; native witnesses/capabilities never enter here. */
export function rebindNamedViewSelection<T extends SelectionContext>(selection: T | null,
  beforeDocument: NamedViewDocument, afterDocument: NamedViewDocument, before: SelectionContext, after: SelectionContext): T | null {
  const sameScope = (a: SelectionContext, b: SelectionContext) => a.scopePath.length === b.scopePath.length
    && a.scopePath.every((value, index) => value === b.scopePath[index])
  if (!selection || !before.documentSignature || !after.documentSignature || before.sessionIdentity == null || after.sessionIdentity == null
    || !sameDocumentExceptNamedViews(beforeDocument, afterDocument)
    || selection.documentSignature !== before.documentSignature || !Object.is(selection.sessionIdentity, before.sessionIdentity)
    || !sameScope(selection, before) || selection.scene !== before.scene || !sameScope(before, after) || before.scene !== after.scene) return selection
  return { ...selection, documentSignature: after.documentSignature, sessionIdentity: after.sessionIdentity }
}

/** UI metadata equivalence only. Never changes native document authentication. */
export function sameDocumentExceptNamedViews<T extends NamedViewDocument>(before: T, after: T): boolean {
  const { namedViews: _before, ...left } = before, { namedViews: _after, ...right } = after
  return JSON.stringify(left) === JSON.stringify(right)
}

export function withDocumentNamedViews<T extends NamedViewDocument>(document: T, values: NamedView[]): T {
  const views = validateNamedViews(values), next = { ...document }
  if (views.length) next.namedViews = views
  else delete next.namedViews
  return next
}

interface Options<T extends NamedViewDocument> {
  document: T
  identity: unknown
  scene: unknown
  blocked: boolean
  isCurrent: () => boolean
  history: ViewHistory
  commit: (document: T) => T
  recall: (view: SavedCameraView) => void
}

/** A modal owns one committed document/scene context, extended only by its own
 * synchronous catalogue edits. Camera recall never enters document history. */
export function useNamedDocumentViews<T extends NamedViewDocument>(options: Options<T>) {
  const [isOpen, setOpen] = useState(false), current = useRef(options), mounted = useRef(false)
  const active = useRef<{ document: T; identity: unknown; scene: unknown } | null>(null)
  const close = () => { active.current = null; setOpen(false) }
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current = null } }, [])
  useLayoutEffect(() => {
    current.current = options
    const ticket = active.current
    if (ticket && (options.blocked || options.history.navigating || ticket.document !== options.document
      || ticket.identity !== options.identity || ticket.scene !== options.scene)) close()
  })
  const renderedTicket = active.current
  const live = () => {
    const value = current.current, ticket = active.current
    if (!mounted.current || !ticket || ticket !== renderedTicket || value.blocked || !value.isCurrent() || value.history.navigating
      || ticket.document !== value.document || ticket.identity !== value.identity || ticket.scene !== value.scene)
      throw Error('El documento o la vista han cambiado. Vuelve a abrir Vistas guardadas.')
    return { value, ticket }
  }
  const commit = (value: Options<T>, ticket: NonNullable<typeof active.current>, next: T) => {
    if (!sameDocumentExceptNamedViews(value.document, next)) throw Error('Sólo se puede modificar el catálogo de vistas.')
    const owned = value.commit(next)
    ticket.document = owned
  }
  let captureAvailable = false
  try { const camera = options.history.current; captureAvailable = !!camera && !!validateSavedCameraView(camera) } catch { /* No admissible current camera. */ }
  return {
    isOpen,
    views: options.document.namedViews ?? [],
    canOpen: !options.blocked && !options.history.navigating,
    canSave: !options.blocked && !options.history.navigating && captureAvailable && (options.document.namedViews?.length ?? 0) < MAX_NAMED_VIEWS,
    open() {
      const value = current.current
      if (!mounted.current || value.blocked || !value.isCurrent() || value.history.navigating || active.current) return
      active.current = { document: value.document, identity: value.identity, scene: value.scene }; setOpen(true)
    },
    close,
    save(name: string) {
      const { value, ticket } = live(), id = crypto.randomUUID()
      const view = validateSavedCameraView(value.history.current)
      const views = [...(value.document.namedViews ?? []), { id, name: normalizeNamedViewName(name), view }]
      commit(value, ticket, withDocumentNamedViews(value.document, views))
      return id
    },
    show(id: string) {
      const { value } = live(), found = validateNamedViews(value.document.namedViews ?? []).find(view => view.id === id)
      if (!found) throw Error('La vista guardada ya no está disponible.')
      value.recall(found.view); close()
    },
    remove(id: string) {
      const { value, ticket } = live(), views = validateNamedViews(value.document.namedViews ?? [])
      if (!views.some(view => view.id === id)) throw Error('La vista guardada ya no está disponible.')
      commit(value, ticket, withDocumentNamedViews(value.document, views.filter(view => view.id !== id)))
    },
  }
}
