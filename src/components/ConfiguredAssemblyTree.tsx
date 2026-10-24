import { Box, ChevronRight, CircleDot, EyeOff, Layers, Link2, LockKeyhole } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AssemblyConfigurationEvaluation } from '../model/assemblyConfigurationCore'

interface Props {
  name: string
  evaluation: AssemblyConfigurationEvaluation
  scope: string
  occurrenceId: string
  disabled: boolean
  onScope: (scope: string) => void
  onOccurrence: (scope: string, id: string) => void
  onRelations: () => void
}

/** The tree reflects effective occurrences and their actual selected child states. */
export default function ConfiguredAssemblyTree({ name, evaluation, scope, occurrenceId, disabled, onScope, onOccurrence, onRelations }: Props) {
  const renderScope = (path: readonly string[]): ReactNode => {
    const owner = evaluation.scopes.find(row => JSON.stringify(row.path) === JSON.stringify(path))
    if (!owner) return null
    return <ul>{owner.occurrences.map(occurrence => {
      const childPath = [...path, occurrence.id], ownerKey = JSON.stringify(path), childKey = JSON.stringify(childPath)
      const child = evaluation.scopes.find(row => JSON.stringify(row.path) === childKey)
      const row = <button type="button" disabled={disabled} className={scope === ownerKey && occurrenceId === occurrence.id ? 'selected' : ''}
        aria-pressed={scope === ownerKey && occurrenceId === occurrence.id} aria-label={`Seleccionar componente ${occurrence.name}`}
        title={`${childPath.join(' / ')} · ${occurrence.definition.id} · ${occurrence.definition.revision}`}
        onClick={() => onOccurrence(ownerKey, occurrence.id)}>
        {child ? <Layers size={15} /> : <Box size={15} />}<span>{occurrence.name}</span>
        {occurrence.fixed && <LockKeyhole size={12} aria-label="Fijado" />}{!occurrence.visible && <EyeOff size={12} aria-label="Oculto" />}
        {occurrence.suppressed && <small>Suprimido</small>}
      </button>
      return <li key={occurrence.id}>{child ? <details open><summary><ChevronRight size={12} />{row}</summary>
        <button className="configured-tree-state" type="button" disabled={disabled} aria-pressed={scope === childKey} onClick={() => onScope(childKey)}><Layers size={13} />{child.configuration ?? 'Base'}</button>
        {renderScope(childPath)}</details> : row}</li>
    })}</ul>
  }
  return <section className="configured-model-tree" id="configured-model-tree" aria-label="Árbol del ensamblaje configurado" tabIndex={-1}>
    <h2>Ensamblaje</h2>
    <button type="button" className="configured-tree-root" disabled={disabled} onClick={() => onScope('[]')}><Layers size={17} /><strong>{name}</strong></button>
    <button type="button" className="configured-tree-state" disabled={disabled} onClick={() => onScope('[]')}><Layers size={14} />{evaluation.rootConfiguration ?? 'Base'}</button>
    <details className="configured-tree-origin"><summary><ChevronRight size={12} /><CircleDot size={15} />Origen</summary><ul><li>Eje X</li><li>Eje Y</li><li>Eje Z</li></ul></details>
    {renderScope([])}
    <button type="button" onClick={onRelations}><Link2 size={15} />Relaciones de posición</button>
  </section>
}
