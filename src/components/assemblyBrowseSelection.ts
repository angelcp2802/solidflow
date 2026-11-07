import { assemblySceneEdgeReference, assemblySceneFaceReference, type AssemblyScene, type AssemblySceneEdge, type AssemblySceneFace } from '../cad/kernel.assembly-types'
import { validateAssemblyGeometryReference, type AssemblyGeometryReference } from '../model/assemblyDocument'
import { assemblyBodyKey, assemblyEdgeKey, assemblyFaceKey } from './AssemblyViewport'
import { assemblyOriginReferenceKey, type AssemblyOriginDisplay } from './assemblyOriginPicking'
import type { AssemblyOriginTreeContext, AssemblyOriginTreeEntry } from './assemblyOriginTree'

export interface AssemblyBrowseContext extends AssemblyOriginTreeContext {
  readonly scene: AssemblyScene | null
}

export type AssemblyBrowseItem = { kind: 'face' | 'edge'; key: string }
  | { kind: 'origin'; key: string; binding: string } | { kind: 'unsupported'; key: string }
export interface AssemblyBrowseSelection extends AssemblyBrowseContext { readonly items: readonly AssemblyBrowseItem[] }

function samePath(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((id, index) => id === second[index])
}
function inside(owner: readonly string[], scope: readonly string[]): boolean {
  return owner.length > scope.length && scope.every((id, index) => id === owner[index])
}
function sameContext(first: AssemblyBrowseContext, second: AssemblyBrowseContext): boolean {
  return first.documentSignature === second.documentSignature && Object.is(first.sessionIdentity, second.sessionIdentity)
    && first.scene === second.scene && samePath(first.scopePath, second.scopePath)
}

function nominate(previous: AssemblyBrowseSelection | null, item: AssemblyBrowseItem | null, context: AssemblyBrowseContext,
  additive: boolean): AssemblyBrowseSelection {
  let items: readonly AssemblyBrowseItem[] = item ? [item] : []
  if (item && additive && previous && sameContext(previous, context)) {
    const found = previous.items.some(value => value.kind === item.kind && value.key === item.key)
    if (!found) items = [...previous.items, item]
    else if (item.kind === 'unsupported') items = previous.items
    else items = previous.items.filter(value => value.kind !== item.kind || value.key !== item.key)
  }
  return { ...context, scopePath: [...context.scopePath], items }
}

/** Browse intent retains exact display identities, not saved-reference authority. */
export function nominateAssemblyBrowseFace(previous: AssemblyBrowseSelection | null, face: AssemblySceneFace | null,
  empty: boolean, context: AssemblyBrowseContext, additive: boolean, unresolvedKey = 'unresolved-visible-surface'): AssemblyBrowseSelection {
  return nominate(previous, face ? { kind: 'face', key: assemblyFaceKey(face) }
    : empty ? null : { kind: 'unsupported', key: unresolvedKey }, context, additive)
}
export function nominateAssemblyBrowseEdge(previous: AssemblyBrowseSelection | null, edge: AssemblySceneEdge | null,
  empty: boolean, context: AssemblyBrowseContext, additive: boolean, unresolvedKey = 'unresolved-visible-edge'): AssemblyBrowseSelection {
  return nominate(previous, edge ? { kind: 'edge', key: assemblyEdgeKey(edge) }
    : empty ? null : { kind: 'unsupported', key: unresolvedKey }, context, additive)
}
export function nominateAssemblyBrowseOrigin(previous: AssemblyBrowseSelection | null, entry: AssemblyOriginTreeEntry,
  context: AssemblyBrowseContext, additive: boolean): AssemblyBrowseSelection {
  return nominate(previous, { kind: 'origin', key: entry.treeKey, binding: entry.binding }, context, additive)
}
export function nominateAssemblyBrowseUnsupported(key: string, context: AssemblyBrowseContext): AssemblyBrowseSelection {
  return nominate(null, { kind: 'unsupported', key }, context, false)
}
export function assemblyBrowseSelectionOrComponent(selection: AssemblyBrowseSelection | null, componentKey: string | null,
  context: AssemblyBrowseContext): AssemblyBrowseSelection | null {
  return selection ?? (componentKey === null ? null : nominateAssemblyBrowseUnsupported(componentKey, context))
}

export interface AssemblyRelationSelection {
  status: 'empty' | 'ready' | 'invalid'
  references: AssemblyGeometryReference[]
  faces: AssemblySceneFace[]
  edges: AssemblySceneEdge[]
  origins: AssemblyOriginDisplay[]
  message?: string
}
function result(status: AssemblyRelationSelection['status'], message?: string): AssemblyRelationSelection {
  return { status, references: [], faces: [], edges: [], origins: [], ...(message ? { message } : {}) }
}

