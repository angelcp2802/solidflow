import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { MAX_NAMED_VIEWS, MAX_NAMED_VIEW_NAME_LENGTH, normalizeNamedViewName, type NamedView } from '../model/namedViews'
import './named-views-dialog.css'

export interface NamedViewsDialogProps {
  views: readonly NamedView[]
  canSave: boolean
  canUpdate: boolean
  /** Synchronous document transactions; the owner revalidates the current session. */
  onSave: (name: string) => string
  onShow: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
  onUpdate: (id: string) => void
  onClose: () => void
}

/** Native editing defaults remain available inside the name field. */
type DialogKey = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'isComposing' | 'getModifierState'>
export function namedViewTextEditingKey(event: DialogKey, composing = false): boolean {
  if (composing || event.isComposing || event.key === 'Dead') return true
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Backspace', 'Delete'].includes(event.key)) return true
  if ((event.ctrlKey || event.metaKey) && !event.altKey && ['a', 'c', 'v', 'x', 'z', 'y'].includes(event.key.toLowerCase())) return true
  return event.altKey && !event.metaKey && (event.getModifierState('AltGraph') || event.key.length === 1)
}

export function namedViewDialogKeyAction(event: DialogKey, editing: boolean, composing = false): 'close' | 'block' | 'native' {
  if (event.key === 'Escape') return composing || event.isComposing ? 'native' : 'close'
  if ((event.altKey || event.ctrlKey || event.metaKey) && !(editing && namedViewTextEditingKey(event, composing))) return 'block'
  return 'native'
}

/** Document-local catalog editor. Camera and document authority stay with its owner. */
export function NamedViewsDialog(props: NamedViewsDialogProps) {
  const { views, canSave, canUpdate, onSave, onShow, onDelete, onRename, onUpdate } = props
  const titleId = useId(), nameId = useId(), renameId = useId(), errorId = useId()
  const dialog = useRef<HTMLDialogElement>(null), latest = useRef(props), composing = useRef(false)
  const [name, setName] = useState(''), [selectedId, setSelectedId] = useState(''), [error, setError] = useState('')
  const [renameDraft, setRenameDraft] = useState<{ id: string; name: string } | null>(null)
  const selected = views.find(view => view.id === selectedId) ?? views[0]
  const selectedName = selected && renameDraft?.id === selected.id ? renameDraft.name : selected?.name ?? ''
  const full = views.length >= MAX_NAMED_VIEWS
  useLayoutEffect(() => { latest.current = props })
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    const restore = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.showModal()
    const keyboard = (event: KeyboardEvent) => {
      if (!element.open) return
      const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
      const action = namedViewDialogKeyAction(event, editing, composing.current)
      if (action === 'close') {
        event.preventDefault(); event.stopImmediatePropagation(); latest.current.onClose(); return
      }
      if (action === 'block') event.preventDefault()
      // Keep native typing, selection, Tab and button/form activation. No CAD
      // shortcut behind the modal may consume the same keyboard event.
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', keyboard, true)
    return () => {
      window.removeEventListener('keydown', keyboard, true)
      element.close()
      if (restore?.isConnected) restore.focus({ preventScroll: true })
    }
  }, [])
  const act = (action: () => void) => {
    try { action(); setError('') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo cambiar la vista guardada.') }
  }
  const show = () => { if (selected) act(() => onShow(selected.id)) }
  return <dialog ref={dialog} className="named-views-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!composing.current) props.onClose() }}>
    <h2 id={titleId}>Vistas guardadas</h2>
    <p>Guarda la orientación y el encuadre actuales en este documento.</p>
    <div className="named-views-catalog">
      {views.length ? <select aria-label="Vistas de este documento" size={Math.min(8, Math.max(3, views.length))}
        value={selected?.id ?? ''} onChange={event => { setSelectedId(event.target.value); setRenameDraft(null); setError('') }} onDoubleClick={show}>
        {views.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}
      </select> : <p className="named-views-empty">Todavía no hay vistas guardadas.</p>}
      <div className="named-views-actions">
        <button type="button" disabled={!selected} onClick={show}>Mostrar</button>
        <button type="button" disabled={!selected || !canUpdate} title="Sustituir el encuadre seleccionado por el actual"
          onClick={() => { if (selected) act(() => onUpdate(selected.id)) }}>Actualizar vista</button>
        <button type="button" disabled={!selected} onClick={() => {
          if (selected) act(() => { onDelete(selected.id); setSelectedId(''); setRenameDraft(null) })
        }}>Eliminar</button>
      </div>
    </div>
    {selected && <form className="named-views-rename" onSubmit={event => {
      event.preventDefault()
      if (composing.current) return
      act(() => { onRename(selected.id, selectedName); setRenameDraft(null) })
    }}>
      <label htmlFor={renameId}>Nombre de la vista seleccionada</label>
      <div className="named-views-save">
        <input id={renameId} aria-label="Nombre de la vista seleccionada" value={selectedName} maxLength={MAX_NAMED_VIEW_NAME_LENGTH}
          autoComplete="off" required onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}
          aria-describedby={error ? errorId : undefined} onChange={event => { setRenameDraft({ id: selected.id, name: event.target.value }); setError('') }} />
        <button type="submit" disabled={!selectedName.trim() || selectedName.trim() === selected.name}>Renombrar</button>
      </div>
    </form>}
    <form onSubmit={event => {
      event.preventDefault()
      if (!canSave || full || composing.current) return
      act(() => { const id = onSave(normalizeNamedViewName(name)); setSelectedId(id); setRenameDraft(null); setName('') })
    }}>
      <label htmlFor={nameId}>Nombre de la vista</label>
      <div className="named-views-save">
        <input id={nameId} aria-label="Nombre de la vista" value={name} maxLength={MAX_NAMED_VIEW_NAME_LENGTH} autoComplete="off" required
          placeholder="Ejemplo: Detalle del taladro" disabled={!canSave || full}
          onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}
          aria-describedby={error ? errorId : undefined} onChange={event => { setName(event.target.value); setError('') }} />
        <button type="submit" disabled={!canSave || full || !name.trim()}>Guardar vista actual</button>
      </div>
      {full && <p>Se ha alcanzado el límite de {MAX_NAMED_VIEWS} vistas. Elimina una para guardar otra.</p>}
    </form>
    {error && <p id={errorId} className="named-views-error" role="alert">{error}</p>}
    <footer><button type="button" onClick={props.onClose}>Cerrar</button></footer>
  </dialog>
}
