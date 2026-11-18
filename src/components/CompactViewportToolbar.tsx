import type { ReactNode } from 'react'
import { Box, Layers, Maximize, MousePointer2, Move3D, Rotate3D, ScanLine, Square, X } from 'lucide-react'
import './compact-viewport-toolbar.css'

const icons = { iso: Box, front: Square, top: Layers, fit: Maximize, face: MousePointer2,
  edge: ScanLine, translate: Move3D, rotate: Rotate3D, stop: X } as const

/** Presentation only; each caller retains its existing controls and guards. */
export function CompactViewportToolbar({ label, className = '', children }: {
  label: string; className?: string; children: ReactNode
}) {
  return <nav aria-label={label} className={'compact-viewport-toolbar ' + className}>{children}</nav>
}

export function ViewportToolGroup({ label, className = '', children }: {
  label: string; className?: string; children: ReactNode
}) {
  return <div role="group" aria-label={label} className={'compact-viewport-group ' + className}>{children}</div>
}

export function ViewportToolIcon({ name, label }: { name: keyof typeof icons; label: string }) {
  const Icon = icons[name]
  return <><Icon size={17} strokeWidth={1.65} aria-hidden="true" /><span className="compact-viewport-label">{label}</span></>
}
