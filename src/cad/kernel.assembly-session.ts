import { assemblyDefinitionKey, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyComponentReference, type AssemblyDefinitionReference, type AssemblyDocument, type AssemblySourceLink } from '../model/assemblyDocument'
import type { Document } from '../model/document'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { createAssemblyRootRevision } from '../model/assemblyRevisions'
import { applyAssemblySolvePreview, assertAssemblyGearSourceContinuity, assertUnavailableAssemblyGearCoordinates, captureAssemblyComponentLock, captureAssemblyConcentricRotationLock, captureAssemblyGearPreview, captureAssemblyScrewPreview, captureAssemblyRackPinionPreview,
  discardAssemblySolvePreview, prepareAssemblyDragPreview, prepareAssemblyMovePreview, prepareAssemblyMotionPreview, prepareAssemblyWorldMovePreview, prepareAssemblyTranslationPreview, prepareAssemblySolve, type AssemblySolveOptions, type AssemblySolvePreview } from './kernel.assembly-solve'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { withAssemblyGeometryReuse } from './kernel.assembly-snapshot'
import type { AssemblyAppliedReply, AssemblyGearCaptureRequest, AssemblyScrewCaptureRequest, AssemblyRackPinionCaptureRequest, AssemblyKernelRequest, AssemblyPreviewReply, AssemblyScene } from './kernel.assembly-types'
import { reviewAssemblyPartSourceUpdate, prepareAssemblyPartSourceProposal, type AssemblySourceUpdateReview } from './kernel.assembly-source-updates'
import { analyzeAssemblyInterference } from './kernel.assembly-interference'
import type { AssemblyInterferenceReport } from '../model/assemblyInterference'
import type { AssemblyComponentMove } from '../model/assemblyMovement'
import type { AssemblyComponentMotion } from '../model/assemblyMotion'
import type { AssemblyWorldComponentMove } from '../model/assemblyDrag'
import type { AssemblyComponentDrag } from '../model/assemblyProjectionIntent'
import type { AssemblyTranslationRequest, AssemblyTranslationStopOptions } from '../model/assemblyTranslation'
import type { AssemblyPartReplacementRequest, AssemblyPartReplacementPlan } from '../model/assemblyReplacement'
import { reviewAssemblyReplacement, prepareAssemblyReplacementDecisions, replacementScope,
  type AssemblyReplacementReview, type AssemblyReplacementDecisions } from './kernel.assembly-replacement'
import { reviewAssemblyDocumentSourceUpdate, prepareAssemblyDocumentUpdateDecisions } from './kernel.assembly-document-updates'
import type { AssemblyDocumentUpdateReview, AssemblyDocumentUpdateDecisions } from './kernel.assembly-document-update-types'
import type { AssemblyDocumentUpdatePlan } from '../model/assemblySubassemblyUpdates'