/** The tree may be a global catalog while the editable relation scope is nested. */
function originReference(entry: AssemblyOriginTreeEntry, scopePath: readonly string[]): AssemblyGeometryReference | null {
  const declared = validateAssemblyGeometryReference(entry.display.reference)
  if (declared.kind !== 'principal-axis' && declared.kind !== 'principal-plane') return null
  if (assemblyOriginReferenceKey(declared) !== entry.display.key) return null
  const catalogRoot = samePath(entry.ownerPath, entry.scopePath)
  if (catalogRoot) {
    if (declared.component !== null) return null
  } else {
    if (!inside(entry.ownerPath, entry.scopePath) || !declared.component
      || !samePath(declared.component.occurrencePath, entry.ownerPath.slice(entry.scopePath.length))
      || declared.component.definition.id !== entry.definition.id || declared.component.definition.revision !== entry.definition.revision) return null
  }
  const root = samePath(entry.ownerPath, scopePath)
  if (!root && !inside(entry.ownerPath, scopePath)) return null
  return validateAssemblyGeometryReference({ ...declared, component: root ? null : {
    occurrencePath: entry.ownerPath.slice(scopePath.length), definition: { ...entry.definition },
  } })
}

/** Resolve the complete list against current unique visible entries. Native preview
 * still authenticates every proposed endpoint; no camera witness grants a mate. */
export function resolveAssemblyRelationSelection(selection: AssemblyBrowseSelection | null, context: AssemblyBrowseContext,
  origins: readonly AssemblyOriginTreeEntry[]): AssemblyRelationSelection {
  if (!selection) return result('empty')
  if (!context.documentSignature || context.sessionIdentity == null || !context.scene || !sameContext(selection, context)) {
    return result('invalid', 'La selección ya no pertenece al documento y ámbito actuales.')
  }
  if (!selection.items.length) return result('empty')
  if (selection.items.length > 2) return result('invalid', 'Selecciona una o dos referencias para iniciar la relación.')
  const resolved = result('ready'), keys = new Set<string>(), references = new Set<string>()
  for (const item of selection.items) {
    const key = JSON.stringify([item.kind, item.key])
    if (keys.has(key)) return result('invalid', 'Selecciona referencias distintas y actuales.')
    keys.add(key)
    if (item.kind !== 'face' && item.kind !== 'edge' && item.kind !== 'origin') {
      return result('invalid', 'La selección contiene un elemento sin referencia compatible.')
    }
    let reference: AssemblyGeometryReference | null = null
    try {
      if (item.kind === 'origin') {
        const matches = origins.filter(value => value.treeKey === item.key)
        if (matches.length !== 1 || matches[0].binding !== item.binding) return result('invalid', 'La referencia de origen ya no es única y actual.')
        reference = originReference(matches[0], context.scopePath)
        if (reference) resolved.origins.push(matches[0].display)
      } else {
        const bodies = context.scene.bodies.filter(body => body.visible)
        const matches = item.kind === 'face'
          ? bodies.flatMap(body => body.faces.map(face => ({ body, value: face }))).filter(entry => assemblyFaceKey(entry.value) === item.key)
          : bodies.flatMap(body => (body.edges ?? []).map(edge => ({ body, value: edge }))).filter(entry => assemblyEdgeKey(entry.value) === item.key)
        if (matches.length !== 1) return result('invalid', 'La referencia geométrica ya no es única y visible.')
        const { body, value } = matches[0]
        if (assemblyBodyKey(body.component, body.body) !== assemblyBodyKey(value.selection.component, value.selection.body)) {
          return result('invalid', 'La referencia no pertenece al cuerpo visible actual.')
        }
        const source = item.kind === 'face' ? assemblySceneFaceReference(value as AssemblySceneFace) : assemblySceneEdgeReference(value as AssemblySceneEdge)
        if (source && inside(source.component.occurrencePath, context.scopePath)) {
          source.component.occurrencePath = source.component.occurrencePath.slice(context.scopePath.length)
          reference = validateAssemblyGeometryReference(source)
          if (item.kind === 'face') resolved.faces.push(value as AssemblySceneFace)
          else resolved.edges.push(value as AssemblySceneEdge)
        }
      }
    } catch {
      return result('invalid', 'La selección no contiene una referencia geométrica válida.')
    }
    if (!reference) return result('invalid', 'Selecciona una referencia compatible dentro del ámbito actual.')
    const referenceKey = JSON.stringify(reference)
    if (references.has(referenceKey)) return result('invalid', 'Selecciona referencias distintas y actuales.')
    references.add(referenceKey)
    resolved.references.push(reference)
  }
  return resolved
}
