import { Box, ChevronRight, EyeOff, Layers, Link2, LockKeyhole, Settings2 } from 'lucide-react'
import { useId, useMemo, type MouseEvent, type ReactNode } from 'react'
import type { AssemblyConfigurationEvaluation } from '../model/assemblyConfigurationCore'
import type { AssemblyComponentReference } from '../model/assemblyDocument'
import { useAssemblyTreeNavigation } from './useAssemblyTreeNavigation'
import type { AssemblyOriginTreeEntry } from './assemblyOriginTree'
import AssemblyOriginIcon from './AssemblyOriginIcon'

type Scope = AssemblyConfigurationEvaluation['scopes'][number]
type TreeNode = { key: string; parentKey: string | null; path: string[] } & (
  { kind: 'occurrence'; ownerPath: string[]; occurrence: Scope['occurrences'][number]; isAssembly: boolean }
  | { kind: 'configuration'; scope: Scope }
  | { kind: 'origin'; entry: AssemblyOriginTreeEntry }
)

export function configuredAssemblyTreeKey(kind: TreeNode['kind'], path: readonly string[], definition: { id: string; revision: string }): string {
  return JSON.stringify([kind, path, definition.id, definition.revision])
}

/** Reused definitions keep separate occurrence and configuration action identities. */
export function configuredAssemblyTreeNodes(evaluation: AssemblyConfigurationEvaluation, origins?: readonly AssemblyOriginTreeEntry[]): TreeNode[] {
  const scopes = new Map(evaluation.scopes.map(scope => [JSON.stringify(scope.path), scope])), nodes: TreeNode[] = []
  const originsByOwner = new Map<string, AssemblyOriginTreeEntry[]>()
  for (const entry of origins ?? []) {
    const owner = JSON.stringify(entry.ownerPath), entries = originsByOwner.get(owner) ?? []
    entries.push(entry); originsByOwner.set(owner, entries)
  }
  const addOrigins = (path: readonly string[], parentKey: string | null) => {
    for (const entry of originsByOwner.get(JSON.stringify(path)) ?? []) {
      nodes.push({ kind: 'origin', key: entry.treeKey, parentKey, path: [...path], entry })
    }
  }
  const visit = (path: readonly string[], parentKey: string | null) => {
    const owner = scopes.get(JSON.stringify(path))
    if (!owner) return
    for (const occurrence of owner.occurrences) {
      const childPath = [...path, occurrence.id], key = configuredAssemblyTreeKey('occurrence', childPath, occurrence.definition)
      const child = scopes.get(JSON.stringify(childPath))
      nodes.push({ key, parentKey, path: childPath, kind: 'occurrence', ownerPath: [...path], occurrence, isAssembly: !!child })
      addOrigins(childPath, key)
      if (!child) continue
      nodes.push({ key: configuredAssemblyTreeKey('configuration', childPath, child.definition), parentKey: key, path: childPath, kind: 'configuration', scope: child })
      visit(childPath, key)
    }
  }
  addOrigins([], null)
  visit([], null)
  return nodes
}

interface Props {
  name: string
  evaluation: AssemblyConfigurationEvaluation
  scope: string
  occurrenceId: string
  disabled: boolean
  active: boolean
  resetKey: unknown
  onScope: (scope: string) => void
  onOccurrence: (scope: string, id: string) => void
  onProperties: () => void
  onRelations: () => void
  originRows?: readonly AssemblyOriginTreeEntry[]
  selectedOriginKey?: string | null
  onOrigin?: (entry: AssemblyOriginTreeEntry, additive?: boolean) => void
  onComponentContext?: (component: AssemblyComponentReference, point: { x: number; y: number }, element: HTMLElement) => void
}

