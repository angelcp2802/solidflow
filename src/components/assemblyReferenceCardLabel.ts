import { assemblyDefinitionKey, type AssemblyGeometryReference, type AssemblySphereTangentReference, type AssemblyTangentReference } from '../model/assemblyDocument'
import type { AssemblyMateEndpointSide } from '../model/assemblyMateEndpoints'
import type { AssemblyTreeRow } from './assemblyContextTarget'

export const assemblyMateEndpointLabels: Readonly<Record<AssemblyMateEndpointSide, string>> = {
  'axis-0': 'Eje A de bisagra', 'axis-1': 'Eje B de bisagra',
  'axial-0': 'Plano axial A de bisagra', 'axial-1': 'Plano axial B de bisagra',
  'angle-0': 'Plano angular A de bisagra', 'angle-1': 'Plano angular B de bisagra',
  point: 'Punto material', path: 'Trayecto y origen material', up: 'Guía UP · cara plana material',
  first: 'Referencia 1', second: 'Referencia 2', guide: 'Eje guía', carrier: 'Componente portador',
  'width-0': 'Anchura · plano 1', 'width-1': 'Anchura · plano 2',
  'tab-0': 'Pestaña · plano 1', 'tab-1': 'Pestaña · plano 2',
  source: 'Origen', target: 'Destino', mirror: 'Plano de simetría',
}

type CardReference = AssemblyGeometryReference | AssemblyTangentReference | AssemblySphereTangentReference
const samePath = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, index) => id === b[index])

/** Presentation only: saved paths and revision-addressed references remain unchanged. */
export function assemblyReferenceCardLabel(reference: CardReference | null, rows: readonly AssemblyTreeRow[], scopePath: readonly string[]): string {
  if (!reference) return 'Sin seleccionar'
  if (scopePath.length) {
    const scopes = rows.filter(row => samePath(row.path, scopePath))
    if (scopes.length !== 1 || scopes[0].definition.kind !== 'assembly') return 'Referencia no vigente'
  }
  let owner = 'Ámbito actual'
  if (reference.component) {
    if (!reference.component.occurrencePath.length) return 'Referencia no vigente'
    const path = [...scopePath, ...reference.component.occurrencePath]
    const matches = rows.filter(row => samePath(row.path, path))
    if (matches.length !== 1 || assemblyDefinitionKey(matches[0].occurrence.definition) !== assemblyDefinitionKey(reference.component.definition)) return 'Referencia no vigente'
    const names: string[] = []
    for (let length = 1; length <= path.length; length++) {
      const prefix = path.slice(0, length), ancestors = rows.filter(row => samePath(row.path, prefix))
      if (ancestors.length !== 1 || length < path.length && ancestors[0].definition.kind !== 'assembly') return 'Referencia no vigente'
      const row = ancestors[0], parent = prefix.slice(0, -1)
      const sameNamedSiblings = rows.filter(value => samePath(value.path.slice(0, -1), parent) && value.occurrence.name === row.occurrence.name)
      // The document's sibling order distinguishes reused, same-named instances
      // without exposing their internal IDs or turning names into lookup keys.
      names.push(row.occurrence.name + (sameNamedSiblings.length > 1 ? ` (instancia ${sameNamedSiblings.indexOf(row) + 1})` : ''))
    }
    owner = names.join(' / ')
  }
  if (reference.kind === 'principal-plane') return `${owner} · ${reference.plane}`
  if (reference.kind === 'principal-axis') return `${owner} · Eje de origen ${reference.axis}`
  if (reference.kind === 'edge') return `${owner} · Arista lineal`
  if (reference.support === 'axis') return `${owner} · Cilindro`
  if (reference.support === 'cylinder-surface') return `${owner} · Superficie cilíndrica`
  if (reference.support === 'sphere-surface') return `${owner} · Superficie esférica`
  return `${owner} · Plano`
}
