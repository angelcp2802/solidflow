import { useMemo, useState } from 'react'
import type { ConfiguredAssemblyScene } from '../cad/kernel.assembly-configuration-scene'
import type { AssemblyConfigurationEvaluation } from '../model/assemblyConfigurationCore'
import { assemblyMateEndpointLabels } from './assemblyReferenceCardLabel'

export type ConfiguredReferenceDiagnostic = ConfiguredAssemblyScene['referenceDiagnostics'][number]
type Scope = AssemblyConfigurationEvaluation['scopes'][number]
const PAGE_SIZE = 8
const reasons: Readonly<Record<ConfiguredReferenceDiagnostic['problem'], string>> = {
  'missing-occurrence': 'La ocurrencia ya no existe',
  'path-through-part': 'La ruta atraviesa una pieza',
  'stale-definition': 'La referencia apunta a otra revisión',
  'suppressed-component': 'Componente suprimido',
}

function pathLabel(path: readonly string[], scopes: ReadonlyMap<string, Scope>): string {
  const names = path.map((id, index) => {
    const occurrences = scopes.get(JSON.stringify(path.slice(0, index)))?.occurrences
    const occurrence = occurrences?.find(row => row.id === id)
    if (!occurrence || !occurrences) return id
    const siblings = occurrences.filter(row => row.name === occurrence.name)
    return siblings.length > 1 ? `${occurrence.name} (instancia ${siblings.indexOf(occurrence) + 1})` : occurrence.name
  })
  return names.join(' / ') || 'Raíz'
}

interface Props {
  diagnostics: readonly ConfiguredReferenceDiagnostic[]
  evaluation: AssemblyConfigurationEvaluation
  disabled: boolean
  onLocate: (diagnostic: ConfiguredReferenceDiagnostic) => void
}

export default function ConfiguredAssemblyReferenceDiagnostics({ diagnostics, evaluation, disabled, onLocate }: Props) {
  const [page, setPage] = useState(0)
  const scopes = useMemo(() => new Map(evaluation.scopes.map(scope => [JSON.stringify(scope.path), scope])), [evaluation])
  const start = page * PAGE_SIZE
  const end = Math.min(start + PAGE_SIZE, diagnostics.length)
  return <details className="configured-reference-diagnostics">
    <summary>{diagnostics.length} {diagnostics.length === 1 ? 'referencia no disponible' : 'referencias no disponibles'}</summary>
    <ul>{diagnostics.slice(start, end).map(diagnostic => {
      const scope = scopes.get(JSON.stringify(diagnostic.scopePath))
      const mate = scope?.mates.find(row => row.id === diagnostic.mateId)
      const owner = pathLabel(diagnostic.scopePath, scopes)
      const reference = pathLabel(diagnostic.path, scopes)
      return <li key={JSON.stringify([diagnostic.scopePath, diagnostic.mateId, diagnostic.side])}>
        <div>
          <strong>{mate?.name ?? diagnostic.mateId}</strong>
          <small title={diagnostic.scopePath.join(' / ')}>{owner} · {scope?.configuration ?? 'Base'}</small>
          <small title={diagnostic.path.join(' / ')}>{assemblyMateEndpointLabels[diagnostic.side]} · {reference} · {reasons[diagnostic.problem]}</small>
        </div>
        <button type="button" disabled={disabled || !mate} aria-label={`Ir a relación ${mate?.name ?? diagnostic.mateId} en ${owner}`}
          onClick={() => onLocate(diagnostic)}>Ir a relación</button>
      </li>
    })}</ul>
    {diagnostics.length > PAGE_SIZE && <nav aria-label="Páginas de referencias no disponibles">
      <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
      <span role="status">{start + 1}–{end} de {diagnostics.length}</span>
      <button type="button" disabled={end === diagnostics.length} onClick={() => setPage(page + 1)}>Siguiente</button>
    </nav>}
  </details>
}
