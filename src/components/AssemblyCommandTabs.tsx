import type { KeyboardEvent } from 'react'

export type AssemblyCommandTab = 'assembly' | 'relations' | 'evaluate'
type Kind = 'standard' | 'configured'
const tabs: readonly { id: AssemblyCommandTab; label: string }[] = [
  { id: 'assembly', label: 'Ensamblaje' },
  { id: 'relations', label: 'Relaciones' },
  { id: 'evaluate', label: 'Evaluar' },
]

interface Props {
  kind: Kind
  value: AssemblyCommandTab
  onChange: (value: AssemblyCommandTab) => void
}

/** Ribbon presentation only. The owning workspace retains editor and CAD state. */
export function AssemblyCommandTabs({ kind, value, onChange }: Props) {
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
    if (next === null || event.altKey || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    event.stopPropagation()
    onChange(tabs[next].id)
    // All tab buttons remain mounted; only an explicit keyboard action moves focus.
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#${kind}-command-tab-${tabs[next].id}`)?.focus()
  }
  return <nav className="assembly-command-tabs" role="tablist"
    aria-label={kind === 'configured' ? 'Pestañas del ensamblaje configurado' : 'Áreas de trabajo del ensamblaje'}>
    {tabs.map((tab, index) => <button key={tab.id} type="button" role="tab"
      id={`${kind}-command-tab-${tab.id}`} aria-controls={`${kind}-command-panel-${tab.id}`}
      aria-selected={value === tab.id} tabIndex={value === tab.id ? 0 : -1}
      data-assembly-command-tab={kind === 'standard' ? tab.id : undefined}
      data-configured-command-tab={kind === 'configured' ? tab.id : undefined}
      onClick={() => onChange(tab.id)} onKeyDown={event => navigate(event, index)}>{tab.label}</button>)}
  </nav>
}
