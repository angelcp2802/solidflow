import { useViewHistory } from './useViewHistory'
import { NamedViewsDialog } from './NamedViewsDialog'
import CadContextMenu, { type CadContextAction } from './CadContextMenu'
import { captureConfiguredComponentContext, configuredComponentContextRow, resolveConfiguredComponentContext, type ConfiguredComponentContextTarget } from './configuredAssemblyContextTarget'
import { rebindNamedViewSelection, sameDocumentExceptNamedViews, useNamedDocumentViews } from './useNamedDocumentViews'
import { standardViews, type ViewName, type ViewRequest } from './viewNavigation'
import { assemblyNormalSelectionOrComponent, nominateAssemblyNormalFace, nominateAssemblyNormalOrigin, nominateAssemblyNormalUnsupported, resolveAssemblyNormalSelection, type AssemblyNormalSelection } from './assemblyNormalTo'
import { ViewOrientationControls } from './ViewOrientationControls'
import { requestNewDocument, useNewDocumentDialog } from './useNewDocumentDialog'
import { createDocument } from '../model/document'
import { createEmptyAssembly } from '../examples/assembly'
import { CompactViewportToolbar, ViewportToolGroup, ViewportToolIcon } from './CompactViewportToolbar'
import ConfiguredAssemblyOccurrencePanel, { initialConfiguredOccurrenceFields, configuredOccurrenceUiIntent, configuredOccurrenceImportIntent, configuredOccurrenceReuseIntent } from './ConfiguredAssemblyOccurrencePanel'
import type { AssemblyConfiguredOccurrenceEdit } from '../model/assemblyConfiguredOccurrenceEditing'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildConfiguredAssembly, previewConfiguredAssembly, previewConfiguredAssemblyRelationEdit, previewConfiguredAssemblyMechanicalEdit, previewConfiguredAssemblyOccurrenceEdit, applyConfiguredAssembly, discardConfiguredAssembly } from '../cad/kernel'
import type { ConfiguredAssemblyPreviewReply } from '../cad/kernel.assembly-configuration-session'
import type { ConfiguredAssemblyScene } from '../cad/kernel.assembly-configuration-scene'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { assemblyDefinitionKey, validateAssemblyMate, type AssemblyMate, type AssemblyComponentReference } from '../model/assemblyDocument'
import { validateAssemblyConfiguredMateEdit, type AssemblyConfiguredMateEdit } from '../model/assemblyConfiguredMateEditing'
import { inspectAssemblyConfiguredMechanicalEdit, validateAssemblyConfiguredMechanicalEdit, type AssemblyConfiguredMechanicalEdit } from '../model/assemblyConfiguredMechanicalEditing'
import { AssemblyConfiguredDocumentHistory } from '../model/assemblyConfiguredHistory'
import { validateAssemblyConfiguredDocument, parseAssemblyConfiguredDocument, serializeAssemblyConfiguredDocument, type AssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { parseCadDocument, type CadDocument } from '../model/cadDocument'
import { CAD_RECOVERY_KEY } from '../model/cadRecovery'
import { buildConfiguredAssemblyBom, type ConfiguredAssemblyBomOptions, type ConfiguredAssemblyBomMember } from '../model/assemblyConfiguredBom'
import { createConfiguredUiRootVariant, createConfiguredUiScopeVariant, configuredUiPose, editConfiguredUiOccurrence, configuredUiTicket, configuredUiTicketMatches, configuredUiSceneMatches, configuredUiDisplayScene, configuredBomUiTicket, configuredBomUiTicketMatches, configuredBomUiSelectedPath, downloadConfiguredBomCsv, runConfiguredBomCsvExport, configuredMateUiTicketMatches, configuredMateUiPreviewMatches, configuredMechanicalUiPreviewMatches } from './configuredAssemblyUi'
import AssemblyViewport, { type AssemblyViewportViewSelection, type AssemblyViewportContextTarget } from './AssemblyViewport'
import { configuredComponentPick, configuredMatePickChoice, configuredMateHighlights, type ConfiguredMatePick } from './configuredAssemblyPicking'
import { buildAssemblyOriginDisplay, type AssemblyOriginReference } from './assemblyOriginPicking'
import { buildAssemblyOriginTree, retainAssemblyOriginTreeSelection, resolveAssemblyOriginTreeSelection, type AssemblyOriginTreeEntry, type AssemblyOriginTreeSelection } from './assemblyOriginTree'
import { configuredOriginCatalog, configuredOriginHighlights, configuredOriginOwners, configuredOriginPickAssignment, configuredOriginPickChoice, type ConfiguredOriginPick } from './configuredAssemblyOriginPicking'
import type { AssemblySceneFace, AssemblySceneEdge } from '../cad/kernel.assembly-types'
import ConfiguredAssemblyBomPanel from './ConfiguredAssemblyBomPanel'
import ConfiguredAssemblyMatePanel, { configuredMateUiDraft, configuredMateUiRoleLabels, configuredMateUiChoices, configuredMateUiProposal, configuredMateEditUnavailable, type ConfiguredMateDraft } from './ConfiguredAssemblyMatePanel'
import ConfiguredAssemblyMechanicalPanel, { configuredMechanicalDraft, configuredMechanicalChoices, configuredMechanicalIntent, configuredMechanicalMate, type ConfiguredMechanicalDraft } from './ConfiguredAssemblyMechanicalPanel'
import ConfiguredAssemblyCompoundPanel, { configuredCompoundUiDraft, configuredCompoundUiProposal, configuredCompoundMate, type ConfiguredCompoundDraft } from './ConfiguredAssemblyCompoundPanel'
import { configuredCompoundUiChoices, type ConfiguredCompoundUiChoices } from './configuredCompoundUiChoices'
import { Box, Check, Component, FolderOpen, Layers, Link2, List, Play, Redo2, Save, SavePen, Settings2, Undo2, X } from 'lucide-react'
import { AssemblyShellHeader, AssemblyCommandGroup, type AssemblyMenuDefinition } from './AssemblyCommandManager'
import { useAssemblyShortcuts, withAssemblyShortcutLabels } from './useAssemblyShortcuts'
import { AssemblyCommandTabs, type AssemblyCommandTab } from './AssemblyCommandTabs'
import ConfiguredAssemblyTree from './ConfiguredAssemblyTree'
import './assembly.css'
import './configured-assembly.css'

let controllerEpoch = 0
type RelationDraft = ConfiguredMateDraft | ConfiguredMechanicalDraft | ConfiguredCompoundDraft
function nextEpoch(minimum = 0) { controllerEpoch = Math.max(controllerEpoch, minimum); if (controllerEpoch >= Number.MAX_SAFE_INTEGER) throw Error('Vuelve a abrir la aplicación para continuar.'); return ++controllerEpoch }

/** Disclosure is local presentation state; changing it never changes picking intent. */
export function ConfiguredOriginDisclosure({ axes, planes, pick, activeRole, visibleCount, children }: {
  axes: boolean; planes: boolean; pick: ConfiguredOriginPick | null; activeRole: string | null; visibleCount: number; children: ReactNode
}) {
  const [open, setOpen] = useState(axes || planes || !!pick)
  const previous = useRef({ axes, planes, pick })
  useEffect(() => {
    const old = previous.current
    previous.current = { axes, planes, pick }
    if (axes && !old.axes || planes && !old.planes || pick && pick !== old.pick) setOpen(true)
  }, [axes, planes, pick])
  return <details className="configured-origin-controls" aria-label="Referencias de origen configuradas" open={open}
    onToggle={event => setOpen(event.currentTarget.open)}>
    <summary aria-label="Mostrar referencias de origen configuradas">
      <strong>Referencias de origen</strong>
      <span>{activeRole ? `Seleccionando ${activeRole}` : `Planos y ejes · ${visibleCount} visibles`}</span>
    </summary>
    <div className="configured-origin-content">{children}</div>
  </details>
}

export interface ConfiguredAssemblyWorkspaceProps {
  initialDocument: AssemblyConfiguredDocument
  initialPath?: string
  initialSaved?: string
  onOpenDocument: (document: CadDocument, path?: string, saved?: string) => void
  skipInitialRecoveryWrite?: boolean
}
export default function ConfiguredAssemblyWorkspace({ initialDocument, initialPath, initialSaved, onOpenDocument, skipInitialRecoveryWrite = false }: ConfiguredAssemblyWorkspaceProps) {
  const newDocumentDialog = useNewDocumentDialog(), newDocumentRequest = useRef(false)
  const history = useRef<AssemblyConfiguredDocumentHistory | null>(null)
  if (!history.current) history.current = new AssemblyConfiguredDocumentHistory(initialDocument)
  const [document, setDocument] = useState(() => history.current!.current), [generation, setGeneration] = useState(nextEpoch)
  const [path, setPath] = useState(initialPath), [saved, setSaved] = useState(() => initialSaved === undefined ? '' : serializeAssemblyConfiguredDocument(parseAssemblyConfiguredDocument(initialSaved)))
  const [scene, setScene] = useState<ConfiguredAssemblyScene | null>(null), [preview, setPreview] = useState<ConfiguredAssemblyPreviewReply | null>(null)
  const [busy, setBusy] = useState(false), [cancelable, setCancelable] = useState(false), [failure, setFailure] = useState<string | null>(null)
  const [message, setMessage] = useState('Preparando el ensamblaje…'), [scope, setScope] = useState('[]')
  const [occurrenceId, setOccurrenceId] = useState(''), [variantName, setVariantName] = useState(''), [scopeVariantName, setScopeVariantName] = useState(''), [pose, setPose] = useState(['0', '0', '0'])
  const [rotationAxis, setRotationAxis] = useState<'X' | 'Y' | 'Z'>('Z'), [rotationDegrees, setRotationDegrees] = useState('0')
  const [mateDraft, setMateDraft] = useState<RelationDraft | null>(null), mateDraftRef = useRef(mateDraft), mateRevision = useRef(0), sceneRef = useRef(scene), committedSceneRef = useRef<ConfiguredAssemblyScene | null>(null)
  const [occurrenceFields, setOccurrenceFields] = useState(initialConfiguredOccurrenceFields)
  const [inspectorPane, setInspectorPane] = useState<'model' | 'configuration' | 'components' | 'occurrence' | 'relations' | 'relation'>('model')
  const [ribbonTab, setRibbonTab] = useState<AssemblyCommandTab>('assembly')
  const inspector = useRef<HTMLElement>(null)
  const [revealRequest, setRevealRequest] = useState<{ id: string } | null>(null)
  const revealInspector = (id: string) => {
    const aside = inspector.current, target = aside?.querySelector<HTMLElement>('#' + id)
    if (!aside || !target || target.closest('[hidden]')) return
    const anchor = target.dataset.inspectorAnchor ? aside.querySelector<HTMLElement>('#' + target.dataset.inspectorAnchor) ?? target : target
    const visible = (element: HTMLElement) => {
      if (element.closest('[hidden]') || !element.getClientRects().length) return false
      for (let closed = element.closest('details:not([open])'); closed; closed = closed.parentElement?.closest('details:not([open])') ?? null) {
        const summary = [...closed.children].find(child => child.tagName === 'SUMMARY')
        if (!summary?.contains(element)) return false
      }
      return true
    }
    const controls = 'input:enabled, select:enabled, button:enabled'
    const field = target.matches(controls) && visible(target) ? target
      : [...target.querySelectorAll<HTMLElement>(controls)].find(visible)
        ?? [...target.querySelectorAll<HTMLElement>('summary')].find(visible) ?? anchor
    // Keep the section heading and its context visible independently of focus.
    const tabsHeight = aside.querySelector<HTMLElement>('.configured-inspector-tabs')?.offsetHeight ?? 0
    aside.scrollTop += anchor.getBoundingClientRect().top - aside.getBoundingClientRect().top - tabsHeight - 12
    field.focus({ preventScroll: true })
  }
  useEffect(() => {
    if (!revealRequest) return
    const id = revealRequest.id
    setInspectorPane(id === 'configured-model-tree' ? 'model' : id === 'configured-root-state' ? 'configuration' : id === 'configured-relations' ? 'relations' : id === 'configured-occurrence-inspector' ? 'occurrence' : id === 'configured-relation-inspector' ? 'relation' : 'components')
  }, [revealRequest])
  useEffect(() => { if (revealRequest) revealInspector(revealRequest.id) }, [revealRequest, inspectorPane])
  // A newly opened editor is revealed once; typing and picking keep their scroll position.
  useEffect(() => {
    if (mateDraft?.id) { setInspectorPane('relation'); setRevealRequest({ id: 'configured-relation-inspector' }) }
    else {
      setRevealRequest(request => request?.id === 'configured-relation-inspector' ? null : request)
      setInspectorPane(pane => pane === 'relation' ? 'model' : pane)
    }
  }, [mateDraft?.id])
  const [matePick, setMatePick] = useState<ConfiguredMatePick | null>(null), matePickRef = useRef(matePick)
  const [originPick, setOriginPick] = useState<ConfiguredOriginPick | null>(null), originPickRef = useRef(originPick)
  const [originAxes, setOriginAxes] = useState(false), [originPlanes, setOriginPlanes] = useState(false)
  const [originOwner, setOriginOwner] = useState<'scope' | 'selected' | 'both'>('scope')
  const [originComponent, setOriginComponent] = useState<string | null>(null)
  const [treeOriginSelection, setTreeOriginSelection] = useState<AssemblyOriginTreeSelection | null>(null)
  const [normalSelection, setNormalSelection] = useState<AssemblyNormalSelection | null>(null)
  const stopMatePick = () => { matePickRef.current = null; setMatePick(null); originPickRef.current = null; setOriginPick(null) }
  useEffect(() => { if (inspectorPane !== 'relation' && (matePickRef.current || originPickRef.current)) stopMatePick() }, [inspectorPane])
  const viewHistory = useViewHistory()
  const [view, setView] = useState<ViewRequest>({ name: 'iso', stamp: 0 })
  const [navigationRevision, setNavigationRevision] = useState(0), navigationRevisionRef = useRef(0)
  const [componentContext, setComponentContext] = useState<{ ticket: ConfiguredComponentContextTarget; scene: ConfiguredAssemblyScene;
    point: { x: number; y: number }; element: HTMLElement } | null>(null)
  const [discardDialog, setDiscardDialog] = useState(false), answer = useRef<((allow: boolean) => void) | null>(null)
  const [bomOpen, setBomOpen] = useState(false), [bomOptions, setBomOptions] = useState<ConfiguredAssemblyBomOptions>({ mode: 'parts-only', includeHidden: true, scopePath: [] })
  const [bomSelection, setBomSelection] = useState<{ serialized: string; member: ConfiguredAssemblyBomMember } | null>(null)
  useEffect(() => { setTreeOriginSelection(null) }, [scope, occurrenceId, bomSelection?.member])
  const bomView = useRef({ open: bomOpen, options: bomOptions, revision: 0 }), bomToggle = useRef<HTMLButtonElement>(null)
  const restoreBomFocus = useRef(false)
  useLayoutEffect(() => {
    if (!restoreBomFocus.current || bomOpen || ribbonTab !== 'evaluate' || busy) return
    restoreBomFocus.current = false
    bomToggle.current?.focus()
  }, [bomOpen, ribbonTab, busy])
  const dialog = useRef<HTMLDivElement>(null)
  const current = useRef(document), epoch = useRef(generation), scopeRef = useRef(scope), occurrenceRef = useRef(occurrenceId), pathRef = useRef(path), mounted = useRef(false)
  const pending = useRef(preview), operation = useRef(false), skipRecovery = useRef(skipInitialRecoveryWrite)
  const operationKind = useRef<'build' | 'solve' | 'apply' | 'file' | null>(null), dirtyRef = useRef(false)
  current.current = document; pending.current = preview; pathRef.current = path; sceneRef.current = scene
  const serialized = useMemo(() => serializeAssemblyConfiguredDocument(document), [document]), dirty = serialized !== saved
  const renderedTicket = { serialized, generation, scope, path, occurrence: occurrenceId, draftRevision: mateRevision.current, navigationRevision }
  dirtyRef.current = dirty
  const evaluation = useMemo(() => evaluateAssemblyConfiguration(document.source, document.catalog, document.rootConfiguration), [document])
  const selectedScope = evaluation.scopes.find(row => JSON.stringify(row.path) === scope) ?? evaluation.scopes[0]
  const selected = selectedScope.occurrences.find(row => row.id === occurrenceId)
  const effectiveMates = selectedScope.mates.map(value => validateAssemblyMate(value))
  const mateChoices = useMemo(() => {
    try { return { values: configuredMateUiChoices(document, preview ? committedSceneRef.current : scene, generation, selectedScope.path.map(String)), error: undefined } }
    catch (reason) { return { values: [], error: reason instanceof Error ? reason.message : 'No se pudieron preparar las referencias actuales.' } }
  }, [document, scene, preview, generation, scope])
  const mechanicalChoices = useMemo(() => {
    try { return { values: configuredMechanicalChoices(document, preview ? committedSceneRef.current : scene, generation, selectedScope.path.map(String)), error: undefined } }
    catch (reason) { return { values: { geometry: [], components: [] }, error: reason instanceof Error ? reason.message : 'No se pudieron preparar los componentes actuales.' } }
  }, [document, scene, preview, generation, scope])
  const compoundEditing = !!mateDraft && 'compound' in mateDraft
  const compoundChoices = useMemo(() => {
    const empty: ConfiguredCompoundUiChoices = { profileFaces: [], profileEdges: [], points: [], lineEdges: [], circularPaths: [], guides: [] }
    if (!compoundEditing) return { values: empty, error: undefined }
    try { return { values: configuredCompoundUiChoices(document, preview ? committedSceneRef.current : scene, generation, selectedScope.path.map(String)), error: undefined } }
    catch (reason) { return { values: empty, error: reason instanceof Error ? reason.message : 'No se pudieron preparar las referencias compuestas actuales.' } }
  }, [document, scene, preview, generation, scope, compoundEditing])
  const mechanicalTarget = { scopePath: [...selectedScope.path], definition: { ...selectedScope.definition }, configuration: selectedScope.configuration }
  let mechanicalError: string | undefined
  if (mateDraft && 'mechanical' in mateDraft) {
    try { inspectAssemblyConfiguredMechanicalEdit(document, configuredMechanicalIntent(mateDraft, mechanicalChoices.values, mechanicalTarget)) }
    catch (reason) { mechanicalError = reason instanceof Error ? reason.message : 'La edición mecánica no está disponible.' }
  }
  const rootVariants = document.catalog.find(row => assemblyDefinitionKey(row.definition) === assemblyDefinitionKey(document.source))?.configurations ?? []
  const bom = useMemo(() => {
    if (!bomOpen) return { report: null, error: undefined }
    try { return { report: buildConfiguredAssemblyBom(document, bomOptions), error: undefined } }
    catch (reason) { return { report: null, error: reason instanceof Error ? reason.message : 'Lista de materiales no disponible.' } }
  }, [document, bomOpen, bomOptions])
  const bomSelectedPath = configuredBomUiSelectedPath(bom.report, serialized, bomSelection)
  const ticket = () => configuredUiTicket(current.current, epoch.current, scopeRef.current, pathRef.current, occurrenceRef.current, mateRevision.current, navigationRevisionRef.current)
  const fresh = (value: ReturnType<typeof ticket>) => mounted.current && configuredUiTicketMatches(value, ticket())
  const mateTicket = () => ({ context: ticket(), revision: mateRevision.current, draft: JSON.stringify(mateDraftRef.current), sceneId: sceneRef.current?.scene.sceneId ?? null })
  const renderedMateTicket = { context: renderedTicket, revision: mateRevision.current, draft: JSON.stringify(mateDraft), sceneId: scene?.scene.sceneId ?? null }
  const freshMate = () => mounted.current && configuredMateUiTicketMatches(renderedMateTicket, mateTicket())
  const setRelationDraft = (value: RelationDraft | null) => {
    if (mateRevision.current >= Number.MAX_SAFE_INTEGER) throw Error('Vuelve a abrir el ensamblaje para continuar editando relaciones.')
    stopMatePick(); mateRevision.current++; mateDraftRef.current = value; setMateDraft(value); if (!value) { setRevealRequest(null); setInspectorPane('model') }
  }
  const bomTicket = () => configuredBomUiTicket(ticket(), bomView.current.open, bomView.current.revision, bomView.current.options)
  const renderedBomTicket = configuredBomUiTicket(renderedTicket, bomOpen, bomView.current.revision, bomOptions)
  const freshBom = (value: ReturnType<typeof bomTicket>) => mounted.current && configuredBomUiTicketMatches(value, bomTicket())
  const release = (token: string) => { void discardConfiguredAssembly(token).catch(() => undefined) }
  const begin = (kind: NonNullable<typeof operationKind.current>) => { operation.current = true; operationKind.current = kind; setBusy(true); setCancelable(kind === 'build' || kind === 'solve') }
  const finish = () => { operation.current = false; operationKind.current = null; setBusy(false); setCancelable(false) }
  const error = (reason: unknown) => { const text = reason instanceof Error ? reason.message : String(reason); setFailure(text); setMessage(text) }
  const revoke = (minimum = 0, reservedEpoch?: number, keepMateDraft = false) => {
    setNormalSelection(null)
    stopMatePick()
    const next = reservedEpoch ?? nextEpoch(minimum)
    if (pending.current) release(pending.current.token)
    pending.current = null; setPreview(null); finish()
    if (!keepMateDraft) { mateDraftRef.current = null; setMateDraft(null) }
    answer.current?.(false); answer.current = null; setDiscardDialog(false)
    epoch.current = next; setGeneration(next); committedSceneRef.current = null; setScene(null)
  }
  const commit = (next: AssemblyConfiguredDocument, minimum = 0) => {
    const checked = validateAssemblyConfiguredDocument(next), reservedEpoch = nextEpoch(minimum)
    const owned = history.current!.commitDocument(checked)
    revoke(0, reservedEpoch); setFailure(null); current.current = owned; skipRecovery.current = false; setDocument(owned)
  }
  const namedSelectionRebind = useRef<{ before: AssemblyConfiguredDocument; after: AssemblyConfiguredDocument;
    normal: typeof normalViewContext; tree: typeof treeOriginContext } | null>(null)
  const canRetainNamedViewScene = (next: AssemblyConfiguredDocument) =>
    sameDocumentExceptNamedViews(current.current, next) && !operation.current && !pending.current && !mateDraftRef.current
    && !!scene && scene === sceneRef.current && scene === committedSceneRef.current
    && configuredUiSceneMatches(scene, current.current, epoch.current)
  const retainNamedViewScene = (next: AssemblyConfiguredDocument) => {
    if (!canRetainNamedViewScene(next)) return false
    // Root view metadata does not change the authenticated source/catalog or
    // generation. Keep the confirmed scene and its native context untouched.
    namedSelectionRebind.current = { before: current.current, after: next,
      normal: normalViewCurrent.current.context, tree: currentTreeOrigins.current.context }
    if (bomSelection && configuredBomUiSelectedPath(bom.report, serialized, bomSelection).length)
      setBomSelection({ serialized: serializeAssemblyConfiguredDocument(next), member: bomSelection.member })
    current.current = next; skipRecovery.current = false; setDocument(next); return true
  }
  const namedViews = useNamedDocumentViews({ document, identity: generation, scene, history: viewHistory,
    isCurrent: () => current.current === document && epoch.current === generation && canRetainNamedViewScene(document),
    blocked: busy || operation.current || !!preview || !!pending.current || !!mateDraft || discardDialog || !!answer.current
      || newDocumentDialog.pending() || !scene || scene !== committedSceneRef.current || !configuredUiSceneMatches(scene, document, generation),
    commit: next => {
      if (current.current !== document || !canRetainNamedViewScene(next)) throw Error('El documento o la escena han cambiado.')
      const owned = history.current!.commitDocument(next)
      if (!retainNamedViewScene(owned)) throw Error('La escena confirmada ya no está disponible.')
      return owned
    },
    recall: savedView => setView(previous => ({ name: 'named', stamp: previous.stamp + 1, view: savedView })),
  })
  const edit = (change: Parameters<typeof editConfiguredUiOccurrence>[3]) => {
    if (!fresh(renderedTicket) || operation.current || pending.current || mateDraftRef.current || !selected) return
    setFailure(null)
    try { commit(editConfiguredUiOccurrence(current.current, JSON.parse(scopeRef.current), selected.id, change)); setMessage('Estado actualizado. Resuelve para comprobar sus relaciones.') }
    catch (reason) { error(reason) }
  }
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; if (pending.current) release(pending.current.token); answer.current?.(false) }
  }, [])
  useEffect(() => {
    const retained = committedSceneRef.current
    if (retained && sceneRef.current === retained && configuredUiSceneMatches(retained, current.current, epoch.current)) return
    const captured = ticket(); begin('build'); setMessage('Reconstruyendo la configuración…')
    void buildConfiguredAssembly({ document: current.current, generation: captured.generation }).then(value => {
      if (!fresh(captured)) return
      if (!configuredUiSceneMatches(value, current.current, captured.generation)) throw Error('La escena no corresponde a la configuración actual.')
      committedSceneRef.current = value; setScene(value); setMessage(value.referenceDiagnostics.length ? 'Hay referencias que necesitan reparación. La geometría disponible se conserva.' : 'Configuración lista.')
    }).catch(reason => { if (fresh(captured)) { setScene(null); error(reason) } }).finally(() => { if (fresh(captured)) finish() })
  }, [serialized, generation])
  useEffect(() => {
    if (skipRecovery.current) return
    try { localStorage.setItem(CAD_RECOVERY_KEY, serialized) } catch { error(Error('No se pudo guardar la recuperación local. Guarda el archivo.')) }
  }, [serialized])
  useEffect(() => { if (selected) { setPose(selected.pose.translation.map(String)); setRotationDegrees('0') } }, [serialized, scope, occurrenceId])
  useEffect(() => { const leave = (event: BeforeUnloadEvent) => { if (dirtyRef.current || pending.current || mateDraftRef.current) { event.preventDefault(); event.returnValue = '' } }; window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave) }, [])
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
    if (!fresh(renderedTicket) || operation.current || pending.current || mateDraftRef.current || !scene) return
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
    if (namedViews.isOpen || !fresh(renderedTicket) || operation.current || pending.current || mateDraftRef.current) return false
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
  const newDocument = async () => {
    if (newDocumentRequest.current || !fresh(renderedTicket) || operation.current || pending.current || mateDraftRef.current || answer.current) return
    newDocumentRequest.current = true
    const captured = ticket()
    const stillCurrent = () => fresh(captured) && !operation.current && !pending.current && !mateDraftRef.current
    try {
      await requestNewDocument({ choose: newDocumentDialog.choose, current: stillCurrent,
        confirm: () => dirtyRef.current ? new Promise<boolean>(resolve => { answer.current = resolve; setDiscardDialog(true) }) : Promise.resolve(true),
        create: kind => onOpenDocument(kind === 'part' ? createDocument('Pieza1') : createEmptyAssembly()),
      })
    } catch (reason) { if (mounted.current) error(reason) }
    finally { newDocumentRequest.current = false }
  }
  const open = async () => {
    if (!fresh(renderedTicket) || operation.current || pending.current || mateDraftRef.current || !window.solidflow) return
    const captured = ticket(); setFailure(null); begin('file')
    try {
      if (captured.serialized !== saved) {
        const allowed = await new Promise<boolean>(resolve => { answer.current = resolve; setDiscardDialog(true) })
        if (!allowed || !fresh(captured)) return
      }
      const file = await window.solidflow.openDocument()
      if (!fresh(captured) || !file) return
      const next = parseCadDocument(file.content)
      revoke(); restoreBomFocus.current = false; setRibbonTab('assembly'); onOpenDocument(next, file.path, file.content)
    } catch (reason) { if (fresh(captured)) error(reason) }
    finally { if (fresh(captured)) finish() }
  }
  const undo = (redo: boolean) => {
    if (namedViews.isOpen || !fresh(renderedTicket) || operation.current || pending.current || mateDraftRef.current) return
    const value = redo ? history.current!.redo() : history.current!.undo()
    if (retainNamedViewScene(value)) return
    const reservedEpoch = nextEpoch()
    revoke(0, reservedEpoch); setFailure(null); current.current = value; skipRecovery.current = false; setDocument(value)
  }
  const changeScope = (value: string) => {
    if (!fresh(renderedTicket) || operation.current || pending.current || !evaluation.scopes.some(row => JSON.stringify(row.path) === value)
      || value === scopeRef.current) return
    if (navigationRevisionRef.current >= Number.MAX_SAFE_INTEGER) { error(Error('Vuelve a abrir el ensamblaje para continuar navegando.')); return }
    const retained = sceneRef.current
    const retainScene = !busy && !viewHistory.navigating && !preview && !mateDraft && !mateDraftRef.current && !discardDialog && !answer.current
      && !newDocumentRequest.current && !newDocumentDialog.pending() && !namedViews.isOpen
      && retained && retained === scene && retained === committedSceneRef.current && configuredUiSceneMatches(retained, current.current, epoch.current)
    // UI callbacks must remain stale after A → B → A even when native geometry
    // is unchanged. This revision never grants a native preview capability.
    navigationRevisionRef.current++; setNavigationRevision(navigationRevisionRef.current)
    if (retainScene) { setNormalSelection(null); setTreeOriginSelection(null); stopMatePick() }
    else revoke()
    setFailure(null); setBomSelection(null); scopeRef.current = value; occurrenceRef.current = ''; setScope(value); setOccurrenceId('')
  }
  const relationTarget = (change: AssemblyConfiguredMateEdit['change']) => validateAssemblyConfiguredMateEdit({ scopePath: [...selectedScope.path], definition: { ...selectedScope.definition }, configuration: selectedScope.configuration, change })
  const previewRelation = async (intent: AssemblyConfiguredMateEdit) => {
    if (!freshMate() || operation.current || pending.current || !scene || selectedScope.suppressed) return
    let edit: AssemblyConfiguredMateEdit
    try { edit = validateAssemblyConfiguredMateEdit(intent) } catch (reason) { error(reason); return }
    const captured = mateTicket(), isCurrent = () => mounted.current && configuredMateUiTicketMatches(captured, mateTicket())
    setFailure(null); begin('solve'); setMessage('Verificando la edición de la relación en todos sus usos…')
    try {
      const reply = await previewConfiguredAssemblyRelationEdit({ document: current.current, generation: captured.context.generation }, edit)
      if (!isCurrent()) { release(reply.token); return }
      if (reply.kind !== 'configured-assembly-preview' || reply.generation !== captured.context.generation || !reply.verification.accepted
        || !configuredUiSceneMatches(reply.scene, reply.document, reply.candidateGeneration) || !configuredMateUiPreviewMatches(reply.document, edit)) { release(reply.token); throw Error('La vista previa no conserva la edición de relación solicitada.') }
      pending.current = reply; setPreview(reply); setScene(reply.scene); setMessage('Edición verificada. Revisa la vista previa y pulsa Aplicar o Cancelar.')
    } catch (reason) { if (isCurrent()) error(reason) }
    finally { if (fresh(captured.context) && operationKind.current === 'solve') finish() }
  }
  const previewMechanical = async (intent: AssemblyConfiguredMechanicalEdit) => {
    if (!freshMate() || operation.current || pending.current || !scene || selectedScope.suppressed) return
    let edit: AssemblyConfiguredMechanicalEdit
    try { edit = validateAssemblyConfiguredMechanicalEdit(intent); inspectAssemblyConfiguredMechanicalEdit(current.current, edit) } catch (reason) { error(reason); return }
    const captured = mateTicket(), isCurrent = () => mounted.current && configuredMateUiTicketMatches(captured, mateTicket())
    setFailure(null); begin('solve'); setMessage('Verificando la captura mecánica en todos sus usos…')
    try {
      const reply = await previewConfiguredAssemblyMechanicalEdit({ document: current.current, generation: captured.context.generation }, edit)
      if (!isCurrent()) { release(reply.token); return }
      if (reply.kind !== 'configured-assembly-preview' || reply.generation !== captured.context.generation || !reply.verification.accepted
        || !configuredUiSceneMatches(reply.scene, reply.document, reply.candidateGeneration) || !configuredMechanicalUiPreviewMatches(reply.document, edit)) { release(reply.token); throw Error('La vista previa no conserva la intención mecánica solicitada.') }
      pending.current = reply; setPreview(reply); setScene(reply.scene); setMessage('Captura mecánica verificada. Revisa la vista previa y pulsa Aplicar o Cancelar.')
    } catch (reason) { if (isCurrent()) error(reason) }
    finally { if (fresh(captured.context) && operationKind.current === 'solve') finish() }
  }
  const openRelationEditor = (mate?: AssemblyMate, mechanical = false, compound = false) => {
    if (!freshMate() || operation.current || pending.current || mateDraftRef.current || !scene || selectedScope.suppressed) return
    setOriginComponent(null)
    try { const id = mate?.id ?? crypto.randomUUID(); setRelationDraft(mate && configuredCompoundMate(mate) ? configuredCompoundUiDraft(id, mate) : mate && (mechanical && mate.type === 'concentric' || configuredMechanicalMate(mate)) ? configuredMechanicalDraft(id, mate) : compound ? configuredCompoundUiDraft(id) : mechanical ? configuredMechanicalDraft(id) : configuredMateUiDraft(id, mate)); setFailure(null) } catch (reason) { error(reason) }
  }
  const previewDraft = () => {
    if (!freshMate() || operation.current || pending.current || !mateDraftRef.current) return
    try { const draft = mateDraftRef.current
      if ('mechanical' in draft) void previewMechanical(configuredMechanicalIntent(draft, mechanicalChoices.values, mechanicalTarget))
      else if ('compound' in draft) { const mate = configuredCompoundUiProposal(draft, compoundChoices.values); void previewRelation(relationTarget(draft.editing ? { kind: 'replace', mateId: draft.id, mate } : { kind: 'add', mate })) }
      else { const mate = configuredMateUiProposal(draft, mateChoices.values); void previewRelation(relationTarget(draft.editing ? { kind: 'replace', mateId: draft.id, mate } : { kind: 'add', mate })) }
    }
    catch (reason) { error(reason) }
  }
  const changeBomView = (open: boolean, options = bomView.current.options) => {
    if (!freshBom(renderedBomTicket)) return
    if (bomView.current.revision >= Number.MAX_SAFE_INTEGER) { error(Error('Vuelve a abrir el ensamblaje para continuar con la lista de materiales.')); return }
    bomView.current = { open, options: structuredClone(options), revision: bomView.current.revision + 1 }
    setBomOpen(open); setBomOptions(bomView.current.options); setBomSelection(null)
    if (!open) { restoreBomFocus.current = true; setRibbonTab('evaluate') }
  }
  const exportBom = async () => {
    if (!freshBom(renderedBomTicket) || !bomView.current.open || operation.current || pending.current || mateDraftRef.current || !bom.report) return
    const captured = bomTicket(), snapshot = parseAssemblyConfiguredDocument(captured.context.serialized), options = structuredClone(bomView.current.options)
    setFailure(null); begin('file'); setMessage('Exportando lista de materiales CSV…')
    try {
      const outcome = await runConfiguredBomCsvExport(snapshot, options, {
        isCurrent: () => freshBom(captured), write: window.solidflow ? (bytes, name) => window.solidflow!.exportDocument(bytes, name, 'csv') : undefined,
        download: downloadConfiguredBomCsv,
      })
      if (freshBom(captured)) setMessage(outcome === 'cancelled' ? 'Exportación CSV cancelada.' : 'Lista de materiales configurada exportada como CSV.')
    } catch (reason) { if (freshBom(captured)) error(reason) }
    finally { if (mounted.current && epoch.current === captured.context.generation && operationKind.current === 'file') finish() }
  }
  const pickMate = (hit: AssemblySceneFace | AssemblySceneEdge | null) => {
    if (!freshMate() || operation.current || pending.current || inspectorPane !== 'relation' || !matePick || matePickRef.current !== matePick || !mateDraft || 'mechanical' in mateDraft || 'compound' in mateDraft || !scene || !configuredUiSceneMatches(scene, current.current, epoch.current)) return
    const choice = configuredMatePickChoice(displayScene, selectedScope.path, mateDraft, mateChoices.values, matePick, hit)
    if (!choice) { setMessage('Selecciona una referencia visible compatible con este papel y ámbito.'); return }
    const references = [...mateDraft.references]; references[matePick.slot] = choice.reference
    setRelationDraft({ ...mateDraft, references }); setFailure(null); setMessage('Referencia seleccionada. Completa el formulario y verifica la vista previa antes de aplicar.')
  }
  const previewOccurrence = async (importFile = false, fixed?: boolean) => {
    if (!fresh(renderedTicket) || operation.current || pending.current || mateDraftRef.current || !scene || selectedScope.suppressed) return
    if (importFile && !window.solidflow) { setMessage('Abre la aplicación de escritorio para importar un componente.'); return }
    const captured = ticket(), fields = structuredClone(occurrenceFields), scopePath = [...selectedScope.path]
    setFailure(null); begin(importFile ? 'file' : 'solve')
    try {
      let intent: AssemblyConfiguredOccurrenceEdit
      if (importFile) {
        const file = await window.solidflow!.openDocument()
        if (!fresh(captured)) return
        if (!file) { setMessage('Importación cancelada. Se conserva el documento confirmado.'); return }
        intent = configuredOccurrenceImportIntent(current.current, scopePath, fields, file.content)
        begin('solve')
      } else if (fixed !== undefined) {
        if (!selected || selected.suppressed) throw Error('Selecciona una ocurrencia activa actual.')
        intent = configuredOccurrenceUiIntent(current.current, scopePath, { kind: 'set-fixed', occurrenceId: selected.id, fixed })
      } else intent = configuredOccurrenceReuseIntent(current.current, scopePath, fields)
      const reply = await previewConfiguredAssemblyOccurrenceEdit({ document: current.current, generation: captured.generation }, intent)
      if (!fresh(captured)) { release(reply.token); return }
      if (reply.kind !== 'configured-assembly-preview' || reply.generation !== captured.generation || !reply.verification.accepted || !configuredUiSceneMatches(reply.scene, reply.document, reply.candidateGeneration)) {
        release(reply.token); throw Error('La vista previa del componente no corresponde al contexto actual.')
      }
      pending.current = reply; setPreview(reply); setScene(reply.scene); setMessage('Componente verificado. Revisa la vista previa y pulsa Aplicar configuración o Cancelar.')
    } catch (reason) { if (fresh(captured)) error(reason) }
    finally { if (fresh(captured)) finish() }
  }
  const displayScene = useMemo(() => scene ? configuredUiDisplayScene(scene) : null, [scene])
  const blocked = busy || !!preview
  const treeOriginRows = useMemo(() => buildAssemblyOriginTree(evaluation, []), [evaluation])
  const treeOriginSession = useMemo(() => ({}), [scene, generation, path, !!mateDraft, blocked, inspectorPane === 'model', navigationRevision])
  const treeOriginContext = { documentSignature: serialized, scopePath: selectedScope.path, sessionIdentity: treeOriginSession }
  const currentTreeOrigins = useRef({ rows: treeOriginRows, context: treeOriginContext, active: false })
  currentTreeOrigins.current = { rows: treeOriginRows, context: treeOriginContext, active: inspectorPane === 'model' && !blocked && !mateDraft }
  const selectedTreeOrigin = resolveAssemblyOriginTreeSelection(treeOriginSelection, treeOriginRows, treeOriginContext)
  const modelOrigin = inspectorPane === 'model' && !blocked && !mateDraft && scene && configuredUiSceneMatches(scene, document, generation) ? selectedTreeOrigin : null
  const modelOriginRef = useRef(modelOrigin); modelOriginRef.current = modelOrigin
  const normalViewBlocked = blocked || !!mateDraft || discardDialog || !scene || selectedScope.suppressed
    || !configuredUiSceneMatches(scene, document, generation)
  const normalViewSession = useMemo(() => ({}), [displayScene, serialized, generation, path, scope, navigationRevision])
  const normalViewContext = { documentSignature: serialized, scopePath: selectedScope.path, sessionIdentity: normalViewSession, scene: displayScene }
  const normalViewCurrent = useRef({ context: normalViewContext, blocked: normalViewBlocked })
  // Publish only committed ownership; render bailouts must retain live handlers.
  useLayoutEffect(() => { normalViewCurrent.current = { context: normalViewContext, blocked: normalViewBlocked } })
  useLayoutEffect(() => {
    const transition = namedSelectionRebind.current
    if (!transition) return
    namedSelectionRebind.current = null
    if (current.current !== transition.after || document !== transition.after) return
    setNormalSelection(selection => rebindNamedViewSelection(selection, transition.before, transition.after, transition.normal, normalViewContext))
    setTreeOriginSelection(selection => rebindNamedViewSelection(selection, transition.before, transition.after, transition.tree, treeOriginContext))
  })
  const normalComponentPath = bomSelectedPath.length ? bomSelectedPath : selected ? [...selectedScope.path, selected.id] : []
  const normalComponentKey = normalComponentPath.length ? JSON.stringify(['component', normalComponentPath]) : null
  const normalViewSelection = assemblyNormalSelectionOrComponent(normalSelection, normalComponentKey, normalViewContext)
  const normalResolution = resolveAssemblyNormalSelection(normalViewSelection, normalViewContext, treeOriginRows)
  const canNormal = !normalViewBlocked && !viewHistory.navigating && normalResolution.target !== null
  const nominateViewSelection = (value: AssemblyViewportViewSelection) => {
    if (normalViewBlocked || normalViewCurrent.current.context !== normalViewContext || normalViewCurrent.current.blocked
      || !fresh(renderedTicket) || operation.current || pending.current || mateDraftRef.current
      || value.scene !== displayScene || !scene || !configuredUiSceneMatches(scene, current.current, epoch.current)) return
    if (value.empty) { occurrenceRef.current = ''; setOccurrenceId(''); setBomSelection(null); setTreeOriginSelection(null) }
    setNormalSelection(previous => nominateAssemblyNormalFace(assemblyNormalSelectionOrComponent(previous, normalComponentKey, normalViewContext), value.face, value.empty, normalViewContext, value.additive, JSON.stringify(['visible-surface', value.component])))
  }
  const selectTreeOrigin = (entry: AssemblyOriginTreeEntry, additive = false) => {
    if (!currentTreeOrigins.current.active || !fresh(renderedTicket) || operation.current || pending.current || mateDraftRef.current || inspectorPane !== 'model' || !scene || !configuredUiSceneMatches(scene, current.current, epoch.current)) return
    const retained = retainAssemblyOriginTreeSelection(entry, treeOriginContext)
    if (resolveAssemblyOriginTreeSelection(retained, currentTreeOrigins.current.rows, currentTreeOrigins.current.context)) {
      const next = nominateAssemblyNormalOrigin(normalViewSelection, entry, normalViewContext, additive)
      const lastOrigin = [...next.items].reverse().find(item => item.kind === 'origin')
      const selectedOrigin = lastOrigin && treeOriginRows.find(row => row.treeKey === lastOrigin.key && row.binding === lastOrigin.binding)
      setTreeOriginSelection(selectedOrigin ? retainAssemblyOriginTreeSelection(selectedOrigin, treeOriginContext) : null)
      setNormalSelection(next)
    }
  }
  const generalDraft = mateDraft && !('mechanical' in mateDraft) && !('compound' in mateDraft) ? mateDraft : null
  const originOwners = useMemo(() => configuredOriginOwners(evaluation, selectedScope.path), [evaluation, selectedScope.path])
  const originComponentKey = originComponent ?? originOwners.find(row => JSON.stringify(row.path) === JSON.stringify([...selectedScope.path, occurrenceId]))?.key ?? ''
  const chosenOriginOwner = originOwners.find(row => row.key === originComponentKey)
  const mateHighlights = useMemo(() => configuredMateHighlights(!blocked && scene && configuredUiSceneMatches(scene, document, generation) ? displayScene : null, selectedScope.path, generalDraft, mateChoices.values), [blocked, scene, document, generation, displayScene, selectedScope.path, generalDraft, mateChoices.values])
  const originDisplay = useMemo(() => {
    if (inspectorPane !== 'relation' || !generalDraft || blocked || !scene || !configuredUiSceneMatches(scene, document, generation)) return []
    const kinds = { axes: originAxes, planes: originPlanes }
    const own = originOwner !== 'selected' ? buildAssemblyOriginDisplay(evaluation, selectedScope.path, null, kinds) : []
    const component = originOwner !== 'scope' && chosenOriginOwner ? chosenOriginOwner.origins.filter(row => row.reference.kind === 'principal-axis' ? kinds.axes : kinds.planes) : []
    return [...own, ...component]
  }, [inspectorPane, generalDraft, blocked, scene, document, generation, evaluation, selectedScope.path, chosenOriginOwner, originOwner, originAxes, originPlanes])
  const selectedOrigins = useMemo(() => configuredOriginHighlights(originDisplay, generalDraft, mateChoices.values), [originDisplay, generalDraft, mateChoices.values])
  const pickOrigin = (reference: AssemblyOriginReference | null) => {
    if (!freshMate() || operation.current || pending.current || inspectorPane !== 'relation' || !originPick || originPickRef.current !== originPick || !generalDraft || !scene || selectedScope.suppressed || !configuredUiSceneMatches(scene, current.current, epoch.current)) return
    const choice = configuredOriginPickAssignment(originPick, originPickRef.current, originDisplay, generalDraft, mateChoices.values, reference)
    if (!choice) { setMessage('Selecciona un origen visible compatible con esta referencia y el ámbito actual.'); return }
    const references = [...generalDraft.references]; references[originPick.slot] = choice.reference
    setRelationDraft({ ...generalDraft, references }); setFailure(null); setMessage('Referencia de origen seleccionada. Verifica la vista previa antes de aplicar.')
  }
  const menuReveal = (id: string) => { if (fresh(renderedTicket) && !operation.current && !pending.current) setRevealRequest({ id }) }
  const contextBlocked = blocked || !!mateDraft || !!matePick || !!originPick || viewHistory.navigating
    || namedViews.isOpen || newDocumentDialog.isOpen || discardDialog || !scene
  const contextCurrent = useRef({ target: componentContext, blocked: contextBlocked })
  contextCurrent.current = { target: componentContext, blocked: contextBlocked }
  const contextSceneCurrent = () => !contextCurrent.current.blocked && mounted.current && !operation.current && !pending.current
    && !mateDraftRef.current && !matePickRef.current && !originPickRef.current && !newDocumentRequest.current
    && !newDocumentDialog.pending() && !answer.current && !!scene && scene === sceneRef.current
    && scene === committedSceneRef.current && configuredUiSceneMatches(scene, current.current, epoch.current)
  const openComponentContext = (component: AssemblyComponentReference, point: { x: number; y: number }, element: HTMLElement) => {
    if (!fresh(renderedTicket) || !contextSceneCurrent() || !scene || !element.isConnected) return
    const row = configuredComponentContextRow(evaluation, component)
    if (!row) return
    const owner = JSON.stringify(row.scope.path)
    if (owner !== scopeRef.current) changeScope(owner)
    if (owner !== scopeRef.current || !contextSceneCurrent()) return
    setNormalSelection(null); setTreeOriginSelection(null); setBomSelection(null)
    occurrenceRef.current = row.occurrence.id; setOccurrenceId(row.occurrence.id)
    const captured = captureConfiguredComponentContext(evaluation, ticket(), component)
    if (captured) setComponentContext({ ticket: captured, scene, point: { ...point }, element })
  }
  const openViewportContext = (target: AssemblyViewportContextTarget) => {
    if (target.kind === 'component') openComponentContext(target.component, target.point, target.restoreFocusElement)
  }
  const contextIsCurrent = (target: NonNullable<typeof componentContext>) =>
    contextCurrent.current.target === target && contextSceneCurrent() && target.scene === scene
    && !!resolveConfiguredComponentContext(target.ticket, evaluation, ticket())
  const activeContext = componentContext && contextIsCurrent(componentContext) ? componentContext : null
  useLayoutEffect(() => { if (componentContext && !activeContext) setComponentContext(null) }, [componentContext, activeContext])
  const contextRow = activeContext ? resolveConfiguredComponentContext(activeContext.ticket, evaluation, ticket()) : null
  const contextActions: CadContextAction[] = activeContext && contextRow ? [
    { id: 'component-properties', label: 'Propiedades', icon: Settings2,
      onSelect: () => { if (contextIsCurrent(activeContext)) menuReveal('configured-occurrence-inspector') } },
    { id: 'component-fixed', label: contextRow.occurrence.fixed ? 'Flotar' : 'Fijar',
      disabled: contextRow.scope.suppressed || contextRow.occurrence.suppressed,
      onSelect: () => { if (contextIsCurrent(activeContext) && !contextRow.scope.suppressed && !contextRow.occurrence.suppressed) void previewOccurrence(false, !contextRow.occurrence.fixed) } },
    { id: 'component-visible', label: contextRow.occurrence.visible ? 'Ocultar' : 'Mostrar', disabled: contextRow.scope.suppressed,
      onSelect: () => { if (contextIsCurrent(activeContext) && !contextRow.scope.suppressed) edit({ visible: !contextRow.occurrence.visible }) } },
    { id: 'component-suppressed', label: contextRow.occurrence.suppressed ? 'Activar' : 'Suprimir', disabled: contextRow.scope.suppressed,
      onSelect: () => { if (contextIsCurrent(activeContext) && !contextRow.scope.suppressed) edit({ suppressed: !contextRow.occurrence.suppressed }) } },
  ] : []
  const menuView = (name: ViewName) => {
    if (namedViews.isOpen || operation.current || viewHistory.navigating || !fresh(renderedTicket) || name === 'previous' && !viewHistory.canPrevious) return
    if (name === 'normal') {
      if (!canNormal || normalViewCurrent.current.context !== normalViewContext || pending.current || mateDraftRef.current) return
      const target = resolveAssemblyNormalSelection(normalViewSelection, normalViewContext, treeOriginRows).target
      if (target) setView(old => ({ name, stamp: old.stamp + 1, target }))
    } else setView(old => ({ name, stamp: old.stamp + 1 }))
  }
  const componentMenuBlocked = blocked || !!mateDraft || !scene || selectedScope.suppressed
  const cancelPreview = () => {
    if (!fresh(renderedTicket) || operationKind.current !== 'build' && operationKind.current !== 'solve' && (operation.current || !pending.current)) return
    revoke(0, undefined, !!mateDraftRef.current); setFailure(null); setMessage('Vista previa cancelada. Se conserva el documento confirmado.')
  }
  const cancelPreviewDisabled = !cancelable && (!preview || busy)
  const menus: AssemblyMenuDefinition[] = withAssemblyShortcutLabels([
    { id: 'file', label: 'Archivo', items: [
      { id: 'new', label: 'Nuevo…', disabled: blocked || !!mateDraft || discardDialog, onSelect: () => { void newDocument() } },
      { id: 'open', label: 'Abrir…', disabled: blocked || !!mateDraft, onSelect: () => { void open() } },
      { id: 'save', label: 'Guardar', disabled: blocked || !!mateDraft, onSelect: () => { void save(false) } },
      { id: 'save-as', label: 'Guardar como…', disabled: blocked || !!mateDraft, onSelect: () => { void save(true) } },
    ] },
    { id: 'edit', label: 'Editar', items: [
      { id: 'undo', label: 'Deshacer', disabled: blocked || !!mateDraft || !history.current.canUndo, onSelect: () => undo(false) },
      { id: 'redo', label: 'Rehacer', disabled: blocked || !!mateDraft || !history.current.canRedo, onSelect: () => undo(true) },
      { id: 'component-properties', label: 'Propiedades del componente', disabled: blocked || !selected || !!modelOrigin, onSelect: () => menuReveal('configured-occurrence-inspector') },
    ] },
    { id: 'view', label: 'Ver', items: [
      ...standardViews.map(({ name, label }) => ({ id: 'view-' + name, label, disabled: busy || viewHistory.navigating, onSelect: () => menuView(name) })),
      { id: 'view-normal', label: 'Normal a', disabled: !canNormal, onSelect: () => menuView('normal') },
      { id: 'view-named', label: 'Vistas guardadas…', disabled: !namedViews.canOpen, onSelect: namedViews.open },
      { id: 'view-fit', label: 'Ajustar a pantalla', disabled: busy || viewHistory.navigating, onSelect: () => menuView('fit') },
      { id: 'view-previous', label: 'Vista anterior', disabled: busy || !viewHistory.canPrevious, onSelect: () => menuView('previous') },
      { id: 'show-tree', label: 'Árbol del ensamblaje', disabled: blocked, onSelect: () => menuReveal('configured-model-tree') },
      { id: 'show-configurations', label: 'Configuraciones', disabled: blocked, onSelect: () => menuReveal('configured-root-state') },
      { id: 'show-relations', label: 'Relaciones de posición', disabled: blocked, onSelect: () => menuReveal(mateDraft ? 'configured-relation-inspector' : 'configured-relations') },
    ] },
    { id: 'insert', label: 'Insertar', items: [
      { id: 'insert-component', label: 'Insertar componente…', disabled: componentMenuBlocked, onSelect: () => menuReveal('configured-component-name') },
      { id: 'reuse-component', label: 'Reutilizar componente…', disabled: componentMenuBlocked, onSelect: () => menuReveal('configured-component-definition') },
      { id: 'insert-relation', label: 'Relación de posición…', disabled: componentMenuBlocked, onSelect: () => openRelationEditor() },
    ] },
    { id: 'tools', label: 'Herramientas', items: [
      { id: 'solve', label: 'Resolver configuración', disabled: blocked || !!mateDraft || !scene, onSelect: () => { void solve() } },
      { id: 'bom', label: 'Lista de materiales', disabled: busy, checked: bomOpen, onSelect: () => changeBomView(!bomOpen) },
    ] },
    { id: 'help', label: 'Ayuda', items: [
      { id: 'viewport-controls', label: 'Controles del visor', onSelect: () => setMessage('Clic: seleccionar. Rueda: acercar o alejar. Rueda pulsada: girar. Mayús + rueda pulsada: desplazar. Para relacionar orígenes, abre una relación, elige el componente y activa su referencia.') },
    ] },
  ])
  useAssemblyShortcuts({ root: '.configured-assembly-workspace', menus, modal: !!activeContext || namedViews.isOpen || newDocumentDialog.isOpen || discardDialog || !!answer.current,
    escape: matePick || originPick ? { disabled: blocked, onSelect: () => {
      if (operation.current || !fresh(renderedTicket)) return
      stopMatePick(); setMessage('Selección en vista cancelada. Se conservan las referencias y los campos de la relación.')
    } } : { disabled: cancelPreviewDisabled, onSelect: cancelPreview },
  })
  return <div className="configured-assembly-workspace" aria-label="Ensamblaje configurado" aria-busy={busy}>
    <AssemblyShellHeader menus={menus} menuLabel="Menú del ensamblaje configurado" name={document.source.name} dirty={dirty} fileTitle={path} fileLabel={path?.split(/[\\/]/).at(-1) ?? 'Sin guardar'} mode="Ensamblaje configurado">
      <nav className="assembly-quickbar" aria-label="Archivo del ensamblaje configurado">
        <button title="Abrir" onClick={() => void open()} disabled={blocked || !!mateDraft}><FolderOpen size={20} aria-hidden="true" /><span className="command-header-icon-label">Abrir</span></button><button title="Guardar" onClick={() => void save(false)} disabled={blocked || !!mateDraft}><Save size={20} aria-hidden="true" /><span className="command-header-icon-label">Guardar</span></button><button title="Guardar como" onClick={() => void save(true)} disabled={blocked || !!mateDraft}><SavePen size={20} aria-hidden="true" /><span className="command-header-icon-label">Guardar como</span></button><button title="Deshacer" onClick={() => undo(false)} disabled={blocked || !!mateDraft || !history.current.canUndo}><Undo2 size={20} aria-hidden="true" /><span className="command-header-icon-label">Deshacer</span></button><button title="Rehacer" onClick={() => undo(true)} disabled={blocked || !!mateDraft || !history.current.canRedo}><Redo2 size={20} aria-hidden="true" /><span className="command-header-icon-label">Rehacer</span></button>
      </nav>
    </AssemblyShellHeader>
    <div className="assembly-command-manager configured-command-manager">
      <nav className="configured-command-bar" aria-label="Comandos del ensamblaje configurado">
        <div className="assembly-command-panel" data-configured-command-panel="assembly" id="configured-command-panel-assembly" role="tabpanel" aria-labelledby="configured-command-tab-assembly" hidden={ribbonTab !== 'assembly'}>
        <AssemblyCommandGroup label="Componentes">
          <button className="assembly-command-large" aria-controls="configured-component-name" disabled={blocked || !!mateDraft || !scene || selectedScope.suppressed} onClick={() => { if (fresh(renderedTicket) && !operation.current && !pending.current) setRevealRequest({ id: 'configured-component-name' }) }}><Box size={20} aria-hidden="true" /><span>Insertar componente</span></button>
          <button aria-controls="configured-component-definition" disabled={blocked || !!mateDraft || !scene || selectedScope.suppressed} onClick={() => { if (fresh(renderedTicket) && !operation.current && !pending.current) setRevealRequest({ id: 'configured-component-definition' }) }}><Component size={20} aria-hidden="true" /><span>Reutilizar componente</span></button>
        </AssemblyCommandGroup>
        <AssemblyCommandGroup label="Relación de posición">
          <button className="assembly-command-large" aria-controls="configured-relation-inspector" disabled={blocked || !!mateDraft || !scene || selectedScope.suppressed} onClick={() => openRelationEditor()}><Link2 size={20} aria-hidden="true" /><span>Nueva relación</span></button>
        </AssemblyCommandGroup>
        <AssemblyCommandGroup label="Configuraciones">
          <button className="assembly-command-large" aria-controls="configured-root-state" onClick={() => setRevealRequest({ id: 'configured-root-state' })}><Layers size={20} aria-hidden="true" /><span>Configuraciones</span></button>
        </AssemblyCommandGroup>
        </div>
        <div className="assembly-command-panel" data-configured-command-panel="relations" id="configured-command-panel-relations" role="tabpanel" aria-labelledby="configured-command-tab-relations" hidden={ribbonTab !== 'relations'}>
        <AssemblyCommandGroup label="Relaciones de posición">
          <button aria-controls="configured-relations" onClick={() => setRevealRequest({ id: 'configured-relations' })}><List size={20} aria-hidden="true" /><span>Relaciones</span></button>
        </AssemblyCommandGroup>
        </div>
        <div className="assembly-command-panel" data-configured-command-panel="evaluate" id="configured-command-panel-evaluate" role="tabpanel" aria-labelledby="configured-command-tab-evaluate" hidden={ribbonTab !== 'evaluate'}>
        <AssemblyCommandGroup label="Evaluar">
          <button className="assembly-command-large" ref={bomToggle} aria-label="Lista de materiales configurada" aria-controls="configured-assembly-bom-panel" aria-pressed={bomOpen} disabled={busy} onClick={() => changeBomView(!bomOpen)}><List size={20} aria-hidden="true" /><span>Lista de materiales</span></button>
        </AssemblyCommandGroup>
        </div>
        <AssemblyCommandGroup label="Resultado" className="assembly-command-confirmation">
          <button className="assembly-command-large" onClick={() => void apply()} disabled={busy || !preview}><Check size={20} aria-hidden="true" /><span>Aplicar configuración</span></button>
          <div className="assembly-command-stack"><button onClick={() => void solve()} disabled={blocked || !!mateDraft || !scene}><Play size={20} aria-hidden="true" /><span>Resolver configuración</span></button><button onClick={cancelPreview} disabled={cancelPreviewDisabled}><X size={20} aria-hidden="true" /><span>Cancelar</span></button></div>
        </AssemblyCommandGroup>
      </nav>
      <AssemblyCommandTabs kind="configured" value={ribbonTab} onChange={setRibbonTab} />
    </div>
    <div className="configured-assembly-layout"><aside ref={inspector} aria-label="Inspector del ensamblaje configurado">
      <div className="configured-inspector-tabs" aria-label="Panel del ensamblaje">
        <button title="Árbol del ensamblaje" aria-label="Mostrar árbol del ensamblaje" aria-pressed={inspectorPane === 'model'} onClick={() => setRevealRequest({ id: 'configured-model-tree' })}><Layers size={17} /></button>
        <button title="Propiedades del componente" aria-label="Mostrar propiedades del componente" aria-pressed={inspectorPane === 'occurrence'} disabled={!!modelOrigin} onClick={() => { if (modelOriginRef.current) return; setRevealRequest(null); setInspectorPane('occurrence') }}><Box size={17} /></button>
        <button title="Configuraciones" aria-label="Mostrar configuraciones" aria-pressed={inspectorPane === 'configuration'} onClick={() => setRevealRequest({ id: 'configured-root-state' })}><Component size={17} /></button>
        <button title="Relación de posición" aria-label="Mostrar relación de posición" aria-pressed={inspectorPane === 'relation' || inspectorPane === 'relations'} onClick={() => setRevealRequest({ id: mateDraft ? 'configured-relation-inspector' : 'configured-relations' })}><Link2 size={17} /></button>
        <span>{inspectorPane === 'relation' ? 'Relación de posición' : inspectorPane === 'components' ? 'Componentes' : inspectorPane === 'configuration' ? 'Configuraciones' : inspectorPane === 'occurrence' ? 'Propiedades' : 'Modelo'}</span>
      </div>
      <div data-configured-pane="model" hidden={inspectorPane !== 'model'}>
        <ConfiguredAssemblyTree name={document.source.name} evaluation={evaluation} scope={scope} occurrenceId={occurrenceId} disabled={blocked || !!mateDraft || !scene}
          active={inspectorPane === 'model'} resetKey={initialDocument}
          onComponentContext={openComponentContext}
          originRows={treeOriginRows} selectedOriginKey={selectedTreeOrigin?.treeKey} onOrigin={selectTreeOrigin}
          onScope={value => { setTreeOriginSelection(null); if (value !== scope) changeScope(value); setNormalSelection(nominateAssemblyNormalUnsupported(JSON.stringify(['scope', value]), normalViewContext)); setRevealRequest({ id: 'configured-root-state' }) }}
          onOccurrence={(owner, id) => { if (!fresh(renderedTicket) || operation.current || pending.current || mateDraftRef.current) return; setTreeOriginSelection(null); if (owner !== scope) changeScope(owner); setNormalSelection(nominateAssemblyNormalUnsupported(JSON.stringify(['component', owner, id]), normalViewContext)); occurrenceRef.current = id; setOccurrenceId(id); setBomSelection(null) }}
          onProperties={() => { if (!fresh(renderedTicket) || operation.current || pending.current || mateDraftRef.current || !selected) return; setRevealRequest({ id: 'configured-occurrence-inspector' }) }}
          onRelations={() => setRevealRequest({ id: 'configured-relations' })} />
        <details className="configured-effective-parts"><summary>Piezas efectivas</summary><ul>{evaluation.parts.map(part => <li key={JSON.stringify(part.path)}>{part.path.join(' / ')}{part.suppressed ? ' · suprimida' : part.visible ? '' : ' · oculta'}</li>)}</ul>
