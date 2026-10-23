import { useEffect, useRef } from 'react'

export default function AssemblyRootRevisionDialog(props: { id: string; currentRevision: string; revision: string; error: string;
  onRevision: (value: string) => void; onPreview: () => void; onCancel: () => void }) {
  const modal = useRef<HTMLDivElement>(null)
  const cancel = useRef(props.onCancel); cancel.current = props.onCancel
  useEffect(() => {
    const previous = document.activeElement
    modal.current?.querySelector<HTMLInputElement>('input')?.focus()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); cancel.current() }
      if (event.key !== 'Tab') return
      const nodes = Array.from(modal.current?.querySelectorAll<HTMLElement>('input,button:not(:disabled)') ?? [])
      const first = nodes[0], last = nodes.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', keyboard)
    return () => { window.removeEventListener('keydown', keyboard); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])
  return <div className="assembly-modal-backdrop"><div ref={modal} className="assembly-modal" role="dialog" aria-modal="true" aria-labelledby="assembly-root-revision-title">
    <h2 id="assembly-root-revision-title">Crear revisión del ensamblaje</h2>
    <p>Identidad raíz: <span aria-label="Identidad raíz de la revisión">{props.id}</span><br />Revisión actual: <span aria-label="Revisión raíz actual">{props.currentRevision}</span></p>
    <label>Nueva revisión<input aria-label="Nueva revisión del ensamblaje" value={props.revision} onChange={event => props.onRevision(event.target.value)} /></label>
    <p>Se crea una revisión de la raíz. Revisa la vista previa y pulsa Aplicar. Después guarda el archivo para que otros ensamblajes puedan revisar el cambio de origen.</p>
    {props.error && <p role="alert">{props.error}</p>}
    <div><button aria-label="Vista previa de nueva revisión" disabled={!props.revision.trim()} onClick={props.onPreview}>Vista previa</button>
      <button aria-label="Cancelar creación de revisión" onClick={props.onCancel}>Cancelar</button></div>
  </div></div>
}
