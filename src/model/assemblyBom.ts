import { MAX_ASSEMBLY_OCCURRENCES, assemblyDefinitionKey, validateAssemblyDocument,
  type AssemblyComponentReference, type AssemblyDefinition, type AssemblyDefinitionReference,
  type AssemblyDocument, type AssemblyOccurrence, type EmbeddedAssemblyDefinition } from './assemblyDocument'

export type AssemblyBomMode = 'parts-only' | 'top-level' | 'indented'
export interface AssemblyBomOptions { mode: AssemblyBomMode; includeHidden: boolean }
export interface AssemblyBomMember {
  /** Complete ROOT path and exact definition tuple, never a display-name key. */
  component: AssemblyComponentReference
  name: string
  /** Occurrence names along this member's complete path, for display only. */
  pathNames: string[]
}
export interface AssemblyBomRow {
  /** JSON identity of mode, definition-tuple ancestry and this exact definition. */
  key: string
  parentKey: string | null
  /** Root-level rows have depth zero. */
  depth: number
  /** Ordered display number; may change after filtering or document edits. */
  itemNumber: string
  kind: 'part' | 'assembly'
  definition: AssemblyDefinitionReference
  /** Canonical definition name, not an arbitrarily chosen occurrence name. */
  name: string
  /** Null for flattened parts, which can combine unrelated parent contexts. */
  quantityPerParent: number | null
  quantityTotal: number
  members: AssemblyBomMember[]
}
export interface AssemblyBomReport {
  kind: 'assembly-bom'
  /** Snapshot labels only; these are not native freshness or Apply authority. */
  source: { id: string; revision: string; name: string }
  options: AssemblyBomOptions
  rows: AssemblyBomRow[]
}
/** Output admission caps, aligned with the complete graph's occurrence budget. */
export const MAX_ASSEMBLY_BOM_ROWS = MAX_ASSEMBLY_OCCURRENCES
export const MAX_ASSEMBLY_BOM_MEMBERS = MAX_ASSEMBLY_OCCURRENCES
type Scope = AssemblyDocument | EmbeddedAssemblyDefinition
type Tuple = [string, string]
function fail(message: string): never { throw new Error('Lista de materiales: ' + message) }

/** Strict options data only; unknown, inherited and executable fields reject. */
export function validateAssemblyBomOptions(input?: Partial<AssemblyBomOptions>): AssemblyBomOptions {
  const fields: Record<string, unknown> = Object.create(null)
  if (input !== undefined) {
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail('las opciones deben ser un objeto de datos simple.')
    for (const key of Reflect.ownKeys(input)) {
      const field = Object.getOwnPropertyDescriptor(input, key)!
      if (typeof key !== 'string' || !['mode', 'includeHidden'].includes(key) || !field.enumerable || !('value' in field)) {
        fail('solo se admiten mode e includeHidden como datos enumerables, sin accesores.')
      }
      fields[key] = field.value
    }
  }
  const mode = Object.hasOwn(fields, 'mode') ? fields.mode : 'parts-only'
  const includeHidden = Object.hasOwn(fields, 'includeHidden') ? fields.includeHidden : true
  if (mode !== 'parts-only' && mode !== 'top-level' && mode !== 'indented') fail('modo de lista no válido.')
  if (typeof includeHidden !== 'boolean') fail('includeHidden debe ser verdadero o falso.')
  return { mode, includeHidden }
}

/**
 * Detached declaration BOM. Suppression always prunes the complete branch;
 * visibility is inherited and hidden branches are included by default. The
 * traversal deliberately performs no pose composition or CAD reconstruction.
 * One part occurrence is one unit, even if its source has zero/multiple bodies
 * or its native build would fail. Dormant definitions are not purchased units.
 */
