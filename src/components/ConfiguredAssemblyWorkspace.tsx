import ConfiguredAssemblyOccurrencePanel, { initialConfiguredOccurrenceFields, configuredOccurrenceUiIntent, configuredOccurrenceImportIntent, configuredOccurrenceReuseIntent } from './ConfiguredAssemblyOccurrencePanel'
import type { AssemblyConfiguredOccurrenceEdit } from '../model/assemblyConfiguredOccurrenceEditing'
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildConfiguredAssembly, previewConfiguredAssembly, previewConfiguredAssemblyRelationEdit, previewConfiguredAssemblyMechanicalEdit, previewConfiguredAssemblyOccurrenceEdit, applyConfiguredAssembly, discardConfiguredAssembly } from '../cad/kernel'
import type { ConfiguredAssemblyPreviewReply } from '../cad/kernel.assembly-configuration-session'
import type { ConfiguredAssemblyScene } from '../cad/kernel.assembly-configuration-scene'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { assemblyDefinitionKey, validateAssemblyMate, type AssemblyMate } from '../model/assemblyDocument'
import { validateAssemblyConfiguredMateEdit, type AssemblyConfiguredMateEdit } from '../model/assemblyConfiguredMateEditing'
import { inspectAssemblyConfiguredMechanicalEdit, validateAssemblyConfiguredMechanicalEdit, type AssemblyConfiguredMechanicalEdit } from '../model/assemblyConfiguredMechanicalEditing'
import { AssemblyConfiguredDocumentHistory } from '../model/assemblyConfiguredHistory'
import { validateAssemblyConfiguredDocument, parseAssemblyConfiguredDocument, serializeAssemblyConfiguredDocument, type AssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { parseCadDocument, type CadDocument } from '../model/cadDocument'
import { CAD_RECOVERY_KEY } from '../model/cadRecovery'
import { buildConfiguredAssemblyBom, type ConfiguredAssemblyBomOptions, type ConfiguredAssemblyBomMember } from '../model/assemblyConfiguredBom'
import { createConfiguredUiRootVariant, createConfiguredUiScopeVariant, configuredUiPose, editConfiguredUiOccurrence, configuredUiTicket, configuredUiTicketMatches, configuredUiSceneMatches, configuredUiDisplayScene, configuredBomUiTicket, configuredBomUiTicketMatches, configuredBomUiSelectedPath, downloadConfiguredBomCsv, runConfiguredBomCsvExport, configuredMateUiTicketMatches, configuredMateUiPreviewMatches, configuredMechanicalUiPreviewMatches } from './configuredAssemblyUi'
import AssemblyViewport from './AssemblyViewport'
import { configuredComponentPick, configuredMatePickChoice, configuredMateHighlights, type ConfiguredMatePick } from './configuredAssemblyPicking'
import type { AssemblySceneFace, AssemblySceneEdge } from '../cad/kernel.assembly-types'
import ConfiguredAssemblyBomPanel from './ConfiguredAssemblyBomPanel'
import ConfiguredAssemblyMatePanel, { configuredMateUiDraft, configuredMateUiRoleLabels, configuredMateUiChoices, configuredMateUiProposal, configuredMateEditUnavailable, type ConfiguredMateDraft } from './ConfiguredAssemblyMatePanel'
import ConfiguredAssemblyMechanicalPanel, { configuredMechanicalDraft, configuredMechanicalChoices, configuredMechanicalIntent, configuredMechanicalMate, type ConfiguredMechanicalDraft } from './ConfiguredAssemblyMechanicalPanel'
import ConfiguredAssemblyCompoundPanel, { configuredCompoundUiDraft, configuredCompoundUiProposal, configuredCompoundMate, type ConfiguredCompoundDraft } from './ConfiguredAssemblyCompoundPanel'
import { configuredCompoundUiChoices, type ConfiguredCompoundUiChoices } from './configuredCompoundUiChoices'
import './assembly.css'
import './configured-assembly.css'

let controllerEpoch = 0
type RelationDraft = ConfiguredMateDraft | ConfiguredMechanicalDraft | ConfiguredCompoundDraft
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
  const [mateDraft, setMateDraft] = useState<RelationDraft | null>(null), mateDraftRef = useRef(mateDraft), mateRevision = useRef(0), sceneRef = useRef(scene), committedSceneRef = useRef<ConfiguredAssemblyScene | null>(null)
  const [occurrenceFields, setOccurrenceFields] = useState(initialConfiguredOccurrenceFields)
  const [matePick, setMatePick] = useState<ConfiguredMatePick | null>(null), matePickRef = useRef(matePick)
  const stopMatePick = () => { matePickRef.current = null; setMatePick(null) }
  const [view, setView] = useState<{ name: 'iso' | 'front' | 'top' | 'fit'; stamp: number }>({ name: 'iso', stamp: 0 })
  const [discardDialog, setDiscardDialog] = useState(false), answer = useRef<((allow: boolean) => void) | null>(null)
  const [bomOpen, setBomOpen] = useState(false), [bomOptions, setBomOptions] = useState<ConfiguredAssemblyBomOptions>({ mode: 'parts-only', includeHidden: true, scopePath: [] })
  const [bomSelection, setBomSelection] = useState<{ serialized: string; member: ConfiguredAssemblyBomMember } | null>(null)
  const bomView = useRef({ open: bomOpen, options: bomOptions, revision: 0 }), bomToggle = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const current = useRef(document), epoch = useRef(generation), scopeRef = useRef(scope), occurrenceRef = useRef(occurrenceId), pathRef = useRef(path), mounted = useRef(false)
  const pending = useRef(preview), operation = useRef(false), skipRecovery = useRef(skipInitialRecoveryWrite)
  const operationKind = useRef<'build' | 'solve' | 'apply' | 'file' | null>(null), dirtyRef = useRef(false)
  current.current = document; pending.current = preview; pathRef.current = path; sceneRef.current = scene
  const serialized = useMemo(() => serializeAssemblyConfiguredDocument(document), [document]), dirty = serialized !== saved
  const renderedTicket = { serialized, generation, scope, path, occurrence: occurrenceId, draftRevision: mateRevision.current }
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
  const ticket = () => configuredUiTicket(current.current, epoch.current, scopeRef.current, pathRef.current, occurrenceRef.current, mateRevision.current)
  const fresh = (value: ReturnType<typeof ticket>) => mounted.current && configuredUiTicketMatches(value, ticket())
  const mateTicket = () => ({ context: ticket(), revision: mateRevision.current, draft: JSON.stringify(mateDraftRef.current), sceneId: sceneRef.current?.scene.sceneId ?? null })
  const renderedMateTicket = { context: renderedTicket, revision: mateRevision.current, draft: JSON.stringify(mateDraft), sceneId: scene?.scene.sceneId ?? null }
  const freshMate = () => mounted.current && configuredMateUiTicketMatches(renderedMateTicket, mateTicket())
  const setRelationDraft = (value: RelationDraft | null) => {
    if (mateRevision.current >= Number.MAX_SAFE_INTEGER) throw Error('Vuelve a abrir el ensamblaje para continuar editando relaciones.')
    stopMatePick(); mateRevision.current++; mateDraftRef.current = value; setMateDraft(value)
  }
  const bomTicket = () => configuredBomUiTicket(ticket(), bomView.current.open, bomView.current.revision, bomView.current.options)
  const renderedBomTicket = configuredBomUiTicket(renderedTicket, bomOpen, bomView.current.revision, bomOptions)
  const freshBom = (value: ReturnType<typeof bomTicket>) => mounted.current && configuredBomUiTicketMatches(value, bomTicket())
  const release = (token: string) => { void discardConfiguredAssembly(token).catch(() => undefined) }
  const begin = (kind: NonNullable<typeof operationKind.current>) => { operation.current = true; operationKind.current = kind; setBusy(true); setCancelable(kind === 'build' || kind === 'solve') }
  const finish = () => { operation.current = false; operationKind.current = null; setBusy(false); setCancelable(false) }
  const error = (reason: unknown) => { const text = reason instanceof Error ? reason.message : String(reason); setFailure(text); setMessage(text) }
  const revoke = (minimum = 0, reservedEpoch?: number, keepMateDraft = false) => {
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
    if (!fresh(renderedTicket) || operation.current || pending.current || mateDraftRef.current) return false
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
      revoke(); onOpenDocument(next, file.path, file.content)
    } catch (reason) { if (fresh(captured)) error(reason) }
    finally { if (fresh(captured)) finish() }
  }
  const undo = (redo: boolean) => {
    if (!fresh(renderedTicket) || operation.current || pending.current || mateDraftRef.current) return
    const reservedEpoch = nextEpoch(), value = redo ? history.current!.redo() : history.current!.undo()
    revoke(0, reservedEpoch); setFailure(null); current.current = value; skipRecovery.current = false; setDocument(value)
  }
  const changeScope = (value: string) => { if (!fresh(renderedTicket) || operation.current || pending.current || !evaluation.scopes.some(row => JSON.stringify(row.path) === value)) return; revoke(); setFailure(null); scopeRef.current = value; occurrenceRef.current = ''; setScope(value); setOccurrenceId('') }
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
    try { const id = mate?.id ?? crypto.randomUUID(); setRelationDraft(mate && configuredCompoundMate(mate) ? configuredCompoundUiDraft(id, mate) : mate && configuredMechanicalMate(mate) ? configuredMechanicalDraft(id, mate) : compound ? configuredCompoundUiDraft(id) : mechanical ? configuredMechanicalDraft(id) : configuredMateUiDraft(id, mate)); setFailure(null) } catch (reason) { error(reason) }
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
    if (!open) bomToggle.current?.focus()
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
    if (!freshMate() || operation.current || pending.current || !matePick || matePickRef.current !== matePick || !mateDraft || 'mechanical' in mateDraft || 'compound' in mateDraft || !scene || !configuredUiSceneMatches(scene, current.current, epoch.current)) return
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
  const generalDraft = mateDraft && !('mechanical' in mateDraft) && !('compound' in mateDraft) ? mateDraft : null
  const mateHighlights = useMemo(() => configuredMateHighlights(!blocked && scene && configuredUiSceneMatches(scene, document, generation) ? displayScene : null, selectedScope.path, generalDraft, mateChoices.values), [blocked, scene, document, generation, displayScene, selectedScope.path, generalDraft, mateChoices.values])
  return <div className="configured-assembly-workspace" aria-label="Ensamblaje configurado" aria-busy={busy}>
    <header><strong>SolidFlow · {document.source.name}{dirty ? ' *' : ''}</strong><span title={path}>{path?.split(/[\\/]/).at(-1) ?? 'Sin guardar'}</span></header>
    <nav aria-label="Archivo del ensamblaje configurado">
      <button onClick={() => void open()} disabled={blocked || !!mateDraft}>Abrir</button><button onClick={() => void save(false)} disabled={blocked || !!mateDraft}>Guardar</button><button onClick={() => void save(true)} disabled={blocked || !!mateDraft}>Guardar como</button>
      <button onClick={() => undo(false)} disabled={blocked || !!mateDraft || !history.current.canUndo}>Deshacer</button><button onClick={() => undo(true)} disabled={blocked || !!mateDraft || !history.current.canRedo}>Rehacer</button>
      <button onClick={() => void solve()} disabled={blocked || !!mateDraft || !scene}>Resolver configuración</button><button onClick={() => void apply()} disabled={busy || !preview}>Aplicar configuración</button>
      <button ref={bomToggle} aria-label="Lista de materiales configurada" aria-controls="configured-assembly-bom-panel" aria-pressed={bomOpen} disabled={busy} onClick={() => changeBomView(!bomOpen)}>Lista de materiales</button>
      <button onClick={() => { if (!fresh(renderedTicket) || operationKind.current !== 'build' && operationKind.current !== 'solve' && (operation.current || !pending.current)) return; revoke(0, undefined, !!mateDraftRef.current); setFailure(null); setMessage('Vista previa cancelada. Se conserva el documento confirmado.') }} disabled={!cancelable && (!preview || busy)}>Cancelar</button>
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
      <label>Ocurrencia<select aria-label="Ocurrencia configurada" disabled={blocked} value={occurrenceId} onChange={event => { if (!fresh(renderedTicket) || operation.current || pending.current) return; setBomSelection(null); occurrenceRef.current = event.target.value; setOccurrenceId(event.target.value) }}><option value="">Selecciona una ocurrencia</option>{selectedScope.occurrences.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      <ConfiguredAssemblyOccurrencePanel document={document} scopePath={selectedScope.path} configuration={selectedScope.configuration} fields={occurrenceFields} disabled={blocked || !!mateDraft || !scene || selectedScope.suppressed}
        onChange={fields => { if (!fresh(renderedTicket) || operation.current || pending.current || mateDraftRef.current) return; if (mateRevision.current >= Number.MAX_SAFE_INTEGER) { error(Error('Vuelve a abrir el documento para continuar.')); return }; mateRevision.current++; setOccurrenceFields(fields) }}
        onImport={() => void previewOccurrence(true)} onReuse={() => void previewOccurrence()} />
      {selected && <section aria-label="Editar estado de ocurrencia"><p>{selectedScope.configuration === null ? 'Editando Base: los estados que heredan estos valores también cambian.' : 'Editando sólo la configuración ' + selectedScope.configuration + '. Los usos de esta misma variante comparten el cambio.'}</p>
        <p>{selected.fixed ? 'Componente fijado respecto al padre.' : 'Componente libre respecto al padre.'} {selectedScope.configuration === null ? 'Fijar o liberar en Base afecta a los estados que heredan ese valor.' : 'Fijar o liberar afecta a todos los usos de esta misma definición y estado.'}</p>
        <button disabled={blocked || !!mateDraft || !scene || selectedScope.suppressed || selected.suppressed} onClick={() => void previewOccurrence(false, !selected.fixed)}>{selected.fixed ? 'Vista previa de liberar componente' : 'Vista previa de fijar componente'}</button>
        <fieldset disabled={blocked || !!mateDraft}><legend>Traslación local (mm)</legend>{['X', 'Y', 'Z'].map((axis, i) => <label key={axis}>{axis}<input aria-label={'Posición configurada ' + axis} type="number" step="any" value={pose[i]} onChange={event => { if (fresh(renderedTicket)) setPose(values => values.map((v, index) => index === i ? event.target.value : v)) }} /></label>)}</fieldset>
        <label>Eje local de giro<select aria-label="Eje local de giro configurado" disabled={blocked || !!mateDraft} value={rotationAxis} onChange={event => { if (fresh(renderedTicket)) setRotationAxis(event.target.value as 'X' | 'Y' | 'Z') }}>{(['X', 'Y', 'Z'] as const).map(axis => <option key={axis} value={axis}>{axis}</option>)}</select></label><label>Giro incremental (grados)<input aria-label="Giro incremental configurado en grados" type="number" step="any" disabled={blocked || !!mateDraft} value={rotationDegrees} onChange={event => { if (fresh(renderedTicket)) setRotationDegrees(event.target.value) }} /></label>
        <button disabled={blocked || !!mateDraft || pose.some(v => !v.trim()) || !rotationDegrees.trim()} onClick={() => { if (!fresh(renderedTicket) || operation.current || pending.current) return; try { edit({ pose: configuredUiPose(selected.pose, pose.map(Number), rotationAxis, Number(rotationDegrees)) }) } catch (reason) { error(reason) } }}>Actualizar posición del estado</button>
        <label><input type="checkbox" aria-label="Ocurrencia configurada visible" disabled={blocked || !!mateDraft} checked={selected.visible} onChange={event => edit({ visible: event.target.checked })} />Visible</label><label><input type="checkbox" aria-label="Ocurrencia configurada suprimida" disabled={blocked || !!mateDraft} checked={selected.suppressed} onChange={event => edit({ suppressed: event.target.checked })} />Suprimida</label>
        {evaluation.scopes.some(row => JSON.stringify(row.path) === JSON.stringify([...selectedScope.path, selected.id])) && <label>Configuración hija<select aria-label="Configuración hija de la ocurrencia" disabled={blocked || !!mateDraft || selectedScope.configuration === null} value={evaluation.scopes.find(row => JSON.stringify(row.path) === JSON.stringify([...selectedScope.path, selected.id]))?.configuration ?? ''} onChange={event => edit({ configuration: event.target.value || null })}><option value="">Base</option>{document.catalog.find(row => assemblyDefinitionKey(row.definition) === assemblyDefinitionKey(selected.definition))?.configurations.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select>{selectedScope.configuration === null && <small>Crea primero una configuración del padre para elegir una variante hija.</small>}</label>}
      </section>}
      <section className="configured-mate-list" role="region" aria-label="Relaciones del estado configurado"><h2>Relaciones del estado</h2>
        <p>{selectedScope.configuration === null ? 'Las ediciones de Base conservan los estados efectivos de las configuraciones nombradas.' : `Se edita la configuración ${selectedScope.configuration}. Todos sus usos comparten las relaciones.`}</p>
        <button disabled={blocked || !!mateDraft || !scene || selectedScope.suppressed} onClick={() => openRelationEditor()}>Nueva relación configurada</button>
        <button disabled={blocked || !!mateDraft || !scene || selectedScope.suppressed} onClick={() => openRelationEditor(undefined, true)}>Nueva relación mecánica configurada</button>
        <button disabled={blocked || !!mateDraft || !scene || selectedScope.suppressed} onClick={() => openRelationEditor(undefined, false, true)}>Nueva relación compuesta configurada</button>
        {!effectiveMates.length && <p>No hay relaciones declaradas en este estado.</p>}
        <ul>{effectiveMates.map(mate => { const unavailable = configuredMechanicalMate(mate) || configuredCompoundMate(mate) ? null : configuredMateEditUnavailable(mate); return <li key={mate.id} data-configured-mate-id={mate.id} data-configured-mate-type={mate.type} data-configured-mate-suppressed={String(mate.suppressed)}>
          <strong>{mate.name}</strong><small>{mate.type}{mate.suppressed ? ' · suprimida' : ''}{mate.type === 'distance' ? ` · ${mate.distance} mm` : ''}{mate.type === 'angle' ? ` · ${mate.angle}°` : ''}</small>
          <button aria-label={`Editar relación configurada ${mate.name}`} title={unavailable ?? 'Editar referencias y parámetros'} disabled={blocked || !!mateDraft || !!unavailable || !scene || selectedScope.suppressed} onClick={() => openRelationEditor(mate)}>Editar</button>
          <button aria-label={`${mate.suppressed ? 'Activar' : 'Suprimir'} relación configurada ${mate.name}`} disabled={blocked || !!mateDraft || !scene || selectedScope.suppressed} onClick={() => { if (freshMate()) void previewRelation(relationTarget({ kind: 'suppression', mateId: mate.id, suppressed: !mate.suppressed })) }}>{mate.suppressed ? 'Activar' : 'Suprimir'}</button>
          <button aria-label={`Eliminar relación configurada ${mate.name}`} disabled={blocked || !!mateDraft || !scene || selectedScope.suppressed} onClick={() => { if (freshMate()) void previewRelation(relationTarget({ kind: 'remove', mateId: mate.id })) }}>Eliminar</button>
          {unavailable && <small>{unavailable}</small>}
        </li> })}</ul>
        <p>Los perfiles y trayectos requieren todas sus referencias materiales actuales; se verifican antes de aplicar.</p>
      </section>
      {mateDraft && !('mechanical' in mateDraft) && !('compound' in mateDraft) && <ConfiguredAssemblyMatePanel draft={mateDraft} choices={mateChoices.values} disabled={blocked || !scene || selectedScope.suppressed}
        picking={matePick} onStopPicking={stopMatePick} onPick={(slot, kind) => { if (!freshMate() || operation.current || pending.current) return; const value = { slot, kind }; matePickRef.current = value; setMatePick(value) }}
        onChange={draft => { if (!freshMate() || operation.current || pending.current) return; try { setRelationDraft(structuredClone(draft)); setFailure(null) } catch (reason) { error(reason) } }}
        onPreview={previewDraft} onClose={() => { if (!freshMate() || operation.current || pending.current) return; try { setRelationDraft(null); setFailure(null) } catch (reason) { error(reason) } }} />}
      {mateDraft && 'mechanical' in mateDraft && <ConfiguredAssemblyMechanicalPanel draft={mateDraft} choices={mechanicalChoices.values} target={mechanicalTarget} error={mechanicalError ?? mechanicalChoices.error} disabled={blocked || !scene || selectedScope.suppressed}
        onChange={draft => { if (!freshMate() || operation.current || pending.current) return; try { setRelationDraft(structuredClone(draft)); setFailure(null) } catch (reason) { error(reason) } }}
        onPreview={previewDraft} onClose={() => { if (!freshMate() || operation.current || pending.current) return; try { setRelationDraft(null); setFailure(null) } catch (reason) { error(reason) } }} />}
      {mateDraft && 'compound' in mateDraft && <ConfiguredAssemblyCompoundPanel draft={mateDraft} choices={compoundChoices.values} disabled={blocked || !scene || selectedScope.suppressed}
        onChange={draft => { if (!freshMate() || operation.current || pending.current) return; try { setRelationDraft(structuredClone(draft)); setFailure(null) } catch (reason) { error(reason) } }}
        onPreview={previewDraft} onClose={() => { if (!freshMate() || operation.current || pending.current) return; try { setRelationDraft(null); setFailure(null) } catch (reason) { error(reason) } }} />}
      {compoundChoices.error && <p role="alert">{compoundChoices.error}</p>}
      {mateChoices.error && <p role="alert">{mateChoices.error}</p>}
      <h2>Piezas efectivas</h2><ul>{evaluation.parts.map(part => <li key={JSON.stringify(part.path)}>{part.path.join(' / ')}{part.suppressed ? ' · suprimida' : part.visible ? '' : ' · oculta'}</li>)}</ul>
    </aside><main><nav aria-label="Vistas del ensamblaje configurado">{([['iso', 'Isométrica'], ['front', 'Frontal'], ['top', 'Superior'], ['fit', 'Ajustar']] as const).map(([name, label]) => <button key={name} disabled={busy} onClick={() => setView(old => ({ name, stamp: old.stamp + 1 }))}>{label}</button>)}</nav>{matePick && generalDraft && !blocked && <p role="status" aria-label="Selección de referencia en vista configurada">Selecciona {configuredMateUiRoleLabels(generalDraft)[matePick.slot]}: {matePick.kind === 'face' ? 'una cara compatible' : 'una arista LINE'} · Ámbito: {selectedScope.path.join(' / ') || 'Raíz'} · Estado: {selectedScope.configuration ?? 'Base'}. <button type="button" onClick={stopMatePick}>Cancelar selección en vista</button></p>}<div className="configured-assembly-view"><AssemblyViewport selectedFaces={mateHighlights.faces} selectedEdges={mateHighlights.edges} scene={displayScene} disabled={busy} view={view} selectedPath={preview ? [] : bomSelectedPath.length ? bomSelectedPath : selected ? [...selectedScope.path, selected.id] : []} pickingFaces={!blocked && matePick?.kind === 'face'} pickingEdges={!blocked && matePick?.kind === 'edge'} onFace={pickMate} onEdge={pickMate} onComponent={component => {
        if (!fresh(renderedTicket) || operation.current || pending.current || mateDraftRef.current || !scene || !configuredUiSceneMatches(scene, current.current, epoch.current)) return
        const id = configuredComponentPick(displayScene, component, selectedScope.path)
        if (!id || !selectedScope.occurrences.some(row => row.id === id && !row.suppressed)) return
        occurrenceRef.current = id; setOccurrenceId(id); setBomSelection(null); setMessage('Componente seleccionado en el ámbito actual.')
      }} /></div>
      {preview && <p role="status">Vista previa verificada · todavía sin aplicar. {preview.states.length} estados resueltos; {preview.verification.reports.length} relaciones comprobadas.</p>}
      {scene && <p aria-label="Totales de configuración">{scene.scene.solidCount} sólidos · {scene.scene.volume.toFixed(3)} mm³ · {scene.scene.area.toFixed(3)} mm²</p>}
      <p className="configured-assembly-limit">Edición de estados y relaciones con captura mecánica verificada, variantes y lista de materiales CSV. La reparación de orígenes, la exportación de geometría y el movimiento interactivo aún no están disponibles en esta vista.</p>
    </main></div>{bomOpen && <ConfiguredAssemblyBomPanel report={bom.report} error={bom.error} options={bomOptions} disabled={blocked || !!mateDraft} selectedPath={bomSelectedPath}
      rootConfigurationLabel={document.rootConfiguration === null ? 'Base' : `${rootVariants.find(value => value.id === document.rootConfiguration)?.name ?? document.rootConfiguration} · ${JSON.stringify(document.rootConfiguration)}`}
      scopes={evaluation.scopes.map(value => ({ path: value.path, label: `${value.path.join(' / ') || 'Todo el ensamblaje'} · ${value.configuration ?? 'Base'}` }))}
      onOptionsChange={options => { if (!freshBom(renderedBomTicket) || operation.current || pending.current || mateDraftRef.current) return; changeBomView(true, options) }}
      onSelect={member => { if (!freshBom(renderedBomTicket) || operation.current || pending.current || mateDraftRef.current || !bom.report) return; const match = configuredBomUiSelectedPath(bom.report, serialized, { serialized, member }); if (match.length) setBomSelection({ serialized, member: structuredClone(member) }) }}
      onExport={() => void exportBom()} onClose={() => changeBomView(false)} />}{failure && <p className="configured-assembly-error" role="alert">{failure}</p>}<footer role="status">{message}</footer>
    {discardDialog && <div ref={dialog} role="dialog" aria-modal="true" aria-label="Cambios del ensamblaje configurado"><p>Hay cambios sin guardar. ¿Abrir otro documento?</p><button onClick={() => { if (!fresh(renderedTicket)) return; const resolve = answer.current; answer.current = null; setDiscardDialog(false); resolve?.(false) }}>Cancelar apertura</button><button onClick={() => { if (!fresh(renderedTicket)) return; const resolve = answer.current; answer.current = null; setDiscardDialog(false); resolve?.(true) }}>Continuar sin guardar</button></div>}
  </div>
}
