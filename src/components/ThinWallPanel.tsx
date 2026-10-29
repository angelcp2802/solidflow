import { ChevronDown, ArrowLeftRight } from 'lucide-react'
import type { ThinWallDefinition } from '../cad/kernel.types'
import { MAX_THIN_WALL_THICKNESS, MIN_THIN_WALL_THICKNESS, validateThinWallDefinition } from '../cad/thinWall'
import { DEFAULT_WALL_THICKNESS, defaultThinWallDefinition } from './thinWallEditorDraft'
import './thin-wall-panel.css'

const DEFAULT_AUTO_CORNER_RADIUS = 5

/** Mode changes retain the first displayed thickness; a new second side starts at 10 mm. */
export function thinWallModeChange(wall: ThinWallDefinition, kind: string): ThinWallDefinition | null {
  if (kind === wall.kind) return wall
  const thickness = wall.kind === 'two-sides' ? wall.firstThickness : wall.thickness
  const common = wall.autoCorners ? { autoCorners: { ...wall.autoCorners } } : {}
  if (kind === 'one-side') return { kind, thickness, reversed: false, ...common }
  if (kind === 'mid-plane') return { kind, thickness, ...common }
  if (kind === 'two-sides') return { kind, firstThickness: thickness, secondThickness: DEFAULT_WALL_THICKNESS, ...common }
  return null
}

export function thinWallInputError(wall?: ThinWallDefinition): string | null {
  if (wall === undefined) return null
  try { validateThinWallDefinition(wall) }
  catch (error) { return error instanceof Error ? error.message : 'El espesor de pared no es válido.' }
  return null
}

interface Props {
  thinWall?: ThinWallDefinition
  onChange: (next: ThinWallDefinition | undefined) => void
  existing?: boolean
  required?: boolean
  disabled?: boolean
  autoCornersAvailable?: boolean
  allowAutoCornerRecovery?: boolean
}

