import type { CSSProperties, MouseEvent, PointerEventHandler } from 'react'
import { assemblyOriginDisplayBinding, type AssemblyOriginDisplay } from './assemblyOriginPicking'

export interface OriginLabelFrame {
  signature: string
  catalog: string
  width: number
  height: number
  topInset: number
  usable: boolean
}

export interface OriginLabelCurrent {
  disabled: boolean
  picking: boolean
  signature: string
  catalog: string
  presentedCatalog: string
  width: number | undefined
  height: number | undefined
  topInset: number
  entries: ReadonlyMap<string, AssemblyOriginDisplay | null>
}

export interface OriginLabelIdentity { key: string; label: string; binding: string }

export function originLabelEntries(entries: readonly AssemblyOriginDisplay[]): ReadonlyMap<string, AssemblyOriginDisplay | null> {
  const result = new Map<string, AssemblyOriginDisplay | null>()
  for (const entry of entries) result.set(entry.key, result.has(entry.key) ? null : entry)
  return result
}

export function currentOriginLabel(label: OriginLabelIdentity, frame: OriginLabelFrame, current: OriginLabelCurrent): AssemblyOriginDisplay | null {
  if (current.disabled || !current.picking || frame.topInset !== current.topInset || !frame.usable
    || frame.signature !== current.signature || frame.width !== current.width || frame.height !== current.height
    || current.presentedCatalog !== current.catalog || frame.catalog !== current.catalog) return null
  const entry = current.entries.get(label.key)
  return entry && assemblyOriginDisplayBinding(entry) === label.binding ? entry : null
}

interface Props {
  label: OriginLabelIdentity
  frame: OriginLabelFrame
  current: OriginLabelCurrent
  selected: boolean
  style?: CSSProperties
  onPointerDown: PointerEventHandler<HTMLButtonElement>
  onPointerMove: PointerEventHandler<HTMLButtonElement>
  onPointerUp: PointerEventHandler<HTMLButtonElement>
  onPointerLeave: PointerEventHandler<HTMLButtonElement>
  onPointerCancel: PointerEventHandler<HTMLButtonElement>
  activate: (event: MouseEvent<HTMLButtonElement>) => {
    current: OriginLabelCurrent
    acceptGesture: () => boolean
    select: (entry: AssemblyOriginDisplay) => void
  }
}

/** The same current label must be available in the rendered button and at activation. */
export function AssemblyOriginLabelButton({ label, frame, current, selected, style, activate, ...pointer }: Props) {
  return <button type="button" className={selected ? 'selected' : ''} style={style}
    aria-label={`Seleccionar ${label.label}`} title={label.label} data-origin-key={label.key}
    data-origin-frame-width={frame.width} data-origin-frame-height={frame.height}
    disabled={!currentOriginLabel(label, frame, current)}
    {...pointer} onClick={event => {
      const activation = activate(event), entry = currentOriginLabel(label, frame, activation.current)
      if (entry && activation.acceptGesture()) activation.select(entry)
    }}>{label.label}</button>
}
