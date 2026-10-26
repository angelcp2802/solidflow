import { ArrowUpFromLine, Undo2 } from 'lucide-react'
import './view-orientation-controls.css'
import { standardViews, type ViewName } from './viewNavigation'

/** Commands only; camera state and guards belong to the current workspace. */
export function ViewOrientationControls({ onView, disabled = false, canPrevious, canNormal = !disabled }: {
  onView: (name: ViewName) => void; disabled?: boolean; canPrevious: boolean; canNormal?: boolean
}) {
  return <>
    <select className="view-orientation-select" aria-label="Orientación de vista" title="Vistas estándar" value="" disabled={disabled} onChange={event => onView(event.target.value as ViewName)}>
      <option value="" disabled>Vistas</option>
      {standardViews.map(view => <option key={view.name} value={view.name}>{view.label} ({view.shortcut})</option>)}
      <option value="normal" disabled={!canNormal}>Normal a (Ctrl+8)</option>
    </select>
    <button className="view-normal" type="button" aria-label="Normal a" title="Normal a (Ctrl+8)" disabled={!canNormal} onClick={() => onView('normal')}><ArrowUpFromLine size={17} aria-hidden="true" /><span className="compact-viewport-label">Normal a</span></button>
    <button className="view-previous" type="button" aria-label="Vista anterior" title="Vista anterior (Ctrl+Shift+Z)" disabled={disabled || !canPrevious} onClick={() => onView('previous')}><Undo2 size={17} aria-hidden="true" /><span className="compact-viewport-label">Vista anterior</span></button>
  </>
}