export default function ThinWallPanel({ thinWall, onChange, existing = false, required = false, disabled = false,
  autoCornersAvailable = false, allowAutoCornerRecovery = false }: Props) {
  // The regular/thin operation kind belongs to its creation, not an edit-time toggle.
  if (existing && !thinWall) return null
  const error = thinWallInputError(thinWall)
  const canReverse = thinWall?.kind === 'one-side' && !disabled
  const autoCorners = thinWall?.autoCorners
  const showAutoCorners = autoCornersAvailable || (allowAutoCornerRecovery && !!autoCorners)
  // Inactive declarations still validate, so an invalid remembered radius must remain editable.
  const invalidAutoCornerRadius = !!autoCorners && (!Number.isFinite(autoCorners.radius)
    || autoCorners.radius <= MIN_THIN_WALL_THICKNESS || autoCorners.radius > MAX_THIN_WALL_THICKNESS)
  const changeThickness = (value: string, side?: 'firstThickness' | 'secondThickness') => {
    if (!thinWall || disabled) return
    const thickness = value === '' ? 0 : Number(value)
    if (thinWall.kind === 'two-sides') {
      if (side) onChange({ ...thinWall, [side]: thickness })
    } else onChange({ ...thinWall, thickness })
  }
  return <section className="property-section thin-wall-section" aria-labelledby="thin-wall-heading" aria-disabled={disabled}>
    <h3 id="thin-wall-heading"><ChevronDown size={12} aria-hidden="true" />
      <label className="thin-wall-toggle" htmlFor="thin-wall-enabled">
        <input id="thin-wall-enabled" type="checkbox" aria-label="Operación lámina" checked={!!thinWall}
          disabled={disabled || existing || required}
          title={required ? 'Un perfil abierto requiere una operación lámina.' : existing ? 'El tipo de operación se conserva al editar.' : undefined}
          onChange={event => {
            if (disabled || existing || required) return
            if (event.target.checked && !thinWall) onChange(defaultThinWallDefinition())
            else if (!event.target.checked && thinWall) onChange(undefined)
          }} />
        Operación lámina
      </label>
    </h3>
    {thinWall && <>
      <div className="thin-wall-mode-row">
        <select id="thin-wall-mode" aria-label="Tipo de pared" value={thinWall.kind} disabled={disabled}
          onChange={event => {
            if (disabled) return
            const next = thinWallModeChange(thinWall, event.target.value)
            if (next && next !== thinWall) onChange(next)
          }}>
          <option value="one-side">Una dirección</option>
          <option value="mid-plane">Plano medio</option>
          <option value="two-sides">Dos direcciones</option>
        </select>
        <button type="button" className="thin-wall-reverse" aria-label="Invertir lado de pared"
          title="Invertir lado de pared" aria-pressed={thinWall.kind === 'one-side' && thinWall.reversed}
          disabled={!canReverse} onClick={() => {
            if (canReverse && thinWall.kind === 'one-side') onChange({ ...thinWall, reversed: !thinWall.reversed })
          }}><ArrowLeftRight size={15} aria-hidden="true" /></button>
      </div>
      {thinWall.kind === 'two-sides' ? <>
        <label className="number-field" htmlFor="thin-wall-first-thickness"><span>Espesor 1</span><div>
          <input id="thin-wall-first-thickness" aria-label="Espesor 1" type="number" step={0.1}
            value={Number.isFinite(thinWall.firstThickness) ? thinWall.firstThickness : ''} disabled={disabled}
            aria-invalid={!!error} aria-describedby={error ? 'thin-wall-error' : undefined}
            onChange={event => changeThickness(event.target.value, 'firstThickness')} /><small>mm</small>
        </div></label>
        <label className="number-field" htmlFor="thin-wall-second-thickness"><span>Espesor 2</span><div>
          <input id="thin-wall-second-thickness" aria-label="Espesor 2" type="number" step={0.1}
            value={Number.isFinite(thinWall.secondThickness) ? thinWall.secondThickness : ''} disabled={disabled}
            aria-invalid={!!error} aria-describedby={error ? 'thin-wall-error' : undefined}
            onChange={event => changeThickness(event.target.value, 'secondThickness')} /><small>mm</small>
        </div></label>
      </> : <label className="number-field" htmlFor="thin-wall-thickness"><span>Espesor</span><div>
        <input id="thin-wall-thickness" aria-label="Espesor de pared" type="number" step={0.1}
          value={Number.isFinite(thinWall.thickness) ? thinWall.thickness : ''} disabled={disabled}
          aria-invalid={!!error} aria-describedby={error ? 'thin-wall-error' : undefined}
          onChange={event => changeThickness(event.target.value)} /><small>mm</small>
      </div></label>}
      {showAutoCorners && <div className="thin-wall-auto-corners">
        <label className="thin-wall-option-toggle" htmlFor="thin-wall-auto-corners">
          <input id="thin-wall-auto-corners" type="checkbox" aria-label="Redondeo automático de esquinas"
            checked={autoCorners?.enabled ?? false} disabled={disabled || (!autoCornersAvailable && !autoCorners?.enabled)}
            onChange={event => {
              if (disabled || (!autoCornersAvailable && (!autoCorners?.enabled || event.target.checked))) return
              onChange({ ...thinWall, autoCorners: { enabled: event.target.checked,
                radius: autoCorners?.radius ?? DEFAULT_AUTO_CORNER_RADIUS } })
            }} />
          Redondeo automático de esquinas
        </label>
        {autoCorners && <label className={`number-field${!autoCorners.enabled && !invalidAutoCornerRadius ? ' thin-wall-inactive-radius' : ''}`}
          htmlFor="thin-wall-auto-corner-radius"><span>Radio</span><div>
          <input id="thin-wall-auto-corner-radius" aria-label="Radio del redondeo automático" type="number" step={0.1}
            value={Number.isFinite(autoCorners.radius) ? autoCorners.radius : ''} disabled={disabled}
            aria-invalid={!!error} aria-describedby={error ? 'thin-wall-error' : undefined}
            onChange={event => {
              if (disabled) return
              onChange({ ...thinWall, autoCorners: { ...autoCorners,
                radius: event.target.value === '' ? 0 : Number(event.target.value) } })
            }} /><small>mm</small>
        </div></label>}
      </div>}
      {error && <p id="thin-wall-error" className="thin-wall-error" role="alert">{error}</p>}
    </>}
  </section>
}