type Mutable<T> = T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T
const copy = <T>(value: T): Mutable<T> => structuredClone(value) as Mutable<T>
interface PendingPreview {
  token: string
  base: string
  proposed: AssemblyDocument
  native: AssemblySolvePreview
  options: AssemblySolveOptions
  replacementReviewId?: string
  documentUpdateReviewId?: string
  partUpdateReviewId?: string
}
function assertScrewProposal(base: AssemblyDocument, proposal: AssemblyDocument): void {
  const nodes = (document: AssemblyDocument) => [document, ...document.definitions.filter(value => value.kind === 'assembly')]
  const previous = new Map(nodes(base).flatMap(scope => scope.kind === 'assembly' ? scope.mates.filter(mate => mate.type === 'screw')
    .map(mate => [JSON.stringify([assemblyDefinitionKey(scope), mate.id]), mate] as const) : []))
  for (const scope of nodes(proposal)) if (scope.kind === 'assembly') for (const mate of scope.mates) if (mate.type === 'screw') {
    const original = previous.get(JSON.stringify([assemblyDefinitionKey(scope), mate.id]))
    if (!original || original.type !== 'screw') throw new Error('Utiliza la captura nativa para crear una relación de tornillo.')
    if (JSON.stringify(original.neutralRotation) !== JSON.stringify(mate.neutralRotation) || original.angle !== mate.angle
      || original.neutralTravel !== mate.neutralTravel) throw new Error('El estado angular y el origen del tornillo pertenecen al worker.')
    for (const side of ['first', 'second'] as const) if (original[side].component.definition.id !== mate[side].component.definition.id
      || JSON.stringify(original[side].component.occurrencePath) !== JSON.stringify(mate[side].component.occurrencePath)) {
      throw new Error('Cambiar los componentes del tornillo necesita una nueva captura nativa.')
    }
    if (original.alignment !== mate.alignment) throw new Error('Cambiar la alineación del tornillo necesita una nueva captura nativa.')
  }
}
function assertRackPinionProposal(base: AssemblyDocument, proposal: AssemblyDocument): void {
  const nodes = (document: AssemblyDocument) => [document, ...document.definitions.filter(value => value.kind === 'assembly')]
  const previous = new Map(nodes(base).flatMap(scope => scope.kind === 'assembly' ? scope.mates.filter(mate => mate.type === 'rack-pinion')
    .map(mate => [JSON.stringify([assemblyDefinitionKey(scope), mate.id]), mate] as const) : []))
  for (const scope of nodes(proposal)) if (scope.kind === 'assembly') for (const mate of scope.mates) if (mate.type === 'rack-pinion') {
    const original = previous.get(JSON.stringify([assemblyDefinitionKey(scope), mate.id]))
    if (!original || original.type !== 'rack-pinion') throw new Error('Utiliza la captura nativa para crear una relación de cremallera y piñón.')
    if (JSON.stringify(original.neutralRotation) !== JSON.stringify(mate.neutralRotation) || original.angle !== mate.angle || original.neutralTravel !== mate.neutralTravel) {
      throw new Error('El estado angular y el origen de la cremallera pertenecen al worker.')
    }
    for (const side of ['first', 'second'] as const) if (original[side].component.definition.id !== mate[side].component.definition.id
      || JSON.stringify(original[side].component.occurrencePath) !== JSON.stringify(mate[side].component.occurrencePath)) throw new Error('Cambiar los componentes de la cremallera necesita una nueva captura nativa.')
  }
}
/** Renderer edits may change intention, never manufacture native zero/lift data. */
function assertGearProposal(base: AssemblyDocument, proposal: AssemblyDocument): void {
  const nodes = (document: AssemblyDocument) => [document, ...document.definitions.filter(value => value.kind === 'assembly')]
  const previous = new Map(nodes(base).flatMap(scope => scope.kind === 'assembly' ? scope.mates.filter(mate => mate.type === 'gear')
    .map(mate => [JSON.stringify([assemblyDefinitionKey(scope), mate.id]), mate] as const) : []))
  for (const scope of nodes(proposal)) if (scope.kind === 'assembly') for (const mate of scope.mates) if (mate.type === 'gear') {
    const original = previous.get(JSON.stringify([assemblyDefinitionKey(scope), mate.id]))
    if (!original) throw new Error('Utiliza la captura nativa para crear una relación de engranaje.')
    if (original.type !== 'gear' || JSON.stringify(original.neutralRotations) !== JSON.stringify(mate.neutralRotations)
      || JSON.stringify(original.angles) !== JSON.stringify(mate.angles)) throw new Error('El estado angular y los ceros del engranaje pertenecen al worker; vuelve a capturar o resolver.')
    const sameComponent = (first: AssemblyComponentReference | null, second: AssemblyComponentReference | null) => first === null ? second === null
      : second !== null && first.definition.id === second.definition.id && JSON.stringify(first.occurrencePath) === JSON.stringify(second.occurrencePath)
    if (!sameComponent(original.first.component, mate.first.component) || !sameComponent(original.second.component, mate.second.component)
      || !sameComponent(original.carrier, mate.carrier)) throw new Error('Cambiar los componentes o el portador del engranaje necesita una nueva captura nativa.')
  }
}
/** One bounded worker-owned capability; native object identities never cross RPC. */
export class AssemblyWorkerSession {
  #preview: PendingPreview | null = null
  #replacement: { base: string; plan: AssemblyPartReplacementPlan; review: AssemblyReplacementReview } | null = null
  #documentUpdate: { base: string; plan: AssemblyDocumentUpdatePlan; catalog: AssemblyDocument; review: AssemblyDocumentUpdateReview } | null = null
  #partUpdate: { base: string; review: AssemblySourceUpdateReview } | null = null
  #clearPreview(): void {
    if (this.#preview) discardAssemblySolvePreview(this.#preview.native)
    this.#preview = null
  }
  discard(token?: string): void {
    if (token !== undefined) {
      if (token === this.#preview?.token) this.#clearPreview()
      return
    }
    this.#replacement = null; this.#documentUpdate = null; this.#partUpdate = null; this.#clearPreview()
  }
  discardPartUpdate(reviewId?: string): void {
    const stage = this.#partUpdate
    if (!stage || reviewId !== undefined && reviewId !== stage.review.reviewId) return
    if (this.#preview?.partUpdateReviewId === stage.review.reviewId) this.#clearPreview()
    this.#partUpdate = null
  }
  reviewPartUpdate(current: AssemblyDocument, source: AssemblyDefinitionReference, part: Document, revision: string,
    sourceLink?: AssemblySourceLink): AssemblySourceUpdateReview {
    this.discard()
    const base = validateAssemblyDocument(current), review = reviewAssemblyPartSourceUpdate(base, source, part, revision, sourceLink)
    review.reviewId = crypto.randomUUID()
    this.#partUpdate = { base: JSON.stringify(base), review }
    return copy(review)
  }
  previewPartUpdate(current: AssemblyDocument, reviewId: string, proposed: AssemblyDocument): AssemblyPreviewReply {
    const stage = this.#partUpdate
    if (!stage || typeof reviewId !== 'string' || reviewId !== stage.review.reviewId) throw Error('La revisión de pieza ya no está disponible.')
    this.#clearPreview()
    let base: AssemblyDocument
    try {
      base = validateAssemblyDocument(current)
      if (JSON.stringify(base) !== stage.base) throw Error('El documento cambió; vuelve a revisar la pieza.')
    } catch (error) { this.discardPartUpdate(); throw error }
    const proposal = prepareAssemblyPartSourceProposal(stage.review, proposed)
    assertGearProposal(base, proposal); assertScrewProposal(base, proposal); assertRackPinionProposal(base, proposal)
    assertUnavailableAssemblyGearCoordinates(base, proposal); assertAssemblyGearSourceContinuity(base, proposal)
    return this.#publish(base, proposal, prepareAssemblySolve(proposal), {}, undefined, undefined, reviewId)
  }
  discardReplacement(reviewId?: string): void {
    if (!this.#replacement || reviewId !== undefined && reviewId !== this.#replacement.review.reviewId) return
    if (this.#preview?.replacementReviewId === this.#replacement.review.reviewId) this.#clearPreview()
    this.#replacement = null
  }
  discardDocumentUpdate(reviewId?: string): void {
    const stage = this.#documentUpdate
    if (!stage || reviewId !== undefined && reviewId !== stage.review.reviewId) return
    if (this.#preview?.documentUpdateReviewId === stage.review.reviewId) this.#clearPreview()
    this.#documentUpdate = null
  }
  reviewDocumentUpdate(current: AssemblyDocument, source: AssemblyDefinitionReference, incoming: AssemblyDocument, sourceLink?: AssemblySourceLink): AssemblyDocumentUpdateReview {
    this.discard()
    const base = validateAssemblyDocument(current), prepared = reviewAssemblyDocumentSourceUpdate(base, source, incoming, sourceLink)
    this.#documentUpdate = { base: JSON.stringify(base), ...prepared }
    return copy(prepared.review)
  }
  previewDocumentUpdate(current: AssemblyDocument, reviewId: string, decisions: AssemblyDocumentUpdateDecisions): AssemblyPreviewReply {
    const stage = this.#documentUpdate
    if (!stage || typeof reviewId !== 'string' || reviewId !== stage.review.reviewId) throw new Error('La revisión del subensamblaje ya no está disponible.')
    this.#clearPreview()
    let base: AssemblyDocument
    try {
      base = validateAssemblyDocument(current)
      if (JSON.stringify(base) !== stage.base) throw new Error('El documento cambió; vuelve a revisar el subensamblaje.')
    } catch (error) { this.discardDocumentUpdate(); throw error }
    const prepared = prepareAssemblyDocumentUpdateDecisions(stage.plan, stage.catalog, stage.review, decisions)
    // The imported declarations and all authorized writes are retained privately.
    // The renderer supplies decisions, never a candidate document or captured zero.
    assertGearProposal(prepared.baseline, prepared.proposal)
    assertScrewProposal(prepared.baseline, prepared.proposal)
    assertRackPinionProposal(prepared.baseline, prepared.proposal)
    assertUnavailableAssemblyGearCoordinates(prepared.baseline, prepared.proposal)
    assertAssemblyGearSourceContinuity(prepared.baseline, prepared.proposal)
    let proposal = prepared.proposal, native = prepareAssemblySolve(proposal)
    try {
      for (const item of prepared.recapture) {
        if (native.status !== 'ready') return { kind: 'assembly-preview', ...native }
        const mate = item.mate, scope = item.locator.scope
        const captured = mate.type === 'concentric' ? captureAssemblyConcentricRotationLock(native, proposal, mate.id, scope)
          : mate.type === 'lock' ? captureAssemblyComponentLock(native, proposal, mate.first, mate.second, scope)
            : mate.type === 'gear' ? captureAssemblyGearPreview(native, proposal, { first: mate.first, second: mate.second, carrier: mate.carrier,
              ratio: mate.ratio, direction: mate.direction, name: mate.name, phase: mate.phase }, scope)
              : mate.type === 'screw' ? captureAssemblyScrewPreview(native, proposal, { first: mate.first, second: mate.second,
                lead: mate.lead, reverse: mate.reverse, alignment: mate.alignment, name: mate.name }, scope)
                : captureAssemblyRackPinionPreview(native, proposal, { first: mate.first, second: mate.second, conversion: mate.conversion,
                  reverse: mate.reverse, name: mate.name }, scope)
        const node = replacementScope(captured, scope), capturedMate = mate.type === 'concentric' ? node.mates.find(value => value.id === mate.id)! : node.mates.at(-1)!
        if (!capturedMate || capturedMate.type !== mate.type) throw new Error('La recaptura no produjo la familia solicitada.')
        capturedMate.id = mate.id; capturedMate.name = mate.name; capturedMate.suppressed = mate.suppressed
        discardAssemblySolvePreview(native)
        proposal = validateAssemblyDocument(captured); serializeAssemblyDocument(proposal); native = prepareAssemblySolve(proposal)
      }
      if (native.status === 'ready') serializeAssemblyDocument(validateAssemblyDocument(native.document))
      return this.#publish(base, proposal, native, {}, undefined, stage.review.reviewId)
    } catch (error) { this.#clearPreview(); throw error }
    finally {
      if (native.status === 'ready' && this.#preview?.native !== native) discardAssemblySolvePreview(native)
    }
  }
  reviewReplacement(current: AssemblyDocument, request: AssemblyPartReplacementRequest): AssemblyReplacementReview {
    this.discard()
    const base = validateAssemblyDocument(current), prepared = reviewAssemblyReplacement(base, request)
    this.#replacement = { base: JSON.stringify(base), plan: prepared.plan, review: prepared.review }
    return copy(prepared.review)
  }
  previewReplacement(current: AssemblyDocument, reviewId: string, decisions: AssemblyReplacementDecisions): AssemblyPreviewReply {
    const stage = this.#replacement
    if (!stage || typeof reviewId !== 'string' || reviewId !== stage.review.reviewId) {
      throw new Error('La revisión de sustitución ya no está disponible.')
    }
    this.#clearPreview()
    let base: AssemblyDocument
    try {
      base = validateAssemblyDocument(current)
      if (JSON.stringify(base) !== stage.base) throw new Error('El documento cambió; vuelve a revisar la sustitución.')
    } catch (error) { this.discardReplacement(); throw error }
    const prepared = prepareAssemblyReplacementDecisions(stage.plan, stage.review, decisions)
    // The comparison layout is generated by this worker from the original
    // request. Renderer proposals cannot claim COW identity or captured zeros.
    assertGearProposal(prepared.baseline, prepared.proposal)
    assertScrewProposal(prepared.baseline, prepared.proposal)
    assertRackPinionProposal(prepared.baseline, prepared.proposal)
    assertUnavailableAssemblyGearCoordinates(prepared.baseline, prepared.proposal)
    assertAssemblyGearSourceContinuity(prepared.baseline, prepared.proposal)
    let proposal = prepared.proposal, native = prepareAssemblySolve(proposal)
    try {
      for (const item of prepared.recapture) {
        if (native.status !== 'ready') return { kind: 'assembly-preview', ...native }
        const mate = item.mate, scope = item.locator.scope
        const captured = mate.type === 'gear' ? captureAssemblyGearPreview(native, proposal, {
          first: mate.first, second: mate.second, carrier: mate.carrier, ratio: mate.ratio, direction: mate.direction, name: mate.name, phase: mate.phase }, scope)
          : mate.type === 'screw' ? captureAssemblyScrewPreview(native, proposal, { first: mate.first, second: mate.second,
            lead: mate.lead, reverse: mate.reverse, alignment: mate.alignment, name: mate.name }, scope)
            : captureAssemblyRackPinionPreview(native, proposal, { first: mate.first, second: mate.second, conversion: mate.conversion,
              reverse: mate.reverse, name: mate.name }, scope)
        const capturedMate = replacementScope(captured, scope).mates.at(-1)!
        if (capturedMate.type !== mate.type) throw new Error('La recaptura no produjo la familia mecánica solicitada.')
        capturedMate.id = mate.id; capturedMate.suppressed = mate.suppressed
        discardAssemblySolvePreview(native)
        proposal = validateAssemblyDocument(captured); native = prepareAssemblySolve(proposal)
      }
      const result = this.#publish(base, proposal, native, {}, stage.review.reviewId)
      // #publish takes ownership only after it stores the authenticated preview.
      if (result.status === 'ready') return result
      return result
    } catch (error) {
      this.#clearPreview(); throw error
    } finally {
      if (native.status === 'ready' && this.#preview?.native !== native) discardAssemblySolvePreview(native)
    }
  }
  #current(current: AssemblyDocument, token: string): PendingPreview {
    const preview = this.#preview
    if (!preview || typeof token !== 'string' || token !== preview.token) throw new Error('La vista previa ya no está disponible; vuelve a resolver el ensamblaje.')
    try { if (JSON.stringify(validateAssemblyDocument(current)) !== preview.base) throw new Error('El documento cambió; vuelve a resolver antes de aplicar.') }
    catch (error) { this.discard(); throw error }
    return preview
  }
  build(document: AssemblyDocument): AssemblyScene {
    this.discard()
    return buildAssemblyScene(document)
  }
  prepare(current: AssemblyDocument, proposed: AssemblyDocument = current, options: AssemblySolveOptions = {}): AssemblyPreviewReply {
    this.discard()
    const base = validateAssemblyDocument(current), proposal = validateAssemblyDocument(proposed)
    assertGearProposal(base, proposal)
    assertScrewProposal(base, proposal)
    assertRackPinionProposal(base, proposal)
    let native: ReturnType<typeof prepareAssemblySolve> | undefined
    try {
      const prepared = withAssemblyGeometryReuse(proposal, (snapshots, parts) => {
        assertUnavailableAssemblyGearCoordinates(base, proposal, snapshots)
        assertAssemblyGearSourceContinuity(base, proposal, options, snapshots)
        native = prepareAssemblySolve(proposal, options, snapshots)
        return { native, scene: native.status === 'ready' ? buildAssemblyScene(validateAssemblyDocument(native.document), parts) : undefined }
      })
      // The shared owner has closed successfully. No token is stored while
      // construction, placed validation or final native cleanup can still fail.
      return this.#publish(base, proposal, prepared.native, options, undefined, undefined, undefined, prepared.scene)
    } catch (error) {
      if (native?.status === 'ready') discardAssemblySolvePreview(native)
      throw error
    }
  }
  /** Revision authoring cannot accept a renderer proposal. Only this exact
   * detached identity rewrite may retain existing native capture declarations;
   * ordinary proposal guards correctly reject relabelled mechanical scopes.
   * Current native geometry and every active mate still require a fresh Solve. */
  previewRootRevision(current: AssemblyDocument, revision: string): AssemblyPreviewReply {
    this.discard()
    const base = validateAssemblyDocument(current), proposal = createAssemblyRootRevision(base, revision)
    const native = prepareAssemblySolve(proposal)
    if (native.status === 'ready') {
      try {
        if (serializeAssemblyDocument(validateAssemblyDocument(native.document)) !== serializeAssemblyDocument(proposal)) {
          const scopes = copy(native.scopes)
          discardAssemblySolvePreview(native)
          return {kind:'assembly-preview',status:'rejected',reason:'verification',scopes,
            message:'Resuelve y aplica primero el ensamblaje antes de crear una revisión. La revisión no puede cambiar posiciones ni capturas.'}
        }
      } catch (error) {discardAssemblySolvePreview(native);throw error}
    }
    return this.#publish(base, proposal, native, {})
  }
  #prepare(base: AssemblyDocument, proposal: AssemblyDocument, options: AssemblySolveOptions): AssemblyPreviewReply {
    this.discard()
    const native = prepareAssemblySolve(proposal, options)
    return this.#publish(base, proposal, native, options)
  }
  move(current: AssemblyDocument, move: AssemblyComponentMove, options: AssemblySolveOptions = {}): AssemblyPreviewReply {
    this.discard()
    const base = validateAssemblyDocument(current), native = prepareAssemblyMovePreview(base, move, options)
    // Movement authority authenticates the original base; the target is intent,
    // and the temporary solve anchor is never a saved flag or mate declaration.
    return this.#publish(base, base, native, options)
  }
  moveWorld(current: AssemblyDocument, move: AssemblyWorldComponentMove, options: AssemblySolveOptions = {}): AssemblyPreviewReply {
    this.discard()
    const base = validateAssemblyDocument(current), native = prepareAssemblyWorldMovePreview(base, move, options)
    return this.#publish(base, base, native, options)
  }
  moveMotion(current: AssemblyDocument, motion: AssemblyComponentMotion, options: AssemblySolveOptions = {}): AssemblyPreviewReply {
    this.discard()
    const base = validateAssemblyDocument(current), native = prepareAssemblyMotionPreview(base, motion, options)
    return this.#publish(base, base, native, options)
  }
  project(current: AssemblyDocument, drag: AssemblyComponentDrag, options: AssemblySolveOptions = {}): AssemblyPreviewReply {
    this.discard()
    const base = validateAssemblyDocument(current), native = prepareAssemblyDragPreview(base, drag, options)
    return this.#publish(base, base, native, options)
  }
  translateUntilContact(current: AssemblyDocument, translation: AssemblyTranslationRequest,
    stopOptions?: Partial<AssemblyTranslationStopOptions>, options: AssemblySolveOptions = {}): AssemblyPreviewReply {
    this.discard()
    const base = validateAssemblyDocument(current), native = prepareAssemblyTranslationPreview(base, translation, stopOptions, options)
    return this.#publish(base, base, native, options)
  }
  #publish(base: AssemblyDocument, proposal: AssemblyDocument, native: ReturnType<typeof prepareAssemblySolve>, options: AssemblySolveOptions, replacementReviewId?: string, documentUpdateReviewId?: string, partUpdateReviewId?: string, preparedScene?: AssemblyScene): AssemblyPreviewReply {
    if (native.status === 'rejected') return { kind: 'assembly-preview', ...native }
    try {
      const document = validateAssemblyDocument(native.document), scene = preparedScene ?? buildAssemblyScene(document), token = crypto.randomUUID()
      const pending: PendingPreview = { token, base: JSON.stringify(base), proposed: proposal, native, options: copy(options),
        ...(replacementReviewId === undefined ? {} : { replacementReviewId }),
        ...(documentUpdateReviewId === undefined ? {} : { documentUpdateReviewId }),
        ...(partUpdateReviewId === undefined ? {} : { partUpdateReviewId }) }
      const reply: AssemblyPreviewReply = { kind: 'assembly-preview', status: 'ready', token, document, scene, scopes: copy(native.scopes), checks: copy(native.checks),
        ...(native.tangencies ? { tangencies: copy(native.tangencies) } : {}),
        ...(native.cylinderTangencies ? { cylinderTangencies: copy(native.cylinderTangencies) } : {}),
        ...(native.sphericalTangencies ? { sphericalTangencies: copy(native.sphericalTangencies) } : {}),
        ...(native.limitDistances ? { limitDistances: copy(native.limitDistances) } : {}),
        ...(native.limitAngles ? { limitAngles: copy(native.limitAngles) } : {}),
        ...(native.limitDirectedAngles ? { limitDirectedAngles: copy(native.limitDirectedAngles) } : {}),
        ...(native.widthCentered ? { widthCentered: copy(native.widthCentered) } : {}),
        ...(native.symmetries ? { symmetries: copy(native.symmetries) } : {}),
        ...(native.profileCenters ? { profileCenters: copy(native.profileCenters) } : {}),
        ...(native.linePaths ? { linePaths: copy(native.linePaths) } : {}),
        ...(native.hinges ? { hinges: copy(native.hinges) } : {}),
        ...(native.circularPaths ? { circularPaths: copy(native.circularPaths) } : {}),
        ...(native.movement ? { movement: copy(native.movement) } : {}), ...(native.projection ? { projection: copy(native.projection) } : {}),
        ...(native.motion ? { motion: copy(native.motion) } : {}),
        ...(native.translation ? { translation: copy(native.translation) } : {}) }
      this.#preview = pending
      return reply
    } catch (error) { discardAssemblySolvePreview(native); throw error }
  }
  apply(current: AssemblyDocument, token: string): AssemblyAppliedReply {
    const pending = this.#current(current, token)
    // This private history contains the proposal authenticated by the native
    // capability. The renderer's committed base changes only after RPC success.
    try {
      const document = applyAssemblySolvePreview(new AssemblyDocumentHistory(pending.proposed), pending.native)
      const scene = buildAssemblyScene(document)
      return { kind: 'assembly-applied', document, scene }
    } finally { this.discard() }
  }
  captureRotation(current: AssemblyDocument, token: string, mateId: string, scope?: AssemblyDefinitionReference): AssemblyPreviewReply {
    const pending = this.#current(current, token)
    const locked = captureAssemblyConcentricRotationLock(pending.native, pending.proposed, mateId, scope)
    return this.#prepare(validateAssemblyDocument(current), locked, pending.options)
  }
  captureComponents(current: AssemblyDocument, token: string, first: AssemblyComponentReference, second: AssemblyComponentReference,
    scope?: AssemblyDefinitionReference): AssemblyPreviewReply {
    const pending = this.#current(current, token)
    const locked = captureAssemblyComponentLock(pending.native, pending.proposed, first, second, scope)
    return this.#prepare(validateAssemblyDocument(current), locked, pending.options)
  }
  captureGear(current: AssemblyDocument, token: string, request: AssemblyGearCaptureRequest, scope?: AssemblyDefinitionReference): AssemblyPreviewReply {
    const pending = this.#current(current, token)
    try {
      const captured = captureAssemblyGearPreview(pending.native, pending.proposed, request, scope)
      return this.#prepare(validateAssemblyDocument(current), captured, pending.options)
    } catch (error) { this.discard(); throw error }
  }
  captureScrew(current: AssemblyDocument, token: string, request: AssemblyScrewCaptureRequest, scope?: AssemblyDefinitionReference): AssemblyPreviewReply {
    const pending = this.#current(current, token), base = validateAssemblyDocument(current)
    try {
      const captured = captureAssemblyScrewPreview(pending.native, pending.proposed, request, scope)
      return this.#prepare(base, captured, pending.options)
    } catch (error) { this.discard(); throw error }
  }
  captureRackPinion(current: AssemblyDocument, token: string, request: AssemblyRackPinionCaptureRequest, scope?: AssemblyDefinitionReference): AssemblyPreviewReply {
    const pending = this.#current(current, token), base = validateAssemblyDocument(current)
    try {
      const captured = captureAssemblyRackPinionPreview(pending.native, pending.proposed, request, scope)
      return this.#prepare(base, captured, pending.options)
    } catch (error) { this.discard(); throw error }
  }
  handle(request: AssemblyKernelRequest): AssemblyScene | AssemblyPreviewReply | AssemblyAppliedReply | AssemblySourceUpdateReview | AssemblyReplacementReview | AssemblyDocumentUpdateReview | AssemblyInterferenceReport | null {
    switch (request.action) {
      case 'build-assembly': return this.build(request.document)
      case 'inspect-assembly-interferences':
        this.discard()
        return analyzeAssemblyInterference(request.current, request.options)
      case 'review-assembly-part-update': return this.reviewPartUpdate(request.current, request.source, request.part, request.revision, request.sourceLink)
      case 'preview-assembly-part-update': return this.previewPartUpdate(request.current, request.reviewId, request.proposed)
      case 'discard-assembly-part-update': this.discardPartUpdate(request.reviewId); return null
      case 'review-assembly-part-replacement': return this.reviewReplacement(request.current, request.request)
      case 'preview-assembly-part-replacement': return this.previewReplacement(request.current, request.reviewId, request.decisions)
      case 'discard-assembly-part-replacement': this.discardReplacement(request.reviewId); return null
      case 'review-assembly-document-update': return this.reviewDocumentUpdate(request.current, request.source, request.incoming, request.sourceLink)
      case 'preview-assembly-document-update': return this.previewDocumentUpdate(request.current, request.reviewId, request.decisions)
      case 'discard-assembly-document-update': this.discardDocumentUpdate(request.reviewId); return null
      case 'preview-assembly': return this.prepare(request.current, request.proposed, request.options)
      case 'preview-assembly-root-revision': return this.previewRootRevision(request.current, request.revision)
      case 'move-assembly-component': return this.move(request.current, request.move, request.options)
      case 'move-assembly-component-motion': return this.moveMotion(request.current, request.motion, request.options)
      case 'move-assembly-world-component': return this.moveWorld(request.current, request.move, request.options)
      case 'project-assembly-component': return this.project(request.current, request.drag, request.options)
      case 'translate-assembly-until-contact': return this.translateUntilContact(request.current, request.translation, request.stopOptions, request.options)
      case 'apply-assembly': return this.apply(request.current, request.token)
      case 'discard-assembly': this.discard(request.token); return null
      case 'lock-assembly-rotation': return this.captureRotation(request.current, request.token, request.mateId, request.scope)
      case 'lock-assembly-components': return this.captureComponents(request.current, request.token, request.first, request.second, request.scope)
      case 'capture-assembly-gear': return this.captureGear(request.current, request.token, request.request, request.scope)
      case 'capture-assembly-screw': return this.captureScrew(request.current, request.token, request.request, request.scope)
      case 'capture-assembly-rack-pinion': return this.captureRackPinion(request.current, request.token, request.request, request.scope)
      default: throw new Error('Solicitud de ensamblaje no admitida.')
    }
  }
}
