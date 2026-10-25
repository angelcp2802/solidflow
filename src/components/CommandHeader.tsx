import type { ReactNode } from 'react'
import './command-header.css'

interface CommandHeaderProps {
  className?: string
  brand?: ReactNode
  menus?: ReactNode
  quickActions?: ReactNode
  document?: ReactNode
  utilities?: ReactNode
}

/** Shared layout only: each caller owns its controls, focus behavior and guards. */
export default function CommandHeader({ className = '', brand, menus, quickActions, document, utilities }: CommandHeaderProps) {
  return <header className={`command-header${className ? ` ${className}` : ''}`}>
    {brand != null && <div className="command-header-brand">{brand}</div>}
    {menus != null && <div className="command-header-menus">{menus}</div>}
    {quickActions != null && <div className="command-header-quick-actions">{quickActions}</div>}
    {document != null && <div className="command-header-document">{document}</div>}
    {utilities != null && <div className="command-header-utilities">{utilities}</div>}
  </header>
}
