import { Undo2 } from 'lucide-react'
import './view-orientation-controls.css'
import { standardViews, type ViewName } from './viewNavigation'

/** Commands only; camera state and guards belong to the current workspace. */
export function ViewOrientationControls({ onView, disabled = false, canPrevious }: {
  onView: (name: ViewName) => void; disabled?: boolean; canPrevious: boolean
}) {
  return <>
    <select className="view-orientation-select" aria-label="Orientación de vista" title="Vistas estándar" value="" disabled={disabled} onChange={event => onView(event.target.value as ViewName)}>
      <option value="" disabled>Vistas</option>
      {standardViews.map(view => <option key={view.name} value={view.name}>{view.label} ({view.shortcut})</option>)}
    </select>
    <button className="view-previous" type="button" aria-label="Vista anterior" title="Vista anterior (Ctrl+Shift+Z)" disabled={disabled || !canPrevious} onClick={() => onView('previous')}><Undo2 size={17} aria-hidden="true" /><span className="compact-viewport-label">Vista anterior</span></button>
  </>
}
