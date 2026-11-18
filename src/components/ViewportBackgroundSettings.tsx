import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { viewportBackgroundPreference } from './viewportBackgroundPreference'
import { namedViewDialogKeyAction } from './NamedViewsDialog'
import './part-properties.css'

export function useViewportBackground() {
  return useSyncExternalStore(viewportBackgroundPreference.subscribe, viewportBackgroundPreference.snapshot, () => null)
}

/** A local dialog per workspace; the committed preference is shared by all viewers. */
export function useViewportBackgroundSettings() {
  const [open, setOpen] = useState(false)
  return { open: () => setOpen(true), dialog: open ? <ViewportBackgroundDialog onClose={() => setOpen(false)} /> : null }
}

export function ViewportBackgroundDialog({ onClose }: { onClose: () => void }) {
  const value = useViewportBackground(), dialog = useRef<HTMLDialogElement>(null), close = useRef(onClose)
  close.current = onClose
  const [custom, setCustom] = useState(value !== null), [color, setColor] = useState(value ?? '#edf2f6'), [warning, setWarning] = useState('')
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    const restore = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.showModal()
    const keyboard = (event: KeyboardEvent) => {
      if (!element.open) return
      const editing = event.target instanceof HTMLInputElement
      const action = namedViewDialogKeyAction(event, editing)
      if (action === 'close') { event.preventDefault(); close.current() }
      if (action === 'block') event.preventDefault()
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', keyboard, true)
    return () => { window.removeEventListener('keydown', keyboard, true); element.close(); if (restore?.isConnected) restore.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={dialog} className="viewport-background-dialog" aria-label="Fondo del visor" onCancel={event => { event.preventDefault(); onClose() }}>
    <form onSubmit={event => {
      event.preventDefault()
      if (viewportBackgroundPreference.set(custom ? color : null)) onClose()
      else setWarning('El fondo se ha aplicado durante esta sesión. No se pudo guardar en este equipo.')
    }}>
      <h2>Fondo del visor</h2>
      <p>Se comparte entre piezas y ensamblajes en este equipo.</p>
      <label><input type="checkbox" checked={custom} onChange={event => setCustom(event.target.checked)} /> Usar un color sólido</label>
      <label>Color del fondo <input aria-label="Color del fondo" type="color" disabled={!custom} value={color} onChange={event => setColor(event.target.value)} /></label>
      {warning && <p role="status">{warning}</p>}
      <div className="part-properties-actions"><button type="button" onClick={() => { setCustom(false); setWarning('') }}>Restaurar predeterminado</button><button type="button" onClick={onClose}>Cancelar</button><button type="submit">Aplicar fondo</button></div>
    </form>
  </dialog>
}
