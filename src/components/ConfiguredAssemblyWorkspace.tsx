import { useEffect, useMemo, useRef, useState } from 'react'
import { buildConfiguredAssembly, previewConfiguredAssembly, applyConfiguredAssembly, discardConfiguredAssembly } from '../cad/kernel'
import type { ConfiguredAssemblyPreviewReply } from '../cad/kernel.assembly-configuration-session'
import type { ConfiguredAssemblyScene } from '../cad/kernel.assembly-configuration-scene'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { assemblyDefinitionKey } from '../model/assemblyDocument'
import { AssemblyConfiguredDocumentHistory } from '../model/assemblyConfiguredHistory'
import { validateAssemblyConfiguredDocument, parseAssemblyConfiguredDocument, serializeAssemblyConfiguredDocument, type AssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { parseCadDocument, type CadDocument } from '../model/cadDocument'
import { CAD_RECOVERY_KEY } from '../model/cadRecovery'
import { createConfiguredUiRootVariant, createConfiguredUiScopeVariant, configuredUiPose, editConfiguredUiOccurrence, configuredUiTicket, configuredUiTicketMatches, configuredUiSceneMatches, configuredUiDisplayScene } from './configuredAssemblyUi'
import AssemblyViewport from './AssemblyViewport'
import './assembly.css'
import './configured-assembly.css'

let controllerEpoch = 0
function nextEpoch(minimum = 0) { controllerEpoch = Math.max(controllerEpoch, minimum); if (controllerEpoch >= Number.MAX_SAFE_INTEGER) throw Error('Vuelve a abrir la aplicación para continuar.'); return ++controllerEpoch }
export interface ConfiguredAssemblyWorkspaceProps {
  initialDocument: AssemblyConfiguredDocument
  initialPath?: string
  initialSaved?: string
  onOpenDocument: (document: CadDocument, path?: string, saved?: string) => void
  skipInitialRecoveryWrite?: boolean
}
export default function ConfiguredAssemblyWorkspace({ initialDocument, initialPath, initialSaved, onOpenDocument, skipInitialRecoveryWrite = false }: ConfiguredAssemblyWorkspaceProps) {
  const history = useRef<AssemblyConfiguredDocumentHistory | null>(null)
  if (!history.current) history.current = new AssemblyConfiguredDocumentHistory(initialDocument)
  const [document, setDocument] = useState(() => history.current!.current), [generation, setGeneration] = useState(nextEpoch)
  const [path, setPath] = useState(initialPath), [saved, setSaved] = useState(() => initialSaved === undefined ? '' : serializeAssemblyConfiguredDocument(parseAssemblyConfiguredDocument(initialSaved)))
  const [scene, setScene] = useState<ConfiguredAssemblyScene | null>(null), [preview, setPreview] = useState<ConfiguredAssemblyPreviewReply | null>(null)
  const [busy, setBusy] = useState(false), [cancelable, setCancelable] = useState(false), [failure, setFailure] = useState<string | null>(null)
  const [message, setMessage] = useState('Preparando el ensamblaje…'), [scope, setScope] = useState('[]')
  const [occurrenceId, setOccurrenceId] = useState(''), [variantName, setVariantName] = useState(''), [scopeVariantName, setScopeVariantName] = useState(''), [pose, setPose] = useState(['0', '0', '0'])
  const [rotationAxis, setRotationAxis] = useState<'X' | 'Y' | 'Z'>('Z'), [rotationDegrees, setRotationDegrees] = useState('0')
  const [view, setView] = useState<{ name: 'iso' | 'front' | 'top' | 'fit'; stamp: number }>({ name: 'iso', stamp: 0 })
  const [discardDialog, setDiscardDialog] = useState(false), answer = useRef<((allow: boolean) => void) | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const current = useRef(document), epoch = useRef(generation), scopeRef = useRef(scope), occurrenceRef = useRef(occurrenceId), pathRef = useRef(path), mounted = useRef(false)
  const pending = useRef(preview), operation = useRef(false), skipRecovery = useRef(skipInitialRecoveryWrite)
  const operationKind = useRef<'build' | 'solve' | 'apply' | 'file' | null>(null), dirtyRef = useRef(false)
  current.current = document; pending.current = preview; pathRef.current = path
  const serialized = useMemo(() => serializeAssemblyConfiguredDocument(document), [document]), dirty = serialized !== saved
  const renderedTicket = { serialized, generation, scope, path, occurrence: occurrenceId }
  dirtyRef.current = dirty
  const evaluation = useMemo(() => evaluateAssemblyConfiguration(document.source, document.catalog, document.rootConfiguration), [document])
  const selectedScope = evaluation.scopes.find(row => JSON.stringify(row.path) === scope) ?? evaluation.scopes[0]
  const selected = selectedScope.occurrences.find(row => row.id === occurrenceId)
  const rootVariants = document.catalog.find(row => assemblyDefinitionKey(row.definition) === assemblyDefinitionKey(document.source))?.configurations ?? []
  const ticket = () => configuredUiTicket(current.current, epoch.current, scopeRef.current, pathRef.current, occurrenceRef.current)
  const fresh = (value: ReturnType<typeof ticket>) => mounted.current && configuredUiTicketMatches(value, ticket())
  const release = (token: string) => { void discardConfiguredAssembly(token).catch(() => undefined) }
  const begin = (kind: NonNullable<typeof operationKind.current>) => { operation.current = true; operationKind.current = kind; setBusy(true); setCancelable(kind === 'build' || kind === 'solve') }
  const finish = () => { operation.current = false; operationKind.current = null; setBusy(false); setCancelable(false) }
  const error = (reason: unknown) => { const text = reason instanceof Error ? reason.message : String(reason); setFailure(text); setMessage(text) }
  const revoke = (minimum = 0, reservedEpoch?: number) => {
    const next = reservedEpoch ?? nextEpoch(minimum)
    if (pending.current) release(pending.current.token)
    pending.current = null; setPreview(null); finish()
    answer.current?.(false); answer.current = null; setDiscardDialog(false)
    epoch.current = next; setGeneration(next); setScene(null)
  }
  const commit = (next: AssemblyConfiguredDocument, minimum = 0) => {
    const checked = validateAssemblyConfiguredDocument(next), reservedEpoch = nextEpoch(minimum)
    const owned = history.current!.commitDocument(checked)
    revoke(0, reservedEpoch); setFailure(null); current.current = owned; skipRecovery.current = false; setDocument(owned)
  }
  const edit = (change: Parameters<typeof editConfiguredUiOccurrence>[3]) => {
    if (!fresh(renderedTicket) || operation.current || pending.current || !selected) return
    setFailure(null)
    try { commit(editConfiguredUiOccurrence(current.current, JSON.parse(scopeRef.current), selected.id, change)); setMessage('Estado actualizado. Resuelve para comprobar sus relaciones.') }
    catch (reason) { error(reason) }
  }
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; if (pending.current) release(pending.current.token); answer.current?.(false) }
  }, [])
  useEffect(() => {
    const captured = ticket(); begin('build'); setMessage('Reconstruyendo la configuración…')
    void buildConfiguredAssembly({ document: current.current, generation: captured.generation }).then(value => {
      if (!fresh(captured)) return
      if (!configuredUiSceneMatches(value, current.current, captured.generation)) throw Error('La escena no corresponde a la configuración actual.')
      setScene(value); setMessage(value.referenceDiagnostics.length ? 'Hay referencias que necesitan reparación. La geometría disponible se conserva.' : 'Configuración lista.')
    }).catch(reason => { if (fresh(captured)) { setScene(null); error(reason) } }).finally(() => { if (fresh(captured)) finish() })
  }, [serialized, generation])
  useEffect(() => {
    if (skipRecovery.current) return
    try { localStorage.setItem(CAD_RECOVERY_KEY, serialized) } catch { error(Error('No se pudo guardar la recuperación local. Guarda el archivo.')) }
  }, [serialized])
  useEffect(() => { if (selected) { setPose(selected.pose.translation.map(String)); setRotationDegrees('0') } }, [serialized, scope, occurrenceId])
  useEffect(() => { const leave = (event: BeforeUnloadEvent) => { if (dirtyRef.current || pending.current) { event.preventDefault(); event.returnValue = '' } }; window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave) }, [])
  useEffect(() => {
    if (!discardDialog || !dialog.current) return
    const node = dialog.current, previous = window.document.activeElement
    const buttons = () => [...node.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    buttons()[0]?.focus()
    const key = (event: KeyboardEvent) => {
      if (!fresh(renderedTicket)) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); const resolve = answer.current; answer.current = null; setDiscardDialog(false); resolve?.(false) }
      if (event.key === 'Tab') { const rows = buttons(), first = rows[0], last = rows.at(-1); if (event.shiftKey && window.document.activeElement === first) { event.preventDefault(); last?.focus() } else if (!event.shiftKey && window.document.activeElement === last) { event.preventDefault(); first?.focus() } }
    }
    node.addEventListener('keydown', key)
    return () => { node.removeEventListener('keydown', key); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [discardDialog])
  const solve = async () => {
    if (!fresh(renderedTicket) || operation.current || pending.current || !scene) return
    const captured = ticket(); setFailure(null); begin('solve'); setMessage('Resolviendo todos los estados utilizados…')
    try {
      const reply = await previewConfiguredAssembly({ document: current.current, generation: captured.generation })
      if (!fresh(captured)) { release(reply.token); return }
      if (reply.kind !== 'configured-assembly-preview' || reply.generation !== captured.generation || !reply.verification.accepted
        || !configuredUiSceneMatches(reply.scene, reply.document, reply.candidateGeneration)) { release(reply.token); throw Error('La vista previa no corresponde al estado actual.') }
      pending.current = reply; setPreview(reply); setScene(reply.scene); setMessage('Vista previa verificada. Revisa el resultado y pulsa Aplicar o Cancelar.')
    } catch (reason) { if (fresh(captured)) error(reason) }
    finally { if (fresh(captured)) finish() }
  }
  const apply = async () => {
    const proposal = pending.current
    if (!fresh(renderedTicket) || !proposal || operation.current) return
    const captured = ticket(); setFailure(null); begin('apply')
    try {
      const reply = await applyConfiguredAssembly({ document: current.current, generation: captured.generation }, proposal.token)
      if (!fresh(captured)) return
      if (reply.kind !== 'configured-assembly-applied' || reply.generation !== proposal.candidateGeneration
        || serializeAssemblyConfiguredDocument(reply.document) !== serializeAssemblyConfiguredDocument(proposal.document)
        || !configuredUiSceneMatches(reply.scene, reply.document, reply.generation)) throw Error('La aplicación no coincide con la vista previa verificada.')
      pending.current = null; commit(reply.document, reply.generation); setMessage('Configuración aplicada. Guarda el archivo para conservarla.')
    } catch (reason) { if (fresh(captured)) { revoke(); error(reason) } }
    finally { if (fresh(captured)) finish() }
  }
  const save = async (saveAs: boolean) => {
    if (!fresh(renderedTicket) || operation.current || pending.current) return false
    if (!window.solidflow) { setMessage('Abre la aplicación de escritorio para guardar en un archivo.'); return false }
    const captured = ticket(), content = captured.serialized; setFailure(null); begin('file')
    try {
      const target = await window.solidflow.saveDocument(content, current.current.source.name, saveAs ? undefined : pathRef.current)
      if (!fresh(captured)) return false
      if (!target) { setMessage('Guardado cancelado. El archivo y los cambios siguen como estaban.'); return false }
      pathRef.current = target; setPath(target); setSaved(content); setMessage('Ensamblaje configurado guardado.'); return true
    } catch (reason) { if (fresh(captured)) error(reason); return false }
    finally { if (mounted.current && epoch.current === captured.generation) finish() }
  }
  const open = async () => {
    if (!fresh(renderedTicket) || operation.current || pending.current || !window.solidflow) return
    const captured = ticket(); setFailure(null); begin('file')
    try {
      if (captured.serialized !== saved) {
        const allowed = await new Promise<boolean>(resolve => { answer.current = resolve; setDiscardDialog(true) })
        if (!allowed || !fresh(captured)) return
      }
      const file = await window.solidflow.openDocument()
      if (!fresh(captured) || !file) return
      const next = parseCadDocument(file.content)
      revoke(); onOpenDocument(next, file.path, file.content)
    } catch (reason) { if (fresh(captured)) error(reason) }
    finally { if (fresh(captured)) finish() }
  }
  const undo = (redo: boolean) => {
    if (!fresh(renderedTicket) || operation.current || pending.current) return
    const reservedEpoch = nextEpoch(), value = redo ? history.current!.redo() : history.current!.undo()
    revoke(0, reservedEpoch); setFailure(null); current.current = value; skipRecovery.current = false; setDocument(value)
  }
  const changeScope = (value: string) => { if (!fresh(renderedTicket) || operation.current || pending.current || !evaluation.scopes.some(row => JSON.stringify(row.path) === value)) return; revoke(); setFailure(null); scopeRef.current = value; occurrenceRef.current = ''; setScope(value); setOccurrenceId('') }
  const displayScene = useMemo(() => scene ? configuredUiDisplayScene(scene) : null, [scene])
  const blocked = busy || !!preview
  return <div className="configured-assembly-workspace" aria-label="Ensamblaje configurado" aria-busy={busy}>
    <header><strong>SolidFlow · {document.source.name}{dirty ? ' *' : ''}</strong><span title={path}>{path?.split(/[\\/]/).at(-1) ?? 'Sin guardar'}</span></header>
    <nav aria-label="Archivo del ensamblaje configurado">
      <button onClick={() => void open()} disabled={blocked}>Abrir</button><button onClick={() => void save(false)} disabled={blocked}>Guardar</button><button onClick={() => void save(true)} disabled={blocked}>Guardar como</button>
      <button onClick={() => undo(false)} disabled={blocked || !history.current.canUndo}>Deshacer</button><button onClick={() => undo(true)} disabled={blocked || !history.current.canRedo}>Rehacer</button>
      <button onClick={() => void solve()} disabled={blocked || !scene}>Resolver configuración</button><button onClick={() => void apply()} disabled={busy || !preview}>Aplicar configuración</button>
      <button onClick={() => { if (!fresh(renderedTicket) || operationKind.current !== 'build' && operationKind.current !== 'solve' && (operation.current || !pending.current)) return; revoke(); setFailure(null); setMessage('Vista previa cancelada. Se conserva el documento confirmado.') }} disabled={!cancelable && (!preview || busy)}>Cancelar</button>
    </nav>
    <div className="configured-assembly-layout"><aside>
      <h2>Configuraciones</h2><label>Configuración raíz<select aria-label="Configuración raíz" disabled={blocked} value={document.rootConfiguration ?? ''} onChange={event => {
        if (!fresh(renderedTicket) || operation.current || pending.current) return
        try { commit(validateAssemblyConfiguredDocument({ ...current.current, rootConfiguration: event.target.value || null })); scopeRef.current = '[]'; occurrenceRef.current = ''; setScope('[]'); setOccurrenceId('') } catch (reason) { error(reason) }
      }}><option value="">Base</option>{rootVariants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
      <label>Nueva configuración raíz<input aria-label="Nombre de nueva configuración raíz" disabled={blocked} value={variantName} onChange={event => { if (fresh(renderedTicket)) setVariantName(event.target.value) }} /></label>
      <button disabled={blocked || !variantName.trim()} onClick={() => { if (!fresh(renderedTicket) || operation.current || pending.current) return; try { commit(createConfiguredUiRootVariant(current.current, variantName)); setVariantName(''); scopeRef.current = '[]'; occurrenceRef.current = ''; setScope('[]'); setOccurrenceId('') } catch (reason) { error(reason) } }}>Crear configuración basada en Base</button>
      <p>La nueva configuración empieza en Base; no copia la variante seleccionada.</p>
      <h2>Estado efectivo</h2><label>Ámbito<select aria-label="Ámbito de configuración" disabled={blocked} value={scope} onChange={event => changeScope(event.target.value)}>{evaluation.scopes.map(row => <option key={JSON.stringify(row.path)} value={JSON.stringify(row.path)}>{row.path.join(' / ') || 'Raíz'} · {row.configuration ?? 'Base'}{row.suppressed ? ' · suprimido' : ''}</option>)}</select></label>
      {scope !== '[]' && <section aria-label="Crear configuración del ámbito"><label>Nueva configuración del ámbito<input aria-label="Nombre de nueva configuración del ámbito" disabled={blocked} value={scopeVariantName} onChange={event => { if (fresh(renderedTicket)) setScopeVariantName(event.target.value) }} /></label><button disabled={blocked || !scopeVariantName.trim()} onClick={() => { if (!fresh(renderedTicket) || operation.current || pending.current) return; try { commit(createConfiguredUiScopeVariant(current.current, JSON.parse(scopeRef.current), scopeVariantName)); setScopeVariantName(''); occurrenceRef.current = ''; setOccurrenceId('') } catch (reason) { error(reason) } }}>Crear configuración del ámbito basada en Base</button><small>Se selecciona para este uso en la configuración activa del padre. Los usos que comparten ese estado del padre también cambian.</small></section>}
      <label>Ocurrencia<select aria-label="Ocurrencia configurada" disabled={blocked} value={occurrenceId} onChange={event => { if (!fresh(renderedTicket) || operation.current || pending.current) return; occurrenceRef.current = event.target.value; setOccurrenceId(event.target.value) }}><option value="">Selecciona una ocurrencia</option>{selectedScope.occurrences.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      {selected && <section aria-label="Editar estado de ocurrencia"><p>{selectedScope.configuration === null ? 'Editando Base: los estados que heredan estos valores también cambian.' : 'Editando sólo la configuración ' + selectedScope.configuration + '. Los usos de esta misma variante comparten el cambio.'}</p>
        <fieldset disabled={blocked}><legend>Traslación local (mm)</legend>{['X', 'Y', 'Z'].map((axis, i) => <label key={axis}>{axis}<input aria-label={'Posición configurada ' + axis} type="number" step="any" value={pose[i]} onChange={event => { if (fresh(renderedTicket)) setPose(values => values.map((v, index) => index === i ? event.target.value : v)) }} /></label>)}</fieldset>
        <label>Eje local de giro<select aria-label="Eje local de giro configurado" disabled={blocked} value={rotationAxis} onChange={event => { if (fresh(renderedTicket)) setRotationAxis(event.target.value as 'X' | 'Y' | 'Z') }}>{(['X', 'Y', 'Z'] as const).map(axis => <option key={axis} value={axis}>{axis}</option>)}</select></label><label>Giro incremental (grados)<input aria-label="Giro incremental configurado en grados" type="number" step="any" disabled={blocked} value={rotationDegrees} onChange={event => { if (fresh(renderedTicket)) setRotationDegrees(event.target.value) }} /></label>
        <button disabled={blocked || pose.some(v => !v.trim()) || !rotationDegrees.trim()} onClick={() => { if (!fresh(renderedTicket) || operation.current || pending.current) return; try { edit({ pose: configuredUiPose(selected.pose, pose.map(Number), rotationAxis, Number(rotationDegrees)) }) } catch (reason) { error(reason) } }}>Actualizar posición del estado</button>
        <label><input type="checkbox" aria-label="Ocurrencia configurada visible" disabled={blocked} checked={selected.visible} onChange={event => edit({ visible: event.target.checked })} />Visible</label><label><input type="checkbox" aria-label="Ocurrencia configurada suprimida" disabled={blocked} checked={selected.suppressed} onChange={event => edit({ suppressed: event.target.checked })} />Suprimida</label>
        {evaluation.scopes.some(row => JSON.stringify(row.path) === JSON.stringify([...selectedScope.path, selected.id])) && <label>Configuración hija<select aria-label="Configuración hija de la ocurrencia" disabled={blocked || selectedScope.configuration === null} value={evaluation.scopes.find(row => JSON.stringify(row.path) === JSON.stringify([...selectedScope.path, selected.id]))?.configuration ?? ''} onChange={event => edit({ configuration: event.target.value || null })}><option value="">Base</option>{document.catalog.find(row => assemblyDefinitionKey(row.definition) === assemblyDefinitionKey(selected.definition))?.configurations.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select>{selectedScope.configuration === null && <small>Crea primero una configuración del padre para elegir una variante hija.</small>}</label>}
      </section>}
      <h2>Piezas efectivas</h2><ul>{evaluation.parts.map(part => <li key={JSON.stringify(part.path)}>{part.path.join(' / ')}{part.suppressed ? ' · suprimida' : part.visible ? '' : ' · oculta'}</li>)}</ul>
    </aside><main><nav aria-label="Vistas del ensamblaje configurado">{([['iso', 'Isométrica'], ['front', 'Frontal'], ['top', 'Superior'], ['fit', 'Ajustar']] as const).map(([name, label]) => <button key={name} disabled={busy} onClick={() => setView(old => ({ name, stamp: old.stamp + 1 }))}>{label}</button>)}</nav><div className="configured-assembly-view"><AssemblyViewport scene={displayScene} disabled={busy} view={view} onComponent={() => undefined} onFace={() => undefined} /></div>
      {preview && <p role="status">Vista previa verificada · todavía sin aplicar. {preview.states.length} estados resueltos; {preview.verification.reports.length} relaciones comprobadas.</p>}
      {scene && <p aria-label="Totales de configuración">{scene.scene.solidCount} sólidos · {scene.scene.volume.toFixed(3)} mm³ · {scene.scene.area.toFixed(3)} mm²</p>}
      <p className="configured-assembly-limit">Edición de estados, selección de variantes y resolución. La creación y reparación de relaciones, exportación y movimiento interactivo aún no están disponibles en esta vista.</p>
    </main></div>{failure && <p className="configured-assembly-error" role="alert">{failure}</p>}<footer role="status">{message}</footer>
    {discardDialog && <div ref={dialog} role="dialog" aria-modal="true" aria-label="Cambios del ensamblaje configurado"><p>Hay cambios sin guardar. ¿Abrir otro documento?</p><button onClick={() => { if (!fresh(renderedTicket)) return; const resolve = answer.current; answer.current = null; setDiscardDialog(false); resolve?.(false) }}>Cancelar apertura</button><button onClick={() => { if (!fresh(renderedTicket)) return; const resolve = answer.current; answer.current = null; setDiscardDialog(false); resolve?.(true) }}>Continuar sin guardar</button></div>}
  </div>
}