/** Disclosure and focus are presentation state; callers retain every CAD guard. */
export default function ConfiguredAssemblyTree({ name, evaluation, scope, occurrenceId, disabled, active, resetKey, onScope, onOccurrence, onProperties, onRelations, originRows, selectedOriginKey, onOrigin, onComponentContext }: Props) {
  const prefix = useId(), nodes = useMemo(() => configuredAssemblyTreeNodes(evaluation, originRows), [evaluation, originRows])
  const childrenByParent = useMemo(() => {
    const result = new Map<string | null, TreeNode[]>()
    for (const node of nodes) {
      const children = result.get(node.parentKey) ?? []
      children.push(node); result.set(node.parentKey, children)
    }
    return result
  }, [nodes])
  const selected = nodes.find(node => node.kind === 'occurrence' && JSON.stringify(node.ownerPath) === scope && node.occurrence.id === occurrenceId)
  const selectedDatum = nodes.find(node => node.kind === 'origin' && node.key === selectedOriginKey)
  const selectedKey = selectedDatum?.key ?? selected?.key ?? (occurrenceId ? null : nodes.find(node => node.kind === 'configuration' && JSON.stringify(node.path) === scope)?.key ?? null)
  const navigation = useAssemblyTreeNavigation({ nodes, selectedKey, resetKey, active, disabled })
  const groupId = (key: string) => prefix + '-group-' + key.split('').map(char => char.charCodeAt(0).toString(16)).join('-')
  const renderNode = (node: TreeNode): ReactNode => {
    const children = childrenByParent.get(node.key) ?? [], expanded = navigation.isExpanded(node.key)
    const occurrence = node.kind === 'occurrence' ? node.occurrence : null
    const origin = node.kind === 'origin' ? node.entry : null
    const originLabel = origin ? origin.display.reference.kind === 'principal-plane' ? `Plano ${origin.display.reference.plane}` : `Eje ${origin.display.reference.axis}` : ''
    const level = node.path.length + (node.kind === 'configuration' || origin ? 1 : 0)
    const choose = (event: MouseEvent<HTMLButtonElement>) => {
      if (disabled || !active || !navigation.isVisible(node.key)) return
      if (node.kind === 'occurrence') onOccurrence(JSON.stringify(node.ownerPath), node.occurrence.id)
      else if (node.kind === 'origin') onOrigin?.(node.entry, event.ctrlKey || event.metaKey)
      else onScope(JSON.stringify(node.path))
    }
    const context = (point: { x: number; y: number }, element: HTMLElement) => {
      if (node.kind !== 'occurrence' || !onComponentContext || disabled || !active || !navigation.isVisible(node.key) || !element.isConnected) return
      onComponentContext({ occurrencePath: [...node.path], definition: { ...node.occurrence.definition } }, point, element)
    }
    return <li key={node.key} role="none" hidden={!navigation.isVisible(node.key)}>
      <div className="configured-tree-line">
        {children.length ? <button type="button" className="configured-tree-disclosure" tabIndex={-1}
          data-assembly-tree-disclosure={node.key} aria-label={`${expanded ? 'Contraer' : 'Expandir'} componente ${occurrence?.name ?? name}`}
          aria-controls={groupId(node.key)} aria-expanded={expanded} disabled={disabled || !active}
          onClick={() => navigation.toggle(node.key)}><ChevronRight size={13} aria-hidden="true" /></button>
          : <span className="configured-tree-disclosure-space" aria-hidden="true" />}
        <button type="button" role="treeitem" ref={element => navigation.register(node.key, element)}
          className={node.key === selectedKey ? 'configured-tree-row selected' : 'configured-tree-row'}
          data-assembly-tree-key={node.key} data-assembly-tree-parent={node.parentKey ?? ''}
          data-assembly-origin-tree-key={origin?.treeKey} data-assembly-origin-tree-reference={origin ? JSON.stringify(origin.display.reference) : undefined}
          data-assembly-origin-tree-owner={origin ? JSON.stringify(origin.ownerPath) : undefined}
          aria-level={level} aria-selected={node.key === selectedKey}
          aria-expanded={children.length ? expanded : undefined} aria-controls={children.length ? groupId(node.key) : undefined}
          aria-owns={children.length ? groupId(node.key) : undefined}
          aria-haspopup={occurrence && onComponentContext ? 'menu' : undefined}
          aria-label={origin ? `Seleccionar ${originLabel} de ${origin.ownerPath.join(' / ') || 'Raíz'}` : occurrence ? `Seleccionar componente ${occurrence.name}` : `Configuración de ${node.path.join(' / ')}`}
          aria-pressed={node.kind === 'configuration' ? scope === JSON.stringify(node.path) : node.key === selectedKey}
          title={occurrence ? `${node.path.join(' / ')} · ${occurrence.definition.id} · ${occurrence.definition.revision}` : undefined}
          tabIndex={navigation.rowTabIndex(node.key)} disabled={disabled || !active} aria-disabled={origin && !onOrigin ? true : undefined}
          onFocus={() => navigation.onFocus(node.key)} onKeyDown={event => {
            if (occurrence && onComponentContext && !event.altKey && !event.ctrlKey && !event.metaKey
              && (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey)) {
              event.preventDefault(); event.stopPropagation()
              const rect = event.currentTarget.getBoundingClientRect(); context({ x: rect.left + 28, y: rect.bottom }, event.currentTarget)
            } else navigation.onKeyDown(event, node.key)
          }} onContextMenu={occurrence && onComponentContext ? event => {
            event.preventDefault(); event.stopPropagation(); context({ x: event.clientX, y: event.clientY }, event.currentTarget)
          } : undefined} onClick={choose}>
          {origin ? <AssemblyOriginIcon plane={origin.display.reference.kind === 'principal-plane'} /> : node.kind === 'configuration' || node.kind === 'occurrence' && node.isAssembly ? <Layers size={15} aria-hidden="true" /> : <Box size={15} aria-hidden="true" />}
          <span>{node.kind === 'origin' ? originLabel : node.kind === 'occurrence' ? node.occurrence.name : node.scope.configuration ?? 'Base'}</span>
          {occurrence?.fixed && <LockKeyhole size={12} aria-label="Fijado" />}{occurrence && !occurrence.visible && <EyeOff size={12} aria-label="Oculto" />}
          {occurrence?.suppressed && <small>Suprimido</small>}
        </button>
      </div>
      {!!children.length && <ul role="group" id={groupId(node.key)} data-assembly-tree-parent-key={node.key} hidden={!expanded}>{children.map(renderNode)}</ul>}
    </li>
  }
  return <section className="configured-model-tree" id="configured-model-tree" aria-label="Árbol del ensamblaje configurado" tabIndex={-1}>
    <h2>Ensamblaje</h2>
    <button type="button" className="configured-tree-root" disabled={disabled || !active} onClick={() => onScope('[]')}><Layers size={17} /><strong>{name}</strong></button>
    <button type="button" className="configured-tree-state" disabled={disabled || !active} onClick={() => onScope('[]')}><Layers size={14} />{evaluation.rootConfiguration ?? 'Base'}</button>
    <ul role="tree" aria-label="Componentes del ensamblaje configurado">{childrenByParent.get(null)?.map(renderNode)}</ul>
    <button type="button" aria-label="Propiedades del componente seleccionado" disabled={disabled || !active || !selected || !!selectedDatum} onClick={onProperties}><Settings2 size={15} />Propiedades del componente</button>
    <button type="button" onClick={onRelations}><Link2 size={15} />Relaciones de posición</button>
  </section>
}
