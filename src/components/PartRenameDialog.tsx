import { useId, useLayoutEffect, useRef, useState } from 'react'

interface PartRenameDialogProps {
  name: string
  onRename: (name: string) => void
  onClose: () => void
}

export default function PartRenameDialog({ name, onRename, onClose }: PartRenameDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null), save = useRef<HTMLButtonElement>(null)
  const titleId = useId(), errorId = titleId + '-error'
  const [error, setError] = useState('')

  useLayoutEffect(() => {
    const element = dialog.current
    if (!element) return
    const opener = document.activeElement
    element.showModal()
    input.current?.focus()
    return () => {
      if (element.open) element.close()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  return <dialog ref={dialog} className="part-rename-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose() }}
    onKeyDown={event => {
      if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey || event.nativeEvent.isComposing) return
      const active = document.activeElement
      const target = event.shiftKey && active === input.current ? save.current
        : !event.shiftKey && active === save.current ? input.current : null
      if (target) { event.preventDefault(); target.focus() }
    }}>
    <form className="modal small" onSubmit={event => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      try {
        onRename(String(data.get('name')).trim())
        onClose()
      } catch (reason) { setError((reason as Error).message) }
    }}>
      <h2 id={titleId}>Nombre de la pieza</h2>
      <input ref={input} className="text-input" name="name" aria-label="Nombre de la pieza"
        aria-invalid={!!error || undefined} aria-describedby={error ? errorId : undefined}
        defaultValue={name} required maxLength={100} onInput={() => setError('')} />
      {error && <p id={errorId} className="part-rename-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="outline-button" onClick={onClose}>Cancelar</button>
        <button ref={save} type="submit" className="primary-button">Guardar</button>
      </div>
    </form>
  </dialog>
}