export function buildAssemblyBom(input: AssemblyDocument, supplied?: Partial<AssemblyBomOptions>): AssemblyBomReport {
  const options = validateAssemblyBomOptions(supplied), document = validateAssemblyDocument(input)
  const definitions = new Map(document.definitions.map(value => [assemblyDefinitionKey(value), value]))
  const rows: AssemblyBomRow[] = [], grouped = new Map<string, AssemblyBomRow>()
  const localCounts = new Map<string, Map<string, number>>(), childNumbers = new Map<string | null, number>()
  let traversed = 0, memberCount = 0
  // Hidden/suppressed ancestors are pruned before entering their scope, so a
  // child's local flags suffice here without composing any world placement.
  function eligible(occurrence: AssemblyOccurrence): boolean {
    return !occurrence.suppressed && (options.includeHidden || occurrence.visible)
  }
  function quantity(scope: Scope, definition: AssemblyDefinitionReference): number {
    const scopeKey = assemblyDefinitionKey(scope)
    let counts = localCounts.get(scopeKey)
    if (!counts) {
      counts = new Map<string, number>()
      for (const occurrence of scope.occurrences) if (eligible(occurrence)) {
        const key = assemblyDefinitionKey(occurrence.definition)
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      localCounts.set(scopeKey, counts)
    }
    return counts.get(assemblyDefinitionKey(definition)) ?? 0
  }
  function add(scope: Scope, definition: AssemblyDefinition, occurrence: AssemblyOccurrence,
    path: string[], pathNames: string[], ancestry: Tuple[], parent: AssemblyBomRow | undefined): AssemblyBomRow {
    // Encode a tuple array directly, rather than recursively escaping parentKey.
    // Equal definitions under different ancestor-definition contexts stay apart.
    const context = options.mode === 'parts-only' ? [] : ancestry
    const key = JSON.stringify([options.mode, context, [definition.id, definition.revision]])
    let row = grouped.get(key)
    if (!row) {
      if (rows.length >= MAX_ASSEMBLY_BOM_ROWS) fail('se supera el presupuesto de filas; no se publica una lista parcial.')
      const parentKey = options.mode === 'indented' ? parent?.key ?? null : null
      const ordinal = (childNumbers.get(parentKey) ?? 0) + 1
      childNumbers.set(parentKey, ordinal)
      row = { key, parentKey, depth: options.mode === 'indented' ? ancestry.length - 1 : 0,
        itemNumber: parentKey === null ? String(ordinal) : parent!.itemNumber + '.' + ordinal,
        kind: definition.kind, definition: { id: definition.id, revision: definition.revision },
        name: definition.kind === 'part' ? definition.document.name : definition.name,
        quantityPerParent: options.mode === 'parts-only' ? null : quantity(scope, definition), quantityTotal: 0, members: [] }
      grouped.set(key, row); rows.push(row)
    }
    if (memberCount >= MAX_ASSEMBLY_BOM_MEMBERS) fail('se supera el presupuesto de miembros; no se publica una lista parcial.')
    row.members.push({ component: { occurrencePath: [...path], definition: { id: definition.id, revision: definition.revision } },
      name: occurrence.name, pathNames: [...pathNames] })
    memberCount++; row.quantityTotal = row.members.length
    return row
  }
  function walk(scope: Scope, path: string[], pathNames: string[], ancestry: Tuple[], parent?: AssemblyBomRow): void {
    for (const occurrence of scope.occurrences) {
      if (++traversed > MAX_ASSEMBLY_OCCURRENCES) fail('se supera el presupuesto de ocurrencias recorridas.')
      if (!eligible(occurrence)) continue
      const definition = definitions.get(assemblyDefinitionKey(occurrence.definition))!
      const nextPath = [...path, occurrence.id], names = [...pathNames, occurrence.name]
      let row: AssemblyBomRow | undefined
      if (options.mode !== 'parts-only' || definition.kind === 'part') {
        row = add(scope, definition, occurrence, nextPath, names, ancestry, parent)
      }
      if (options.mode !== 'top-level' && definition.kind === 'assembly') {
        walk(definition, nextPath, names, [...ancestry, [definition.id, definition.revision]], row)
      }
    }
  }
  walk(document, [], [], [[document.id, document.revision]])
  // First filtered encounters set row order and numbering. Reused scopes add
  // members to their existing rows, not extra rows keyed by occurrence paths.
  // All strings/arrays/records escaping here are independent snapshots.
  return { kind: 'assembly-bom', source: { id: document.id, revision: document.revision, name: document.name }, options, rows }
}