</details>
      </div>
      <div data-configured-pane="configuration" hidden={inspectorPane !== 'configuration'}>      <h2 id="configured-root-heading" tabIndex={-1}>Configuraciones</h2><label>Configuración raíz<select id="configured-root-state" data-inspector-anchor="configured-root-heading" aria-label="Configuración raíz" disabled={blocked} value={document.rootConfiguration ?? ''} onChange={event => {
        if (!fresh(renderedTicket) || operation.current || pending.current) return
        try { commit(validateAssemblyConfiguredDocument({ ...current.current, rootConfiguration: event.target.value || null })); scopeRef.current = '[]'; occurrenceRef.current = ''; setScope('[]'); setOccurrenceId('') } catch (reason) { error(reason) }
      }}><option value="">Base</option>{rootVariants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
      <label>Nueva configuración raíz<input aria-label="Nombre de nueva configuración raíz" disabled={blocked} value={variantName} onChange={event => { if (fresh(renderedTicket)) setVariantName(event.target.value) }} /></label>
      <button disabled={blocked || !variantName.trim()} onClick={() => { if (!fresh(renderedTicket) || operation.current || pending.current) return; try { commit(createConfiguredUiRootVariant(current.current, variantName)); setVariantName(''); scopeRef.current = '[]'; occurrenceRef.current = ''; setScope('[]'); setOccurrenceId('') } catch (reason) { error(reason) } }}>Crear configuración basada en Base</button>
      <p>La nueva configuración empieza en Base; no copia la variante seleccionada.</p>
      <h2>Estado efectivo</h2><label>Ámbito<select aria-label="Ámbito de configuración" disabled={blocked} value={scope} onChange={event => changeScope(event.target.value)}>{evaluation.scopes.map(row => <option key={JSON.stringify(row.path)} value={JSON.stringify(row.path)}>{row.path.join(' / ') || 'Raíz'} · {row.configuration ?? 'Base'}{row.suppressed ? ' · suprimido' : ''}</option>)}</select></label>
      {scope !== '[]' && <section aria-label="Crear configuración del ámbito"><label>Nueva configuración del ámbito<input aria-label="Nombre de nueva configuración del ámbito" disabled={blocked} value={scopeVariantName} onChange={event => { if (fresh(renderedTicket)) setScopeVariantName(event.target.value) }} /></label><button disabled={blocked || !scopeVariantName.trim()} onClick={() => { if (!fresh(renderedTicket) || operation.current || pending.current) return; try { commit(createConfiguredUiScopeVariant(current.current, JSON.parse(scopeRef.current), scopeVariantName)); setScopeVariantName(''); occurrenceRef.current = ''; setOccurrenceId('') } catch (reason) { error(reason) } }}>Crear configuración del ámbito basada en Base</button><small>Se selecciona para este uso en la configuración activa del padre. Los usos que comparten ese estado del padre también cambian.</small></section>}
</div>
      <div data-configured-pane="components" hidden={inspectorPane !== 'components'}>      <ConfiguredAssemblyOccurrencePanel document={document} scopePath={selectedScope.path} configuration={selectedScope.configuration} fields={occurrenceFields} disabled={blocked || !!mateDraft || !scene || selectedScope.suppressed}
        onChange={fields => { if (!fresh(renderedTicket) || operation.current || pending.current || mateDraftRef.current) return; if (mateRevision.current >= Number.MAX_SAFE_INTEGER) { error(Error('Vuelve a abrir el documento para continuar.')); return }; mateRevision.current++; setOccurrenceFields(fields) }}
        onImport={() => void previewOccurrence(true)} onReuse={() => void previewOccurrence()} />
</div>
      <div data-configured-pane="occurrence" hidden={inspectorPane !== 'occurrence'}><h2>{selected?.name ?? 'Componente'}</h2>      <label>Ocurrencia<select aria-label="Ocurrencia configurada" disabled={blocked} value={occurrenceId} onChange={event => { if (!fresh(renderedTicket) || operation.current || pending.current) return; setBomSelection(null); setTreeOriginSelection(null); setNormalSelection(event.target.value ? nominateAssemblyNormalUnsupported(JSON.stringify(['component', scope, event.target.value]), normalViewContext) : nominateAssemblyNormalFace(null, null, true, normalViewContext, false)); occurrenceRef.current = event.target.value; setOccurrenceId(event.target.value); if (event.target.value) setRevealRequest({ id: 'configured-occurrence-inspector' }) }}><option value="">Selecciona una ocurrencia</option>{selectedScope.occurrences.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      {selected && <section id="configured-occurrence-inspector" tabIndex={-1} aria-label="Editar estado de ocurrencia"><p>{selectedScope.configuration === null ? 'Editando Base: los estados que heredan estos valores también cambian.' : 'Editando sólo la configuración ' + selectedScope.configuration + '. Los usos de esta misma variante comparten el cambio.'}</p>
        <p>{selected.fixed ? 'Componente fijado respecto al padre.' : 'Componente libre respecto al padre.'} {selectedScope.configuration === null ? 'Fijar o liberar en Base afecta a los estados que heredan ese valor.' : 'Fijar o liberar afecta a todos los usos de esta misma definición y estado.'}</p>
        <button disabled={blocked || !!mateDraft || !scene || selectedScope.suppressed || selected.suppressed} onClick={() => void previewOccurrence(false, !selected.fixed)}>{selected.fixed ? 'Vista previa de liberar componente' : 'Vista previa de fijar componente'}</button>
        <fieldset disabled={blocked || !!mateDraft}><legend>Traslación local (mm)</legend>{['X', 'Y', 'Z'].map((axis, i) => <label key={axis}>{axis}<input aria-label={'Posición configurada ' + axis} type="number" step="any" value={pose[i]} onChange={event => { if (fresh(renderedTicket)) setPose(values => values.map((v, index) => index === i ? event.target.value : v)) }} /></label>)}</fieldset>
        <label>Eje local de giro<select aria-label="Eje local de giro configurado" disabled={blocked || !!mateDraft} value={rotationAxis} onChange={event => { if (fresh(renderedTicket)) setRotationAxis(event.target.value as 'X' | 'Y' | 'Z') }}>{(['X', 'Y', 'Z'] as const).map(axis => <option key={axis} value={axis}>{axis}</option>)}</select></label><label>Giro incremental (grados)<input aria-label="Giro incremental configurado en grados" type="number" step="any" disabled={blocked || !!mateDraft} value={rotationDegrees} onChange={event => { if (fresh(renderedTicket)) setRotationDegrees(event.target.value) }} /></label>
        <button disabled={blocked || !!mateDraft || pose.some(v => !v.trim()) || !rotationDegrees.trim()} onClick={() => { if (!fresh(renderedTicket) || operation.current || pending.current) return; try { edit({ pose: configuredUiPose(selected.pose, pose.map(Number), rotationAxis, Number(rotationDegrees)) }) } catch (reason) { error(reason) } }}>Actualizar posición del estado</button>
        <label><input type="checkbox" aria-label="Ocurrencia configurada visible" disabled={blocked || !!mateDraft} checked={selected.visible} onChange={event => edit({ visible: event.target.checked })} />Visible</label><label><input type="checkbox" aria-label="Ocurrencia configurada suprimida" disabled={blocked || !!mateDraft} checked={selected.suppressed} onChange={event => edit({ suppressed: event.target.checked })} />Suprimida</label>
        {evaluation.scopes.some(row => JSON.stringify(row.path) === JSON.stringify([...selectedScope.path, selected.id])) && <label>Configuración hija<select aria-label="Configuración hija de la ocurrencia" disabled={blocked || !!mateDraft || selectedScope.configuration === null} value={evaluation.scopes.find(row => JSON.stringify(row.path) === JSON.stringify([...selectedScope.path, selected.id]))?.configuration ?? ''} onChange={event => edit({ configuration: event.target.value || null })}><option value="">Base</option>{document.catalog.find(row => assemblyDefinitionKey(row.definition) === assemblyDefinitionKey(selected.definition))?.configurations.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select>{selectedScope.configuration === null && <small>Crea primero una configuración del padre para elegir una variante hija.</small>}</label>}
      </section>}
</div>
      <div data-configured-pane="relations" hidden={inspectorPane !== 'relations'}>      <section id="configured-relations" tabIndex={-1} className="configured-mate-list" role="region" aria-label="Relaciones del estado configurado"><h2>Relaciones del estado</h2>
        <p>{selectedScope.configuration === null ? 'Las ediciones de Base conservan los estados efectivos de las configuraciones nombradas.' : `Se edita la configuración ${selectedScope.configuration}. Todos sus usos comparten las relaciones.`}</p>
        <button disabled={blocked || !!mateDraft || !scene || selectedScope.suppressed} onClick={() => openRelationEditor()}>Nueva relación configurada</button>
        <button disabled={blocked || !!mateDraft || !scene || selectedScope.suppressed} onClick={() => openRelationEditor(undefined, true)}>Nueva relación mecánica configurada</button>
        <button disabled={blocked || !!mateDraft || !scene || selectedScope.suppressed} onClick={() => openRelationEditor(undefined, false, true)}>Nueva relación compuesta configurada</button>
        {!effectiveMates.length && <p>No hay relaciones declaradas en este estado.</p>}
        <ul>{effectiveMates.map(mate => { const unavailable = configuredMechanicalMate(mate) || configuredCompoundMate(mate) ? null : configuredMateEditUnavailable(mate); return <li key={mate.id} data-configured-mate-id={mate.id} data-configured-mate-type={mate.type} data-configured-mate-suppressed={String(mate.suppressed)}>
          <strong>{mate.name}</strong><small>{mate.type}{mate.suppressed ? ' · suprimida' : ''}{mate.type === 'distance' ? ` · ${mate.distance} mm` : ''}{mate.type === 'angle' ? ` · ${mate.angle}°` : ''}</small>
          <button aria-label={`Editar relación configurada ${mate.name}`} title={unavailable ?? 'Editar referencias y parámetros'} disabled={blocked || !!mateDraft || !!unavailable || !scene || selectedScope.suppressed} onClick={() => openRelationEditor(mate)}>Editar</button>
          {mate.type === 'concentric' && mate.rotationLock === null && <button aria-label={`Bloquear giro de relación configurada ${mate.name}`} disabled={blocked || !!mateDraft || !scene || selectedScope.suppressed} onClick={() => openRelationEditor(mate, true)}>Bloquear giro</button>}
          <button aria-label={`${mate.suppressed ? 'Activar' : 'Suprimir'} relación configurada ${mate.name}`} disabled={blocked || !!mateDraft || !scene || selectedScope.suppressed} onClick={() => { if (freshMate()) void previewRelation(relationTarget({ kind: 'suppression', mateId: mate.id, suppressed: !mate.suppressed })) }}>{mate.suppressed ? 'Activar' : 'Suprimir'}</button>
          <button aria-label={`Eliminar relación configurada ${mate.name}`} disabled={blocked || !!mateDraft || !scene || selectedScope.suppressed} onClick={() => { if (freshMate()) void previewRelation(relationTarget({ kind: 'remove', mateId: mate.id })) }}>Eliminar</button>
          {unavailable && <small>{unavailable}</small>}
        </li> })}</ul>
        <p>Los perfiles y trayectos requieren todas sus referencias materiales actuales; se verifican antes de aplicar.</p>
      </section>
</div>
      <div data-configured-pane="relation" hidden={inspectorPane !== 'relation'}>
        <div id="configured-property-heading" role="heading" aria-level={2} className="configured-property-context"><strong>{mateDraft?.editing ? 'Editar relación' : 'Nueva relación'}</strong><span>{selectedScope.path.join(' / ') || document.source.name} · {selectedScope.configuration ?? 'Base'}</span></div>
        <div className="configured-property-actions">
          <button title={preview ? 'Aplicar relación verificada' : 'Verifica la vista previa para aplicar'} aria-label="Aplicar relación verificada" disabled={busy || !preview} onClick={() => void apply()}><Check size={21} /></button>
          <button title={preview ? 'Cancelar vista previa de relación' : 'Cerrar relación'} aria-label={preview ? 'Cancelar vista previa de relación' : 'Cerrar relación'} disabled={busy} onClick={() => {
            if (!freshMate() || operation.current) return
            if (pending.current) { revoke(0, undefined, true); setFailure(null); setMessage('Vista previa cancelada. Se conserva el documento confirmado.'); return }
            try { setRelationDraft(null); setFailure(null) } catch (reason) { error(reason) }
          }}><X size={21} /></button>
          <span>{preview ? 'Vista previa verificada' : 'Selecciona referencias y verifica'}</span>
        </div>
              <div id="configured-relation-inspector" data-inspector-anchor="configured-property-heading" tabIndex={-1}>
      {mateDraft && !('mechanical' in mateDraft) && !('compound' in mateDraft) && <ConfiguredAssemblyMatePanel draft={mateDraft} choices={mateChoices.values} disabled={blocked || !scene || selectedScope.suppressed}
        originControls={generalDraft && <ConfiguredOriginDisclosure axes={originAxes} planes={originPlanes} pick={originPick}
        activeRole={originPick ? configuredMateUiRoleLabels(generalDraft)[originPick.slot] : null} visibleCount={originDisplay.length}>
        <div className="configured-origin-visibility">
          <label><input type="checkbox" aria-label="Mostrar ejes de origen configurados" checked={originAxes} disabled={blocked || !scene} onChange={event => { if (!freshMate() || operation.current || pending.current || inspectorPane !== 'relation') return; stopMatePick(); setOriginAxes(event.target.checked) }} />Ejes</label>
          <label><input type="checkbox" aria-label="Mostrar planos de origen configurados" checked={originPlanes} disabled={blocked || !scene} onChange={event => { if (!freshMate() || operation.current || pending.current || inspectorPane !== 'relation') return; stopMatePick(); setOriginPlanes(event.target.checked) }} />Planos</label>
        </div>
        <label>Mostrar origen de<select aria-label="Propietario de referencias de origen configuradas" value={originOwner} disabled={blocked || !scene} onChange={event => { if (!freshMate() || operation.current || pending.current || inspectorPane !== 'relation') return; stopMatePick(); setOriginOwner(event.target.value as typeof originOwner) }}>
          <option value="scope">Ámbito actual</option><option value="selected" disabled={!chosenOriginOwner}>Componente elegido</option><option value="both" disabled={!chosenOriginOwner}>Ambos</option>
        </select></label>
        <label>Componente de origen<select aria-label="Componente de referencias de origen configuradas" value={chosenOriginOwner?.key ?? ''} disabled={blocked || !scene || !originOwners.length} onChange={event => {
          if (!freshMate() || operation.current || pending.current || inspectorPane !== 'relation' || !scene || !configuredUiSceneMatches(scene, current.current, epoch.current)) return
          const owner = originOwners.find(row => row.key === event.target.value)
          if (!owner) return
          stopMatePick(); setOriginComponent(owner.key); setOriginOwner(value => value === 'scope' ? 'selected' : value)
        }}><option value="" disabled>Elige un componente visible</option>{originOwners.map(owner => <option key={owner.key} value={owner.key}>{owner.label}</option>)}</select></label>
        <div className="configured-origin-roles">{configuredMateUiRoleLabels(generalDraft).map((label, slot) => <button key={slot} type="button" aria-label={`Seleccionar ${label} por origen en vista configurada`} aria-pressed={originPick?.slot === slot} disabled={blocked || !scene || !originDisplay.some(row => configuredOriginPickChoice(originDisplay, generalDraft, mateChoices.values, slot, row.reference))} onClick={() => {
          if (!freshMate() || operation.current || pending.current || inspectorPane !== 'relation' || !scene || !configuredUiSceneMatches(scene, current.current, epoch.current)) return
          if (!originDisplay.some(row => configuredOriginPickChoice(originDisplay, generalDraft, mateChoices.values, slot, row.reference))) return
          stopMatePick(); const value = { slot, catalog: configuredOriginCatalog(originDisplay) }; originPickRef.current = value; setOriginPick(value)
        }}>{label}</button>)}</div>
        <small>Elige un componente y después la referencia que quieres seleccionar. Cambiar de componente conserva las referencias ya elegidas.</small>
      </ConfiguredOriginDisclosure>}
        picking={matePick} onStopPicking={stopMatePick} onPick={(slot, kind) => { if (!freshMate() || operation.current || pending.current || inspectorPane !== 'relation') return; stopMatePick(); const value = { slot, kind }; matePickRef.current = value; setMatePick(value) }}
        onChange={draft => { if (!freshMate() || operation.current || pending.current) return; try { setRelationDraft(structuredClone(draft)); setFailure(null) } catch (reason) { error(reason) } }}
        onPreview={previewDraft} onClose={() => { if (!freshMate() || operation.current || pending.current) return; try { setRelationDraft(null); setFailure(null) } catch (reason) { error(reason) } }} />}
      {mateDraft && 'mechanical' in mateDraft && <ConfiguredAssemblyMechanicalPanel draft={mateDraft} choices={mechanicalChoices.values} target={mechanicalTarget} error={mechanicalError ?? mechanicalChoices.error} disabled={blocked || !scene || selectedScope.suppressed}
        onChange={draft => { if (!freshMate() || operation.current || pending.current) return; try { setRelationDraft(structuredClone(draft)); setFailure(null) } catch (reason) { error(reason) } }}
        onPreview={previewDraft} onClose={() => { if (!freshMate() || operation.current || pending.current) return; try { setRelationDraft(null); setFailure(null) } catch (reason) { error(reason) } }} />}
      {mateDraft && 'compound' in mateDraft && <ConfiguredAssemblyCompoundPanel draft={mateDraft} choices={compoundChoices.values} disabled={blocked || !scene || selectedScope.suppressed}
        onChange={draft => { if (!freshMate() || operation.current || pending.current) return; try { setRelationDraft(structuredClone(draft)); setFailure(null) } catch (reason) { error(reason) } }}
        onPreview={previewDraft} onClose={() => { if (!freshMate() || operation.current || pending.current) return; try { setRelationDraft(null); setFailure(null) } catch (reason) { error(reason) } }} />}
      </div>
      {compoundChoices.error && <p role="alert">{compoundChoices.error}</p>}
      {mateChoices.error && <p role="alert">{mateChoices.error}</p>}

      </div>
    </aside><main>{inspectorPane === 'relation' && matePick && generalDraft && !blocked && <p role="status" aria-label="Selección de referencia en vista configurada">Selecciona {configuredMateUiRoleLabels(generalDraft)[matePick.slot]}: {matePick.kind === 'face' ? 'una cara compatible' : 'una arista LINE'} · Ámbito: {selectedScope.path.join(' / ') || 'Raíz'} · Estado: {selectedScope.configuration ?? 'Base'}. <button type="button" onClick={stopMatePick}>Cancelar selección en vista</button></p>}{inspectorPane === 'relation' && originPick && generalDraft && !blocked && <p role="status" aria-label="Selección de origen en vista configurada">Selecciona {configuredMateUiRoleLabels(generalDraft)[originPick.slot]}: un eje o plano de origen visible compatible. <button type="button" onClick={stopMatePick}>Cancelar selección de origen</button></p>}<div className="configured-assembly-view" data-normal-selection-kind={normalResolution.target?.kind ?? 'invalid'} data-normal-selection-keys={JSON.stringify(normalViewSelection?.items.map(value => [value.kind, value.key]) ?? [])} data-normal-enabled={canNormal}><CompactViewportToolbar label="Vistas del ensamblaje configurado"><ViewportToolGroup label="Orientación y ajuste"><ViewOrientationControls onView={menuView} disabled={busy || viewHistory.navigating} canPrevious={viewHistory.canPrevious} canNormal={canNormal} onNamedViews={namedViews.open} canNamedViews={namedViews.canOpen} />{([['iso', 'Isométrica'], ['front', 'Frontal'], ['top', 'Superior'], ['fit', 'Ajustar']] as const).map(([name, label]) => <button key={name} title={label} disabled={busy || viewHistory.navigating} onClick={() => menuView(name)}><ViewportToolIcon name={name} label={label} /></button>)}</ViewportToolGroup></CompactViewportToolbar><AssemblyViewport interactionRevision={navigationRevision} originLabelTopInset={44} originReferences={!normalViewBlocked && normalResolution.origins.length ? normalResolution.origins : inspectorPane === 'model' ? modelOrigin ? [modelOrigin.display] : [] : originDisplay} selectedOrigins={!normalViewBlocked && normalResolution.origins.length ? normalResolution.origins.map(value => value.reference) : inspectorPane === 'model' ? modelOrigin ? [modelOrigin.display.reference] : [] : selectedOrigins} pickingOrigins={inspectorPane === 'relation' && !blocked && !!originPick} onOrigin={pickOrigin} selectedFaces={normalViewBlocked ? mateHighlights.faces : [...mateHighlights.faces, ...normalResolution.faces]} selectedEdges={mateHighlights.edges} scene={displayScene} disabled={busy} view={view} viewHistory={viewHistory} selectedPath={preview || modelOrigin ? [] : bomSelectedPath.length ? bomSelectedPath : selected ? [...selectedScope.path, selected.id] : []} pickingFaces={inspectorPane === 'relation' && !blocked && matePick?.kind === 'face'} pickingEdges={inspectorPane === 'relation' && !blocked && matePick?.kind === 'edge'} onFace={pickMate} onEdge={pickMate} onViewSelection={nominateViewSelection} onContextTarget={openViewportContext} onComponent={component => {
        if (!fresh(renderedTicket) || operation.current || pending.current || mateDraftRef.current || !scene || !configuredUiSceneMatches(scene, current.current, epoch.current)) return
        setTreeOriginSelection(null)
        const id = configuredComponentPick(displayScene, component, selectedScope.path)
        if (!id || !selectedScope.occurrences.some(row => row.id === id && !row.suppressed)) return
        occurrenceRef.current = id; setOccurrenceId(id); setBomSelection(null); setMessage('Componente seleccionado en el ámbito actual.')
      }} /></div>
      {preview && <p role="status">Vista previa verificada · todavía sin aplicar. {preview.states.length} estados resueltos; {preview.verification.reports.length} relaciones comprobadas.</p>}
      {scene && <p aria-label="Totales de configuración">{scene.scene.solidCount} sólidos · {scene.scene.volume.toFixed(3)} mm³ · {scene.scene.area.toFixed(3)} mm²</p>}
      <details className="configured-assembly-limit"><summary>Alcance de esta vista</summary><p>Edición de estados y relaciones con captura mecánica verificada, variantes y lista de materiales CSV. La reparación de orígenes, la exportación de geometría y el movimiento interactivo aún no están disponibles en esta vista.</p></details>
    </main></div>{bomOpen && <ConfiguredAssemblyBomPanel report={bom.report} error={bom.error} options={bomOptions} disabled={blocked || !!mateDraft} selectedPath={bomSelectedPath}
      rootConfigurationLabel={document.rootConfiguration === null ? 'Base' : `${rootVariants.find(value => value.id === document.rootConfiguration)?.name ?? document.rootConfiguration} · ${JSON.stringify(document.rootConfiguration)}`}
      scopes={evaluation.scopes.map(value => ({ path: value.path, label: `${value.path.join(' / ') || 'Todo el ensamblaje'} · ${value.configuration ?? 'Base'}` }))}
      onOptionsChange={options => { if (!freshBom(renderedBomTicket) || operation.current || pending.current || mateDraftRef.current) return; changeBomView(true, options) }}
      onSelect={member => { if (!freshBom(renderedBomTicket) || operation.current || pending.current || mateDraftRef.current || !bom.report) return; const match = configuredBomUiSelectedPath(bom.report, serialized, { serialized, member }); if (match.length) { setNormalSelection(nominateAssemblyNormalUnsupported(JSON.stringify(['component', match]), normalViewContext)); setTreeOriginSelection(null); setBomSelection({ serialized, member: structuredClone(member) }) } }}
      onExport={() => void exportBom()} onClose={() => changeBomView(false)} />}{failure && <p className="configured-assembly-error" role="alert">{failure}</p>}<footer role="status">{message}</footer>
    {activeContext && contextRow && <CadContextMenu targetName={`${contextRow.occurrence.name} · ${contextRow.scope.path.join(' / ') || 'Raíz'} · ${contextRow.scope.configuration ?? 'Base'}`}
      actions={contextActions} point={activeContext.point} restoreFocusElement={activeContext.element} onClose={() => setComponentContext(null)} />}
    {namedViews.isOpen && <NamedViewsDialog views={namedViews.views} canSave={namedViews.canSave} canUpdate={namedViews.canUpdate}
      onSave={namedViews.save} onShow={namedViews.show} onDelete={namedViews.remove} onRename={namedViews.rename} onUpdate={namedViews.update} onClose={namedViews.close} />}
    {newDocumentDialog.dialog}
    {discardDialog && <div ref={dialog} role="dialog" aria-modal="true" aria-label="Cambios del ensamblaje configurado"><p>Hay cambios sin guardar. ¿Sustituir el documento actual?</p><button onClick={() => { if (!fresh(renderedTicket)) return; const resolve = answer.current; answer.current = null; setDiscardDialog(false); resolve?.(false) }}>Cancelar apertura</button><button onClick={() => { if (!fresh(renderedTicket)) return; const resolve = answer.current; answer.current = null; setDiscardDialog(false); resolve?.(true) }}>Continuar sin guardar</button></div>}
  </div>
}
