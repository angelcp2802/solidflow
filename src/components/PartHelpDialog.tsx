import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import { Box, X } from 'lucide-react'
import { version as appVersion } from '../../package.json'
import './part-help-dialog.css'

interface PartHelpDialogProps { onClose: () => void }

/** Native modal ownership keeps header shortcuts out of the help dialog. */
export default function PartHelpDialog({ onClose }: PartHelpDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null), latestClose = useRef(onClose)
  const composing = useRef(false), outsidePress = useRef(false), titleId = useId()
  useLayoutEffect(() => { latestClose.current = onClose }, [onClose])
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    const restore = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.showModal()
    const keyboard = (event: KeyboardEvent) => {
      if (!element.open) return
      if (event.isComposing || composing.current) { event.stopImmediatePropagation(); return }
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); latestClose.current(); return
      }
      if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const buttons = element.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
        const first = buttons[0], last = buttons[buttons.length - 1], active = document.activeElement
        const boundary = active === element || !element.contains(active) || active === (event.shiftKey ? first : last)
        const target = boundary ? event.shiftKey ? last : first : null
        if (target) { event.preventDefault(); target.focus() }
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey
        && ['n', 'o', 's', 'z', 'y', '1', '2', '3', '4', '5', '6', '7', '8'].includes(event.key.toLowerCase())) event.preventDefault()
      // Interior Tab, text selection/copy and button activation stay native.
      // Wrap the controls before a scrollable dialog becomes an extra Tab stop.
      // No CAD or menu key handler behind the modal consumes the same event.
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', keyboard, true)
    return () => {
      window.removeEventListener('keydown', keyboard, true)
      if (element.open) element.close()
      if (restore?.isConnected) restore.focus({ preventScroll: true })
    }
  }, [])
  return <dialog ref={dialog} className="modal part-help-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!composing.current) latestClose.current() }}
    onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}
    onPointerDown={event => {
      const bounds = event.currentTarget.getBoundingClientRect()
      outsidePress.current = event.button === 0 && event.target === event.currentTarget
        && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)
    }}
    onPointerCancel={() => { outsidePress.current = false }}
    onClick={event => {
      const outside = outsidePress.current; outsidePress.current = false
      if (!outside || event.target !== event.currentTarget) return
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) latestClose.current()
    }}>
            <button type="button" autoFocus className="modal-close" aria-label="Cerrar ayuda" onClick={() => onClose()}>
              <X size={18} />
            </button>
            <div className="modal-brand">
              <Box size={25} />
              <strong>SolidFlow</strong>
              <span>{appVersion}</span>
            </div>
            <h2 id={titleId}>Tu primer recorrido</h2>
            <ol>
              <li>
                Selecciona <b>Planta, Alzado o Vista lateral</b> en el árbol.
                También puedes activar <b>Seleccionar caras</b> y elegir una
                cara plana, o crear un plano desplazado con{" "}
                <b>Geometría de referencia</b>.
              </li>
              <li>
                Abre <b>Croquis</b> y dibuja líneas, rectángulos, círculos o
                arcos. Selecciona entidades o puntos para añadir cotas y
                relaciones.
              </li>
              <li>
                Acepta el croquis y utiliza <b>Saliente/Base extruido</b>,{" "}
                <b>Corte extruido</b> o <b>Revolución</b>. En extrusión y corte
                puedes elegir <b>Por todo</b>, <b>Hasta siguiente</b> o{" "}
                <b>Hasta superficie</b> para que el extremo siga la pieza o una
                referencia al reconstruir.
              </li>
              <li>
                <b>Barrido</b> une un perfil cerrado con un recorrido abierto.{" "}
                <b>Recubrir</b> une secciones ordenadas de varios croquis.
                Prueba sus ejemplos en la biblioteca.
              </li>
              <li>
                Haz doble clic en una operación para editarla. Guarda la pieza o
                exporta STEP/STL.
              </li>
              <li>
                Para un acabado, abre <b>Redondeo</b> o <b>Chaflán</b>,
                selecciona aristas de la pieza y comprueba <b>Vista previa</b>{" "}
                antes de aceptar. Puedes activar <b>Todas las aristas</b>.
              </li>
            </ol>
            <div className="shortcut-list">
              <span>
                Guardar <kbd>Ctrl S</kbd>
              </span>
              <span>
                Deshacer <kbd>Ctrl Z</kbd>
              </span>
              <span>
                Ajustar vista <kbd>F</kbd>
              </span>
              <span>
                Isométrica <kbd>Ctrl 7</kbd>
              </span>
            </div>
            <p>
              Los croquis admiten contornos de líneas y arcos, círculos y
              agujeros. Los comandos atenuados pertenecen a módulos todavía
              pendientes. El formato editable es .solidflow; permite exportar
              la geometría a STEP y STL.
            </p>
            <button
              className="primary-button"
              onClick={() => onClose()}
            >
              Volver a la pieza
            </button>
  </dialog>
}
