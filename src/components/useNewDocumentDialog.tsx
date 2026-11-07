import { useEffect, useRef, useState } from 'react'
import { Box, File } from 'lucide-react'
import './new-document-dialog.css'

export type NewDocumentKind = 'part' | 'assembly'

/** One owner per choice; closing/unmounting settles it without creating a document. */
export function newDocumentChoice() {
  let resolve: ((kind: NewDocumentKind | null) => void) | null = null
  return {
    get pending() { return resolve !== null },
    choose(): Promise<NewDocumentKind | null> {
      if (resolve) return Promise.resolve(null)
      return new Promise(answer => { resolve = answer })
    },
    finish(kind: NewDocumentKind | null) { const answer = resolve; resolve = null; answer?.(kind) },
  }
}

/** Revalidate at both asynchronous boundaries; a cancelled/stale request has no commit. */
export async function requestNewDocument(options: {
  choose: () => Promise<NewDocumentKind | null>
  current: () => boolean
  confirm: () => Promise<boolean>
  create: (kind: NewDocumentKind) => void
}): Promise<boolean> {
  const kind = await options.choose()
  if (!kind || !options.current() || !(await options.confirm()) || !options.current()) return false
  options.create(kind)
  return true
}

export function NewDocumentDialog({ onChoose }: { onChoose: (kind: NewDocumentKind | null) => void }) {
  return <div className="new-document-backdrop"><section className="new-document-dialog" role="dialog" aria-modal="true" aria-labelledby="new-document-title">
    <h2 id="new-document-title">Nuevo documento</h2>
    <p>Elige el documento que quieres crear.</p>
    <div className="new-document-options">
      <button type="button" data-new-document-kind="part" onClick={() => onChoose('part')}><File aria-hidden="true" size={30} /><strong>Pieza</strong></button>
      <button type="button" data-new-document-kind="assembly" onClick={() => onChoose('assembly')}><Box aria-hidden="true" size={30} /><strong>Ensamblaje</strong></button>
    </div>
    <footer><button type="button" onClick={() => onChoose(null)}>Cancelar</button></footer>
  </section></div>
}

export function useNewDocumentDialog() {
  const choice = useRef<ReturnType<typeof newDocumentChoice> | null>(null)
  choice.current ??= newDocumentChoice()
  const [isOpen, setOpen] = useState(false), mounted = useRef(false), restore = useRef<HTMLElement | null>(null)
  const finish = (kind: NewDocumentKind | null) => { choice.current!.finish(kind); if (mounted.current) setOpen(false) }
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; choice.current!.finish(null) }
  }, [])
  useEffect(() => {
    if (!isOpen) return
    const dialog = document.querySelector<HTMLElement>('[aria-labelledby="new-document-title"]')
    const buttons = () => [...dialog?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []]
    buttons()[0]?.focus()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finish(null); return }
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.toLowerCase() === 'f') {
        event.preventDefault(); event.stopImmediatePropagation(); return
      }
      if (event.key === 'Tab') {
        const targets = buttons(), index = targets.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.shiftKey ? (index <= 0 ? targets.length - 1 : index - 1) : (index + 1) % targets.length
        event.preventDefault(); event.stopImmediatePropagation(); targets[next]?.focus()
        return
      }
      // Native Enter/Space activation remains available; background handlers do not.
      event.stopPropagation()
    }
    const containFocus = (event: FocusEvent) => { if (!dialog?.contains(event.target as Node)) buttons()[0]?.focus() }
    const blockBackground = (event: Event) => { if (!dialog?.contains(event.target as Node)) { event.preventDefault(); event.stopImmediatePropagation() } }
    window.addEventListener('keydown', keyboard, true)
    window.addEventListener('focusin', containFocus, true)
    window.addEventListener('pointerdown', blockBackground, true)
    window.addEventListener('click', blockBackground, true)
    return () => {
      window.removeEventListener('keydown', keyboard, true); window.removeEventListener('focusin', containFocus, true)
      window.removeEventListener('pointerdown', blockBackground, true); window.removeEventListener('click', blockBackground, true)
      if (restore.current?.isConnected) restore.current.focus({ preventScroll: true })
    }
  }, [isOpen])
  const choose = () => {
    if (!mounted.current || choice.current!.pending) return Promise.resolve(null)
    restore.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const result = choice.current!.choose(); setOpen(true); return result
  }
  return { choose, isOpen, pending: () => choice.current!.pending, dialog: isOpen ? <NewDocumentDialog onChoose={finish} /> : null }
}
