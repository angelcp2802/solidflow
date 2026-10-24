import type { ReactNode } from 'react'
import { Component } from 'lucide-react'
import AssemblyMenuBar, { type AssemblyMenuDefinition } from './AssemblyMenuBar'
export type { AssemblyMenuDefinition, AssemblyMenuAction } from './AssemblyMenuBar'
import './assembly-command-manager.css'

interface AssemblyShellHeaderProps {
  name: string
  dirty?: boolean
  fileLabel?: string
  fileTitle?: string
  mode?: string
  children?: ReactNode
  menus?: readonly AssemblyMenuDefinition[]
  menuLabel?: string
}

/** Presentational shell: callers retain the actual file/menu actions and guards. */
export function AssemblyShellHeader({ name, dirty = false, fileLabel = 'Sin guardar', fileTitle, mode = 'Ensamblaje', children, menus, menuLabel }: AssemblyShellHeaderProps) {
  return <><header className="assembly-shell-header">
    <div className="assembly-shell-brand" aria-label="SolidFlow">
      <span className="assembly-shell-mark" aria-hidden="true">S<span>F</span></span>
      <strong>Solid<span>Flow</span></strong>
    </div>
    {menus && <AssemblyMenuBar menus={menus} label={menuLabel} />}
    {!menus && children && <div className="assembly-shell-access">{children}</div>}
    <div className="assembly-shell-document" title={`${name}${dirty ? ' · Cambios sin guardar' : ''}`}>
      <strong>{name}{dirty ? ' *' : ''}</strong>
      <span className="assembly-shell-file" title={fileTitle ?? fileLabel}>{fileLabel}</span>
    </div>
    <span className="assembly-shell-mode"><Component size={14} aria-hidden="true" />{mode}</span>
  </header>{menus && children && <div className="assembly-shell-quick-access">{children}</div>}</>
}

interface AssemblyCommandGroupProps {
  label: string
  children: ReactNode
  className?: string
}

/** The group adds no commands or CAD state; its children own all interaction. */
export function AssemblyCommandGroup({ label, children, className = '' }: AssemblyCommandGroupProps) {
  return <div className={`assembly-command-group${className ? ` ${className}` : ''}`} role="group" aria-label={label}>
    <div className="assembly-command-group-content">{children}</div>
    <span className="assembly-command-group-label" aria-hidden="true">{label}</span>
  </div>
}
