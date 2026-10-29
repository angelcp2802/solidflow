import { useViewHistory } from './useViewHistory'
import { NamedViewsDialog } from './NamedViewsDialog'
import { rebindNamedViewSelection, sameDocumentExceptNamedViews, useNamedDocumentViews } from './useNamedDocumentViews'
import { standardViews, type ViewName, type ViewRequest } from './viewNavigation'
import { assemblyNormalSelectionOrComponent, nominateAssemblyNormalFace, nominateAssemblyNormalOrigin, nominateAssemblyNormalUnsupported, resolveAssemblyNormalSelection, type AssemblyNormalSelection } from './assemblyNormalTo'
import { nominateAssemblyBrowseEdge, resolveAssemblyRelationSelection } from './assemblyBrowseSelection'
import { assemblyRelationDefault, isAssemblyOrdinaryCreationType } from './assemblyRelationDefaults'
import { ViewOrientationControls } from './ViewOrientationControls'
import { requestNewDocument, useNewDocumentDialog } from './useNewDocumentDialog'
import { CompactViewportToolbar, ViewportToolGroup, ViewportToolIcon } from './CompactViewportToolbar'
import { createAssemblyActivity } from './assemblyActivity'
import { retainAssemblyDistanceEdit, resolveAssemblyDistanceEdit, assemblyDistanceUiEdit, type AssemblyDistanceEditTicket, type AssemblyDistanceMate } from './assemblyDistanceEdit'
import { retainAssemblyAngleEdit, resolveAssemblyAngleEdit, assemblyAngleUiEdit, type AssemblyAngleEditTicket, type AssemblyAngleMate } from './assemblyAngleEdit'
import { retainOrdinaryMateEdit, resolveOrdinaryMateEdit, assemblyOrdinaryMateUiEdit, type OrdinaryMateEditTicket, type AssemblyOrdinaryMate } from './assemblyOrdinaryMateEdit'
import CadContextMenu, { type CadContextAction } from './CadContextMenu'
import { assemblyTreeRows, createAssemblyComponentContextTarget, resolveAssemblyComponentContextTarget, resolveAssemblyOriginContextEntry, type AssemblyTreeRow, type AssemblyComponentContextTarget } from './assemblyContextTarget'
import { assemblyReferenceCardLabel } from './assemblyReferenceCardLabel'
export { assemblyTreeRows, type AssemblyTreeRow } from './assemblyContextTarget'
import { insertAssemblyStepFile } from '../model/assemblyStepInsertion'
import { importStructuralStep } from '../model/structuralStepImport'
import { MAX_STEP_BYTES } from '../model/stepSource'
import type { StepFile } from '../model/stepImport'
import { AssemblyHingeMatePanel, AssemblyHingeSupportSummary, assemblyHingeUiProposal, sameHingeReference, HINGE_ROLE_LABELS, type HingeUiReferences, type HingeUiReference, type HingeUiSlot } from './AssemblyHingeMatePanel'
import { assemblyHingeChoices } from './assemblyHingeChoices'
import { liveHingeTicketIsCurrent, currentHingePick, renderedHingePick, nextHingePick, type HingePickTicket, type HingeUiTicket } from './assemblyHingePicking'
import AssemblyCircularPathMatePanel, { assemblyCircularPathUiProposal, AssemblyCircularPathSupportSummary, sameCircularPathPoint, sameCircularPathSelection } from './AssemblyCircularPathMatePanel'
import AssemblyLinkedSourcePanel from './AssemblyLinkedSourcePanel'
import AssemblyRootRevisionDialog from './AssemblyRootRevisionDialog'
import { assemblyRootRevisionTicket, assemblyRootRevisionTicketIsCurrent, assemblyRootRevisionReplyMatches } from './assemblyRootRevisionUi'
import { AssemblyLinkedSourceBindings, linkedSourceContentsEqual, linkedSourceDescriptor, linkedSourceTicketIsCurrent, linkedSourceBindingKey, linkedSourceFailureDisposition, releaseUnstagedLinkedRead, requireLinkedSourceUpdateRevision,
  type LinkedSourceRead, type LinkedSourceTicket } from './assemblyLinkedSources'
import { setAssemblySourceLink } from '../model/assemblySourceLinks'
import { assemblyCircularPathCatalogChoices } from '../cad/kernel.assembly-document-update-types'
import AssemblyLinePathMatePanel, { AssemblyLinePathSupportSummary, assemblyLinePathUiChoices, linePathOrigins, sameLinePathGuide, type assemblyLinePathUiProposal } from './AssemblyLinePathMatePanel'
import AssemblyProfileCenterMatePanel, { AssemblyProfileCenterSupportSummary, type ProfileFaceChoice, type ProfileEdgeChoice, type assemblyProfileCenterUiProposal } from './AssemblyProfileCenterMatePanel'
import { validateAssemblyProfileFaceSelection } from '../model/assemblyProfileReferences'
import { sameSymmetryReference, currentSymmetryPick, nextSymmetryPick, scopedAssemblySymmetryPick, symmetryPickForReference, symmetryPickProducer, type SymmetryPickTicket, type SymmetryPickSlot } from './assemblySymmetryPicking'
import {assemblySymmetryUiProposal,assemblySymmetryUiReports,SYMMETRY_ROLE_LABELS,type SymmetryUiReferences,type SymmetryUiReference,type SymmetryUiFamily} from '../model/assemblySymmetryUi'
import { AssemblyWidthMatePanel, AssemblyWidthSupportSummary, WIDTH_ROLE_LABELS, assemblyWidthUiReports, assemblyWidthUiProposal, type WidthUiReferences, type WidthUiSlot, type WidthUiBranch, type WidthPlaneChoice } from './AssemblyWidthMatePanel'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDownToLine, ChevronDown, ChevronRight, FileInput, GitBranch, Move3D, ScanLine, Settings2, Box, Check, CircleDot, Component, Eye, FilePlus2, FolderOpen, Layers, Link2, List, Loader2, LockKeyhole, Plus, Redo2, Save, SavePen, Trash2, Undo2, X } from 'lucide-react'
import { applyAssemblyPreview, buildAssembly, captureAssemblyComponentLock, captureAssemblyGear, captureAssemblyRotationLock, captureAssemblyScrew, captureAssemblyRackPinion, discardAssemblyPreview, discardAssemblyPartReplacement, exportAssemblyCad, exportAssemblyStep, importAssemblyStep, insertAssemblyStep, inspectAssemblyInterferences, measureAssemblyDirectedAngle, moveAssemblyComponentMotion, projectAssemblyDrag, previewAssembly, previewAssemblyRootRevision, previewAssemblyPartReplacement, reviewAssemblyPartUpdate, reviewAssemblyPartReplacement, translateAssemblyUntilContact } from '../cad/kernel'
import { assemblySceneFaceReference, assemblySceneCylinderSurfaceReference, assemblySceneSphereSurfaceReference, assemblySceneEdgeReference, type AssemblyGearCaptureRequest, type AssemblyScrewCaptureRequest, type AssemblyRackPinionCaptureRequest, type AssemblyPreviewReply, type AssemblyScene, type AssemblySceneFace, type AssemblySceneEdge, type AssemblySceneVertex } from '../cad/kernel.assembly-types'
import type { AssemblyScopeSolveReport } from '../cad/kernel.assembly-solve'
import { assemblyDefinitionKey, MAX_ASSEMBLY_BYTES, parseCadDocument, serializeAssemblyDocument, validateCadDocument, validateAssemblyDocument, validateAssemblyTangentReference, validateAssemblySphereTangentReference, validateAssemblyPlaneReference,
  type AssemblyAxisReference, type AssemblyComponentReference, type AssemblyDefinition, type AssemblyDefinitionReference, type AssemblyDocument,
  type AssemblyGeometryReference, type AssemblyTangentReference, type AssemblyCylinderSurfaceReference, type AssemblyCylinderTangentMate, type AssemblySphereTangentReference, type AssemblySphereTangentMate, type AssemblyLimitDistanceMate, type AssemblyLimitAngleMate, type AssemblyLimitDirectedAngleMate, type AssemblyMate, type AssemblyOccurrence, type AssemblyPlaneReference, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { applyAssemblyEdit, AssemblyDocumentHistory, type AssemblyEdit, type NewAssemblyMate } from '../model/assemblyEditing'
import { createDocument, validateDocument, type Document } from '../model/document'
import { insertAssemblyDocument } from '../model/assemblyImport'
import { identityRigidPose, type RigidPose } from '../model/rigidPose'
import type { Plane } from '../cad/kernel.types'
import { createAssemblyExample, createEmptyAssembly } from '../examples/assembly'
import { writeCadRecovery } from '../model/cadRecovery'
import { repairAssemblyEndpoint } from '../model/assemblySourceUpdates'
import type { AssemblySourceUpdateReview } from '../cad/kernel.assembly-source-updates'
import AssemblySourceUpdatePanel, { assemblySourceEndpointKey, assemblySourceRepairChoices, type AssemblySourceEndpointReview, type AssemblySourceRepairChoice } from './AssemblySourceUpdatePanel'
import AssemblyDocumentSourceUpdatePanel, { assemblyDocumentUpdatePending, type DocumentUpdateMateDecision } from './AssemblyDocumentSourceUpdatePanel'
import { assemblyDocumentUpdateChoices, assemblyDocumentUpdateEndpointKey, assemblyDocumentUpdateMateKey,
  type AssemblyDocumentUpdateReview, type AssemblyDocumentUpdateDecisions } from '../cad/kernel.assembly-document-update-types'
import { reviewAssemblyDocumentUpdate, previewAssemblyDocumentUpdate, discardAssemblyDocumentUpdate, previewAssemblyPartUpdate, discardAssemblyPartUpdate } from '../cad/kernel'
import AssemblyReplacementPanel, { assemblyReplacementChoices, assemblyReplacementPending, replacementEndpointKey, type AssemblyReplacementEndpoint, type AssemblyReplacementChoice } from './AssemblyReplacementPanel'
import type { AssemblyPartReplacementRequest } from '../model/assemblyReplacement'
import type { AssemblyReplacementDecisions, AssemblyReplacementReview } from '../cad/kernel.assembly-replacement'
import AssemblyInterferencePanel, { assemblyInterferenceUiOptions } from './AssemblyInterferencePanel'
import AssemblyDirectedAnglePanel, { assemblyDirectedAngleChoices, assemblyDirectedAngleReferenceKey, assemblyDirectedAngleUiRequest, assemblyDirectedAngleUiReport, assemblyDirectedAngleReplyIsCurrent, type AssemblyDirectedAngleSelection, type AssemblyDirectedAngleTicket } from './AssemblyDirectedAnglePanel'
import type { AssemblyDirectedAngleReport } from '../model/assemblyDirectedAngle'
import AssemblyBomPanel from './AssemblyBomPanel'
import AssemblyExportPanel from './AssemblyExportPanel'
import { canExportAssemblyGeometry, downloadAssemblyGeometry, runAssemblyGeometryExport, type AssemblyExportState, type AssemblyUiExportFormat } from './assemblyExport'
import AssemblyGearPanel, { assemblyGearUiEdit, type AssemblyGearUiFields, type AssemblyUiGearMate } from './AssemblyGearPanel'
import AssemblyScrewPanel, { assemblyScrewUiEdit, type AssemblyScrewUiFields, type AssemblyUiScrewMate } from './AssemblyScrewPanel'
import AssemblyRackPinionPanel, { assemblyRackPinionUiEdit, type AssemblyRackPinionUiFields, type AssemblyUiRackPinionMate } from './AssemblyRackPinionPanel'
import AssemblyDirectionMatePanel, { assemblyDirectionUiEdit, assemblyDirectionUiObjective, assemblyDirectionUiProposal, type AssemblyUiDirectionMate } from './AssemblyDirectionMatePanel'
import { retainAssemblyDirectionEdit, resolveAssemblyDirectionEdit, type AssemblyDirectionEditTicket } from './assemblyDirectionEdit'
import type { AssemblyDirectionMateType } from '../model/assemblyDirectionMates'
import AssemblyTangentMatePanel, { AssemblyTangentSupportSummary, assemblyTangentUiEdit, assemblyTangentUiProposal, assemblyTangentUiReports, type AssemblyUiTangentMate } from './AssemblyTangentMatePanel'
import type { AssemblyTangentSide } from '../model/assemblyTangentMates'
import AssemblyCylinderTangentMatePanel, { AssemblyCylinderTangentSupportSummary, assemblyCylinderTangentUiBranch, assemblyCylinderTangentUiEdit, assemblyCylinderTangentUiProposal, assemblyCylinderTangentUiReports } from './AssemblyCylinderTangentMatePanel'
import type { AssemblyCylinderTangentMateType } from '../model/assemblyCylinderTangentMates'
import AssemblySphereTangentMatePanel, { AssemblySphereTangentSupportSummary, assemblySphereTangentFamilyLabel, assemblySphereTangentUiBranch, assemblySphereTangentUiEdit, assemblySphereTangentUiProposal, assemblySphereTangentUiReports, type AssemblySphereTangentUiFields } from './AssemblySphereTangentMatePanel'
import type { AssemblySphereTangentMateType } from '../model/assemblySphereTangentMates'
import AssemblyLimitDistanceMatePanel, { AssemblyLimitDistanceSupportSummary, assemblyLimitDistanceUiEdit, assemblyLimitDistanceUiProposal, assemblyLimitDistanceUiReports } from './AssemblyLimitDistanceMatePanel'
import AssemblyLimitDirectedAngleMatePanel, { AssemblyLimitDirectedAngleSupportSummary, assemblyLimitDirectedAngleUiEdit, assemblyLimitDirectedAngleUiProposal, assemblyLimitDirectedAngleUiReports } from './AssemblyLimitDirectedAngleMatePanel'
import AssemblyLimitAngleMatePanel, { AssemblyLimitAngleSupportSummary, assemblyLimitAngleUiEdit, assemblyLimitAngleUiProposal, assemblyLimitAngleUiReports } from './AssemblyLimitAngleMatePanel'
import { canonicalAssemblyRackDirection } from '../model/assemblyRackPinion'
import { buildAssemblyBom, type AssemblyBomOptions } from '../model/assemblyBom'
import { serializeAssemblyBomCsv } from '../model/assemblyBomCsv'
import type { AssemblyInterferenceReport, AssemblyInterferenceScope } from '../model/assemblyInterference'
import type { AssemblyComponentMotion } from '../model/assemblyMotion'
import type { AssemblyTranslationRequest, AssemblyTranslationStopOptions } from '../model/assemblyTranslation'
import { prepareAssemblyDragFrame, type AssemblyDragFrame } from '../model/assemblyDrag'
import { createAssemblyDragSession, type AssemblyDragSession } from './assemblyDragSession'
import AssemblyMovementPanel, { assemblyMotionMatches } from './AssemblyMovementPanel'
import AssemblyTranslationPanel, { assemblyTranslationMatches } from './AssemblyTranslationPanel'
import AssemblyDragProjectionPanel, { assemblyDragProjectionMatches, type AssemblyDragProjection } from './AssemblyDragProjectionPanel'
import AssemblyViewport, { assemblyBodyKey, assemblyFaceKey, assemblyEdgeKey, type AssemblyViewportContextTarget, type AssemblyViewportViewSelection } from './AssemblyViewport'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { buildAssemblyOriginDisplay, type AssemblyOriginReference } from './assemblyOriginPicking'
import { standardAssemblyOriginKinds, standardAssemblyOriginPick, type StandardAssemblyOriginPickTicket } from './assemblyStandardOriginPicking'
import { AssemblyShellHeader, AssemblyCommandGroup, type AssemblyMenuDefinition } from './AssemblyCommandManager'
import { useAssemblyShortcuts, withAssemblyShortcutLabels } from './useAssemblyShortcuts'
import { flushSync } from 'react-dom'
import { AssemblyCommandTabs, type AssemblyCommandTab } from './AssemblyCommandTabs'
import { useAssemblyTreeNavigation } from './useAssemblyTreeNavigation'
import AssemblyOriginIcon from './AssemblyOriginIcon'
import { buildAssemblyOriginTree, retainAssemblyOriginTreeSelection, resolveAssemblyOriginTreeSelection,
  type AssemblyOriginTreeEntry, type AssemblyOriginTreeSelection } from './assemblyOriginTree'
import { retainAssemblyInsertionSelection, resolveAssemblyInsertionSelection, type AssemblyInsertionNavigation, type AssemblyInsertionSelection } from './assemblyInsertionSelection'
import './assembly.css'
import { parseCadDocument as parseSavedCadDocument } from '../model/cadDocument'
import { createAssemblyConfiguredDocument, type AssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'

export interface AssemblyWorkspaceProps {
  initialDocument: AssemblyDocument
  initialPath?: string
  initialSaved?: string
  onOpenPart: (document: Document, path?: string, saved?: string) => void
  onOpenConfigured?: (document: AssemblyConfiguredDocument, path?: string, saved?: string) => void
}
type AssemblyNode = AssemblyDocument | EmbeddedAssemblyDefinition
type RelationReferencePair = [AssemblyGeometryReference | null, AssemblyGeometryReference | null]
type RelationReferenceDraft = {
  ticket: AssemblyDistanceEditTicket | AssemblyAngleEditTicket | OrdinaryMateEditTicket | AssemblyDirectionEditTicket
  references: RelationReferencePair
}
function samePath(a: readonly string[], b: readonly string[]): boolean { return a.length === b.length && a.every((id, i) => id === b[i]) }
/** Display eligibility only. The document frame and worker still validate identity. */
export function assemblyHasVisibleDragBody(scene: AssemblyScene | null, component: AssemblyComponentReference): boolean {
  return component.occurrencePath.length > 0 && !!scene?.bodies.some(body => body.visible && body.component.occurrencePath.length >= component.occurrencePath.length
    && component.occurrencePath.every((id, index) => body.component.occurrencePath[index] === id)
    && (body.component.occurrencePath.length !== component.occurrencePath.length
      || assemblyDefinitionKey(body.component.definition) === assemblyDefinitionKey(component.definition)))
}
function inside(path: readonly string[], scope: readonly string[]): boolean { return path.length > scope.length && scope.every((id, i) => path[i] === id) }
function nodeAt(document: AssemblyDocument, path: readonly string[]): AssemblyNode {
  let node: AssemblyNode = document
  for (const id of path) {
    const occurrence = node.occurrences.find(value => value.id === id), definition = occurrence && document.definitions.find(value => assemblyDefinitionKey(value) === assemblyDefinitionKey(occurrence.definition))
    if (!definition || definition.kind !== 'assembly') throw new Error('Selecciona un ámbito de ensamblaje actual.')
    node = definition
  }
  return node
}
export function scopedAssemblyFace(face: AssemblySceneFace, scopePath: readonly string[]): AssemblyGeometryReference | null {
  const reference = assemblySceneFaceReference(face)
  if (!reference || !inside(reference.component.occurrencePath, scopePath)) return null
  reference.component.occurrencePath = reference.component.occurrencePath.slice(scopePath.length)
  return reference
}
export function scopedAssemblyPlaneFace(face: AssemblySceneFace, scopePath: readonly string[]): AssemblyPlaneReference | null {
  if (face.support?.kind !== 'plane') return null
  const reference = scopedAssemblyFace(face, scopePath)
  return reference ? validateAssemblyPlaneReference(reference) : null
}
/** Resolve display selection against the current visible catalog, never the
 * incoming face payload. The worker still authenticates the four saved refs. */
export function scopedAssemblyWidthPick(scene: AssemblyScene | null, face: AssemblySceneFace | null, scopePath: readonly string[]): { face: AssemblySceneFace; reference: AssemblyPlaneReference } | null {
  if (!scene || !face) return null
  const matches = scene.bodies.filter(body => body.visible).flatMap(body => body.faces).filter(value => assemblyFaceKey(value) === assemblyFaceKey(face))
  if (matches.length !== 1) return null
  const actual = matches[0], reference = scopedAssemblyPlaneFace(actual, scopePath)
  return reference ? { face: actual, reference } : null
}
/** Explicit surface intent; legacy cylindrical axis selection remains separate. */
export function scopedAssemblyTangentFace(face: AssemblySceneFace, scopePath: readonly string[]): AssemblyTangentReference | null {
  const reference = face.support?.kind === 'cylinder' ? assemblySceneCylinderSurfaceReference(face)
    : face.support?.kind === 'plane' ? assemblySceneFaceReference(face) : null
  if (!reference || reference.support === 'axis' || !inside(reference.component.occurrencePath, scopePath)) return null
  reference.component.occurrencePath = reference.component.occurrencePath.slice(scopePath.length)
  return validateAssemblyTangentReference(reference)
}
export function scopedAssemblyCylinderSurface(face: AssemblySceneFace, scopePath: readonly string[]): AssemblyCylinderSurfaceReference | null {
  const reference = assemblySceneCylinderSurfaceReference(face)
  if (!reference || !inside(reference.component.occurrencePath, scopePath)) return null
  reference.component.occurrencePath = reference.component.occurrencePath.slice(scopePath.length)
  return reference
}
export function scopedAssemblySphereTangentFace(face: AssemblySceneFace, scopePath: readonly string[], type: AssemblySphereTangentMateType): AssemblySphereTangentReference | null {
  const reference = face.sphereSurface ? assemblySceneSphereSurfaceReference(face)
    : type === 'plane-sphere-tangent' && face.support?.kind === 'plane' ? assemblySceneFaceReference(face)
      : type === 'cylinder-sphere-tangent' ? assemblySceneCylinderSurfaceReference(face) : null
  if (!reference || reference.support === 'axis' || !inside(reference.component.occurrencePath, scopePath)) return null
  reference.component.occurrencePath = reference.component.occurrencePath.slice(scopePath.length)
  return validateAssemblySphereTangentReference(reference)
}
export function scopedAssemblyEdge(edge: AssemblySceneEdge, scopePath: readonly string[]) {
  const reference = assemblySceneEdgeReference(edge)
  if (!reference || !inside(reference.component.occurrencePath, scopePath)) return null
  reference.component.occurrencePath = reference.component.occurrencePath.slice(scopePath.length)
  return reference
}
/** Import adds a reusable source. It neither replaces the workspace nor relabels an existing source. */
export function insertAssemblyPart(input: AssemblyDocument, source: Document, scope?: AssemblyDefinitionReference): AssemblyDocument {
  const document = validateAssemblyDocument(input), part = validateDocument(source), signature = JSON.stringify(part)
  if ([document, ...document.definitions].some(value => value.id === part.id && value.kind !== 'part')) throw new Error('La identidad importada ya pertenece a un ensamblaje.')
  let definition = document.definitions.find(value => value.kind === 'part' && value.id === part.id && JSON.stringify(value.document) === signature)
  if (!definition) { definition = { kind: 'part', id: part.id, revision: crypto.randomUUID(), document: part }; document.definitions.push(definition) }
  return applyAssemblyEdit(document, { type: 'insert-occurrence', scope, occurrence: { name: part.name, definition: { id: definition.id, revision: definition.revision }, pose: identityRigidPose(), fixed: false, suppressed: false, visible: true } })
}
/** Both file-picker paths import into the parent without replacing its saved-file identity. */
export function insertAssemblyComponent(input: AssemblyDocument, source: Document | AssemblyDocument, scope?: AssemblyDefinitionReference): AssemblyDocument {
  const checked = validateCadDocument(source)
  return checked.version === 1 ? insertAssemblyPart(input, checked, scope) : insertAssemblyDocument(input, checked, scope)
}
function axis(reference: AssemblyGeometryReference): reference is AssemblyAxisReference { return reference.kind === 'face' && reference.support === 'axis' }
function cylinderTangentType(type: string): type is AssemblyCylinderTangentMateType { return type === 'skew-cylinder-tangent' || type === 'parallel-cylinder-tangent' }
function sphereTangentType(type: string): type is AssemblySphereTangentMateType { return type === 'plane-sphere-tangent' || type === 'sphere-sphere-tangent' || type === 'cylinder-sphere-tangent' }
function solveDeletion(type: AssemblyMate['type']): boolean { return type === 'hinge' || type === 'circular-path' || type === 'line-path' || type === 'profile-center' || type === 'symmetry' || type === 'width' || type === 'limit-directed-angle' || type === 'limit-angle' || type === 'limit-distance' || type === 'parallel' || type === 'perpendicular' || type === 'tangent' || cylinderTangentType(type) || sphereTangentType(type) }
function solveSuppression(type: AssemblyMate['type']): boolean { return type === 'gear' || type === 'screw' || type === 'rack-pinion' || solveDeletion(type) }
function sameAxisReference(first: AssemblyAxisReference, second: AssemblyAxisReference): boolean {
  return samePath(first.component.occurrencePath, second.component.occurrencePath) && assemblyDefinitionKey(first.component.definition) === assemblyDefinitionKey(second.component.definition)
    && (first.body === null ? second.body === null : second.body !== null && first.body.bodyId === second.body.bodyId && first.body.sourceFeatureId === second.body.sourceFeatureId)
    && first.face.sourceFeatureId === second.face.sourceFeatureId && first.face.key === second.face.key
}
function plane(reference: AssemblyGeometryReference): reference is AssemblyPlaneReference { return reference.kind === 'principal-plane' || reference.kind === 'face' && reference.support === 'plane' }
export function assemblyMateProposal(first: AssemblyGeometryReference | null, second: AssemblyGeometryReference | null,
  type: 'concentric' | 'coincident' | 'distance' | 'angle' | AssemblyDirectionMateType, alignment: 'aligned' | 'opposed', value: number): NewAssemblyMate {
  if (!first || !second) throw new Error('Selecciona dos referencias del ámbito actual.')
  if (type === 'parallel' || type === 'perpendicular') return assemblyDirectionUiProposal(first, second,
    { type, name: type === 'parallel' ? 'Paralela' : 'Perpendicular', alignment: assemblyDirectionUiObjective(type, first, second) === 'collinear' ? alignment : null })
  const common = { name: type === 'concentric' ? 'Concéntrica' : type === 'coincident' ? 'Coincidente' : type === 'distance' ? 'Distancia' : 'Ángulo', suppressed: false }
  if (type === 'concentric') { if (!(axis(first) || first.kind === 'principal-axis') || !(axis(second) || second.kind === 'principal-axis')) throw new Error('Selecciona dos caras cilíndricas o ejes de origen.'); return { ...common, type, first, second, alignment, rotationLock: null } }
  if (type === 'angle') { if (!Number.isFinite(value) || value < 0 || value > 180) throw new Error('El ángulo debe estar entre 0° y 180°.'); return { ...common, type, first, second, angle: value } }
  if (!plane(first) || !plane(second)) throw new Error('Selecciona dos caras planas o planos principales.')
  if (type === 'distance') { if (!Number.isFinite(value)) throw new Error('La distancia firmada debe ser finita.'); return { ...common, type, first, second, alignment, distance: value } }
  return { ...common, type, first, second, alignment }
}
export interface AssemblyUiPreview {
  reply: Extract<AssemblyPreviewReply, { status: 'ready' }>; baseSignature: string; candidateSignature: string; generation: number
}
interface AssemblyUiSourceUpdate {
  review: AssemblySourceUpdateReview; document: AssemblyDocument; repaired: string[]; baseSignature: string
}
interface AssemblyUiDocumentUpdate { review: AssemblyDocumentUpdateReview; decisions: AssemblyDocumentUpdateDecisions; baseSignature: string }
interface PendingLinkedSource { grantId?: string; target: AssemblyDefinitionReference; descriptor: ReturnType<typeof linkedSourceDescriptor> | null }
interface AssemblyUiReplacement {
  review: AssemblyReplacementReview; decisions: AssemblyReplacementDecisions; baseSignature: string
}
interface AssemblyUiInterference {
  report: AssemblyInterferenceReport; baseSignature: string; optionsSignature: string; generation: number
}
interface AssemblyUiDragProjection { projection: AssemblyDragProjection; checks: Extract<AssemblyPreviewReply, { status: 'ready' }>['checks']; baseSignature: string; generation: number }
type AssemblyFilePurpose = 'open' | 'insert' | 'update' | 'replace-component'
type AssemblyReplacementSelection = Omit<AssemblyPartReplacementRequest, 'part' | 'revision'>
interface AssemblyFileTicket { purpose: AssemblyFilePurpose; source?: AssemblyDefinitionReference; sourceKind?: 'part' | 'assembly'; replacement?: AssemblyReplacementSelection; scope?: AssemblyDefinitionReference; scopePath: string; selectionPath?: string; signature: string; generation: number; insertionNavigation?: AssemblyInsertionNavigation }
/** File contents may arrive after browser focus returns or the active scope changes. */
export function assemblyFileTicketIsCurrent(ticket: Pick<AssemblyFileTicket, 'purpose' | 'scopePath' | 'selectionPath' | 'signature' | 'generation'>,
  signature: string, generation: number, scopePath: string, selectionPath?: string): boolean {
  return ticket.signature === signature && ticket.generation === generation && (ticket.purpose !== 'insert' && ticket.purpose !== 'update' || ticket.scopePath === scopePath)
    && (ticket.purpose !== 'update' || ticket.selectionPath === undefined || ticket.selectionPath === selectionPath)
}
export function canApplyAssemblyPreview(preview: AssemblyUiPreview | null, committed: string, candidate: string | null, generation: number, busy: boolean): boolean {
  return !busy && !!preview && preview.generation === generation && preview.baseSignature === committed
    && preview.candidateSignature === candidate && preview.reply.token.length > 0
}
export function AssemblySolveSummary({ scopes, document }: { scopes: readonly AssemblyScopeSolveReport[]; document?: AssemblyDocument }) {
  return <div className="assembly-solve-summary" aria-label="Resultado de relaciones">
    {!scopes.length && <p>Resuelve las relaciones para medir los grados de libertad.</p>}
    {scopes.map(scope => {
      const node = document && (assemblyDefinitionKey(document) === assemblyDefinitionKey(scope.definition) ? document
        : document.definitions.find(value => value.kind === 'assembly' && assemblyDefinitionKey(value) === assemblyDefinitionKey(scope.definition)))
      return <div key={assemblyDefinitionKey(scope.definition)}><strong>{node?.kind === 'assembly' ? node.name : 'Ámbito de ensamblaje'}</strong>
        <span>{scope.result.status} · {scope.result.localDOF === null ? 'Grados de libertad no determinados' : `${scope.result.localDOF} grados de libertad ${scope.temporaryAnchor ? 'con ancla temporal' : 'locales'}`}</span>
        <small>Ámbito rígido · rango {scope.result.rank === null ? 'no determinado' : scope.result.rank}{scope.temporaryAnchor ? ' con ancla temporal' : ''}</small>
        {scope.temporaryAnchor && <p>El componente sólo está fijado durante esta comprobación del movimiento. Tras Aplicar, vuelve a Resolver para medir los grados de libertad sin el ancla.</p>}
        {scope.result.evidence.diagnostics.map((message, index) => <p key={index}>{message}</p>)}</div>
    })}
  </div>
}
function referenceLabel(reference: AssemblyGeometryReference | AssemblyTangentReference | AssemblySphereTangentReference | null): string {
  if (!reference) return 'Sin seleccionar'
  const component = reference.component?.occurrencePath.join(' / ') ?? 'Ámbito actual'
  return reference.kind === 'principal-axis' ? `${component} · Eje de origen ${reference.axis}` : reference.kind === 'principal-plane' ? `${component} · ${reference.plane}` : reference.kind === 'edge' ? `${component} · Arista lineal · ${reference.edge.sourceFeatureId}` : `${component} · ${reference.support === 'axis' ? 'Cilindro' : reference.support === 'cylinder-surface' ? 'Superficie cilíndrica' : reference.support === 'sphere-surface' ? 'Superficie esférica' : 'Plano'} · ${reference.face.sourceFeatureId}`
}
export function AssemblyComponentTree({ document, selectedPath, onSelect, disabled = false, active = true, resetKey = document.id,
  originRows = [], selectedOriginKey = null, onOrigin, originDisabled = false, onComponentContext, onOriginContext }: {
  document: AssemblyDocument; selectedPath: readonly string[]; onSelect: (path: string[]) => void; disabled?: boolean; active?: boolean; resetKey?: unknown
  originRows?: readonly AssemblyOriginTreeEntry[]; selectedOriginKey?: string | null; onOrigin?: (entry: AssemblyOriginTreeEntry, additive?: boolean) => void; originDisabled?: boolean
  onComponentContext?: (path: string[], point: { x: number; y: number }, element: HTMLElement) => void
  onOriginContext?: (entry: AssemblyOriginTreeEntry, point: { x: number; y: number }, element: HTMLElement) => void
}) {
  type Node = { key: string; parentKey: string | null; level: number } & (
    { kind: 'component'; row: AssemblyTreeRow } | { kind: 'origin'; origin: AssemblyOriginTreeEntry })
  const tree = useMemo(() => {
    const rows = assemblyTreeRows(document)
    const keys = new Map(rows.map(row => [JSON.stringify(row.path), JSON.stringify([row.path, row.definition.id, row.definition.revision])]))
    const originsByOwner = new Map<string, AssemblyOriginTreeEntry[]>()
    for (const origin of originRows) {
      const owner = JSON.stringify(origin.ownerPath), values = originsByOwner.get(owner) ?? []
      values.push(origin); originsByOwner.set(owner, values)
    }
    const origins = (ownerPath: readonly string[]): Node[] => (originsByOwner.get(JSON.stringify(ownerPath)) ?? []).map(origin => ({
      kind: 'origin', origin, key: origin.treeKey, parentKey: keys.get(JSON.stringify(ownerPath)) ?? null, level: ownerPath.length + 1,
    }))
    const nodes: Node[] = origins([])
    for (const row of rows) {
      nodes.push({ kind: 'component', row, key: keys.get(JSON.stringify(row.path))!,
        parentKey: keys.get(JSON.stringify(row.path.slice(0, -1))) ?? null, level: row.path.length }, ...origins(row.path))
    }
    return nodes
  }, [document, originRows])
  const children = useMemo(() => {
    const grouped = new Map<string | null, Node[]>()
    for (const node of tree) {
      const values = grouped.get(node.parentKey) ?? []; values.push(node); grouped.set(node.parentKey, values)
    }
    return grouped
  }, [tree])
  const selectedKey = selectedOriginKey ?? tree.find(node => node.kind === 'component' && samePath(node.row.path, selectedPath))?.key ?? null
  const navigation = useAssemblyTreeNavigation({ nodes: tree, selectedKey, resetKey, active, disabled })
  const renderRows = (parentKey: string | null): ReactNode => (children.get(parentKey) ?? []).map(node => {
    const expandable = navigation.canExpand(node.key), expanded = navigation.isExpanded(node.key)
    const row = node.kind === 'component' ? node.row : null, origin = node.kind === 'origin' ? node.origin : null
    const hasContext = origin ? !!onOriginContext : !!onComponentContext
    const context = (point: { x: number; y: number }, element: HTMLElement) => {
      if (disabled || !active || !navigation.isVisible(node.key)) return
      if (origin) { if (!originDisabled) onOriginContext?.(origin, point, element) }
      else if (row) onComponentContext?.(row.path, point, element)
    }
    // The key is JSON, so URI encoding also accepts document IDs with lone surrogates.
    const childrenId = `standard-assembly-tree-children-${encodeURIComponent(node.key)}`
    return <div className="assembly-tree-entry" role="none" key={node.key} hidden={!navigation.isVisible(node.key)}>
      <div className="assembly-tree-row-wrap" role="none">
        {expandable && <button type="button" className="assembly-tree-toggle" data-assembly-tree-toggle={row ? JSON.stringify(row.path) : undefined} data-assembly-tree-disclosure={node.key}
          style={{ left: 7 + (node.level - 1) * 15 }} disabled={disabled || !active} tabIndex={-1}
          aria-label={`${expanded ? 'Plegar' : 'Desplegar'} ${row?.occurrence.name}`} aria-expanded={expanded} aria-controls={childrenId}
          onClick={() => navigation.toggle(node.key)}>{expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button>}
        <button type="button" role="treeitem" aria-level={node.level} aria-selected={node.key === selectedKey}
          aria-expanded={expandable ? expanded : undefined} aria-controls={expandable ? childrenId : undefined}
          aria-owns={expandable ? childrenId : undefined}
          aria-label={origin ? `Seleccionar ${origin.display.label} en el árbol` : undefined}
          aria-haspopup={hasContext ? 'menu' : undefined}
          data-assembly-tree-path={row ? JSON.stringify(row.path) : undefined}
          data-assembly-tree-key={node.key} data-assembly-tree-parent={node.parentKey ?? ''}
          data-assembly-origin-tree-key={origin?.treeKey} data-assembly-origin-tree-reference={origin ? JSON.stringify(origin.display.reference) : undefined}
          data-assembly-origin-tree-owner={origin ? JSON.stringify(origin.ownerPath) : undefined}
          className={`assembly-tree-row ${origin ? 'assembly-tree-origin' : ''} ${node.key === selectedKey ? 'selected' : ''} ${row?.suppressed ? 'suppressed' : ''}`}
          style={{ paddingLeft: 28 + (node.level - 1) * 15 }} disabled={disabled || !active}
          aria-disabled={origin && (originDisabled || !onOrigin) ? true : undefined} tabIndex={navigation.rowTabIndex(node.key)}
          ref={element => navigation.register(node.key, element)} onFocus={() => navigation.onFocus(node.key)}
          onContextMenu={hasContext ? event => { event.preventDefault(); event.stopPropagation(); context({ x: event.clientX, y: event.clientY }, event.currentTarget) } : undefined}
          onKeyDown={event => {
            if (hasContext && (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey)) {
              event.preventDefault(); event.stopPropagation()
              const rect = event.currentTarget.getBoundingClientRect(); context({ x: rect.left + 28, y: rect.bottom }, event.currentTarget)
            } else navigation.onKeyDown(event, node.key)
          }} onClick={event => {
            if (disabled || !active || !navigation.isVisible(node.key)) return
            if (origin) { if (!originDisabled) onOrigin?.(origin, event.ctrlKey || event.metaKey) }
            else if (row) onSelect(row.path)
          }}>
          {origin ? <AssemblyOriginIcon plane={origin.display.reference.kind === 'principal-plane'} />
            : row?.definition.kind === 'assembly' ? <Layers size={15} /> : <Box size={15} />}
          <span>{origin ? origin.display.reference.kind === 'principal-plane' ? `Plano ${origin.display.reference.plane}` : `Eje ${origin.display.reference.axis}`
            : <>{row?.occurrence.name}<small>{row?.definition.id} · {row?.definition.revision}</small></>}</span>
          {row?.occurrence.fixed && <LockKeyhole size={12} aria-label="Fijo respecto a su padre" />}{row && !row.visible && <Eye size={12} aria-label="Oculto" />}
        </button>
      </div>
      {expandable && <div id={childrenId} role="group" data-assembly-tree-parent-key={node.key} hidden={!expanded}>{renderRows(node.key)}</div>}
    </div>
  })
  return <div className="assembly-tree" role="tree" aria-label="Componentes del ensamblaje">
    {renderRows(null)}
    {!document.occurrences.length && <p className="assembly-muted">Importa un componente para comenzar.</p>}
  </div>
}
function download(content: string, name: string): void {
  const link = window.document.createElement('a'), url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  link.href = url; link.download = name + '.solidflow'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000)
}
function downloadBomCsv(content: string, name: string): void {
  const link = window.document.createElement('a'), url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  link.href = url; link.download = name + '.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export default function AssemblyWorkspace({ initialDocument, initialPath, initialSaved, onOpenPart, onOpenConfigured }: AssemblyWorkspaceProps) {
  const newDocumentDialog = useNewDocumentDialog(), newDocumentRequest = useRef(false)
  const [treeReset, setTreeReset] = useState(0)
  type ContextTarget = { point: { x: number; y: number }; element: HTMLElement; reset: number; signature: string; scope: string; generation: number }
    & ({ kind: 'component'; ticket: AssemblyComponentContextTarget } | { kind: 'origin'; ticket: AssemblyOriginTreeSelection } | { kind: 'background' })
  const [contextTarget, setContextTarget] = useState<ContextTarget | null>(null)
  const [ribbonTab, setRibbonTab] = useState<AssemblyCommandTab>('assembly')
  const [managerTab, setManagerTab] = useState<'components' | 'properties' | 'relations' | 'evaluate'>('components')
  const managerTabRef = useRef(managerTab)
  const manager = useRef<HTMLElement>(null)
  const insertionNavigationEpoch = useRef(0), pendingInsertionSelection = useRef<AssemblyInsertionSelection | null>(null)
  const abandonInsertionSelection = () => { insertionNavigationEpoch.current++; pendingInsertionSelection.current = null }
  const openManager = (tab: 'components' | 'properties' | 'relations' | 'evaluate', selector?: string, focusIsCurrent?: () => boolean) => {
    if (tab === 'properties' && (editingBlocked || selectedTreeOrigin || operation.current || hasStaging() || dragging.current || dragSession.current)) return
    abandonInsertionSelection()
    managerTabRef.current = tab
    if (tab !== 'relations') {
      preselectionPick.current = null
      clearSymmetryPicking(); setHingePicking(null); setWidthPicking(null); setRackPicking(null)
    }
    setManagerTab(tab)
    requestAnimationFrame(() => {
      if (managerTabRef.current !== tab || focusIsCurrent && !focusIsCurrent()) return
      const target = selector ? manager.current?.querySelector<HTMLElement>(selector) : manager.current?.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')
      target?.scrollIntoView({ block: selector === '.assembly-movement h3' ? 'start' : 'nearest' })
      if (target && !target.matches('button, input, select, textarea, [tabindex]')) target.tabIndex = -1
      target?.focus({ preventScroll: true })
    })
  }
  const history = useRef<AssemblyDocumentHistory | null>(null); history.current ??= new AssemblyDocumentHistory(initialDocument)
  const [committed, setCommitted] = useState(() => validateAssemblyDocument(initialDocument)), [path, setPath] = useState(initialPath)
  const [saved, setSaved] = useState(initialSaved ?? ''), [scene, setScene] = useState<AssemblyScene | null>(null), [commandBusy, setBusy] = useState(false), [cancelable, setCancelable] = useState(false)
  const [sceneBuilding, setSceneBuilding] = useState(true), [activity] = useState(createAssemblyActivity)
  const busy = commandBusy || sceneBuilding
  const [preview, setPreview] = useState<AssemblyUiPreview | null>(null), [draft, setDraft] = useState<AssemblyDocument | null>(null), [reports, setReports] = useState<AssemblyScopeSolveReport[]>([])
  const [sourceUpdate, setSourceUpdate] = useState<AssemblyUiSourceUpdate | null>(null), currentUpdate = useRef(sourceUpdate); currentUpdate.current = sourceUpdate
  const [documentUpdate, setDocumentUpdate] = useState<AssemblyUiDocumentUpdate | null>(null), currentDocumentUpdate = useRef(documentUpdate); currentDocumentUpdate.current = documentUpdate
  const [replacementReview, setReplacementReview] = useState<AssemblyUiReplacement | null>(null), currentReplacement = useRef(replacementReview); currentReplacement.current = replacementReview
  const [replacementMode, setReplacementMode] = useState<AssemblyPartReplacementRequest['mode']>('selected'), [replacementTarget, setReplacementTarget] = useState('')
  const hasStaging = () => !!currentUpdate.current || !!currentDocumentUpdate.current || !!currentReplacement.current
  const [inspection, setInspection] = useState<AssemblyUiInterference | null>(null), [analysisPair, setAnalysisPair] = useState<string | null>(null)
  const [directedSelection, setDirectedSelection] = useState<AssemblyDirectedAngleSelection>(['', '', ''])
  const [directedMeasurement, setDirectedMeasurement] = useState<{ report: AssemblyDirectedAngleReport; ticket: AssemblyDirectedAngleTicket } | null>(null), directedPending = useRef(false)
  const [bomOpen, setBomOpen] = useState(false), [bomOptions, setBomOptions] = useState<AssemblyBomOptions>({ mode: 'parts-only', includeHidden: true })
  const bomToggle = useRef<HTMLButtonElement>(null), currentBomOptions = useRef(bomOptions); currentBomOptions.current = bomOptions
  const restoreBomFocus = useRef(false)
  useLayoutEffect(() => {
    if (!restoreBomFocus.current || bomOpen || ribbonTab !== 'evaluate') return
    restoreBomFocus.current = false
    bomToggle.current?.focus({ preventScroll: true })
  }, [bomOpen, ribbonTab])
  const [analysisClearance, setAnalysisClearance] = useState('1'), [includeHidden, setIncludeHidden] = useState(true), [includeWithinComponent, setIncludeWithinComponent] = useState(false), [treatSubassembliesAsComponents, setTreatSubassembliesAsComponents] = useState(false), analysisPending = useRef(false)
  const [analysisScope, setAnalysisScope] = useState<AssemblyInterferenceScope>({ mode: 'all', selected: [], excluded: [] })
  const [message, setMessage] = useState('Preparando ensamblaje…'), [error, setError] = useState(false), [selectedPath, setSelectedPath] = useState<string[]>([])
  const [scopePath, setScopePath] = useState<string[]>([]), [selectedFaceMeshes, setSelectedFaceMeshes] = useState<AssemblySceneFace[]>([])
  const [treeOriginSelection, setTreeOriginSelection] = useState<AssemblyOriginTreeSelection | null>(null)
  // One ordered browse selection feeds camera commands and relation preselection independently.
  const [normalSelection, setNormalSelection] = useState<AssemblyNormalSelection | null>(null)
  const [browseSelectionMode, setBrowseSelectionMode] = useState<'face' | 'edge'>('face')
  useEffect(() => { setTreeOriginSelection(null) }, [selectedPath])
  const [symmetryReferences,setSymmetryReferences]=useState<SymmetryUiReferences>([null,null,null]), [symmetryFamily,setSymmetryFamily]=useState<SymmetryUiFamily>('point'), [symmetryAlignment,setSymmetryAlignment]=useState<'aligned'|'opposed'|''>(''), [editingSymmetryId,setEditingSymmetryId]=useState<string|null>(null)
  const [symmetryPicking, setSymmetryPickingState] = useState<SymmetryPickTicket | null>(null), symmetryPickingRef = useRef<SymmetryPickTicket | null>(null)
  const setSymmetryPicking = (ticket: SymmetryPickTicket | null) => { symmetryPickingRef.current = ticket; setSymmetryPickingState(ticket) }
  const clearSymmetryPicking = () => { stopOriginPicking(); setSymmetryPicking(null); setPickingFaces(false); setPickingLinearEdges(false) }
  const [hingeReferences, updateHingeReferences] = useState<HingeUiReferences>([null,null,null,null]), hingeReferencesRef = useRef(hingeReferences)
  const setHingeReferences = (refs: HingeUiReferences) => { hingeReferencesRef.current = refs; updateHingeReferences(refs) }
  const [editingHingeId, setEditingHingeId] = useState<string | null>(null), [hingeAlignment, setHingeAlignment] = useState<'aligned' | 'opposed' | ''>('')
  const [hingeLimited,setHingeLimited]=useState(false), [hingeStart,setHingeStart]=useState(''), [hingeSweep,setHingeSweep]=useState('')
  const resetHingeStops=()=>{setHingeLimited(false);setHingeStart('');setHingeSweep('')}
  const [hingePicking, updateHingePicking] = useState<HingePickTicket | null>(null), hingePickingRef = useRef<HingePickTicket | null>(null)
  const setHingePicking = (ticket: HingePickTicket | null) => { hingePickingRef.current = ticket; updateHingePicking(ticket) }
  const hingeContext = useRef<HingeUiTicket | null>(null), hingeEpoch = useRef({ key: '', value: 0 })
  const [widthReferences, setWidthReferences] = useState<WidthUiReferences>([null,null,null,null]), [editingWidthId, setEditingWidthId] = useState<string | null>(null)
  const [widthPicking, setWidthPicking] = useState<{ slot: WidthUiSlot; signature: string; scope: string; generation: number } | null>(null)
  const [widthBranch,setWidthBranch] = useState<WidthUiBranch | ''>(''), [tabBranch,setTabBranch] = useState<WidthUiBranch | ''>(''), [widthAlignment,setWidthAlignment] = useState<'aligned'|'opposed'|''>('')
  const [references, setReferences] = useState<RelationReferencePair>([null, null]), [endpointSlot, updateEndpointSlot] = useState<0 | 1>(0)
  const creationReferenceDraft = useRef<{ document: AssemblyDocument; scope: string; session: number; family: string; references: RelationReferencePair } | null>(null)
  const preselectionPick = useRef<{ signature: string; scope: string; scene: AssemblyScene; generation: number; slot: 1 } | null>(null)
  const endpointSlotRef = useRef(endpointSlot)
  const setEndpointSlot = (slot: 0 | 1) => { endpointSlotRef.current = slot; updateEndpointSlot(slot) }
  // An editor's declaration intent survives preview Cancel; generic selection does not.
  const [referenceDraft, updateReferenceDraft] = useState<RelationReferenceDraft | null>(null), referenceDraftRef = useRef(referenceDraft)
  const setReferenceDraft = (value: RelationReferenceDraft | null) => {
    if (value) creationReferenceDraft.current = null
    referenceDraftRef.current = value; updateReferenceDraft(value)
  }
  const [pickingFaces, setPickingFaces] = useState(false), [pickingLinearEdges, setPickingLinearEdges] = useState(false)
  const [showOriginAxes, setShowOriginAxes] = useState(false), [showOriginPlanes, setShowOriginPlanes] = useState(false)
  const [originControlsOpen, updateOriginControlsOpen] = useState(false), originControlsOpenRef = useRef(false)
  const setOriginControlsOpen = (open: boolean) => {
    // Avoid dispatching a presentation no-op that can render without updating child callbacks.
    if (originControlsOpenRef.current === open) return
    originControlsOpenRef.current = open
    updateOriginControlsOpen(open)
  }
  const [originOwner, setOriginOwner] = useState<'scope' | 'selected' | 'both'>('scope')
  const [originPicking, setOriginPicking] = useState(false), originPickingRef = useRef(false)
  const originPickContext = useRef<StandardAssemblyOriginPickTicket | null>(null)
  const stopOriginPicking = () => { originPickingRef.current = false; originPickContext.current = null; setOriginPicking(false) }
  const [editingCircularPathId,setEditingCircularPathId]=useState<string|null>(null),[circularPathReset,setCircularPathReset]=useState(0)
  const circularPathContext=useRef<{signature:string;scope:string;generation:number;sceneId:string|null;family:string;epoch:number}|null>(null)
  const circularPathEpoch=useRef({key:'',value:0})
  const [editingLinePathId, setEditingLinePathId] = useState<string | null>(null), [linePathReset, setLinePathReset] = useState(0)
  const linePathContext = useRef<{signature:string;scope:string;generation:number;sceneId:string|null;family:string} | null>(null)
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null), [profileReset, setProfileReset] = useState(0)
  const [mateType, setMateType] = useState<'hinge' | 'circular-path' | 'line-path' | 'profile-center' | 'symmetry' | 'width' | 'concentric' | 'coincident' | 'distance' | 'limit-distance' | 'limit-angle' | 'limit-directed-angle' | 'angle' | 'gear' | 'screw' | 'rack-pinion' | 'tangent' | AssemblyDirectionMateType | AssemblyCylinderTangentMateType | AssemblySphereTangentMateType>('concentric')
  const [distanceEdit, setDistanceEdit] = useState<AssemblyDistanceEditTicket | null>(null)
  const [angleEdit, setAngleEdit] = useState<AssemblyAngleEditTicket | null>(null)
  const [ordinaryEdit, setOrdinaryEdit] = useState<OrdinaryMateEditTicket | null>(null)
  const [releaseRotation, setReleaseRotation] = useState(false)
  const [directionEdit, updateDirectionEdit] = useState<AssemblyDirectionEditTicket | null>(null), [edgeChoice, setEdgeChoice] = useState('')
  const directionEditCurrent = useRef({ ticket: directionEdit, session: treeReset })
  directionEditCurrent.current = { ticket: directionEdit, session: treeReset }
  const setDirectionEdit = (ticket: AssemblyDirectionEditTicket | null) => {
    directionEditCurrent.current = { ticket, session: treeReset }
    updateDirectionEdit(ticket)
  }
  const [editingTangentId, setEditingTangentId] = useState<string | null>(null), [tangentSide, setTangentSide] = useState<AssemblyTangentSide>('positive')
  const [tangentReferences, setTangentReferences] = useState<[AssemblyTangentReference | null, AssemblyTangentReference | null]>([null, null])
  const [editingCylinderTangentId, setEditingCylinderTangentId] = useState<string | null>(null)
  const [cylinderReferences, setCylinderReferences] = useState<[AssemblyCylinderSurfaceReference | null, AssemblyCylinderSurfaceReference | null]>([null, null])
  const [cylinderBranchKind, setCylinderBranchKind] = useState<'external' | 'internal'>('external'), [cylinderLarger, setCylinderLarger] = useState<'' | 'first' | 'second'>('')
  const [editingSphereTangentId, setEditingSphereTangentId] = useState<string | null>(null)
  const [sphereReferences, setSphereReferences] = useState<[AssemblySphereTangentReference | null, AssemblySphereTangentReference | null]>([null, null])
  const [sphereSide, setSphereSide] = useState<AssemblyTangentSide>('positive'), [sphereBranchKind, setSphereBranchKind] = useState<'external' | 'internal'>('external'), [sphereLarger, setSphereLarger] = useState<'' | 'first' | 'second'>('')
  const [editingLimitDistanceId, setEditingLimitDistanceId] = useState<string | null>(null)
  const [limitReferences, setLimitReferences] = useState<[AssemblyPlaneReference | null, AssemblyPlaneReference | null]>([null, null])
  const [editingLimitDirectedAngleId, setEditingLimitDirectedAngleId] = useState<string | null>(null)
  const [limitDirectedSelection, setLimitDirectedSelection] = useState<AssemblyDirectedAngleSelection>(['', '', ''])
  const [limitDirectedStart, setLimitDirectedStart] = useState('330'), [limitDirectedSweep, setLimitDirectedSweep] = useState('60')
  const [editingLimitAngleId, setEditingLimitAngleId] = useState<string | null>(null)
  const [limitAngleReferences, setLimitAngleReferences] = useState<[AssemblyGeometryReference | null, AssemblyGeometryReference | null]>([null, null])
  const [limitAngleMinimum, setLimitAngleMinimum] = useState('30'), [limitAngleMaximum, setLimitAngleMaximum] = useState('120')
  const [limitMinimum, setLimitMinimum] = useState('0'), [limitMaximum, setLimitMaximum] = useState('10')
  const [editingGearId, setEditingGearId] = useState<string | null>(null)
  const [editingScrewId, setEditingScrewId] = useState<string | null>(null)
  const [editingRackId, setEditingRackId] = useState<string | null>(null), [rackKeys, setRackKeys] = useState<[string, string]>(['', ''])
  const [rackPicking, setRackPicking] = useState<{ kind: 'pinion' | 'rack-axis' | 'rack-edge'; token: string; generation: number } | null>(null)
  const [movementReset, setMovementReset] = useState(0)
  const [dragMode, setDragMode] = useState<'off' | 'translate' | 'rotate'>('off'), [dragActive, setDragActive] = useState(false)
  const [streamProjection, setStreamProjection] = useState<AssemblyUiDragProjection | null>(null)
  const dragging = useRef(false), dragSession = useRef<AssemblyDragSession | null>(null), dragAnchor = useRef<AssemblyDragFrame | null>(null)
  const [alignment, setAlignment] = useState<'aligned' | 'opposed'>('aligned'), [mateValue, setMateValue] = useState('0'), [sourceKey, setSourceKey] = useState('')
  const [mateName, setMateName] = useState('Relación'), [faceChoice, setFaceChoice] = useState('')
  const [datumComponent, setDatumComponent] = useState('scope'), [datumPlane, setDatumPlane] = useState<Plane>('XY'), [datumAxis, setDatumAxis] = useState<'X' | 'Y' | 'Z'>('X'), [componentLock, setComponentLock] = useState(['', ''])
  const viewHistory = useViewHistory()
  const [view, setView] = useState<ViewRequest>({ name: 'iso', stamp: 0 }), [rebuild, setRebuild] = useState(0)
  const [replaceDialog, setReplaceDialog] = useState(false), replaceAnswer = useRef<((answer: boolean) => void) | null>(null), replaceModal = useRef<HTMLDivElement>(null)
  const [rootRevision, setRootRevision] = useState<{ revision: string; signature: string; error: string } | null>(null)
  const structuralInput = useRef<HTMLInputElement>(null)
  const structuralRead = useRef<{resolve:(file:StepFile|null)=>void;reject:(error:unknown)=>void}|null>(null)
  useEffect(() => {
    const input = structuralInput.current
    const cancel = () => { const pending = structuralRead.current; structuralRead.current = null; pending?.resolve(null) }
    input?.addEventListener('cancel', cancel)
    return () => { input?.removeEventListener('cancel', cancel); cancel() }
  },[])
  const fileInput = useRef<HTMLInputElement>(null), fileTicket = useRef<AssemblyFileTicket | null>(null), generation = useRef(0), operation = activity.operation, mounted = useRef(true)
  const linkedEpoch = useRef(0), linkedTicket = useRef<LinkedSourceTicket | null>(null), pendingLinked = useRef<PendingLinkedSource | null>(null)
  const linkedBindings = useRef(new AssemblyLinkedSourceBindings(grantId => { void window.solidflow?.releaseLinkedSource(grantId).catch(() => {}) }))
  const [, refreshLinked] = useState(0)
  const current = useRef(committed), currentPreview = useRef(preview), sceneSignature = useRef(''), confirmedScene = useRef<{ signature: string; scene: AssemblyScene } | null>(null); current.current = committed; currentPreview.current = preview
  const exportView = useRef({ busy, draft: !!draft, replacing: replaceDialog }); exportView.current = { busy, draft: !!draft, replacing: replaceDialog }
  const geometryExportState = (): AssemblyExportState => ({ document: current.current, generation: generation.current, mounted: mounted.current,
    busy: exportView.current.busy, draft: exportView.current.draft, preview: !!currentPreview.current, sourceUpdate: hasStaging(),
    replacing: exportView.current.replacing || !!replaceAnswer.current, sceneSignature: sceneSignature.current, confirmedSceneSignature: confirmedScene.current?.signature ?? null })
  const serialized = useMemo(() => serializeAssemblyDocument(committed), [committed]), candidateSignature = useMemo(() => draft ? serializeAssemblyDocument(draft) : null, [draft])
  useEffect(() => { creationReferenceDraft.current = null }, [scopePath, serialized, treeReset])
  const dirty = serialized !== saved || !!draft || !!sourceUpdate || !!documentUpdate || !!replacementReview, dirtyRef = useRef(dirty); dirtyRef.current = dirty
  const rows = useMemo(() => assemblyTreeRows(committed), [committed]), selected = rows.find(row => samePath(row.path, selectedPath))
  const movementScope = selected && (assemblyDefinitionKey(committed) === assemblyDefinitionKey(selected.parent) ? committed
    : committed.definitions.find(value => value.kind === 'assembly' && assemblyDefinitionKey(value) === assemblyDefinitionKey(selected.parent)))
  const eligibleDragFrame = useMemo(() => {
    if (!selected || pickingFaces || pickingLinearEdges) return null
    const component = { occurrencePath: [...selected.path], definition: { ...selected.occurrence.definition } }
    try { const frame = prepareAssemblyDragFrame(committed, component); return frame.visible && assemblyHasVisibleDragBody(scene, component) ? frame : null }
    catch { return null }
  }, [committed, selected, scene, pickingFaces, pickingLinearEdges])
  const translationEligibility = useMemo(() => {
    if (!selected) return { frame: null, reason: 'Selecciona un componente activo dentro de un grupo raíz libre.' }
    try { return { frame: prepareAssemblyDragFrame(committed, { occurrencePath: [...selected.path], definition: { ...selected.occurrence.definition } }), reason: '' } }
    catch (reason) { return { frame: null, reason: reason instanceof Error ? reason.message : 'Este componente no admite una traslación del grupo raíz.' } }
  }, [committed, selected])
  const scope = nodeAt(committed, scopePath), scopeReference = { id: scope.id, revision: scope.revision }
  const currentFileScope = useRef(JSON.stringify(scopePath)); currentFileScope.current = JSON.stringify(scopePath)
  const currentFileSelection = useRef(JSON.stringify(selectedPath)); currentFileSelection.current = JSON.stringify(selectedPath)
  const availableComponents = rows.filter(row => inside(row.path, scopePath) && !row.suppressed)
  const directedChoices = useMemo(() => assemblyDirectedAngleChoices(scene, scopePath, rows), [scene, scopePath, rows])
  const directedSignature = JSON.stringify([scopePath, directedSelection]), currentDirectedSignature = useRef(directedSignature); currentDirectedSignature.current = directedSignature
  const gearScope = draft ? nodeAt(draft, scopePath) : scope
  const editingGear = gearScope.mates.find((mate): mate is AssemblyUiGearMate => mate.type === 'gear' && mate.id === editingGearId)
  const editingScrew = gearScope.mates.find((mate): mate is AssemblyUiScrewMate => mate.type === 'screw' && mate.id === editingScrewId)
  const editingRack = gearScope.mates.find((mate): mate is AssemblyUiRackPinionMate => mate.type === 'rack-pinion' && mate.id === editingRackId)
  useEffect(() => { if (mateType !== 'width') { setEditingWidthId(null); setWidthReferences([null,null,null,null]) } }, [mateType])
  const isSymmetry=mateType==='symmetry'
  const editingSymmetry=scope.mates.find((mate):mate is Extract<AssemblyMate,{type:'symmetry'}>=>mate.type==='symmetry'&&mate.id===editingSymmetryId)
  const symmetryIntent = useRef({ references: symmetryReferences, family: symmetryFamily, scope: JSON.stringify(scopePath), signature: serialized })
  symmetryIntent.current = { references: symmetryReferences, family: symmetryFamily, scope: JSON.stringify(scopePath), signature: serialized }
  useEffect(()=>{clearSymmetryPicking();setSymmetryReferences([null,null,null]);setEditingSymmetryId(null)},[serialized,scopePath])
  const isCircularPath=mateType==='circular-path'
  const editingCircularPath=scope.mates.find((mate):mate is Extract<AssemblyMate,{type:'circular-path'}>=>mate.type==='circular-path'&&mate.id===editingCircularPathId)
  useEffect(()=>{setEditingCircularPathId(null);setCircularPathReset(v=>v+1)},[serialized,scopePath])
  const isLinePath = mateType === 'line-path'
  const editingLinePath = scope.mates.find((mate): mate is Extract<AssemblyMate,{type:'line-path'}> => mate.type === 'line-path' && mate.id === editingLinePathId)
  useEffect(() => { setEditingLinePathId(null); setLinePathReset(value => value + 1) }, [serialized, scopePath])
  const isProfile = mateType === 'profile-center'
  const editingProfile = scope.mates.find((mate): mate is Extract<AssemblyMate,{type:'profile-center'}> => mate.type === 'profile-center' && mate.id === editingProfileId)
  useEffect(() => { setEditingProfileId(null); setProfileReset(value => value + 1) }, [serialized, scopePath])
  const isHinge = mateType === 'hinge'
  const editingHinge = scope.mates.find((mate): mate is Extract<AssemblyMate,{type:'hinge'}> => mate.type === 'hinge' && mate.id === editingHingeId)
  useEffect(() => { setHingeReferences([null,null,null,null]); resetHingeStops(); setEditingHingeId(null); setHingeAlignment(''); setHingePicking(null) }, [serialized, scopePath])
  useEffect(() => { if (mateType !== 'hinge') { setHingeReferences([null,null,null,null]); resetHingeStops(); setEditingHingeId(null); setHingePicking(null) } }, [mateType])
  const isWidth = mateType === 'width'
  const editingWidth = scope.mates.find((mate): mate is Extract<AssemblyMate,{type:'width'}> => mate.type === 'width' && mate.id === editingWidthId)
  const distanceEditContext = { documentSignature: serialized, scopePath, scope, session: treeReset }
  const distanceEditCurrent = useRef({ ticket: distanceEdit, session: treeReset })
  distanceEditCurrent.current = { ticket: distanceEdit, session: treeReset }
  const editingDistance = resolveAssemblyDistanceEdit(distanceEdit, distanceEditContext)
  useLayoutEffect(() => {
    if (distanceEdit && (!editingDistance || mateType !== 'distance')) setDistanceEdit(null)
  }, [distanceEdit, editingDistance, mateType])
  const angleEditContext = { documentSignature: serialized, scopePath, scope, session: treeReset }
  const angleEditCurrent = useRef({ ticket: angleEdit, session: treeReset })
  angleEditCurrent.current = { ticket: angleEdit, session: treeReset }
  const editingAngle = resolveAssemblyAngleEdit(angleEdit, angleEditContext)
  useLayoutEffect(() => {
    if (angleEdit && (!editingAngle || mateType !== 'angle')) setAngleEdit(null)
  }, [angleEdit, editingAngle, mateType])
  const ordinaryEditContext = { documentSignature: serialized, scopePath, scope, session: treeReset }
  const ordinaryEditCurrent = useRef({ ticket: ordinaryEdit, session: treeReset })
  ordinaryEditCurrent.current = { ticket: ordinaryEdit, session: treeReset }
  const editingOrdinary = resolveOrdinaryMateEdit(ordinaryEdit, ordinaryEditContext)
  useLayoutEffect(() => {
    if (ordinaryEdit && (!editingOrdinary || mateType !== editingOrdinary.type)) {
      setOrdinaryEdit(null); setReleaseRotation(false)
    }
  }, [ordinaryEdit, editingOrdinary, mateType])
  const directionEditContext = { documentSignature: serialized, scopePath, scope, session: treeReset }
  const editingDirection = resolveAssemblyDirectionEdit(directionEdit, directionEditContext)
  useLayoutEffect(() => {
    if (directionEdit && (!editingDirection || mateType !== 'parallel' && mateType !== 'perpendicular')) setDirectionEdit(null)
  }, [directionEdit, editingDirection, mateType])
  const referenceEditTicket = ordinaryEdit ?? angleEdit ?? distanceEdit ?? directionEdit
  const savedReferenceEditIsActive = () => !!(ordinaryEditCurrent.current.ticket || angleEditCurrent.current.ticket || distanceEditCurrent.current.ticket || directionEditCurrent.current.ticket)
  const referenceEditMate = editingOrdinary ?? editingAngle ?? editingDistance ?? editingDirection
  const editedReferences = referenceDraft?.ticket === referenceEditTicket && referenceEditMate ? referenceDraft.references : null
  useLayoutEffect(() => {
    if (referenceDraft && !editedReferences) setReferenceDraft(null)
  }, [referenceDraft, editedReferences])
  const referenceEditorIsCurrent = () => referenceDraftRef.current === referenceDraft && endpointSlotRef.current === endpointSlot
    && (!referenceEditTicket || !!editedReferences)
    && (!directionEdit || directionEditCurrent.current.ticket === directionEdit && directionEditCurrent.current.session === treeReset)
    && serialized === serializeAssemblyDocument(current.current) && JSON.stringify(scopePath) === currentFileScope.current
  const setRelationReference = (slot: 0 | 1, reference: AssemblyGeometryReference | null) => {
    if (!referenceEditorIsCurrent()) return
    const pending = preselectionPick.current
    if (reference && !referenceEditTicket && pending?.slot === slot && pending.signature === serialized
      && pending.scope === JSON.stringify(scopePath) && pending.scene === scene && pending.generation === generation.current) {
      preselectionPick.current = null
      stopOriginPicking(); setPickingFaces(false); setPickingLinearEdges(false)
    }
    if (editedReferences && referenceDraft) {
      const next: RelationReferencePair = [...editedReferences]
      next[slot] = reference && structuredClone(reference)
      setReferenceDraft({ ticket: referenceDraft.ticket, references: next })
      return
    }
    setReferences(values => {
      const next: RelationReferencePair = [...values]
      next[slot] = reference
      return next
    })
  }
  const isDirection = mateType === 'parallel' || mateType === 'perpendicular'
  const directionReferences: RelationReferencePair = directionEdit ? editedReferences ?? [null, null] : references
  const isTangent = mateType === 'tangent'
  const editingTangent = scope.mates.find((mate): mate is AssemblyUiTangentMate => mate.type === 'tangent' && mate.id === editingTangentId)
  const tangentEndpoints = editingTangent ? [editingTangent.first, editingTangent.second] as const : tangentReferences
  const isCylinderTangent = cylinderTangentType(mateType)
  const editingCylinderTangent = scope.mates.find((mate): mate is AssemblyCylinderTangentMate => cylinderTangentType(mate.type) && mate.id === editingCylinderTangentId)
  const cylinderEndpoints = editingCylinderTangent ? [editingCylinderTangent.first, editingCylinderTangent.second] as const : cylinderReferences
  const isSphereTangent = sphereTangentType(mateType)
  const editingSphereTangent = scope.mates.find((mate): mate is AssemblySphereTangentMate => sphereTangentType(mate.type) && mate.id === editingSphereTangentId)
  const sphereEndpoints = editingSphereTangent ? [editingSphereTangent.first, editingSphereTangent.second] as const : sphereReferences
  const isLimitDistance = mateType === 'limit-distance'
  const editingLimitDistance = scope.mates.find((mate): mate is AssemblyLimitDistanceMate => mate.type === 'limit-distance' && mate.id === editingLimitDistanceId)
  const limitEndpoints = editingLimitDistance ? [editingLimitDistance.first, editingLimitDistance.second] as const : limitReferences
  const isLimitDirectedAngle = mateType === 'limit-directed-angle'
  const editingLimitDirectedAngle = scope.mates.find((mate): mate is AssemblyLimitDirectedAngleMate => mate.type === 'limit-directed-angle' && mate.id === editingLimitDirectedAngleId)
  const isLimitAngle = mateType === 'limit-angle'
  const editingLimitAngle = scope.mates.find((mate): mate is AssemblyLimitAngleMate => mate.type === 'limit-angle' && mate.id === editingLimitAngleId)
  const limitAngleEndpoints = editingLimitAngle ? [editingLimitAngle.first, editingLimitAngle.second] as const : limitAngleReferences
  const ordinaryAngleEndpoints = editedReferences ?? references
  const directionalEndpoints = isLimitAngle ? limitAngleEndpoints : mateType === 'angle' ? ordinaryAngleEndpoints : directionReferences
  const referenceEditing = !!ordinaryEdit || !!angleEdit || !!distanceEdit || !!directionEdit || !!editingHinge || !!editingCircularPath || !!editingLinePath || !!editingProfile || !!editingSymmetry || !!editingWidth || !!editingTangent || !!editingCylinderTangent || !!editingSphereTangent || !!editingLimitDistance || !!editingLimitAngle || !!editingLimitDirectedAngle
  const standardPreviewFamily = !!ordinaryEdit || !!angleEdit || !!distanceEdit || !!directionEdit || isHinge || isCircularPath || isLinePath || isProfile || isSymmetry || isWidth || isDirection || isTangent || isCylinderTangent || isSphereTangent || isLimitDistance || isLimitAngle || isLimitDirectedAngle
  const canApply = canApplyAssemblyPreview(preview, serialized, candidateSignature, generation.current, busy)
  const symmetryReports=canApply&&preview&&preview.reply.checks.every(check=>check.satisfied)?assemblySymmetryUiReports(preview.reply.document,preview.reply.symmetries??[]):[]
  const widthReports = canApply && preview && preview.reply.checks.every(check => check.satisfied)
    ? assemblyWidthUiReports(preview.reply.document, preview.reply.widthCentered ?? []) : []
  const tangentReports = canApply && preview && preview.reply.checks.every(check => check.satisfied)
    ? assemblyTangentUiReports(preview.reply.document, preview.reply.tangencies ?? []) : []
  const cylinderReports = canApply && preview && preview.reply.checks.every(check => check.satisfied)
    ? assemblyCylinderTangentUiReports(preview.reply.document, preview.reply.cylinderTangencies ?? []) : []
  const sphereReports = canApply && preview && preview.reply.checks.every(check => check.satisfied)
    ? assemblySphereTangentUiReports(preview.reply.document, preview.reply.sphericalTangencies ?? []) : []
  const limitReports = canApply && preview && preview.reply.checks.every(check => check.satisfied)
    ? assemblyLimitDistanceUiReports(preview.reply.document, preview.reply.limitDistances ?? []) : []
  const limitAngleReports = canApply && preview && preview.reply.checks.every(check => check.satisfied)
    ? assemblyLimitAngleUiReports(preview.reply.document, preview.reply.limitAngles ?? []) : []
  const limitDirectedAngleReports = canApply && preview && preview.reply.checks.every(check => check.satisfied)
    ? assemblyLimitDirectedAngleUiReports(preview.reply.document, preview.reply.limitDirectedAngles ?? []) : []
  const displayedProjection = preview?.reply.projection && preview.generation === generation.current && preview.baseSignature === serialized
    ? { projection: preview.reply.projection, checks: preview.reply.checks }
    : streamProjection?.generation === generation.current && streamProjection.baseSignature === serialized ? streamProjection : null
  const editingBlocked = busy || !!sourceUpdate || !!documentUpdate || !!replacementReview || !!rootRevision
  // Document-only actions may follow a name blur while its scene rebuild is pending.
  // Native selection, solving and Apply still use the aggregate editingBlocked.
  const documentEditingBlocked = commandBusy || !!sourceUpdate || !!documentUpdate || !!replacementReview || !!rootRevision
  const directedReport = directedMeasurement && !editingBlocked && !draft && !preview && !replaceDialog && sceneSignature.current === serialized
    && assemblyDirectedAngleReplyIsCurrent(directedMeasurement.ticket, { mounted: mounted.current, generation: generation.current, documentSignature: serialized, requestSignature: directedSignature }) ? directedMeasurement.report : null
  const bomBlocked = editingBlocked || !!draft || !!preview || replaceDialog
  const bom = useMemo(() => {
    if (!bomOpen) return { report: null, error: undefined }
    try { return { report: buildAssemblyBom(committed, bomOptions), error: undefined } }
    catch (reason) { return { report: null, error: reason instanceof Error ? reason.message : 'No se pudo preparar la lista de materiales.' } }
  }, [bomOpen, committed, bomOptions])
  const analysisChoices = useMemo(() => {
    const names = new Map(rows.map(row => [JSON.stringify(row.path), row.occurrence.name]))
    return rows.map(row => ({ component: { occurrencePath: [...row.path], definition: { ...row.occurrence.definition } },
      label: `${row.path.map((_, index) => names.get(JSON.stringify(row.path.slice(0, index + 1)))!).join(' / ')} · ${JSON.stringify(row.path)} · ${row.definition.kind === 'assembly' ? 'Subensamblaje' : 'Pieza'}${row.suppressed ? ' · Suprimido' : !row.visible ? ' · Oculto' : ''}` }))
  }, [rows])
  const optionsSignature = JSON.stringify([analysisClearance, includeHidden, includeWithinComponent, treatSubassembliesAsComponents, 1e-6, 1e-6, analysisScope]), analysisOptions = useRef(optionsSignature); analysisOptions.current = optionsSignature
  const analysisReport = inspection && inspection.baseSignature === serialized && inspection.optionsSignature === optionsSignature && inspection.generation === generation.current ? inspection.report : null
  const selectedAnalysisPair = analysisReport?.pairs.find(pair => pair.id === analysisPair) ?? null
  const analysisHidden = !!selectedAnalysisPair && !!scene?.bodies.some(body => !body.visible && [selectedAnalysisPair.first, selectedAnalysisPair.second]
    .some(value => assemblyBodyKey(value.component, value.body) === assemblyBodyKey(body.component, body.body)))
  const clearInspection = () => { setInspection(null); setAnalysisPair(null) }
  const notify = (text: string, failure = false) => { setMessage(text); setError(failure) }
  const restoreScene = () => {
    const signature = serializeAssemblyDocument(current.current)
    if (currentUpdate.current?.baseSignature === signature) { setScene(currentUpdate.current.review.scene); return }
    if (currentDocumentUpdate.current?.baseSignature === signature) { setScene(currentDocumentUpdate.current.review.scene); return }
    if (currentReplacement.current?.baseSignature === signature) { setScene(currentReplacement.current.review.scene); return }
    sceneSignature.current = confirmedScene.current?.signature === signature ? signature : ''
    setScene(confirmedScene.current?.signature === signature ? confirmedScene.current.scene : null)
  }
  const discardToken = (token?: string) => { void discardAssemblyPreview(token).catch(() => { /* Restarted workers already revoked the capability. */ }) }
  const dropPendingLinked = (expected?: PendingLinkedSource | null) => {
    if (expected && pendingLinked.current !== expected) return
    const pending = pendingLinked.current; pendingLinked.current = null
    if (pending?.grantId) { linkedBindings.current.releaseGrant(pending.grantId); if (mounted.current) refreshLinked(v => v + 1) }
  }
  const invalidate = (keepSourceUpdate = false, keepCreationReferences = false) => {
    const retained = keepCreationReferences && creationReferenceDraft.current?.document === current.current
      && creationReferenceDraft.current.scope === currentFileScope.current && creationReferenceDraft.current.session === treeReset
      && creationReferenceDraft.current.family === mateType && isAssemblyOrdinaryCreationType(mateType)
      ? creationReferenceDraft.current : null
    creationReferenceDraft.current = retained
    setNormalSelection(null)
    preselectionPick.current = null
    pendingInsertionSelection.current = null
    hingeContext.current = null
    clearSymmetryPicking()
    setHingePicking(null)
    setWidthPicking(null)
    setPickingLinearEdges(false); setEdgeChoice('')
    setRackPicking(null)
    setStreamProjection(null)
    dragSession.current?.cancel(); dragSession.current = null; dragAnchor.current = null; dragging.current = false; setDragActive(false)
    clearInspection(); analysisPending.current = false
    setDirectedMeasurement(null); directedPending.current = false
    if (!keepSourceUpdate) {
      linkedTicket.current = null; dropPendingLinked()
      const partStage = currentUpdate.current
      if (partStage?.review.reviewId) void discardAssemblyPartUpdate(partStage.review.reviewId).catch(() => {})
      currentUpdate.current = null; setSourceUpdate(null)
      const documentStage = currentDocumentUpdate.current
      if (documentStage) void discardAssemblyDocumentUpdate(documentStage.review.reviewId).catch(() => {})
      currentDocumentUpdate.current = null; setDocumentUpdate(null)
      const replacement = currentReplacement.current
      if (replacement) void discardAssemblyPartReplacement(replacement.review.reviewId).catch(() => {})
      currentReplacement.current = null; setReplacementReview(null)
    }
    generation.current++; if (currentPreview.current) discardToken(currentPreview.current.reply.token)
    currentPreview.current = null; setPreview(null); setDraft(null); setReports([]); setSelectedFaceMeshes([]); setReferences(retained ? structuredClone(retained.references) : [null, null]); setTangentReferences([null, null]); setCylinderReferences([null, null]); setSphereReferences([null, null]); setLimitReferences([null, null]); setLimitAngleReferences([null, null]); setFaceChoice(''); setPickingFaces(false)
    restoreScene()
  }
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; generation.current++; linkedEpoch.current++; linkedTicket.current = null; linkedBindings.current.clear(); if (pendingLinked.current?.grantId) linkedBindings.current.releaseGrant(pendingLinked.current.grantId); pendingLinked.current = null; dragSession.current?.cancel(); dragSession.current = null; if (currentPreview.current) discardToken(currentPreview.current.reply.token); if (currentUpdate.current?.review.reviewId) void discardAssemblyPartUpdate(currentUpdate.current.review.reviewId).catch(() => {}); if (currentReplacement.current) void discardAssemblyPartReplacement(currentReplacement.current.review.reviewId).catch(() => {}); if (currentDocumentUpdate.current) void discardAssemblyDocumentUpdate(currentDocumentUpdate.current.review.reviewId).catch(() => {}); replaceAnswer.current?.(false) }
  }, [])
  useEffect(() => { linkedBindings.current.retain(linkedEpoch.current, committed); refreshLinked(v => v + 1) }, [serialized])
  useEffect(() => { setWidthReferences([null,null,null,null]); setEditingWidthId(null); setWidthPicking(null) }, [serialized, scopePath])
  useEffect(() => { setDirectedMeasurement(null); setDirectedSelection(['', '', '']) }, [scopePath])
  useEffect(() => {
    if (hasStaging()) return
    if (sceneSignature.current === serialized) return
    const id = ++generation.current; activity.setRebuilding(true); setSceneBuilding(true)
    buildAssembly(committed).then(value => {
      if (!mounted.current || id !== generation.current) return
      sceneSignature.current = serialized; confirmedScene.current = { signature: serialized, scene: value }; setScene(value); notify(value.warnings.length ? value.warnings.join(' · ') : 'Ensamblaje listo. Selecciona componentes o crea relaciones.')
    }).catch(reason => { if (mounted.current && id === generation.current) { setScene(null); notify(reason instanceof Error ? reason.message : 'No se pudo reconstruir el ensamblaje.', true) } })
      .finally(() => { if (mounted.current && id === generation.current) { activity.setRebuilding(false); setSceneBuilding(false) } })
  }, [committed, serialized, rebuild])
  useEffect(() => { try { writeCadRecovery(localStorage, committed) } catch { notify('No se pudo guardar la recuperación local. Guarda el ensamblaje en un archivo.', true) } }, [serialized])
  useEffect(() => { const leave = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = '' } }; window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave) }, [])
  const change = (next: AssemblyDocument) => {
    const document = history.current!.commitDocument(next); invalidate(); setCommitted(document)
    setSelectedPath(value => assemblyTreeRows(document).some(row => samePath(row.path, value)) ? value : [])
    setScopePath(value => { try { nodeAt(document, value); return value } catch { return [] } })
    return document
  }
  const edit = (value: AssemblyEdit): boolean => {
    if (activity.commandActive || hasStaging() || rootRevision) return false
    try { change(applyAssemblyEdit(current.current, value)); return true }
    catch (reason) { notify((reason as Error).message, true); return false }
  }
  const commitInsertion = (next: AssemblyDocument, navigation: AssemblyInsertionNavigation) => {
    const previous = current.current, document = change(next)
    if (navigation.epoch === insertionNavigationEpoch.current && JSON.stringify(navigation.scopePath) === currentFileScope.current)
      pendingInsertionSelection.current = retainAssemblyInsertionSelection(previous, document, navigation)
  }
  const reuseComponent = () => {
    if (operation.current || hasStaging()) return
    const definition = committed.definitions.find(value => assemblyDefinitionKey(value) === sourceKey)
    if (!definition) return
    try {
      commitInsertion(applyAssemblyEdit(current.current, { type: 'insert-occurrence', scope: scopeReference,
        occurrence: { name: definition.kind === 'part' ? definition.document.name : definition.name, definition: { id: definition.id, revision: definition.revision },
          pose: identityRigidPose(), fixed: false, suppressed: false, visible: true } }), { scopePath: [...scopePath], epoch: insertionNavigationEpoch.current })
    } catch (reason) { notify((reason as Error).message, true) }
  }
  const cancel = () => {
    if (operation.current && !cancelable && !dragSession.current) return
    if (directedPending.current) { generation.current++; directedPending.current = false; setDirectedMeasurement(null); operation.current = false; setBusy(false); setCancelable(false); notify('Medición cancelada. El ensamblaje no ha cambiado.'); return }
    if (analysisPending.current) { generation.current++; analysisPending.current = false; clearInspection(); operation.current = false; setBusy(false); setCancelable(false); notify('Comprobación cancelada. El documento confirmado no ha cambiado.'); return }
    invalidate(false, true); operation.current = false; setBusy(false); setCancelable(false); setRebuild(value => value + 1); notify('Vista previa cancelada. Se conservan las posiciones confirmadas.')
  }
  const cancelToolbarPreview = () => {
    if (!operation.current && currentDocumentUpdate.current && currentPreview.current) {
      invalidate(true); setCancelable(false)
      notify('Vista previa descartada. Se conservan la revisión y las decisiones de actualización del subensamblaje.'); return
    }
    cancel()
  }
  const inspect = async () => {
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog) return
    clearInspection()
    let options: ReturnType<typeof assemblyInterferenceUiOptions>
    try { options = assemblyInterferenceUiOptions(analysisClearance, includeHidden, analysisScope, includeWithinComponent, treatSubassembliesAsComponents) } catch (reason) { notify((reason as Error).message, true); return }
    const base = current.current, signature = serializeAssemblyDocument(base), selectedOptions = optionsSignature, id = ++generation.current
    analysisPending.current = true; operation.current = true; setBusy(true); setCancelable(true); notify('Comprobando interferencias y holguras…')
    try {
      const report = await inspectAssemblyInterferences(base, options)
      if (!mounted.current || id !== generation.current || signature !== serializeAssemblyDocument(current.current) || selectedOptions !== analysisOptions.current) return
      setInspection({ report, baseSignature: signature, optionsSignature: selectedOptions, generation: id }); notify('Comprobación completada. Selecciona un par para ver su resultado.')
    } catch (reason) { if (mounted.current && id === generation.current) { clearInspection(); notify((reason as Error).message, true) } }
    finally { if (mounted.current && id === generation.current) { analysisPending.current = false; operation.current = false; setBusy(false); setCancelable(false) } }
  }
  const changeAnalysisOptions = (clearance: string, hidden: boolean, scope = analysisScope, within = includeWithinComponent, grouped = treatSubassembliesAsComponents) => {
    if (operation.current || hasStaging() || currentPreview.current || replaceDialog) return
    generation.current++; clearInspection(); setAnalysisClearance(clearance); setIncludeHidden(hidden); setIncludeWithinComponent(within); setTreatSubassembliesAsComponents(grouped); setAnalysisScope(scope)
  }
  const selectDirectedAngle = (slot: 0 | 1 | 2, key: string) => {
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog) return
    if (key && !directedChoices.some(choice => choice.key === key)) return
    generation.current++; setDirectedMeasurement(null)
    setDirectedSelection(values => { const next: AssemblyDirectedAngleSelection = [...values]; next[slot] = key; return next })
  }
  const measureDirected = async () => {
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || sceneSignature.current !== serialized) return
    const request = assemblyDirectedAngleUiRequest(scopePath, directedSelection, directedChoices)
    if (!request) return
    const base = current.current, ticket: AssemblyDirectedAngleTicket = { generation: ++generation.current, documentSignature: serializeAssemblyDocument(base), requestSignature: directedSignature }
    const isCurrent = () => assemblyDirectedAngleReplyIsCurrent(ticket, { mounted: mounted.current, generation: generation.current,
      documentSignature: serializeAssemblyDocument(current.current), requestSignature: currentDirectedSignature.current })
    setDirectedMeasurement(null); clearInspection(); directedPending.current = true; operation.current = true; setBusy(true); setCancelable(true); notify('Midiendo el ángulo con las direcciones actuales…')
    try {
      const raw = await measureAssemblyDirectedAngle(base, request)
      if (!isCurrent()) return
      const report = assemblyDirectedAngleUiReport(request, raw)
      if (!report) throw new Error('La respuesta no corresponde a las tres direcciones de la medición.')
      setDirectedMeasurement({ report, ticket }); notify('Medición angular completada. El ensamblaje no ha cambiado.')
    } catch (reason) { if (isCurrent()) { setDirectedMeasurement(null); notify(reason instanceof Error ? reason.message : 'No se pudo medir el ángulo dirigido.', true) } }
    finally { if (mounted.current && ticket.generation === generation.current) { directedPending.current = false; operation.current = false; setBusy(false); setCancelable(false) } }
  }
  const clearDirectedAngle = () => {
    if (directedPending.current) { cancel(); return }
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog) return
    generation.current++; setDirectedMeasurement(null); setDirectedSelection(['', '', ''])
  }
  const acceptReply = (reply: AssemblyPreviewReply, id: number, baseSignature: string) => {
    if (!mounted.current || id !== generation.current || serializeAssemblyDocument(current.current) !== baseSignature) { if (reply.status === 'ready') discardToken(reply.token); return }
    setReports(reply.scopes)
    if (reply.status === 'rejected') { linkedSourceFailureDisposition(pendingLinked.current, !!currentUpdate.current || !!currentDocumentUpdate.current, dropPendingLinked); restoreScene(); notify(reply.message, true); return }
    const candidate = validateAssemblyDocument(reply.document), record = { reply, baseSignature, candidateSignature: serializeAssemblyDocument(candidate), generation: id }
    currentPreview.current = record; setPreview(record); setDraft(candidate); setScene(reply.scene); notify('Vista previa verificada. Revisa las relaciones y pulsa Aplicar.')
  }
  const solve = async (proposed = currentUpdate.current?.document ?? current.current, keepCreationReferences = false) => {
    if (currentDocumentUpdate.current) { await solveDocumentUpdate(); return }
    if (currentReplacement.current) { await solveReplacement(); return }
    if (operation.current || savedReferenceEditIsActive() && proposed === current.current) return
    const base = current.current, signature = serializeAssemblyDocument(base); invalidate(!!currentUpdate.current, keepCreationReferences); const id = ++generation.current; operation.current = true; setBusy(true); setCancelable(true); notify('Resolviendo todas las relaciones…')
    try {
      const reviewId = currentUpdate.current?.review.reviewId
      acceptReply(await (reviewId ? previewAssemblyPartUpdate(base, reviewId, proposed) : previewAssembly(base, proposed)), id, signature)
    } catch (reason) { if (mounted.current && id === generation.current) { linkedSourceFailureDisposition(pendingLinked.current, !!currentUpdate.current || !!currentDocumentUpdate.current, dropPendingLinked); notify((reason as Error).message, true) } }
    finally { if (mounted.current && id === generation.current) { operation.current = false; setBusy(false); setCancelable(false) } }
  }
  const openRootRevision = () => {
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || rootRevision) return
    invalidate()
    setRootRevision({ revision: crypto.randomUUID(), signature: serializeAssemblyDocument(current.current), error: '' })
  }
  const previewRootRevision = async () => {
    if (!rootRevision || operation.current || hasStaging() || currentPreview.current || draft || replaceDialog) return
    const base = current.current
    if (rootRevision.signature !== serializeAssemblyDocument(base)) { setRootRevision(value => value && { ...value, error: 'El ensamblaje ha cambiado. Cancela y vuelve a crear la revisión.' }); return }
    try { assemblyRootRevisionTicket(base, generation.current, rootRevision.revision) }
    catch (reason) { setRootRevision(value => value && { ...value, error: (reason as Error).message }); return }
    const revision = rootRevision.revision
    setRootRevision(null); invalidate()
    const ticket = assemblyRootRevisionTicket(base, ++generation.current, revision)
    operation.current = true; setBusy(true); setCancelable(true); notify('Verificando la nueva revisión del ensamblaje…')
    try {
      const reply = await previewAssemblyRootRevision(base, revision)
      if (!assemblyRootRevisionTicketIsCurrent(ticket, current.current, generation.current, mounted.current)) { if (reply.status === 'ready') discardToken(reply.token); return }
      if (reply.status === 'ready' && !assemblyRootRevisionReplyMatches(reply, ticket, base)) { discardToken(reply.token); throw Error('La vista previa no corresponde a la revisión solicitada.') }
      acceptReply(reply, ticket.generation, ticket.signature)
    } catch (reason) { if (mounted.current && ticket.generation === generation.current) notify((reason as Error).message, true) }
    finally { if (mounted.current && ticket.generation === generation.current) { operation.current = false; setBusy(false); setCancelable(false) } }
  }
  const move = async (request: AssemblyComponentMotion) => {
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog) return
    if (!selected || selected.occurrence.fixed || selected.suppressed || !samePath(request.component.occurrencePath, selected.path)
      || assemblyDefinitionKey(request.component.definition) !== assemblyDefinitionKey(selected.occurrence.definition)) { notify('Selecciona una ocurrencia libre y activa para moverla.', true); return }
    const base = current.current, signature = serializeAssemblyDocument(base); invalidate(); const id = ++generation.current
    operation.current = true; setBusy(true); setCancelable(true); notify('Comprobando el incremento angular y sus estaciones con las relaciones existentes…')
    try {
      const reply = await moveAssemblyComponentMotion(base, request)
      if (!mounted.current || id !== generation.current || signature !== serializeAssemblyDocument(current.current)) { if (reply.status === 'ready') discardToken(reply.token); return }
      if (reply.status === 'ready' && (reply.projection || reply.translation || !assemblyMotionMatches(reply.motion, request, selected.parent, selected.occurrence.pose)
        || !reply.checks.every(check => check.satisfied) || !reply.scopes.some(scope => assemblyDefinitionKey(scope.definition) === assemblyDefinitionKey(selected.parent)
          && scope.temporaryAnchor?.occurrenceId === selected.path.at(-1)))) {
        discardToken(reply.token); throw new Error('El resultado no corresponde al componente, incremento angular y estaciones solicitados.')
      }
      acceptReply(reply, id, signature)
    }
    catch (reason) { if (mounted.current && id === generation.current) { restoreScene(); notify((reason as Error).message, true) } }
    finally { if (mounted.current && id === generation.current) { operation.current = false; setBusy(false); setCancelable(false) } }
  }
  const translate = async (request: AssemblyTranslationRequest, stopOptions: Pick<AssemblyTranslationStopOptions, 'clearance' | 'lengthTolerance'>) => {
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || !selected) return
    const base = current.current, signature = serializeAssemblyDocument(base)
    if (sceneSignature.current !== signature || confirmedScene.current?.signature !== signature) { notify('Espera a que se reconstruya el ensamblaje antes de trasladarlo.', true); return }
    let frame: AssemblyDragFrame
    try {
      frame = prepareAssemblyDragFrame(base, { occurrencePath: [...selected.path], definition: { ...selected.occurrence.definition } })
      if (!samePath(request.component.occurrencePath, frame.component.occurrencePath)
        || assemblyDefinitionKey(request.component.definition) !== assemblyDefinitionKey(frame.component.definition)) throw new Error('El destino no corresponde al componente seleccionado.')
    } catch (reason) { notify((reason as Error).message, true); return }
    invalidate(); const id = ++generation.current; operation.current = true; setBusy(true); setCancelable(true); notify('Comprobando la trayectoria rectilínea y la parada…')
    try {
      const reply = await translateAssemblyUntilContact(base, request, stopOptions)
      if (!mounted.current || id !== generation.current || signature !== serializeAssemblyDocument(current.current)) { if (reply.status === 'ready') discardToken(reply.token); return }
      if (reply.status === 'ready' && (reply.movement || reply.projection || !assemblyTranslationMatches(reply.translation, frame, request, stopOptions)
        || reply.scopes.some(scope => !!scope.temporaryAnchor) || !reply.checks.every(check => check.satisfied))) {
        discardToken(reply.token); throw new Error('El resultado de la traslación no corresponde al destino, componente y grupo seleccionados.')
      }
      acceptReply(reply, id, signature)
    } catch (reason) { if (mounted.current && id === generation.current) { restoreScene(); notify((reason as Error).message, true) } }
    finally { if (mounted.current && id === generation.current) { operation.current = false; setBusy(false); setCancelable(false) } }
  }
  const beginDrag = (): boolean => {
    if (dragMode === 'off' || symmetryPickingRef.current || operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || pickingFaces || !selected) return false
    const base = current.current, signature = serializeAssemblyDocument(base)
    if (sceneSignature.current !== signature || confirmedScene.current?.signature !== signature) return false
    let frame: AssemblyDragFrame
    try {
      frame = prepareAssemblyDragFrame(base, { occurrencePath: [...selected.path], definition: { ...selected.occurrence.definition } })
      if (!frame.visible || !assemblyHasVisibleDragBody(confirmedScene.current.scene, frame.component)) throw new Error('Selecciona un componente visible con geometría actual para arrastrarlo.')
    } catch (reason) { notify((reason as Error).message, true); return false }
    invalidate(); const id = ++generation.current, options = Object.freeze({}), mode = dragMode
    operation.current = true; dragging.current = true; dragAnchor.current = frame; setDragActive(true); setBusy(true); setCancelable(true)
    notify('Arrastra el manipulador. Sólo se muestran destinos verificados por las relaciones; al soltar podrás Aplicar.')
    const matches = () => mounted.current && id === generation.current && serializeAssemblyDocument(current.current) === signature
    const finish = () => { dragSession.current = null; dragAnchor.current = null; dragging.current = false; setDragActive(false); operation.current = false; setBusy(false); setCancelable(false) }
    const controller = createAssemblyDragSession<AssemblyPreviewReply>({
      request: pose => projectAssemblyDrag(base, { component: frame.component, pose, mode }, options), discard: discardToken,
      onVerified: (reply, final) => {
        if (!matches()) { if (final) discardToken(reply.token); controller.cancel(); return }
        if (reply.movement || !assemblyDragProjectionMatches(reply.projection, frame, mode, { id: base.id, revision: base.revision })
          || reply.scopes.some(scope => !!scope.temporaryAnchor) || !reply.checks.every(check => check.satisfied)) {
          if (final) discardToken(reply.token); controller.cancel(); finish(); setStreamProjection(null); restoreScene(); setReports([]); notify('El resultado del arrastre no corresponde al componente y grupo seleccionados.', true); return
        }
        if (final) { setStreamProjection(null); finish(); acceptReply(reply, id, signature) }
        else { setStreamProjection({ projection: reply.projection!, checks: reply.checks, baseSignature: signature, generation: id }); setScene(reply.scene); setReports(reply.scopes); notify('Proyección local verificada. El arrastre continúa; Aplicar permanece bloqueado hasta soltar y verificar el último destino.') }
      },
      onRejected: message => {
        if (!matches()) { controller.cancel(); return }
        setStreamProjection(null); restoreScene(); setReports([]); notify(message, true)
        if (!dragging.current) finish()
      },
      onEmpty: () => { if (matches()) { setStreamProjection(null); finish(); restoreScene(); notify('Arrastre terminado sin cambiar el documento confirmado.') } },
    })
    dragSession.current = controller; return true
  }
  const dragTarget = (pose: RigidPose) => {
    if (!dragging.current || !dragSession.current) return
    try { dragSession.current.target(pose) }
    catch (reason) { cancel(); notify((reason as Error).message, true) }
  }
  const endDrag = () => {
    const controller = dragSession.current; if (!controller) return
    dragging.current = false; setDragActive(false); notify('Verificando el último destino del arrastre…'); controller.end()
  }
  const apply = async () => {
    const candidate = currentPreview.current
    if (!candidate || operation.current || !canApplyAssemblyPreview(candidate, serializeAssemblyDocument(current.current), draft ? serializeAssemblyDocument(draft) : null, generation.current, false)) return
    const id = generation.current, replacing = !!currentReplacement.current, updatingDocument = !!currentDocumentUpdate.current,
      updatingPart = currentUpdate.current?.review.reviewId, linked = pendingLinked.current,
      revisingRoot = candidate.reply.document.id === current.current.id && candidate.reply.document.revision !== current.current.revision; operation.current = true; setBusy(true)
    try {
      const reply = await applyAssemblyPreview(current.current, candidate.reply.token)
      if (!mounted.current || id !== generation.current) return
      const document = history.current!.commitDocument(reply.document); currentPreview.current = null; setPreview(null); setDraft(null); currentUpdate.current = null; setSourceUpdate(null); currentDocumentUpdate.current = null; setDocumentUpdate(null); currentReplacement.current = null; setReplacementReview(null); sceneSignature.current = serializeAssemblyDocument(document); confirmedScene.current = { signature: sceneSignature.current, scene: reply.scene }
      creationReferenceDraft.current = null
      pendingLinked.current = null
      if (linked?.grantId) {
        const definition = document.definitions.find(d => assemblyDefinitionKey(d) === assemblyDefinitionKey(linked.target))
        if (definition && definition.sourceLink && linked.descriptor
          && linkedSourceBindingKey(linkedEpoch.current, definition) === linkedSourceBindingKey(linkedEpoch.current, { ...definition, sourceLink: linked.descriptor })) linkedBindings.current.bind(linkedEpoch.current, definition, linked.grantId)
        else linkedBindings.current.releaseGrant(linked.grantId)
        refreshLinked(v => v + 1)
      }
      setOrdinaryEdit(null); setReleaseRotation(false); setAngleEdit(null); setDistanceEdit(null); setCommitted(document); setScene(reply.scene); setSelectedFaceMeshes([]); setReferences([null, null]); setWidthReferences([null,null,null,null]); setEditingWidthId(null); setTangentReferences([null, null]); setCylinderReferences([null, null]); setSphereReferences([null, null]); setLimitReferences([null, null]); setLimitAngleReferences([null, null]); setLimitDirectedSelection(['', '', '']); setCylinderLarger(''); setSphereLarger(''); setMovementReset(value => value + 1); setDirectionEdit(null); setEditingTangentId(null); setEditingCylinderTangentId(null); setEditingSphereTangentId(null); setEditingLimitDistanceId(null); setEditingLimitAngleId(null)
      setEditingLimitDirectedAngleId(null)
      if (candidate.reply.translation) notify('Traslación aplicada. Se conservan las relaciones y el historial; no se añade un bloqueo temporal.')
      else if (candidate.reply.projection) notify('Proyección local aplicada. Se conservan las relaciones y el historial del ensamblaje.')
      else if (candidate.reply.motion) { setReports([]); notify('Movimiento angular aplicado. Resuelve de nuevo para medir los grados de libertad sin el ancla temporal.') }
      else if (candidate.reply.movement) { setReports([]); notify('Movimiento aplicado. Resuelve de nuevo para medir los grados de libertad sin el ancla temporal.') }
      else if (linked) notify(linked.descriptor ? 'Archivo vinculado y copia incorporada confirmados. Un Deshacer recupera el estado anterior.' : 'Archivo desvinculado. La copia incorporada se conserva.')
      else if (revisingRoot) notify('Nueva revisión creada. Guarda el archivo para que otros ensamblajes puedan revisar este cambio de origen.')
      else if (updatingDocument) notify('Origen de subensamblaje actualizado. Un Deshacer recupera la revisión anterior y sus referencias.')
      else if (replacing) notify('Pieza sustituida. Un Deshacer recupera el conjunto anterior y sus referencias.')
      else notify('Relaciones aplicadas. El historial conserva el estado anterior.')
    } catch (reason) {
      if (mounted.current && id === generation.current) {
        dropPendingLinked()
        // Apply consumes the worker's replacement review even when publication
        // fails. Leave its editor too, so a fresh review can be started.
        if (replacing) {
          const expired = currentReplacement.current
          currentReplacement.current = null; setReplacementReview(null)
          if (expired) void discardAssemblyPartReplacement(expired.review.reviewId).catch(() => {})
        }
        if (updatingDocument) { const expired = currentDocumentUpdate.current; currentDocumentUpdate.current = null; setDocumentUpdate(null); if (expired) void discardAssemblyDocumentUpdate(expired.review.reviewId).catch(() => {}) }
        if (updatingPart) { currentUpdate.current = null; setSourceUpdate(null); void discardAssemblyPartUpdate(updatingPart).catch(() => {}) }
        currentPreview.current = null; setPreview(null); setDraft(null); setStreamProjection(null); restoreScene()
        notify(replacing ? 'No se aplicó la sustitución. Revisa de nuevo la pieza. ' + (reason as Error).message : (reason as Error).message, true)
        setRebuild(value => value + 1)
      }
    }
    finally { if (mounted.current && id === generation.current) { operation.current = false; setBusy(false) } }
  }
  const save = async (saveAs = false): Promise<boolean> => {
    if (namedViews.isOpen || activity.commandActive || draft || hasStaging() || rootRevision) return false
    const snapshot = serializeAssemblyDocument(current.current), document = current.current; operation.current = true; setBusy(true)
    try {
      if (window.solidflow) { const target = await window.solidflow.saveDocument(snapshot, document.name, saveAs ? undefined : path); if (!target) return false; if (current.current === document) setPath(target) }
      else download(snapshot, document.name)
      if (mounted.current && current.current === document) setSaved(snapshot); notify('Ensamblaje guardado.'); return true
    } catch (reason) { notify((reason as Error).message, true); return false }
    finally { operation.current = false; if (mounted.current) setBusy(false) }
  }
  const exportBom = async () => {
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || !bomOpen) return
    const document = current.current, signature = serializeAssemblyDocument(document), id = generation.current
    const options = { ...currentBomOptions.current }, optionsSignature = JSON.stringify(options), name = document.name + '-materiales'
    const fresh = () => mounted.current && id === generation.current && signature === serializeAssemblyDocument(current.current)
      && optionsSignature === JSON.stringify(currentBomOptions.current) && !hasStaging() && !currentPreview.current
    operation.current = true; setBusy(true); setCancelable(false); notify('Exportando lista de materiales CSV…')
    try {
      const csv = serializeAssemblyBomCsv(document, options)
      if (!fresh()) return
      if (window.solidflow) {
        const target = await window.solidflow.exportDocument(new TextEncoder().encode(csv), name, 'csv')
        if (!fresh()) return
        notify(target === null ? 'Exportación CSV cancelada.' : 'Lista de materiales exportada como CSV.')
      } else { downloadBomCsv(csv, name); if (fresh()) notify('Lista de materiales descargada como CSV.') }
    } catch (reason) { if (fresh()) notify(reason instanceof Error ? reason.message : 'No se pudo exportar la lista de materiales.', true) }
    finally { if (mounted.current && id === generation.current) { operation.current = false; setBusy(false) } }
  }
  const exportGeometry = (format: AssemblyUiExportFormat) => runAssemblyGeometryExport(format, {
    operation, state: geometryExportState, setBusy: value => { setBusy(value); setCancelable(false) }, notify,
    build: exportAssemblyCad, buildStructured: exportAssemblyStep, write: window.solidflow ? (bytes, name, selectedFormat) => window.solidflow!.exportDocument(bytes, name, selectedFormat) : undefined,
    download: downloadAssemblyGeometry,
  })
  const mayReplace = async (ownsOperation = false): Promise<boolean> => {
    if ((!ownsOperation && operation.current) || hasStaging()) return false
    if (!dirtyRef.current) return true
    if (replaceAnswer.current) return false
    setReplaceDialog(true); return new Promise(resolve => { replaceAnswer.current = resolve })
  }
  const answerReplace = (answer: boolean) => { setReplaceDialog(false); const resolve = replaceAnswer.current; replaceAnswer.current = null; resolve?.(answer) }
  useEffect(() => {
    if (!replaceDialog) return
    const previous = window.document.activeElement
    replaceModal.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); answerReplace(false) }
      if (event.key === 'Tab') {
        const buttons = Array.from(replaceModal.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
        if (!buttons.length) return
        const first = buttons[0], last = buttons[buttons.length - 1]
        if (event.shiftKey && window.document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && window.document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', keyboard)
    return () => { window.removeEventListener('keydown', keyboard); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [replaceDialog])
  const replace = (document: AssemblyDocument, filePath?: string, fileSaved?: string) => {
    setNormalSelection(null)
    namedViews.close(); viewHistory.reset(); setView(previous => ({ name: 'iso', stamp: previous.stamp + 1 }))
    setOrdinaryEdit(null); setReleaseRotation(false); setAngleEdit(null); setDistanceEdit(null); setTreeReset(value => value + 1)
    restoreBomFocus.current = false; setRibbonTab('assembly'); managerTabRef.current = 'components'; setManagerTab('components')
    linkedEpoch.current++; linkedTicket.current = null; linkedBindings.current.clear(); refreshLinked(v => v + 1)
    setDirectionEdit(null); setEditingTangentId(null); setEditingCylinderTangentId(null); setEditingSphereTangentId(null); setEditingLimitDistanceId(null); setEditingLimitAngleId(null); setEditingLimitDirectedAngleId(null); setCylinderLarger(''); setSphereLarger('')
    invalidate(); setLimitDirectedSelection(['', '', '']); confirmedScene.current = null; sceneSignature.current = ''; setScene(null); history.current!.reset(document); setCommitted(validateAssemblyDocument(document)); setPath(filePath); setSaved(fileSaved ?? ''); setSelectedPath([]); setScopePath([]); setSourceKey(''); setEditingGearId(null); setEditingScrewId(null); setEditingRackId(null); setRackKeys(['', ''])
  }
  const importStructural = async () => {
    if(operation.current || hasStaging() || currentPreview.current || draft || rootRevision || replaceDialog) return
    const signature=serializeAssemblyDocument(current.current), id=generation.current
    const fresh=()=>mounted.current && generation.current===id && serializeAssemblyDocument(current.current)===signature && !hasStaging() && !currentPreview.current && !exportView.current.draft
    operation.current=true;setBusy(true);setCancelable(false)
    try {
      await importStructuralStep({fresh,prepare:importAssemblyStep,
        read:window.solidflow?()=>window.solidflow!.importStep():()=>new Promise<StepFile|null>((resolve,reject)=>{structuralRead.current={resolve,reject};structuralInput.current?.click()}),
        confirm:()=>mayReplace(true),commit:document=>{
          // Release this import synchronously before replacement invalidates its
          // generation and the normal workspace build acquires its own gate.
          operation.current=false;setBusy(false);setCancelable(false)
          replace(document)
        },
      })
    } catch(reason){if(fresh())notify((reason as Error).message,true)}
    finally {if(mounted.current && generation.current===id){operation.current=false;setBusy(false);setCancelable(false)}}
  }
  const insertStructural = async () => {
    if(operation.current || hasStaging() || currentPreview.current || draft || rootRevision || replaceDialog) return
    const signature=serializeAssemblyDocument(current.current), id=generation.current
    const capturedPath=JSON.stringify(scopePath), capturedScope={...scopeReference}
    const fresh=()=>mounted.current && generation.current===id && serializeAssemblyDocument(current.current)===signature
      && currentFileScope.current===capturedPath && !hasStaging() && !currentPreview.current && !exportView.current.draft
    operation.current=true;setBusy(true);setCancelable(false)
    try {
      await insertAssemblyStepFile({current:current.current,scope:capturedScope,fresh,prepare:insertAssemblyStep,
        read:window.solidflow?()=>window.solidflow!.importStep():()=>new Promise<StepFile|null>((resolve,reject)=>{structuralRead.current={resolve,reject};structuralInput.current?.click()}),
        commit:document=>{
          // The following ordinary change invalidates this generation. Release
          // only this insertion before the normal rebuild owns the next gate.
          operation.current=false;setBusy(false);setCancelable(false)
          change(document)
        },
      })
    } catch(reason){if(fresh())notify((reason as Error).message,true)}
    finally {if(mounted.current && generation.current===id){operation.current=false;setBusy(false);setCancelable(false)}}
  }
  const replacementSelection = (): AssemblyReplacementSelection => {
    if (!selected || selected.definition.kind !== 'part') throw new Error('Selecciona la instancia actual de una pieza.')
    return { component: { occurrencePath: [...selected.path], definition: { ...selected.occurrence.definition } }, mode: replacementMode,
      ancestorRevisions: replacementMode === 'selected' ? selected.path.slice(1).map(() => crypto.randomUUID()) : [] }
  }
  const reviewReplacement = async (request: AssemblyPartReplacementRequest) => {
    const base = current.current, signature = serializeAssemblyDocument(base), id = generation.current
    setCancelable(true); notify('Revisando sustitución, instancias y referencias afectadas…')
    const review = await reviewAssemblyPartReplacement(base, request)
    if (!mounted.current || id !== generation.current || signature !== serializeAssemblyDocument(current.current)) {
      void discardAssemblyPartReplacement(review.reviewId).catch(() => {}); return
    }
    const stage: AssemblyUiReplacement = { review, decisions: { repairs: [], removed: [], recapture: [] }, baseSignature: signature }
    currentReplacement.current = stage; setReplacementReview(stage); setScene(review.scene)
    notify('Sustitución pendiente. Elige las referencias indicadas y resuelve antes de Aplicar.')
  }
  const replaceWithEmbeddedPart = async () => {
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog) return
    const target = current.current.definitions.find(value => assemblyDefinitionKey(value) === replacementTarget)
    if (!target || target.kind !== 'part') return
    try {
      const selection = replacementSelection()
      invalidate(); operation.current = true; setBusy(true); setCancelable(true)
      const id = generation.current
      try { await reviewReplacement({ ...selection, part: target.document, revision: target.revision }) }
      catch (reason) { if (mounted.current && id === generation.current) notify((reason as Error).message, true) }
      finally { if (mounted.current && id === generation.current) { operation.current = false; setBusy(false); setCancelable(false) } }
    } catch (reason) { notify((reason as Error).message, true) }
  }
  const changeReplacementDecisions = (decisions: AssemblyReplacementDecisions) => {
    const stage = currentReplacement.current
    if (operation.current || !stage || stage.baseSignature !== serializeAssemblyDocument(current.current)) return
    invalidate(true)
    const next = { ...stage, decisions: structuredClone(decisions) }
    currentReplacement.current = next; setReplacementReview(next)
  }
  const repairReplacement = (endpoint: AssemblyReplacementEndpoint, choice: AssemblyReplacementChoice) => {
    const stage = currentReplacement.current
    if (operation.current || !stage) return
    const original = stage.review.endpoints.find(value => replacementEndpointKey(value.locator) === replacementEndpointKey(endpoint.locator))
    const actual = original && assemblyReplacementChoices(stage.review, original).find(value => value.key === choice.key)
    if (!original || !actual || original.retainFrame) { notify('La referencia ya no pertenece a las opciones de esta sustitución.', true); return }
    changeReplacementDecisions({ ...stage.decisions, repairs: [...stage.decisions.repairs.filter(value => replacementEndpointKey(value.locator) !== replacementEndpointKey(original.locator)),
      { locator: structuredClone(original.locator), reference: structuredClone(actual.reference) }] })
  }
  const solveReplacement = async () => {
    const stage = currentReplacement.current
    if (operation.current || !stage || replaceDialog || stage.baseSignature !== serializeAssemblyDocument(current.current)) return
    if (assemblyReplacementPending(stage.review, stage.decisions)) { notify('Completa las referencias y decisiones de acoplamiento antes de resolver.', true); return }
    const base = current.current, signature = stage.baseSignature; invalidate(true); const id = generation.current
    operation.current = true; setBusy(true); setCancelable(true); notify('Resolviendo la sustitución y verificando sus relaciones…')
    try { acceptReply(await previewAssemblyPartReplacement(base, stage.review.reviewId, structuredClone(stage.decisions)), id, signature) }
    catch (reason) { if (mounted.current && id === generation.current) notify((reason as Error).message, true) }
    finally { if (mounted.current && id === generation.current) { operation.current = false; setBusy(false); setCancelable(false) } }
  }
  const readContent = async (content: string, purpose: AssemblyFilePurpose, filePath?: string, source?: AssemblyDefinitionReference, replacement?: AssemblyReplacementSelection, insertionScope?: AssemblyDefinitionReference, sourceKind?: 'part' | 'assembly', insertionNavigation?: AssemblyInsertionNavigation) => {
    if (purpose === 'open') {
      const saved = parseSavedCadDocument(content)
      if (saved.version === 3) {
        if (!onOpenConfigured) throw Error('Este espacio no puede abrir ensamblajes configurados.')
        invalidate(); onOpenConfigured(saved, filePath, content); return
      }
    }
    const document = parseCadDocument(content)
    if (purpose === 'replace-component') {
      if (document.version !== 1 || !replacement) throw new Error('La sustitución necesita un documento de pieza y una instancia seleccionada actual.')
      await reviewReplacement({ ...replacement, part: document, revision: crypto.randomUUID() }); return
    }
    if (purpose === 'update') {
      if (!source || !sourceKind || (sourceKind === 'part' ? document.version !== 1 : document.version !== 2)) throw new Error('La versión del archivo debe corresponder al tipo de origen seleccionado: pieza o subensamblaje.')
      const base = current.current, signature = serializeAssemblyDocument(base), id = generation.current
      setCancelable(true); notify('Revisando la nueva revisión y sus referencias…')
      if (document.version === 2) {
        const review = await reviewAssemblyDocumentUpdate(base, source, document)
        if (!mounted.current || id !== generation.current || signature !== serializeAssemblyDocument(current.current)) { void discardAssemblyDocumentUpdate(review.reviewId).catch(() => {}); return }
        const stage: AssemblyUiDocumentUpdate = { review, decisions: { repairs: [], removed: [], recapture: [], unlocked: [] }, baseSignature: signature }
        currentDocumentUpdate.current = stage; setDocumentUpdate(stage); setScene(review.scene)
        notify('Actualización de subensamblaje pendiente. Decide las referencias y capturas antes de resolver.'); return
      }
      const review = await reviewAssemblyPartUpdate(base, source, document, crypto.randomUUID())
      if (!mounted.current || id !== generation.current || signature !== serializeAssemblyDocument(current.current)) { if (review.reviewId) void discardAssemblyPartUpdate(review.reviewId).catch(() => {}); return }
      const stage = { review, document: validateAssemblyDocument(review.document), repaired: [], baseSignature: signature }
      currentUpdate.current = stage; setSourceUpdate(stage); setScene(review.scene); notify('Actualización pendiente. Repara las referencias indicadas y resuelve antes de Aplicar.'); return
    }
    if (purpose === 'insert') {
      const next = insertAssemblyComponent(current.current, document, insertionScope)
      if (insertionNavigation) commitInsertion(next, insertionNavigation)
      else change(next)
      notify('Componente incorporado como origen reutilizable.'); return
    }
    if (document.version === 1) { invalidate(); onOpenPart(document, filePath, content) }
    else replace(document, filePath, serializeAssemblyDocument(document))
  }
  const linkedContext = (): LinkedSourceTicket & { mounted: boolean } => {
    const row = assemblyTreeRows(current.current).find(row => JSON.stringify(row.path) === currentFileSelection.current)
    return { mounted: mounted.current, epoch: linkedEpoch.current, generation: generation.current, signature: serializeAssemblyDocument(current.current),
      scopePath: currentFileScope.current, selectionPath: currentFileSelection.current,
      definition: row ? JSON.stringify([row.definition.kind, assemblyDefinitionKey(row.definition)]) : '',
      descriptor: row ? linkedSourceBindingKey(linkedEpoch.current, row.definition) : '' }
  }
  const loadLinkedSource = async (reload = false) => {
    if (!selected || operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || !window.solidflow?.chooseLinkedSource) return
    const definition = selected.definition, source = { id: definition.id, revision: definition.revision }, base = current.current,
      existingGrant = linkedBindings.current.get(linkedEpoch.current, definition)
    if (reload && !existingGrant) { notify('Selecciona el archivo para volver a vincular el origen.', true); return }
    invalidate(); const { mounted: _mounted, ...ticket } = linkedContext(); linkedTicket.current = ticket
    const fresh = () => linkedSourceTicketIsCurrent(ticket, linkedContext())
    operation.current = true; setBusy(true); setCancelable(true); notify(reload ? 'Leyendo el archivo de origen…' : 'Selecciona el archivo de origen correspondiente…')
    let captured: LinkedSourceRead | null = null, capturedPending: PendingLinkedSource | null = null
    try {
      captured = reload ? await window.solidflow.readLinkedSource(existingGrant!) : await window.solidflow.chooseLinkedSource()
      if (!captured) { if (fresh()) notify('Selección cancelada. La copia incorporada no ha cambiado.'); return }
      if (!fresh()) { releaseUnstagedLinkedRead(captured.grantId, reload, false, id => linkedBindings.current.releaseGrant(id)); return }
      const descriptor = linkedSourceDescriptor(captured), incoming = parseCadDocument(captured.content), equal = linkedSourceContentsEqual(base, source, incoming)
      if (!equal) requireLinkedSourceUpdateRevision(source, incoming)
      if (equal && definition.sourceLink && linkedSourceBindingKey(linkedEpoch.current, definition) === linkedSourceBindingKey(linkedEpoch.current, { ...definition, sourceLink: descriptor })) {
        linkedBindings.current.bind(linkedEpoch.current, definition, captured.grantId); refreshLinked(v => v + 1)
        notify(reload ? 'El archivo no ha cambiado. La copia incorporada y el historial se conservan.' : 'Archivo vinculado para esta sesión. La copia incorporada no ha cambiado.'); return
      }
      pendingLinked.current = capturedPending = { grantId: captured.grantId, target: source, descriptor }
      if (equal) {
        const proposed = setAssemblySourceLink(base, source, descriptor)
        acceptReply(await previewAssembly(base, proposed), ticket.generation, ticket.signature)
        if (!fresh()) dropPendingLinked(capturedPending)
        return
      }
      if (incoming.version === 1) {
        const review = await reviewAssemblyPartUpdate(base, source, incoming, crypto.randomUUID(), descriptor)
        if (!fresh()) { if (review.reviewId) void discardAssemblyPartUpdate(review.reviewId).catch(() => {}); dropPendingLinked(capturedPending); return }
        capturedPending.target = review.replacement
        const stage: AssemblyUiSourceUpdate = { review, document: validateAssemblyDocument(review.document), repaired: [], baseSignature: ticket.signature }
        currentUpdate.current = stage; setSourceUpdate(stage); setScene(review.scene)
        notify('Archivo modificado. Revisa las referencias y resuelve antes de Aplicar.'); return
      }
      const review = await reviewAssemblyDocumentUpdate(base, source, incoming, descriptor)
      if (!fresh()) { void discardAssemblyDocumentUpdate(review.reviewId).catch(() => {}); dropPendingLinked(capturedPending); return }
      capturedPending.target = review.replacement
      const stage: AssemblyUiDocumentUpdate = { review, decisions: { repairs: [], removed: [], recapture: [], unlocked: [] }, baseSignature: ticket.signature }
      currentDocumentUpdate.current = stage; setDocumentUpdate(stage); setScene(review.scene)
      notify('Subensamblaje modificado. Revisa sus referencias y resuelve antes de Aplicar.')
    } catch (reason) {
      if (capturedPending) dropPendingLinked(capturedPending)
      else releaseUnstagedLinkedRead(captured?.grantId ?? existingGrant, reload, fresh(), id => linkedBindings.current.releaseGrant(id))
      if (mounted.current) refreshLinked(v => v + 1)
      if (fresh()) notify((reason as Error).message, true)
    } finally {
      if (linkedTicket.current === ticket) linkedTicket.current = null
      if (mounted.current && ticket.generation === generation.current) { operation.current = false; setBusy(false); setCancelable(false) }
    }
  }
  const detachLinkedSource = async () => {
    if (!selected?.definition.sourceLink || operation.current || hasStaging() || currentPreview.current || draft || replaceDialog) return
    const base = current.current, target = { id: selected.definition.id, revision: selected.definition.revision }, proposed = setAssemblySourceLink(base, target, null)
    invalidate(); pendingLinked.current = { target, descriptor: null }
    const id = generation.current, signature = serializeAssemblyDocument(base); operation.current = true; setBusy(true); setCancelable(true)
    try { acceptReply(await previewAssembly(base, proposed), id, signature) }
    catch (reason) { if (mounted.current && id === generation.current) { dropPendingLinked(); notify((reason as Error).message, true) } }
    finally { if (mounted.current && id === generation.current) { operation.current = false; setBusy(false); setCancelable(false) } }
  }
  const open = async (purpose: AssemblyFilePurpose) => {
    if (operation.current || hasStaging()) return
    clearInspection()
    const source = purpose === 'update' && selected ? { id: selected.definition.id, revision: selected.definition.revision } : undefined
    const sourceKind = purpose === 'update' ? selected?.definition.kind : undefined
    let replacement: AssemblyReplacementSelection | undefined
    if (purpose === 'replace-component') {
      if (preview || draft || replaceDialog) return
      try { replacement = replacementSelection() } catch (reason) { notify((reason as Error).message, true); return }
      invalidate()
    }
    if (purpose === 'update') { if (!source || preview) return; invalidate() }
    const ticket: AssemblyFileTicket = { purpose, source, sourceKind, replacement, selectionPath: purpose === 'update' ? JSON.stringify(selectedPath) : undefined, scope: purpose === 'insert' ? { ...scopeReference } : undefined,
      scopePath: JSON.stringify(scopePath), signature: serializeAssemblyDocument(current.current), generation: generation.current,
      insertionNavigation: purpose === 'insert' ? { scopePath: [...scopePath], epoch: insertionNavigationEpoch.current } : undefined }
    if (!window.solidflow) { fileTicket.current = ticket; fileInput.current?.click(); return }
    if (purpose === 'open' && !await mayReplace()) return
    operation.current = true; setBusy(true)
    // A replacement confirmation may have saved the same document. Capture its
    // generation after that confirmation, before the native picker opens.
    ticket.signature = serializeAssemblyDocument(current.current); ticket.generation = generation.current
    try { const file = await window.solidflow.openDocument(); if (file && mounted.current && assemblyFileTicketIsCurrent(ticket, serializeAssemblyDocument(current.current), generation.current, currentFileScope.current, currentFileSelection.current)) await readContent(file.content, purpose, file.path, source, replacement, ticket.scope, ticket.sourceKind, ticket.insertionNavigation) }
    catch (reason) { if (mounted.current && (purpose !== 'update' && purpose !== 'replace-component' || ticket.generation === generation.current)) notify((reason as Error).message, true) }
    finally { if (purpose !== 'update' && purpose !== 'replace-component' || ticket.generation === generation.current) { operation.current = false; if (mounted.current) { setBusy(false); setCancelable(false) } } }
  }
  const repairSource = (endpoint: AssemblySourceEndpointReview, choice: AssemblySourceRepairChoice) => {
    const stage = currentUpdate.current
    if (operation.current || !stage || stage.baseSignature !== serializeAssemblyDocument(current.current)) return
    try {
      const original = stage.review.endpoints.find(value => assemblySourceEndpointKey(value) === assemblySourceEndpointKey(endpoint))
      const actual = original && assemblySourceRepairChoices(stage.review, stage.document, original).find(value => value.key === choice.key)
      if (!original || !actual) throw new Error('La cara ya no pertenece a las opciones actuales de esta referencia.')
      const document = repairAssemblyEndpoint(stage.document, original.locator, actual.reference)
      invalidate(true)
      const next = { ...stage, document, repaired: [...new Set([...stage.repaired, assemblySourceEndpointKey(original)])] }
      currentUpdate.current = next; setSourceUpdate(next); notify('Referencia reparada. Resuelve la actualización para verificarla con el worker.')
    } catch (reason) { notify((reason as Error).message, true) }
  }
  const changeDocumentUpdate = (decide: (stage: AssemblyUiDocumentUpdate) => AssemblyDocumentUpdateDecisions) => {
    const stage = currentDocumentUpdate.current
    if (operation.current || !stage || stage.baseSignature !== serializeAssemblyDocument(current.current)) return
    try {
      const decisions = decide(stage)
      invalidate(true)
      const next = { ...stage, decisions }
      currentDocumentUpdate.current = next; setDocumentUpdate(next); setScene(stage.review.scene)
      notify('Decisión registrada. Resuelve de nuevo para verificar la actualización.')
    } catch (reason) { notify((reason as Error).message, true) }
  }
  const repairDocumentSource = (endpoint: AssemblyDocumentUpdateReview['endpoints'][number], choiceKey: string) => changeDocumentUpdate(stage => {
    const key = assemblyDocumentUpdateEndpointKey(endpoint.locator)
    const original = stage.review.endpoints.find(value => assemblyDocumentUpdateEndpointKey(value.locator) === key)
    if (!original || stage.decisions.removed.some(value => assemblyDocumentUpdateMateKey(value) === assemblyDocumentUpdateMateKey(original.locator))) throw new Error('La referencia ya no pertenece a la revisión actual.')
    const matches = assemblyDocumentUpdateChoices(stage.review, original).filter(value => value.key === choiceKey)
    if (choiceKey && matches.length !== 1) throw new Error('Selecciona una referencia única del catálogo actual.')
    return { ...stage.decisions, repairs: [...stage.decisions.repairs.filter(value => assemblyDocumentUpdateEndpointKey(value.locator) !== key),
      ...(choiceKey ? [{ locator: structuredClone(original.locator), reference: structuredClone(matches[0].reference) }] : [])] }
  })
  const decideDocumentMate = (locator: AssemblyDocumentUpdateDecisions['removed'][number], decision: DocumentUpdateMateDecision) => changeDocumentUpdate(stage => {
    const key = assemblyDocumentUpdateMateKey(locator)
    const original = stage.review.endpoints.find(value => assemblyDocumentUpdateMateKey(value.locator) === key)?.locator
      ?? stage.review.capturedMates.find(value => assemblyDocumentUpdateMateKey(value) === key)
    const capture = stage.review.capturedMates.find(value => assemblyDocumentUpdateMateKey(value) === key)
    if (!original || !['keep','removed','recapture','unlocked'].includes(decision) || decision === 'recapture' && !capture || decision === 'unlocked' && capture?.type !== 'concentric') throw new Error('La decisión no corresponde a una relación de la revisión actual.')
    const actual = { scope: { ...original.scope }, mateId: original.mateId }
    return { repairs: stage.decisions.repairs.filter(value => decision !== 'removed' || assemblyDocumentUpdateMateKey(value.locator) !== key),
      removed: [...stage.decisions.removed.filter(value => assemblyDocumentUpdateMateKey(value) !== key), ...(decision === 'removed' ? [actual] : [])],
      recapture: [...stage.decisions.recapture.filter(value => assemblyDocumentUpdateMateKey(value) !== key), ...(decision === 'recapture' ? [actual] : [])],
      unlocked: [...stage.decisions.unlocked.filter(value => assemblyDocumentUpdateMateKey(value) !== key), ...(decision === 'unlocked' ? [actual] : [])] }
  })
  const solveDocumentUpdate = async () => {
    const stage = currentDocumentUpdate.current
    if (operation.current || !stage || stage.baseSignature !== serializeAssemblyDocument(current.current)) return
    if (assemblyDocumentUpdatePending(stage.review, stage.decisions)) { notify('Completa las referencias y decisiones de captura antes de resolver.', true); return }
    const base = current.current, signature = stage.baseSignature
    invalidate(true); const id = generation.current
    operation.current = true; setBusy(true); setCancelable(true); notify('Resolviendo y verificando la actualización del subensamblaje…')
    try { acceptReply(await previewAssemblyDocumentUpdate(base, stage.review.reviewId, structuredClone(stage.decisions)), id, signature) }
    catch (reason) { if (mounted.current && id === generation.current) notify((reason as Error).message, true) }
    finally { if (mounted.current && id === generation.current) { operation.current = false; setBusy(false); setCancelable(false) } }
  }
  const acceptSymmetryPick = (payload: AssemblySceneVertex | AssemblySceneFace | AssemblySceneEdge | null, channel: 'vertex' | 'face' | 'edge', eventTicket: SymmetryPickTicket | null) => {
    const ticket = symmetryPickingRef.current, intent = symmetryIntent.current, confirmed = confirmedScene.current
    const signature = serializeAssemblyDocument(current.current)
    const blocked = !isSymmetry || !!dragSession.current || dragging.current || operation.current || hasStaging() || !!currentPreview.current || !!draft || replaceDialog
      || sceneSignature.current !== signature || confirmed?.signature !== signature || intent.signature !== signature
    if (!currentSymmetryPick(ticket, { signature, scope: intent.scope, generation: generation.current, sceneId: confirmed?.scene.sceneId ?? null, family: intent.family, blocked }, eventTicket)) return
    const expectedChannel = ticket.producer === 'vertex' ? 'vertex' : ticket.producer === 'line-edge' ? 'edge' : 'face'
    if (channel !== expectedChannel) return
    const actual = scopedAssemblySymmetryPick(confirmed!.scene, payload, JSON.parse(intent.scope), ticket.family, ticket.slot, ticket.producer)
    if (!actual) { notify('Selecciona un soporte visible actual del propósito y ámbito elegidos.', true); return }
    const next: SymmetryUiReferences = [...intent.references]; next[ticket.slot] = actual.reference
    symmetryIntent.current = { ...intent, references: next }; setSymmetryReferences(next)
    const following = nextSymmetryPick(ticket, next); setSymmetryPicking(following)
    setPickingFaces(!!following && following.producer !== 'vertex' && following.producer !== 'line-edge'); setPickingLinearEdges(following?.producer === 'line-edge')
    notify(following ? 'Referencia seleccionada. Selecciona ' + SYMMETRY_ROLE_LABELS[following.slot] + '.' : 'Tres referencias seleccionadas. Resuelve para verificarlas.')
  }
  const pickSymmetryVertex = (vertex: AssemblySceneVertex | null) => acceptSymmetryPick(vertex, 'vertex', symmetryPicking)
  const hingeLiveCurrent = (ticket: HingeUiTicket) => liveHingeTicketIsCurrent(ticket, hingeContext.current, {
    mounted: mounted.current, signature: serializeAssemblyDocument(current.current), generation: generation.current,
    scope: currentFileScope.current, sceneId: confirmedScene.current?.scene.sceneId ?? null,
    confirmedSignature: confirmedScene.current?.signature ?? null, sceneSignature: sceneSignature.current,
  })
  const acceptHingePick = (incoming: AssemblySceneFace | AssemblySceneEdge | null, producer: 'face' | 'line-edge', expected: HingePickTicket | null) => {
    const ticket = expected, context = hingeContext.current
    if (!incoming || !context || !renderedHingePick(ticket, hingePickingRef.current, context, !isHinge || !symmetryMayEdit() || dragActive || !!dragSession.current) || !hingeLiveCurrent(ticket) || ticket.producer !== producer) return
    const confirmed = confirmedScene.current
    if (!confirmed || confirmed.signature !== serialized || confirmed.scene.sceneId !== ticket.sceneId) return
    let reference: HingeUiReference | null = null
    if (producer === 'face' && 'face' in incoming.selection) {
      const matches = confirmed.scene.bodies.filter(b => b.visible).flatMap(b => b.faces).filter(f => assemblyFaceKey(f) === assemblyFaceKey(incoming as AssemblySceneFace))
      const found = matches.length === 1 ? scopedAssemblyFace(matches[0], scopePath) : null
      if (found && (ticket.slot < 2 ? axis(found) : found.kind === 'principal-plane' || found.kind === 'face' && found.support === 'plane')) reference = found as HingeUiReference
    } else if (producer === 'line-edge' && ticket.slot < 2 && 'edge' in incoming.selection) {
      const matches = confirmed.scene.bodies.filter(b => b.visible).flatMap(b => b.edges ?? []).filter(e => assemblyEdgeKey(e) === assemblyEdgeKey(incoming as AssemblySceneEdge))
      reference = matches.length === 1 ? scopedAssemblyEdge(matches[0], scopePath) : null
    }
    if (!reference) { notify(ticket.slot < 2 ? 'Selecciona un eje cilíndrico o una arista recta actual.' : 'Selecciona una cara plana actual.', true); return }
    const refs: HingeUiReferences = [...hingeReferencesRef.current]; refs[ticket.slot] = reference; setHingeReferences(refs)
    const next = nextHingePick(ticket, refs); setHingePicking(next)
    setPickingFaces(next?.producer === 'face'); setPickingLinearEdges(next?.producer === 'line-edge')
    notify(next ? 'Selecciona ' + HINGE_ROLE_LABELS[next.slot] + '.' : 'Referencias seleccionadas. Verifica la bisagra.')
  }
  const pickFace = (face: AssemblySceneFace | null) => {
    if (isHinge) { acceptHingePick(face, 'face', activeHingePick); return }
    if (isSymmetry) { acceptSymmetryPick(face, 'face', symmetryPicking); return }
    if (operation.current || hasStaging() || currentPreview.current || standardPreviewFamily && referenceEditing && !isWidth && !editedReferences || sceneSignature.current !== serialized || !referenceEditorIsCurrent()) return
    if (!face) return
    if (isWidth) {
      if (!pickingFaces || !widthPicking || draft || replaceDialog || confirmedScene.current?.signature !== serialized
        || widthPicking.signature !== serialized || widthPicking.scope !== JSON.stringify(scopePath) || widthPicking.generation !== generation.current) return
      const actual = scopedAssemblyWidthPick(scene, face, scopePath)
      if (!actual) { notify('Selecciona una cara plana visible dentro del ámbito actual.', true); return }
      const next: WidthUiReferences = [...widthReferences]; next[widthPicking.slot] = actual.reference
      setWidthReferences(next); setPickingLinearEdges(false); setFaceChoice(assemblyFaceKey(actual.face))
      const missing = Array.from({ length: 4 }, (_, offset) => (widthPicking.slot + offset + 1) % 4).find(index => next[index] === null)
      setWidthPicking(missing === undefined ? null : { ...widthPicking, slot: missing as WidthUiSlot }); setPickingFaces(missing !== undefined)
      notify(missing === undefined ? 'Cuatro planos seleccionados. Elige las bisectrices y resuelve para verificarlos.' : 'Plano seleccionado. Selecciona ' + WIDTH_ROLE_LABELS[missing] + '.')
      return
    }
    if (isLimitAngle) {
      if (draft || replaceDialog) return
      const actual = scene?.bodies.filter(body => body.visible).flatMap(body => body.faces).find(value => assemblyFaceKey(value) === assemblyFaceKey(face))
      const reference = actual && scopedAssemblyFace(actual, scopePath)
      if (!reference) { notify('Selecciona un plano o eje cilíndrico actual dentro del ámbito.', true); return }
      setPickingFaces(false); setPickingLinearEdges(false); setFaceChoice(assemblyFaceKey(actual!))
      setLimitAngleReferences(values => { const next: typeof values = [...values]; next[endpointSlot] = reference; return next })
      setEndpointSlot(endpointSlot === 0 ? 1 : 0); notify('Dirección seleccionada. ' + relationSelectionGuidance(endpointSlot)); return
    }
    if (isLimitDistance) {
      if (draft || replaceDialog) return
      const actual = scene?.bodies.filter(body => body.visible).flatMap(body => body.faces).find(value => assemblyFaceKey(value) === assemblyFaceKey(face))
      const reference = actual && scopedAssemblyPlaneFace(actual, scopePath)
      if (!reference) { notify('Selecciona una cara plana actual dentro del ámbito.', true); return }
      setPickingFaces(false); setPickingLinearEdges(false); setFaceChoice(assemblyFaceKey(actual!))
      setLimitReferences(values => { const next: typeof values = [...values]; next[endpointSlot] = reference; return next })
      setEndpointSlot(endpointSlot === 0 ? 1 : 0); notify('Plano seleccionado. ' + relationSelectionGuidance(endpointSlot)); return
    }
    if (isSphereTangent) {
      if (draft || replaceDialog) return
      const actual = scene?.bodies.filter(body => body.visible).flatMap(body => body.faces).find(value => assemblyFaceKey(value) === assemblyFaceKey(face))
      const reference = actual && scopedAssemblySphereTangentFace(actual, scopePath, mateType)
      if (!reference) { notify('Selecciona una superficie actual compatible con la familia de tangencia y dentro del ámbito.', true); return }
      setPickingFaces(false); setPickingLinearEdges(false); setFaceChoice(assemblyFaceKey(actual!)); setSphereLarger('')
      setSphereReferences(values => { const next: typeof values = [...values]; next[endpointSlot] = reference; return next })
      setEndpointSlot(endpointSlot === 0 ? 1 : 0); notify('Superficie seleccionada. ' + relationSelectionGuidance(endpointSlot)); return
    }
    if (isCylinderTangent) {
      if (draft || replaceDialog) return
      const actual = scene?.bodies.filter(body => body.visible).flatMap(body => body.faces).find(value => assemblyFaceKey(value) === assemblyFaceKey(face))
      const reference = actual && scopedAssemblyCylinderSurface(actual, scopePath)
      if (!reference) { notify('Selecciona una superficie cilíndrica actual dentro del ámbito.', true); return }
      setPickingFaces(false); setPickingLinearEdges(false); setFaceChoice(assemblyFaceKey(actual!)); setCylinderLarger('')
      setCylinderReferences(values => { const next: typeof values = [...values]; next[endpointSlot] = reference; return next })
      setEndpointSlot(endpointSlot === 0 ? 1 : 0); notify('Superficie cilíndrica seleccionada. ' + relationSelectionGuidance(endpointSlot)); return
    }
    if (isTangent) {
      if (draft || replaceDialog) return
      const actual = scene?.bodies.filter(body => body.visible).flatMap(body => body.faces).find(value => assemblyFaceKey(value) === assemblyFaceKey(face))
      const reference = actual && scopedAssemblyTangentFace(actual, scopePath)
      if (!reference) { notify('Selecciona un plano o una superficie cilíndrica actual dentro del ámbito.', true); return }
      setPickingFaces(false); setPickingLinearEdges(false); setFaceChoice(assemblyFaceKey(actual!))
      setTangentReferences(values => { const next: typeof values = [...values]; next[endpointSlot] = reference; return next })
      setSelectedFaceMeshes(values => endpointSlot === 0 ? [actual!, ...values.slice(1)] : [...values.slice(0, 1), actual!])
      setEndpointSlot(endpointSlot === 0 ? 1 : 0); notify('Superficie seleccionada. ' + relationSelectionGuidance(endpointSlot)); return
    }
    if (draft || replaceDialog || confirmedScene.current?.signature !== serialized || confirmedScene.current?.scene !== scene) return
    const matches = scene.bodies.filter(body => body.visible).flatMap(body => body.faces).filter(value => assemblyFaceKey(value) === assemblyFaceKey(face))
    const actual = matches.length === 1 ? matches[0] : null
    const reference = actual && scopedAssemblyFace(actual, scopePath)
    if (!reference) { notify('Selecciona una cara plana o cilíndrica dentro del ámbito actual.', true); return }
    if (referenceEditTicket && ((mateType === 'distance' || mateType === 'coincident') && !plane(reference)
      || mateType === 'concentric' && !axis(reference))) { notify('La cara seleccionada no es compatible con esta relación.', true); return }
    setPickingLinearEdges(false)
    setRelationReference(endpointSlot, reference); setSelectedFaceMeshes(values => endpointSlot === 0 ? [actual!, ...values.slice(1)] : [...values.slice(0, 1), actual!])
    setEndpointSlot(endpointSlot === 0 ? 1 : 0); notify('Referencia seleccionada. ' + relationSelectionGuidance(endpointSlot))
  }
  const pickDirectionEdge = (edge: AssemblySceneEdge | null) => {
    if (isHinge) { acceptHingePick(edge, 'line-edge', activeHingePick); return }
    if (isSymmetry) { acceptSymmetryPick(edge, 'edge', symmetryPicking); return }
    if (!edge || (!isDirection && !isLimitAngle && mateType !== 'angle') || editingLimitAngle || operation.current || hasStaging() || currentPreview.current || draft || replaceDialog
      || sceneSignature.current !== serializeAssemblyDocument(current.current) || confirmedScene.current?.signature !== serialized || confirmedScene.current?.scene !== scene || !referenceEditorIsCurrent()) return
    const matches = scene?.bodies.filter(body => body.visible).flatMap(body => body.edges ?? []).filter(value => assemblyEdgeKey(value) === assemblyEdgeKey(edge)) ?? []
    const actual = matches.length === 1 ? matches[0] : null
    const reference = actual && scopedAssemblyEdge(actual, scopePath)
    if (!reference) { notify('Selecciona una arista lineal actual dentro del ámbito.', true); return }
    setPickingFaces(false); setPickingLinearEdges(false); setEdgeChoice(assemblyEdgeKey(actual!))
    if (isLimitAngle) setLimitAngleReferences(values => { const next: typeof values = [...values]; next[endpointSlot] = reference; return next })
    else setRelationReference(endpointSlot, reference)
    setEndpointSlot(endpointSlot === 0 ? 1 : 0); notify('Arista lineal seleccionada. ' + relationSelectionGuidance(endpointSlot))
  }
  const liveOrdinaryContext = () => ({ documentSignature: serializeAssemblyDocument(current.current),
    scopePath: JSON.parse(currentFileScope.current) as string[],
    scope: nodeAt(current.current, JSON.parse(currentFileScope.current) as string[]), session: ordinaryEditCurrent.current.session })
  const beginOrdinaryEdit = (mate: AssemblyOrdinaryMate) => {
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || rootRevision || referenceEditing
      || editingGear || editingScrew || editingRack
      || sceneSignature.current !== serializeAssemblyDocument(current.current)) return
    const ticket = retainOrdinaryMateEdit(liveOrdinaryContext(), mate)
    if (!ticket) return
    setReferenceDraft({ ticket, references: [structuredClone(mate.first), structuredClone(mate.second)] }); setEndpointSlot(0)
    stopOriginPicking(); clearSymmetryPicking(); setHingePicking(null); setWidthPicking(null)
    setOrdinaryEdit(ticket); setReleaseRotation(false); setMateType(mate.type); setMateName(mate.name); setAlignment(mate.alignment)
    setDirectionEdit(null); setEditingTangentId(null); setEditingCylinderTangentId(null); setEditingSphereTangentId(null)
    setEditingLimitDistanceId(null); setEditingLimitAngleId(null); setEditingLimitDirectedAngleId(null)
    setEditingGearId(null); setEditingScrewId(null); setEditingRackId(null)
    setReferences([null, null]); setSelectedFaceMeshes([]); setPickingFaces(false); setPickingLinearEdges(false); setRackPicking(null); setDragMode('off')
  }
  const editOrdinary = () => {
    if (!ordinaryEdit || ordinaryEditCurrent.current.ticket !== ordinaryEdit || operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || rootRevision
      || sceneSignature.current !== serializeAssemblyDocument(current.current)) return
    try {
      const context = liveOrdinaryContext(), mate = resolveOrdinaryMateEdit(ordinaryEdit, context)
      if (!mate || mate.type !== mateType) throw new Error('La relación editada ya no pertenece al documento y ámbito actuales.')
      if (!editedReferences || !referenceEditorIsCurrent()) throw new Error('Selecciona las referencias de la relación editada.')
      const proposal = assemblyOrdinaryMateUiEdit(mate, { name: mateName, alignment, releaseRotation, references: editedReferences })
      if (!proposal) throw new Error('Revisa el nombre, la orientación y el bloqueo de giro de la relación.')
      void solve(applyAssemblyEdit(current.current, { type: 'update-mate', scope: { id: context.scope.id, revision: context.scope.revision },
        mateId: mate.id, mate: proposal }))
    } catch (reason) { notify((reason as Error).message, true) }
  }
  const endOrdinaryEdit = () => {
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog) return
    stopOriginPicking()
    setReferenceDraft(null)
    setOrdinaryEdit(null); setReleaseRotation(false); setReferences([null, null]); setSelectedFaceMeshes([]); setPickingFaces(false); setPickingLinearEdges(false)
  }
  const liveDistanceContext = () => ({ documentSignature: serializeAssemblyDocument(current.current),
    scopePath: JSON.parse(currentFileScope.current) as string[],
    scope: nodeAt(current.current, JSON.parse(currentFileScope.current) as string[]), session: distanceEditCurrent.current.session })
  const beginDistanceEdit = (mate: AssemblyDistanceMate) => {
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || rootRevision || referenceEditing
      || sceneSignature.current !== serializeAssemblyDocument(current.current)) return
    const ticket = retainAssemblyDistanceEdit(liveDistanceContext(), mate)
    if (!ticket) return
    setReferenceDraft({ ticket, references: [structuredClone(mate.first), structuredClone(mate.second)] }); setEndpointSlot(0)
    stopOriginPicking(); clearSymmetryPicking(); setHingePicking(null); setWidthPicking(null)
    setDistanceEdit(ticket); setMateType('distance'); setMateName(mate.name); setMateValue(String(mate.distance)); setAlignment(mate.alignment)
    setDirectionEdit(null); setEditingTangentId(null); setEditingCylinderTangentId(null); setEditingSphereTangentId(null)
    setEditingLimitDistanceId(null); setEditingLimitAngleId(null); setEditingLimitDirectedAngleId(null)
    setEditingGearId(null); setEditingScrewId(null); setEditingRackId(null)
    setReferences([null, null]); setSelectedFaceMeshes([]); setPickingFaces(false); setPickingLinearEdges(false); setRackPicking(null); setDragMode('off')
  }
  const editDistance = () => {
    if (mateType !== 'distance' || distanceEditCurrent.current.ticket !== distanceEdit || operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || rootRevision
      || sceneSignature.current !== serializeAssemblyDocument(current.current)) return
    try {
      const context = liveDistanceContext(), mate = resolveAssemblyDistanceEdit(distanceEdit, context)
      if (!mate) throw new Error('La distancia editada ya no pertenece al documento y ámbito actuales.')
      if (!editedReferences || !referenceEditorIsCurrent()) throw new Error('Selecciona las referencias de la distancia editada.')
      void solve(applyAssemblyEdit(current.current, { type: 'update-mate', scope: { id: context.scope.id, revision: context.scope.revision },
        mateId: mate.id, mate: assemblyDistanceUiEdit(mate, { name: mateName, distance: mateValue, alignment, references: editedReferences }) }))
    } catch (reason) { notify((reason as Error).message, true) }
  }
  const endDistanceEdit = () => {
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog) return
    stopOriginPicking()
    setReferenceDraft(null)
    setDistanceEdit(null); setReferences([null, null]); setSelectedFaceMeshes([]); setPickingFaces(false); setPickingLinearEdges(false)
  }
  const liveAngleContext = () => ({ documentSignature: serializeAssemblyDocument(current.current),
    scopePath: JSON.parse(currentFileScope.current) as string[],
    scope: nodeAt(current.current, JSON.parse(currentFileScope.current) as string[]), session: angleEditCurrent.current.session })
  const beginAngleEdit = (mate: AssemblyAngleMate) => {
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || rootRevision || referenceEditing
      || sceneSignature.current !== serializeAssemblyDocument(current.current)) return
    const ticket = retainAssemblyAngleEdit(liveAngleContext(), mate)
    if (!ticket) return
    setReferenceDraft({ ticket, references: [structuredClone(mate.first), structuredClone(mate.second)] }); setEndpointSlot(0)
    stopOriginPicking(); clearSymmetryPicking(); setHingePicking(null); setWidthPicking(null)
    setAngleEdit(ticket); setMateType('angle'); setMateName(mate.name); setMateValue(String(mate.angle))
    setDirectionEdit(null); setEditingTangentId(null); setEditingCylinderTangentId(null); setEditingSphereTangentId(null)
    setEditingLimitDistanceId(null); setEditingLimitAngleId(null); setEditingLimitDirectedAngleId(null)
    setEditingGearId(null); setEditingScrewId(null); setEditingRackId(null)
    setReferences([null, null]); setSelectedFaceMeshes([]); setPickingFaces(false); setPickingLinearEdges(false); setRackPicking(null); setDragMode('off')
  }
  const editAngle = () => {
    if (mateType !== 'angle' || angleEditCurrent.current.ticket !== angleEdit || operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || rootRevision
      || sceneSignature.current !== serializeAssemblyDocument(current.current)) return
    try {
      const context = liveAngleContext(), mate = resolveAssemblyAngleEdit(angleEdit, context)
      if (!mate) throw new Error('El ángulo editado ya no pertenece al documento y ámbito actuales.')
      if (!editedReferences || !referenceEditorIsCurrent()) throw new Error('Selecciona las referencias del ángulo editado.')
      void solve(applyAssemblyEdit(current.current, { type: 'update-mate', scope: { id: context.scope.id, revision: context.scope.revision },
        mateId: mate.id, mate: assemblyAngleUiEdit(mate, { name: mateName, angle: mateValue, references: editedReferences }) }))
    } catch (reason) { notify((reason as Error).message, true) }
  }
  const endAngleEdit = () => {
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog) return
    stopOriginPicking()
    setReferenceDraft(null)
    setAngleEdit(null); setReferences([null, null]); setSelectedFaceMeshes([]); setPickingFaces(false); setPickingLinearEdges(false)
  }
  const liveDirectionContext = () => ({ documentSignature: serializeAssemblyDocument(current.current),
    scopePath: JSON.parse(currentFileScope.current) as string[],
    scope: nodeAt(current.current, JSON.parse(currentFileScope.current) as string[]), session: directionEditCurrent.current.session })
  const editDirection = () => {
    if (!isDirection || !directionEdit || directionEditCurrent.current.ticket !== directionEdit || operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || rootRevision
      || sceneSignature.current !== serializeAssemblyDocument(current.current)) return
    try {
      const context = liveDirectionContext(), mate = resolveAssemblyDirectionEdit(directionEdit, context)
      if (!mate) throw new Error('La relación direccional editada ya no pertenece al documento y ámbito actuales.')
      if (!editedReferences || !referenceEditorIsCurrent()) throw new Error('Selecciona las referencias de la relación direccional editada.')
      const updated = assemblyDirectionUiEdit(mate, { type: mateType, name: mateName, references: editedReferences,
        alignment: assemblyDirectionUiObjective(mateType, editedReferences[0], editedReferences[1]) === 'collinear' ? alignment : null })
      void solve(applyAssemblyEdit(current.current, { type: 'update-mate', scope: { id: context.scope.id, revision: context.scope.revision }, mateId: mate.id, mate: updated }))
    } catch (reason) { notify((reason as Error).message, true) }
  }
  const beginDirectionEdit = (mate: AssemblyUiDirectionMate) => {
    // Opening a saved direction replaces a legacy parameter editor. Retained
    // reference drafts and active native previews still own their interaction.
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || rootRevision || savedReferenceEditIsActive()
      || !mounted.current || directionEditCurrent.current.session !== treeReset
      || serialized !== serializeAssemblyDocument(current.current) || JSON.stringify(scopePath) !== currentFileScope.current
      || sceneSignature.current !== serialized || confirmedScene.current?.signature !== serialized || confirmedScene.current?.scene !== scene) return
    const ticket = retainAssemblyDirectionEdit(liveDirectionContext(), mate)
    if (!ticket) return
    setReferenceDraft({ ticket, references: [structuredClone(mate.first), structuredClone(mate.second)] }); setEndpointSlot(0)
    stopOriginPicking(); clearSymmetryPicking(); setHingePicking(null); setWidthPicking(null)
    setDirectionEdit(ticket); setMateType(mate.type); setMateName(mate.name); setAlignment(mate.alignment ?? 'aligned')
    setEditingTangentId(null); setEditingCylinderTangentId(null); setEditingSphereTangentId(null); setEditingLimitDistanceId(null); setEditingLimitAngleId(null); setEditingLimitDirectedAngleId(null); setEditingGearId(null); setEditingScrewId(null); setEditingRackId(null)
    setReferences([null, null]); setSelectedFaceMeshes([]); setPickingFaces(false); setPickingLinearEdges(false); setRackPicking(null); setDragMode('off')
  }
  const endDirectionEdit = () => {
    if (!directionEdit || directionEditCurrent.current.ticket !== directionEdit || directionEditCurrent.current.session !== treeReset
      || operation.current || hasStaging() || currentPreview.current || draft || replaceDialog) return
    stopOriginPicking()
    setReferenceDraft(null); setDirectionEdit(null); setReferences([null, null]); setSelectedFaceMeshes([]); setPickingFaces(false); setPickingLinearEdges(false)
  }
  const beginTangentEdit = (mate: AssemblyUiTangentMate) => {
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || savedReferenceEditIsActive()) return
    setMateType('tangent'); setEditingTangentId(mate.id); setMateName(mate.name); setTangentSide(mate.side)
    setTangentReferences([structuredClone(mate.first), structuredClone(mate.second)]); setDirectionEdit(null); setEditingCylinderTangentId(null); setEditingSphereTangentId(null); setEditingLimitDistanceId(null); setEditingLimitAngleId(null); setEditingLimitDirectedAngleId(null); setEditingGearId(null); setEditingScrewId(null); setEditingRackId(null)
    setPickingFaces(false); setPickingLinearEdges(false); setRackPicking(null); setDragMode('off')
  }
  const editTangent = () => {
    if (!isTangent || !editingTangentId || operation.current || hasStaging() || currentPreview.current || draft || replaceDialog) return
    try {
      const mate = nodeAt(current.current, scopePath).mates.find((value): value is AssemblyUiTangentMate => value.type === 'tangent' && value.id === editingTangentId)
      if (!mate) throw new Error('La tangencia ya no pertenece al ámbito actual.')
      void solve(applyAssemblyEdit(current.current, { type: 'update-mate', scope: scopeReference, mateId: mate.id,
        mate: assemblyTangentUiEdit(mate, { name: mateName, side: tangentSide }) }))
    } catch (reason) { notify((reason as Error).message, true) }
  }
  const beginCylinderTangentEdit = (mate: AssemblyCylinderTangentMate) => {
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || savedReferenceEditIsActive()) return
    setMateType(mate.type); setEditingCylinderTangentId(mate.id); setMateName(mate.name); setCylinderBranchKind(mate.branch.kind)
    setCylinderLarger(mate.branch.kind === 'internal' ? mate.branch.larger : '')
    setCylinderReferences([structuredClone(mate.first), structuredClone(mate.second)])
    setDirectionEdit(null); setEditingTangentId(null); setEditingSphereTangentId(null); setEditingLimitDistanceId(null); setEditingLimitAngleId(null); setEditingLimitDirectedAngleId(null); setEditingGearId(null); setEditingScrewId(null); setEditingRackId(null)
    setPickingFaces(false); setPickingLinearEdges(false); setRackPicking(null); setDragMode('off')
  }
  const editCylinderTangent = () => {
    if (!cylinderTangentType(mateType) || !editingCylinderTangentId || operation.current || hasStaging() || currentPreview.current || draft || replaceDialog) return
    try {
      const mate = nodeAt(current.current, scopePath).mates.find((value): value is AssemblyCylinderTangentMate => cylinderTangentType(value.type) && value.id === editingCylinderTangentId)
      if (!mate) throw new Error('La tangencia entre cilindros ya no pertenece al ámbito actual.')
      void solve(applyAssemblyEdit(current.current, { type: 'update-mate', scope: scopeReference, mateId: mate.id,
        mate: assemblyCylinderTangentUiEdit(mate, { type: mateType, name: mateName, branch: assemblyCylinderTangentUiBranch(cylinderBranchKind, cylinderLarger) }) }))
    } catch (reason) { notify((reason as Error).message, true) }
  }
  const sphereFields = (type: AssemblySphereTangentMateType): AssemblySphereTangentUiFields => type === 'plane-sphere-tangent'
    ? { type, name: mateName, side: sphereSide } : { type, name: mateName, branch: assemblySphereTangentUiBranch(sphereBranchKind, sphereLarger) }
  const beginSphereTangentEdit = (mate: AssemblySphereTangentMate) => {
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || savedReferenceEditIsActive()) return
    setMateType(mate.type); setEditingSphereTangentId(mate.id); setMateName(mate.name)
    if (mate.type === 'plane-sphere-tangent') { setSphereSide(mate.side); setSphereLarger('') }
    else { setSphereBranchKind(mate.branch.kind); setSphereLarger(mate.branch.kind === 'internal' ? mate.branch.larger : '') }
    setSphereReferences([structuredClone(mate.first), structuredClone(mate.second)])
    setDirectionEdit(null); setEditingTangentId(null); setEditingCylinderTangentId(null); setEditingLimitDistanceId(null); setEditingLimitAngleId(null); setEditingLimitDirectedAngleId(null); setEditingGearId(null); setEditingScrewId(null); setEditingRackId(null)
    setPickingFaces(false); setPickingLinearEdges(false); setRackPicking(null); setDragMode('off')
  }
  const editSphereTangent = () => {
    if (!sphereTangentType(mateType) || !editingSphereTangentId || operation.current || hasStaging() || currentPreview.current || draft || replaceDialog) return
    try {
      const mate = nodeAt(current.current, scopePath).mates.find((value): value is AssemblySphereTangentMate => sphereTangentType(value.type) && value.id === editingSphereTangentId)
      if (!mate) throw new Error('La tangencia con esfera ya no pertenece al ámbito actual.')
      void solve(applyAssemblyEdit(current.current, { type: 'update-mate', scope: scopeReference, mateId: mate.id, mate: assemblySphereTangentUiEdit(mate, sphereFields(mateType)) }))
    } catch (reason) { notify((reason as Error).message, true) }
  }
  const beginLimitDistanceEdit = (mate: AssemblyLimitDistanceMate) => {
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || savedReferenceEditIsActive()) return
    setMateType('limit-distance'); setEditingLimitDirectedAngleId(null); setEditingLimitDistanceId(mate.id); setMateName(mate.name); setAlignment(mate.alignment)
    setLimitMinimum(String(mate.limits.minimum)); setLimitMaximum(String(mate.limits.maximum)); setLimitReferences([structuredClone(mate.first), structuredClone(mate.second)])
    setDirectionEdit(null); setEditingTangentId(null); setEditingCylinderTangentId(null); setEditingSphereTangentId(null); setEditingGearId(null); setEditingScrewId(null); setEditingRackId(null)
    setPickingFaces(false); setPickingLinearEdges(false); setRackPicking(null); setDragMode('off')
  }
  const limitFields = () => ({ name: mateName, alignment, minimum: limitMinimum, maximum: limitMaximum })
  const editLimitDistance = () => {
    if (!isLimitDistance || !editingLimitDistanceId || operation.current || hasStaging() || currentPreview.current || draft || replaceDialog) return
    try {
      const mate = nodeAt(current.current, scopePath).mates.find((value): value is AssemblyLimitDistanceMate => value.type === 'limit-distance' && value.id === editingLimitDistanceId)
      if (!mate) throw new Error('El intervalo ya no pertenece al ámbito actual.')
      void solve(applyAssemblyEdit(current.current, { type: 'update-mate', scope: scopeReference, mateId: mate.id, mate: assemblyLimitDistanceUiEdit(mate, limitFields()) }))
    } catch (reason) { notify((reason as Error).message, true) }
  }
  const beginLimitAngleEdit = (mate: AssemblyLimitAngleMate) => {
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || savedReferenceEditIsActive()) return
    setMateType('limit-angle'); setEditingLimitDirectedAngleId(null); setEditingLimitAngleId(mate.id); setMateName(mate.name)
    setLimitAngleMinimum(String(mate.limits.minimum)); setLimitAngleMaximum(String(mate.limits.maximum)); setLimitAngleReferences([structuredClone(mate.first), structuredClone(mate.second)])
    setDirectionEdit(null); setEditingTangentId(null); setEditingCylinderTangentId(null); setEditingSphereTangentId(null); setEditingLimitDistanceId(null); setEditingGearId(null); setEditingScrewId(null); setEditingRackId(null)
    setPickingFaces(false); setPickingLinearEdges(false); setRackPicking(null); setDragMode('off')
  }
  const limitAngleFields = () => ({ name: mateName, minimum: limitAngleMinimum, maximum: limitAngleMaximum })
  const editLimitAngle = () => {
    if (!isLimitAngle || !editingLimitAngleId || operation.current || hasStaging() || currentPreview.current || draft || replaceDialog) return
    try {
      const mate = nodeAt(current.current, scopePath).mates.find((value): value is AssemblyLimitAngleMate => value.type === 'limit-angle' && value.id === editingLimitAngleId)
      if (!mate) throw new Error('El intervalo angular ya no pertenece al ámbito actual.')
      void solve(applyAssemblyEdit(current.current, { type: 'update-mate', scope: scopeReference, mateId: mate.id, mate: assemblyLimitAngleUiEdit(mate, limitAngleFields()) }))
    } catch (reason) { notify((reason as Error).message, true) }
  }
  const beginLimitDirectedAngleEdit = (mate: AssemblyLimitDirectedAngleMate) => {
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || savedReferenceEditIsActive()) return
    setMateType('limit-directed-angle'); setEditingLimitDirectedAngleId(mate.id); setMateName(mate.name)
    setLimitDirectedStart(String(mate.arc.start)); setLimitDirectedSweep(String(mate.arc.sweep))
    setLimitDirectedSelection([mate.first, mate.second, mate.guide].map(assemblyDirectedAngleReferenceKey) as AssemblyDirectedAngleSelection)
    setDirectionEdit(null); setEditingTangentId(null); setEditingCylinderTangentId(null); setEditingSphereTangentId(null); setEditingLimitDistanceId(null); setEditingLimitAngleId(null)
    setEditingGearId(null); setEditingScrewId(null); setEditingRackId(null); setPickingFaces(false); setPickingLinearEdges(false); setRackPicking(null); setDragMode('off')
  }
  const limitDirectedAngleFields = () => ({ name: mateName, start: limitDirectedStart, sweep: limitDirectedSweep })
  const previewLimitDirectedAngle = () => {
    if (!isLimitDirectedAngle || operation.current || hasStaging() || currentPreview.current || draft || replaceDialog) return
    try {
      const request = assemblyDirectedAngleUiRequest(scopePath, limitDirectedSelection, directedChoices)
      if (!request) throw new Error('Selecciona las tres direcciones actuales del límite.')
      if (editingLimitDirectedAngleId) {
        const mate = nodeAt(current.current, scopePath).mates.find((value): value is AssemblyLimitDirectedAngleMate => value.type === 'limit-directed-angle' && value.id === editingLimitDirectedAngleId)
        if (!mate) throw new Error('El límite dirigido ya no pertenece al ámbito actual.')
        void solve(applyAssemblyEdit(current.current, { type: 'update-mate', scope: scopeReference, mateId: mate.id,
          mate: assemblyLimitDirectedAngleUiEdit(mate, request.first, request.second, request.guide, limitDirectedAngleFields()) }))
      } else void solve(applyAssemblyEdit(current.current, { type: 'add-mate', scope: scopeReference,
        mate: assemblyLimitDirectedAngleUiProposal(request.first, request.second, request.guide, limitDirectedAngleFields()) }))
    } catch (reason) { notify((reason as Error).message, true) }
  }
  const deleteRelation = (mate: AssemblyMate) => {
    if (operation.current || hasStaging() || savedReferenceEditIsActive() || solveDeletion(mate.type) && (currentPreview.current || draft || replaceDialog)) return
    const update: AssemblyEdit = { type: 'delete-mate', scope: scopeReference, mateId: mate.id }
    if (solveDeletion(mate.type)) {
      try { void solve(applyAssemblyEdit(current.current, update)) } catch (reason) { notify((reason as Error).message, true) }
    } else edit(update)
  }
  const symmetryBlocked=editingBlocked||!!preview||!!draft||replaceDialog||sceneSignature.current!==serialized||confirmedScene.current?.signature!==serialized
  const symmetryMayEdit=()=>!operation.current&&!hasStaging()&&!currentPreview.current&&!draft&&!replaceDialog&&sceneSignature.current===serialized&&confirmedScene.current?.signature===serialized
  const previewSymmetry=()=>{
    if(!symmetryMayEdit())return
    clearSymmetryPicking()
    try{
      const proposal=assemblySymmetryUiProposal(symmetryReferences,symmetryFamily,symmetryAlignment,mateName)
      const actual=editingSymmetryId?nodeAt(current.current,scopePath).mates.find(m=>m.id===editingSymmetryId):null
      if(editingSymmetryId&&actual?.type!=='symmetry')throw Error('La simetría ya no está disponible.')
      void solve(applyAssemblyEdit(current.current,actual?{type:'update-mate',scope:scopeReference,mateId:actual.id,mate:{...proposal,suppressed:actual.suppressed}}:{type:'add-mate',scope:scopeReference,mate:proposal}))
    }catch(reason){notify((reason as Error).message,true)}
  }
  const beginSymmetryEdit=(mate:Extract<AssemblyMate,{type:'symmetry'}>)=>{
    if(operation.current||hasStaging()||currentPreview.current||draft||replaceDialog||referenceEditing)return
    clearSymmetryPicking();chooseMateType('symmetry');setEditingSymmetryId(mate.id);setSymmetryFamily(mate.entityKind);setSymmetryAlignment(mate.alignment??'');setSymmetryReferences(structuredClone([mate.source,mate.target,mate.mirror]));setMateName(mate.name);setPickingFaces(false);setPickingLinearEdges(false);setSelectedFaceMeshes([]);setDragMode('off')
  }
  const previewCircularPath=(proposal:ReturnType<typeof assemblyCircularPathUiProposal>)=>{
    if(!isCircularPath||!symmetryMayEdit()||serialized!==serializeAssemblyDocument(current.current)||JSON.stringify(circularPathTicket)!==JSON.stringify(circularPathContext.current)||circularPathTicket.generation!==generation.current||circularPathTicket.scope!==currentFileScope.current||circularPathTicket.sceneId!==(confirmedScene.current?.scene.sceneId??null))return
    try{
      const actual=editingCircularPathId?nodeAt(current.current,scopePath).mates.find(m=>m.id===editingCircularPathId):null
      if(editingCircularPathId&&actual?.type!=='circular-path')throw Error('El trayecto circular ya no está disponible.')
      if(linePathChoices.points.filter(p=>sameCircularPathPoint(p.reference,proposal.point)).length!==1||circularPathChoices.filter(p=>sameCircularPathSelection(p.reference,proposal.path)).length!==1)throw Error('El punto, el arco o su origen material ya no están disponibles.')
      if(proposal.orientation.roll!=='free'&&linePathChoices.guides.filter(c=>sameLinePathGuide(c.reference,proposal.orientation.roll!=='free'?proposal.orientation.roll.guide:null)).length!==1)throw Error('La guía UP plana ya no está disponible.')
      void solve(applyAssemblyEdit(current.current,actual?{type:'update-mate',scope:scopeReference,mateId:actual.id,mate:{...proposal,suppressed:actual.suppressed}}:{type:'add-mate',scope:scopeReference,mate:proposal}))
    }catch(reason){notify((reason as Error).message,true)}
  }
  const beginCircularPathEdit=(mate:Extract<AssemblyMate,{type:'circular-path'}>)=>{
    if(!symmetryMayEdit()||referenceEditing)return
    chooseMateType('circular-path');setEditingCircularPathId(mate.id);setCircularPathReset(v=>v+1);setPickingFaces(false);setPickingLinearEdges(false);setDragMode('off')
  }
  const previewLinePath = (proposal: ReturnType<typeof assemblyLinePathUiProposal>) => {
    if (!isLinePath || !symmetryMayEdit() || serialized !== serializeAssemblyDocument(current.current) || JSON.stringify(linePathTicket) !== JSON.stringify(linePathContext.current) || linePathTicket.generation !== generation.current || linePathTicket.scope !== currentFileScope.current || linePathTicket.sceneId !== (confirmedScene.current?.scene.sceneId ?? null)) return
    try {
      const actual = editingLinePathId ? nodeAt(current.current, scopePath).mates.find(m => m.id === editingLinePathId) : null
      if (editingLinePathId && actual?.type !== 'line-path') throw Error('El trayecto LINE ya no está disponible.')
      if (linePathChoices.points.filter(p => JSON.stringify(p.reference) === JSON.stringify(proposal.point)).length !== 1) throw Error('El punto material ya no está disponible.')
      const edge = linePathChoices.edges.filter(p => JSON.stringify(p.reference.component) === JSON.stringify(proposal.path.component) && JSON.stringify(p.reference.body) === JSON.stringify(proposal.path.body) && JSON.stringify(p.reference.edge) === JSON.stringify(proposal.path.edge))
      if (edge.length !== 1 || linePathOrigins(linePathChoices.points, edge[0].reference).filter(p => JSON.stringify(p.reference.vertex) === JSON.stringify(proposal.path.startVertex)).length !== 1) throw Error('La arista y su origen material ya no están disponibles.')
      if (proposal.orientation.roll !== 'free' && linePathChoices.guides.filter(choice => sameLinePathGuide(choice.reference, proposal.orientation.roll !== 'free' ? proposal.orientation.roll.guide : null)).length !== 1) throw Error('La guía UP plana ya no está disponible en la escena actual.')
      void solve(applyAssemblyEdit(current.current, actual ? { type:'update-mate', scope:scopeReference, mateId:actual.id, mate:{...proposal,suppressed:actual.suppressed} } : { type:'add-mate', scope:scopeReference, mate:proposal }))
    } catch (reason) { notify((reason as Error).message, true) }
  }
  const beginLinePathEdit = (mate: Extract<AssemblyMate,{type:'line-path'}>) => {
    if (!symmetryMayEdit() || referenceEditing) return
    chooseMateType('line-path'); setEditingLinePathId(mate.id); setLinePathReset(value => value + 1); setPickingFaces(false); setPickingLinearEdges(false); setDragMode('off')
  }
  const previewProfile = (proposal: ReturnType<typeof assemblyProfileCenterUiProposal>) => {
    if (!isProfile || !symmetryMayEdit() || serialized !== serializeAssemblyDocument(current.current)) return
    try {
      const actual = editingProfileId ? nodeAt(current.current, scopePath).mates.find(mate => mate.id === editingProfileId) : null
      if (editingProfileId && actual?.type !== 'profile-center') throw Error('El centro de perfiles ya no está disponible.')
      // Recheck every compound identity against this exact current scene before native authentication.
      for (const selection of [proposal.first, proposal.second]) {
        if (profileFaces.filter(choice => JSON.stringify(choice.reference) === JSON.stringify(selection.face)).length !== 1) throw Error('La cara seleccionada ya no está disponible.')
        if (selection.axis && profileEdges.filter(choice => JSON.stringify(choice.faceOwner.component) === JSON.stringify(selection.face.component) && JSON.stringify(choice.faceOwner.body) === JSON.stringify(selection.face.body) && JSON.stringify(choice.edge) === JSON.stringify(selection.axis!.edge)).length !== 1) throw Error('La arista seleccionada ya no está disponible.')
      }
      void solve(applyAssemblyEdit(current.current, actual ? { type:'update-mate', scope:scopeReference, mateId:actual.id, mate:{...proposal,suppressed:actual.suppressed} } : { type:'add-mate', scope:scopeReference, mate:proposal }))
    } catch (reason) { notify((reason as Error).message, true) }
  }
  const beginProfileEdit = (mate: Extract<AssemblyMate,{type:'profile-center'}>) => {
    if (!symmetryMayEdit() || referenceEditing) return
    chooseMateType('profile-center'); setEditingProfileId(mate.id); setProfileReset(value => value + 1); setPickingFaces(false); setPickingLinearEdges(false); setDragMode('off')
  }
  const previewHinge = (ticket: HingeUiTicket) => {
    if (!isHinge || !symmetryMayEdit() || !hingeLiveCurrent(ticket)) return
    try {
      const proposal = assemblyHingeUiProposal(hingeReferencesRef.current, mateName, hingeAlignment, hingeLimited?{start:hingeStart,sweep:hingeSweep}:null)
      const actual = editingHingeId ? nodeAt(current.current, scopePath).mates.find(mate => mate.id === editingHingeId) : null
      if (editingHingeId && actual?.type !== 'hinge') throw Error('La bisagra ya no está disponible.')
      for (const [i, reference] of [...proposal.axis, ...proposal.axial,...(proposal.stops?.angular??[])].entries()) {
        if ((i < 2 ? hingeAxes : i<4?hingePlanes:hingeAngularPlanes).filter(c => sameHingeReference(c.reference,reference)).length !== 1) throw Error('La referencia de bisagra ya no está disponible en la escena actual.')
      }
      void solve(applyAssemblyEdit(current.current, actual ? { type:'update-mate',scope:scopeReference,mateId:actual.id,mate:{...proposal,suppressed:actual.suppressed} } : { type:'add-mate',scope:scopeReference,mate:proposal }))
    } catch (reason) { notify((reason as Error).message, true) }
  }
  const beginHingeEdit = (mate: Extract<AssemblyMate,{type:'hinge'}>) => {
    if (!symmetryMayEdit() || referenceEditing) return
    chooseMateType('hinge'); hingeContext.current = null; setEditingHingeId(mate.id); setHingeReferences(structuredClone([...mate.axis,...mate.axial,...(mate.stops?.angular??[])]) as HingeUiReferences)
    setHingeLimited(!!mate.stops);setHingeStart(mate.stops?String(mate.stops.arc.start):'');setHingeSweep(mate.stops?String(mate.stops.arc.sweep):'')
    setHingeAlignment(mate.alignment); setMateName(mate.name); setPickingFaces(false); setPickingLinearEdges(false); setHingePicking(null); setDragMode('off')
  }
  const previewWidth = () => {
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog) return
    try {
      const proposal = assemblyWidthUiProposal(widthReferences, mateName, widthBranch, tabBranch, widthAlignment)
      const actual = editingWidthId ? nodeAt(current.current, scopePath).mates.find(mate => mate.id === editingWidthId) : null
      if (editingWidthId && actual?.type !== 'width') throw new Error('La relación de anchura ya no está disponible.')
      void solve(applyAssemblyEdit(current.current, actual ? {type:'update-mate',scope:scopeReference,mateId:actual.id,mate:{...proposal,suppressed:actual.suppressed}} : {type:'add-mate',scope:scopeReference,mate:proposal}))
    } catch(reason) { notify((reason as Error).message,true) }
  }
  const beginWidthEdit = (mate: Extract<AssemblyMate,{type:'width'}>) => {
    if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || referenceEditing) return
    chooseMateType('width'); setEditingWidthId(mate.id); setWidthReferences(structuredClone([...mate.width,...mate.tab]) as WidthUiReferences)
    setWidthBranch(mate.widthBranch); setTabBranch(mate.tabBranch); setWidthAlignment(mate.alignment); setMateName(mate.name); setPickingFaces(false); setPickingLinearEdges(false); setSelectedFaceMeshes([]); setDragMode('off')
  }
  const addMate = () => {
    if (angleEdit || distanceEdit || operation.current || hasStaging() || standardPreviewFamily && (currentPreview.current || draft || replaceDialog) || mateType === 'gear' || mateType === 'screw' || mateType === 'rack-pinion') return
    if (isHinge || isCircularPath || isLinePath || isProfile) return
    if (isSymmetry) { previewSymmetry(); return }
    if (isWidth) { previewWidth(); return }
    if (isLimitDirectedAngle) { previewLimitDirectedAngle(); return }
    if (isLimitAngle) {
      try { void solve(applyAssemblyEdit(current.current, { type: 'add-mate', scope: scopeReference, mate: assemblyLimitAngleUiProposal(limitAngleReferences[0], limitAngleReferences[1], limitAngleFields()) })) }
      catch (reason) { notify((reason as Error).message, true) }
      return
    }
    if (isLimitDistance) {
      try { void solve(applyAssemblyEdit(current.current, { type: 'add-mate', scope: scopeReference, mate: assemblyLimitDistanceUiProposal(limitReferences[0], limitReferences[1], limitFields()) })) }
      catch (reason) { notify((reason as Error).message, true) }
      return
    }
    if (sphereTangentType(mateType)) {
      try { void solve(applyAssemblyEdit(current.current, { type: 'add-mate', scope: scopeReference, mate: assemblySphereTangentUiProposal(sphereReferences[0], sphereReferences[1], sphereFields(mateType)) })) }
      catch (reason) { notify((reason as Error).message, true) }
      return
    }
    if (cylinderTangentType(mateType)) {
      try { void solve(applyAssemblyEdit(current.current, { type: 'add-mate', scope: scopeReference,
        mate: assemblyCylinderTangentUiProposal(cylinderReferences[0], cylinderReferences[1], { type: mateType, name: mateName, branch: assemblyCylinderTangentUiBranch(cylinderBranchKind, cylinderLarger) }) })) }
      catch (reason) { notify((reason as Error).message, true) }
      return
    }
    if (isTangent) {
      try { void solve(applyAssemblyEdit(current.current, { type: 'add-mate', scope: scopeReference,
        mate: assemblyTangentUiProposal(tangentReferences[0], tangentReferences[1], { name: mateName, side: tangentSide }) })) }
      catch (reason) { notify((reason as Error).message, true) }
      return
    }
    try {
      if (!mateName.trim()) throw new Error('Escribe un nombre para la relación.')
      if ((mateType === 'distance' || mateType === 'angle') && !mateValue.trim()) throw new Error('Escribe el valor de la relación.')
      const mate = assemblyMateProposal(references[0], references[1], mateType, alignment, Number(mateValue))
      mate.name = mateName
      const candidate = applyAssemblyEdit(current.current, { type: 'add-mate', scope: scopeReference, mate })
      creationReferenceDraft.current = { document: current.current, scope: currentFileScope.current, session: treeReset, family: mateType, references: structuredClone(references) }
      void solve(candidate, true)
    }
    catch (reason) { notify((reason as Error).message, true) }
  }
  const capture = async (mateId?: string) => {
    const source = currentPreview.current; if (!source || !canApply || operation.current || hasStaging() || savedReferenceEditIsActive()) return
    const id = generation.current, signature = serialized; operation.current = true; setBusy(true); setCancelable(true)
    try {
      let reply: AssemblyPreviewReply
      if (mateId) reply = await captureAssemblyRotationLock(current.current, source.reply.token, mateId, scopeReference)
      else {
        const first = availableComponents.find(row => JSON.stringify(row.path) === componentLock[0]), second = availableComponents.find(row => JSON.stringify(row.path) === componentLock[1])
        if (!first || !second || samePath(first.path, second.path)) throw new Error('Selecciona dos componentes distintos para capturar su posición relativa.')
        const ref = (row: AssemblyTreeRow): AssemblyComponentReference => ({ occurrencePath: row.path.slice(scopePath.length), definition: { ...row.occurrence.definition } })
        reply = await captureAssemblyComponentLock(current.current, source.reply.token, ref(first), ref(second), scopeReference)
      }
      currentPreview.current = null; setPreview(null); setDraft(null); acceptReply(reply, id, signature)
    } catch (reason) { discardToken(source.reply.token); if (mounted.current && id === generation.current) { currentPreview.current = null; setPreview(null); setDraft(null); restoreScene(); notify((reason as Error).message, true); setRebuild(value => value + 1) } }
    finally { if (mounted.current && id === generation.current) { operation.current = false; setBusy(false); setCancelable(false) } }
  }
  const captureGear = async (request: AssemblyGearCaptureRequest) => {
    const source = currentPreview.current
    if (!source || operation.current || hasStaging() || replaceDialog
      || !canApplyAssemblyPreview(source, serializeAssemblyDocument(current.current), draft ? serializeAssemblyDocument(draft) : null, generation.current, false)) return
    const id = generation.current, signature = serializeAssemblyDocument(current.current)
    operation.current = true; setBusy(true); setCancelable(true); notify('Capturando los ceros del engranaje y resolviendo el acoplamiento…')
    try {
      const reply = await captureAssemblyGear(current.current, source.reply.token, request, scopeReference)
      if (!mounted.current || id !== generation.current || signature !== serializeAssemblyDocument(current.current)) { if (reply.status === 'ready') discardToken(reply.token); return }
      if (reply.status === 'ready') {
        const previousIds = new Set(nodeAt(source.reply.document, scopePath).mates.map(mate => mate.id))
        const added = nodeAt(reply.document, scopePath).mates.find(mate => mate.type === 'gear' && !previousIds.has(mate.id))
        if (added) setEditingGearId(added.id)
      }
      currentPreview.current = null; setPreview(null); setDraft(null); acceptReply(reply, id, signature)
    } catch (reason) {
      discardToken(source.reply.token)
      if (mounted.current && id === generation.current) { currentPreview.current = null; setPreview(null); setDraft(null); restoreScene(); notify((reason as Error).message, true); setRebuild(value => value + 1) }
    } finally { if (mounted.current && id === generation.current) { operation.current = false; setBusy(false); setCancelable(false) } }
  }
  const editGear = (fields: AssemblyGearUiFields) => {
    if (operation.current || hasStaging() || currentPreview.current || replaceDialog || !editingGearId) return
    try {
      const mate = nodeAt(current.current, scopePath).mates.find((value): value is AssemblyUiGearMate => value.type === 'gear' && value.id === editingGearId)
      if (!mate) throw new Error('El engranaje seleccionado ya no existe en este ámbito.')
      const { id, ...next } = assemblyGearUiEdit(mate, fields)
      void solve(applyAssemblyEdit(current.current, { type: 'update-mate', scope: scopeReference, mateId: id, mate: next }))
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'No se pudo preparar la edición del engranaje.', true) }
  }
  const captureScrew = async (request: AssemblyScrewCaptureRequest) => {
    const source = currentPreview.current
    if (!source || operation.current || hasStaging() || replaceDialog
      || !canApplyAssemblyPreview(source, serializeAssemblyDocument(current.current), draft ? serializeAssemblyDocument(draft) : null, generation.current, false)) return
    const id = generation.current, signature = serializeAssemblyDocument(current.current)
    operation.current = true; setBusy(true); setCancelable(true); notify('Alineando los cilindros y capturando el cero del tornillo…')
    try {
      const reply = await captureAssemblyScrew(current.current, source.reply.token, request, scopeReference)
      if (!mounted.current || id !== generation.current || signature !== serializeAssemblyDocument(current.current)) { if (reply.status === 'ready') discardToken(reply.token); return }
      if (reply.status === 'ready') {
        const previousIds = new Set(nodeAt(source.reply.document, scopePath).mates.map(mate => mate.id))
        const added = nodeAt(reply.document, scopePath).mates.find(mate => mate.type === 'screw' && !previousIds.has(mate.id))
        if (added) setEditingScrewId(added.id)
      }
      currentPreview.current = null; setPreview(null); setDraft(null); acceptReply(reply, id, signature)
    } catch (reason) {
      discardToken(source.reply.token)
      if (mounted.current && id === generation.current) { currentPreview.current = null; setPreview(null); setDraft(null); restoreScene(); notify((reason as Error).message, true); setRebuild(value => value + 1) }
    } finally { if (mounted.current && id === generation.current) { operation.current = false; setBusy(false); setCancelable(false) } }
  }
  const editScrew = (fields: AssemblyScrewUiFields) => {
    if (operation.current || hasStaging() || currentPreview.current || replaceDialog || !editingScrewId) return
    try {
      const mate = nodeAt(current.current, scopePath).mates.find((value): value is AssemblyUiScrewMate => value.type === 'screw' && value.id === editingScrewId)
      if (!mate) throw new Error('El tornillo seleccionado ya no existe en este ámbito.')
      const { id, ...next } = assemblyScrewUiEdit(mate, fields)
      void solve(applyAssemblyEdit(current.current, { type: 'update-mate', scope: scopeReference, mateId: id, mate: next }))
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'No se pudo preparar la edición del tornillo.', true) }
  }
  const captureRack = async (request: AssemblyRackPinionCaptureRequest) => {
    const source = currentPreview.current
    if (!source || operation.current || hasStaging() || replaceDialog || !canApplyAssemblyPreview(source, serializeAssemblyDocument(current.current), draft ? serializeAssemblyDocument(draft) : null, generation.current, false)) return
    const id = generation.current, signature = serializeAssemblyDocument(current.current)
    setRackPicking(null); operation.current = true; setBusy(true); setCancelable(true); notify('Capturando las referencias actuales de cremallera y piñón…')
    try {
      const reply = await captureAssemblyRackPinion(current.current, source.reply.token, request, scopeReference)
      if (!mounted.current || id !== generation.current || signature !== serializeAssemblyDocument(current.current)) { if (reply.status === 'ready') discardToken(reply.token); return }
      if (reply.status === 'ready') {
        const previous = new Set(nodeAt(source.reply.document, scopePath).mates.map(mate => mate.id))
        const added = nodeAt(reply.document, scopePath).mates.find(mate => mate.type === 'rack-pinion' && !previous.has(mate.id))
        if (added) setEditingRackId(added.id)
      }
      currentPreview.current = null; setPreview(null); setDraft(null); acceptReply(reply, id, signature)
    } catch (reason) {
      discardToken(source.reply.token)
      if (mounted.current && id === generation.current) { currentPreview.current = null; setPreview(null); setDraft(null); restoreScene(); notify((reason as Error).message, true); setRebuild(value => value + 1) }
    } finally { if (mounted.current && id === generation.current) { operation.current = false; setBusy(false); setCancelable(false) } }
  }
  const editRack = (fields: AssemblyRackPinionUiFields) => {
    if (operation.current || hasStaging() || currentPreview.current || replaceDialog || !editingRackId) return
    try {
      const mate = nodeAt(current.current, scopePath).mates.find((value): value is AssemblyUiRackPinionMate => value.type === 'rack-pinion' && value.id === editingRackId)
      const radius = rackNativeRadius
      if (!mate || radius === undefined) throw new Error('Selecciona un piñón con un cilindro nativo actual antes de editar la conversión.')
      const { id, ...next } = assemblyRackPinionUiEdit(mate, fields, radius)
      void solve(applyAssemblyEdit(current.current, { type: 'update-mate', scope: scopeReference, mateId: id, mate: next }))
    } catch (reason) { notify((reason as Error).message, true) }
  }
  const rackChoice = (slot: 0 | 1, choice: string) => {
    const source = currentPreview.current
    if (operation.current || hasStaging() || replaceDialog || editingRack || !source || !canApplyAssemblyPreview(source, serialized, candidateSignature, generation.current, false)) return
    if (choice && !(slot === 0 ? rackPinions : rackChoices).some(value => value.key === choice)) return
    setRackKeys(previous => slot === 0 ? [choice, previous[1]] : [previous[0], choice]); setRackPicking(null)
  }
  const beginRackPick = (kind: 'pinion' | 'rack-axis' | 'rack-edge') => {
    if (operation.current || hasStaging() || !canApply || editingBlocked || replaceDialog || editingRack || !preview) return
    setPickingFaces(false); setPickingLinearEdges(false); setDragMode('off'); setRackPicking({ kind, token: preview.reply.token, generation: generation.current })
  }
  const rackPickCurrent = () => !operation.current && !hasStaging() && !!rackPicking && rackPicking.generation === generation.current && rackPicking.token === currentPreview.current?.reply.token && canApply && !editingBlocked && !replaceDialog
  const pickRackFace = (face: AssemblySceneFace | null) => {
    if (!rackPickCurrent() || !face || rackPicking?.kind === 'rack-edge') return
    const choice = rackPinions.find(value => value.key === assemblyFaceKey(face))
    if (choice) rackChoice(rackPicking?.kind === 'pinion' ? 0 : 1, choice.key)
  }
  const pickRackEdge = (edge: AssemblySceneEdge | null) => {
    if (!rackPickCurrent() || rackPicking?.kind !== 'rack-edge' || !edge) return
    const choice = rackChoices.find(value => value.reference.kind === 'edge' && value.key === assemblyEdgeKey(edge))
    if (choice) rackChoice(1, choice.key)
  }
  const namedSelectionRebind = useRef<{ before: AssemblyDocument; after: AssemblyDocument;
    normal: typeof normalViewContext; tree: typeof treeOriginContext } | null>(null)
  const canRetainNamedViewScene = (next: AssemblyDocument): boolean => {
    const before = current.current, signature = serializeAssemblyDocument(before), confirmed = confirmedScene.current
    if (!sameDocumentExceptNamedViews(before, next) || operation.current || hasStaging() || currentPreview.current || draft
      || dragSession.current || dragging.current || !scene || confirmed?.scene !== scene
      || confirmed.signature !== signature || sceneSignature.current !== signature) return false
    return true
  }
  const retainNamedViewScene = (next: AssemblyDocument): boolean => {
    if (!canRetainNamedViewScene(next) || !scene) return false
    // Only presentation bookkeeping advances. Native witnesses and Apply
    // capabilities retain their complete original document authentication.
    const nextSignature = serializeAssemblyDocument(next)
    namedSelectionRebind.current = { before: current.current, after: next,
      normal: normalViewCurrent.current.context, tree: treeOriginCurrent.current.context }
    sceneSignature.current = nextSignature; confirmedScene.current = { signature: nextSignature, scene }
    current.current = next; setCommitted(next); return true
  }
  const namedViews = useNamedDocumentViews({ document: committed, identity: generation.current, scene, history: viewHistory,
    isCurrent: () => current.current === committed && canRetainNamedViewScene(committed),
    blocked: editingBlocked || activity.commandActive || !!draft || !!preview || hasStaging() || replaceDialog || !!rootRevision
      || !!replaceAnswer.current || newDocumentDialog.pending() || dragActive || !!dragSession.current || dragging.current
      || !scene || confirmedScene.current?.scene !== scene || confirmedScene.current?.signature !== serialized || sceneSignature.current !== serialized,
    commit: next => {
      if (current.current !== committed || !canRetainNamedViewScene(next)) throw Error('El documento o la escena han cambiado.')
      const owned = history.current!.commitDocument(next)
      if (!retainNamedViewScene(owned)) throw Error('La escena confirmada ya no está disponible.')
      return owned
    },
    recall: savedView => setView(previous => ({ name: 'named', stamp: previous.stamp + 1, view: savedView })),
  })
  const viewButton = (name: ViewName) => {
    if (namedViews.isOpen || dragSession.current || viewHistory.navigating || name === 'previous' && !viewHistory.canPrevious) return
    if (name === 'normal') {
      if (!canNormal || normalViewCurrent.current.context !== normalViewContext || operation.current || hasStaging()
        || currentPreview.current || dragging.current || serialized !== serializeAssemblyDocument(current.current)
        || JSON.stringify(scopePath) !== currentFileScope.current) return
      const target = resolveAssemblyNormalSelection(normalViewSelection, normalViewContext, treeOrigins).target
      if (target) setView(previous => ({ name, stamp: previous.stamp + 1, target }))
    } else setView(previous => ({ name, stamp: previous.stamp + 1 }))
  }
  const undo = (redo = false) => {
    if (namedViews.isOpen || operation.current || hasStaging()) return
    const next = redo ? history.current!.redo() : history.current!.undo()
    if (retainNamedViewScene(next)) return
    setOrdinaryEdit(null); setReleaseRotation(false); setAngleEdit(null); setDistanceEdit(null); invalidate(); setLimitDirectedSelection(['', '', '']); setCommitted(next); setSelectedPath([]); setScopePath([]); setDirectionEdit(null); setEditingTangentId(null); setEditingCylinderTangentId(null); setEditingSphereTangentId(null); setEditingLimitDistanceId(null); setEditingLimitAngleId(null); setEditingLimitDirectedAngleId(null); setCylinderLarger(''); setSphereLarger(''); setMovementReset(value => value + 1)
  }
  const datum = () => {
    if (referenceEditTicket && mateType === 'concentric' || isCylinderTangent || isSphereTangent && mateType !== 'plane-sphere-tangent' || referenceBlocked || operation.current || hasStaging() || !referenceEditorIsCurrent()) return
    const row = availableComponents.find(value => JSON.stringify(value.path) === datumComponent)
    const component = datumComponent === 'scope' ? null : row ? { occurrencePath: row.path.slice(scopePath.length), definition: { ...row.occurrence.definition } } : undefined
    if (component === undefined) { notify('El componente del plano ya no está disponible.', true); return }
    stopOriginPicking()
    if (isLimitAngle) setLimitAngleReferences(values => { const next: typeof values = [...values]; next[endpointSlot] = { kind: 'principal-plane', component, plane: datumPlane }; return next })
    else if (isLimitDistance) setLimitReferences(values => { const next: typeof values = [...values]; next[endpointSlot] = { kind: 'principal-plane', component, plane: datumPlane }; return next })
    else if (mateType === 'plane-sphere-tangent') setSphereReferences(values => { const next: typeof values = [...values]; next[endpointSlot] = { kind: 'principal-plane', component, plane: datumPlane }; return next })
    else if (isTangent) setTangentReferences(values => { const next: typeof values = [...values]; next[endpointSlot] = { kind: 'principal-plane', component, plane: datumPlane }; return next })
    else setRelationReference(endpointSlot, { kind: 'principal-plane', component, plane: datumPlane })
    setEndpointSlot(endpointSlot === 0 ? 1 : 0)
    notify('Plano seleccionado. ' + relationSelectionGuidance(endpointSlot))
  }
  const useOriginAxis = () => {
    if (!['concentric', 'parallel', 'perpendicular', 'angle', 'limit-angle'].includes(mateType) || referenceBlocked || operation.current || hasStaging() || !referenceEditorIsCurrent()) return
    const row = availableComponents.find(value => JSON.stringify(value.path) === datumComponent)
    const component = datumComponent === 'scope' ? null : row ? { occurrencePath: row.path.slice(scopePath.length), definition: { ...row.occurrence.definition } } : undefined
    if (component === undefined) { notify('El componente del eje ya no está disponible.', true); return }
    stopOriginPicking()
    const reference = { kind: 'principal-axis' as const, component, axis: datumAxis }
    setPickingFaces(false); setPickingLinearEdges(false)
    if (isLimitAngle) setLimitAngleReferences(values => { const next: typeof values = [...values]; next[endpointSlot] = reference; return next })
    else setRelationReference(endpointSlot, reference)
    setEndpointSlot(endpointSlot === 0 ? 1 : 0)
    notify('Eje seleccionado. ' + relationSelectionGuidance(endpointSlot))
  }
  const displayed = draft ?? documentUpdate?.review.document ?? sourceUpdate?.document ?? replacementReview?.review.document ?? committed
  // A solved preview can move owners without changing the editable draft.
  // Its overlays must use the document that produced that displayed scene.
  const originDocument = preview?.reply.document ?? displayed
  const originEvaluation = useMemo(() => {
    if (!showOriginAxes && !showOriginPlanes) return null
    try { return evaluateAssemblyConfiguration(originDocument, [], null) } catch { return null }
  }, [originDocument, showOriginAxes, showOriginPlanes])
  const originDisplays = useMemo(() => {
    if (!originEvaluation || !scene || busy || sourceUpdate || documentUpdate || replacementReview || streamProjection) return []
    if (preview ? scene !== preview.reply.scene : draft || sceneSignature.current !== serialized || confirmedScene.current?.scene !== scene) return []
    const kinds = { axes: showOriginAxes, planes: showOriginPlanes }
    const scopeOrigins = originOwner !== 'selected' ? buildAssemblyOriginDisplay(originEvaluation, scopePath, null, kinds) : []
    const selectedOrigins = originOwner !== 'scope' && selectedPath.length ? buildAssemblyOriginDisplay(originEvaluation, scopePath, selectedPath, kinds) : []
    return [...scopeOrigins, ...selectedOrigins]
  }, [originEvaluation, scene, busy, sourceUpdate, documentUpdate, replacementReview, streamProjection, preview, draft, serialized, scopePath, selectedPath, originOwner, showOriginAxes, showOriginPlanes])
  const treeOrigins = useMemo(() => {
    try { return buildAssemblyOriginTree(evaluateAssemblyConfiguration(committed, [], null), []) } catch { return [] }
  }, [committed])
  const treeOriginBlocked = managerTab !== 'components' || editingBlocked || !!draft || !!preview || replaceDialog || !!streamProjection
    || dragActive || !scene || sceneSignature.current !== serialized
    || confirmedScene.current?.signature !== serialized || confirmedScene.current?.scene !== scene
  const treeOriginSession = useMemo(() => ({}), [treeReset, scene, serialized, scopePath, generation.current, treeOriginBlocked])
  const treeOriginContext = { documentSignature: serialized, scopePath, sessionIdentity: treeOriginSession }
  const treeOriginCurrent = useRef({ context: treeOriginContext, entries: treeOrigins, blocked: treeOriginBlocked })
  treeOriginCurrent.current = { context: treeOriginContext, entries: treeOrigins, blocked: treeOriginBlocked }
  const selectedTreeOrigin = !treeOriginBlocked ? resolveAssemblyOriginTreeSelection(treeOriginSelection, treeOrigins, treeOriginContext) : null
  const normalViewBlocked = editingBlocked || !!draft || !!preview || replaceDialog || !!streamProjection || dragActive
    || pickingFaces || pickingLinearEdges || !!symmetryPicking || !!hingePicking || !!widthPicking || !!rackPicking || originPicking
    || !scene || sceneSignature.current !== serialized || confirmedScene.current?.signature !== serialized || confirmedScene.current?.scene !== scene
  const normalViewSession = useMemo(() => ({}), [treeReset, scene, serialized, scopePath, generation.current])
  const normalViewContext = { documentSignature: serialized, scopePath, sessionIdentity: normalViewSession, scene }
  const normalViewCurrent = useRef({ context: normalViewContext, blocked: normalViewBlocked })
  // A discarded render must not invalidate handlers from the last committed view.
  useLayoutEffect(() => { normalViewCurrent.current = { context: normalViewContext, blocked: normalViewBlocked } })
  useLayoutEffect(() => {
    const transition = namedSelectionRebind.current
    if (!transition) return
    namedSelectionRebind.current = null
    if (current.current !== transition.after || committed !== transition.after) return
    setNormalSelection(selection => rebindNamedViewSelection(selection, transition.before, transition.after, transition.normal, normalViewContext))
    setTreeOriginSelection(selection => rebindNamedViewSelection(selection, transition.before, transition.after, transition.tree, treeOriginContext))
  })
  const normalComponentKey = selectedPath.length ? JSON.stringify(['component', selectedPath]) : null
  const normalViewSelection = assemblyNormalSelectionOrComponent(normalSelection, normalComponentKey, normalViewContext)
  const normalResolution = resolveAssemblyNormalSelection(normalViewSelection, normalViewContext, treeOrigins)
  const browseResolution = resolveAssemblyRelationSelection(normalViewSelection, normalViewContext, treeOrigins)
  const browseFaces = browseResolution.status === 'ready' ? browseResolution.faces : normalResolution.faces
  const browseOrigins = browseResolution.status === 'ready' ? browseResolution.origins : normalResolution.origins
  const canNormal = !normalViewBlocked && !dragSession.current && !viewHistory.navigating && normalResolution.target !== null
  const nominateViewSelection = (value: AssemblyViewportViewSelection) => {
    if (normalViewBlocked || normalViewCurrent.current.context !== normalViewContext || normalViewCurrent.current.blocked
      || operation.current || hasStaging() || currentPreview.current || dragging.current || dragSession.current
      || value.scene !== scene || serialized !== serializeAssemblyDocument(current.current) || JSON.stringify(scopePath) !== currentFileScope.current) return
    setNormalSelection(previous => value.edge
      ? nominateAssemblyBrowseEdge(assemblyNormalSelectionOrComponent(previous, normalComponentKey, normalViewContext), value.edge, value.empty, normalViewContext, value.additive)
      : nominateAssemblyNormalFace(assemblyNormalSelectionOrComponent(previous, normalComponentKey, normalViewContext), value.face, value.empty, normalViewContext, value.additive, JSON.stringify(['visible-surface', value.component])))
  }
  useLayoutEffect(() => {
    const ticket = pendingInsertionSelection.current
    if (!ticket) return
    const component = resolveAssemblyInsertionSelection(ticket, committed, { scopePath, epoch: insertionNavigationEpoch.current })
    if (!component) { pendingInsertionSelection.current = null; return }
    if (!mounted.current || editingBlocked || operation.current || hasStaging() || currentPreview.current || draft || replaceDialog
      || dragging.current || dragSession.current || sceneSignature.current !== serialized
      || confirmedScene.current?.signature !== serialized || confirmedScene.current.scene !== scene) return
    // Selection first, so the next committed render owns the correct property fields.
    if (!samePath(selectedPath, component.occurrencePath) || treeOriginSelection) {
      setTreeOriginSelection(null)
      setNormalSelection(nominateAssemblyNormalUnsupported(JSON.stringify(['component', component.occurrencePath]), normalViewContext))
      setSelectedPath(component.occurrencePath); return
    }
    pendingInsertionSelection.current = null
    const epoch = insertionNavigationEpoch.current + 1, id = generation.current
    openManager('properties', '[aria-label="Nombre del componente"]', () => mounted.current && id === generation.current
      && epoch === insertionNavigationEpoch.current && current.current === ticket.document
      && currentFileScope.current === JSON.stringify(ticket.navigation.scopePath)
      && currentFileSelection.current === JSON.stringify(component.occurrencePath) && !operation.current && !hasStaging() && !currentPreview.current)
  }, [committed, serialized, scene, busy, editingBlocked, draft, replaceDialog, selectedPath, treeOriginSelection, scopePath])
  const selectTreeOrigin = (entry: AssemblyOriginTreeEntry, additive = false) => {
    const live = treeOriginCurrent.current
    if (treeOriginBlocked || live.blocked || managerTabRef.current !== 'components' || !mounted.current || operation.current
      || hasStaging() || currentPreview.current || dragSession.current || dragging.current
      || treeOriginContext.documentSignature !== serializeAssemblyDocument(current.current)) return
    const selection = retainAssemblyOriginTreeSelection(entry, treeOriginContext)
    if (resolveAssemblyOriginTreeSelection(selection, live.entries, live.context)) {
      abandonInsertionSelection()
      setDragMode('off')
      const next = nominateAssemblyNormalOrigin(normalViewSelection, entry, normalViewContext, additive)
      const lastOrigin = [...next.items].reverse().find(item => item.kind === 'origin')
      const retained = lastOrigin && treeOrigins.find(row => row.treeKey === lastOrigin.key && row.binding === lastOrigin.binding)
      setTreeOriginSelection(retained ? retainAssemblyOriginTreeSelection(retained, treeOriginContext) : null)
      setNormalSelection(next)
    }
  }
  // Creation permits preselection before choosing a family; a saved relation's
  // editor has a fixed family and only offers compatible replacements.
  const faceChoices = scene?.bodies.filter(body => body.visible).flatMap(body => body.faces).filter(face => {
    if (isLimitDistance || referenceEditTicket && (mateType === 'distance' || mateType === 'coincident')) return scopedAssemblyPlaneFace(face, scopePath)
    if (isSphereTangent) return scopedAssemblySphereTangentFace(face, scopePath, mateType)
    if (isCylinderTangent) return scopedAssemblyCylinderSurface(face, scopePath)
    const reference = scopedAssemblyFace(face, scopePath)
    return reference && (!referenceEditTicket || mateType !== 'concentric' || axis(reference))
  }) ?? []
  const limitFaceMeshes = isLimitDistance ? faceChoices.filter(face => limitEndpoints.some(reference => reference && JSON.stringify(reference) === JSON.stringify(scopedAssemblyPlaneFace(face, scopePath)))) : []
  const edgeChoices = isDirection || isLimitAngle || mateType === 'angle' ? scene?.bodies.filter(body => body.visible).flatMap(body => body.edges ?? []).filter(edge => scopedAssemblyEdge(edge, scopePath)) ?? [] : []
  const directionFaceMeshes = isDirection || isLimitAngle || mateType === 'angle' ? faceChoices.filter(face => directionalEndpoints.some(reference => reference && JSON.stringify(reference) === JSON.stringify(scopedAssemblyFace(face, scopePath)))) : []
  const directionEdgeMeshes = isDirection || isLimitAngle || mateType === 'angle' ? edgeChoices.filter(edge => directionalEndpoints.some(reference => reference && JSON.stringify(reference) === JSON.stringify(scopedAssemblyEdge(edge, scopePath)))) : []
  const editedFaceMeshes = editedReferences ? faceChoices.filter(face => editedReferences.some(reference => reference && JSON.stringify(reference) === JSON.stringify(scopedAssemblyFace(face, scopePath)))) : null
  const tangentFaceMeshes = isTangent ? faceChoices.filter(face => tangentEndpoints.some(reference => reference && JSON.stringify(reference) === JSON.stringify(scopedAssemblyTangentFace(face, scopePath)))) : []
  const cylinderFaceMeshes = isCylinderTangent ? faceChoices.filter(face => cylinderEndpoints.some(reference => reference && JSON.stringify(reference) === JSON.stringify(scopedAssemblyCylinderSurface(face, scopePath)))) : []
  const cylinderFaceLabel = (reference: AssemblyCylinderSurfaceReference | null) => {
    const face = reference && faceChoices.find(value => JSON.stringify(scopedAssemblyCylinderSurface(value, scopePath)) === JSON.stringify(reference))
    return referenceLabel(reference) + (face?.support?.kind === 'cylinder' ? ` · R${face.support.radius}` : '')
  }
  const sphereFaceMeshes = isSphereTangent ? faceChoices.filter(face => sphereEndpoints.some(reference => reference && JSON.stringify(reference) === JSON.stringify(scopedAssemblySphereTangentFace(face, scopePath, mateType)))) : []
  const sphereFaceLabel = (reference: AssemblySphereTangentReference | null) => {
    const face = reference && isSphereTangent ? faceChoices.find(value => JSON.stringify(scopedAssemblySphereTangentFace(value, scopePath, mateType)) === JSON.stringify(reference)) : undefined
    const radius = face?.sphereSurface?.radius ?? (face?.support?.kind === 'cylinder' ? face.support.radius : undefined)
    const component = reference?.component, row = component && rows.find(value => samePath(value.path, [...scopePath, ...component.occurrencePath]))
    return (row ? `${row.occurrence.name} · ` : '') + referenceLabel(reference)
      + (component ? ` · ${component.definition.id} · ${component.definition.revision}` : '')
      + (reference?.kind === 'face' && reference.body ? ` · ${reference.body.bodyId}` : '') + (radius === undefined ? '' : ` · R${radius}`)
  }
  const gearDocument = preview?.reply.document ?? committed, gearRows = mateType === 'gear' || mateType === 'screw' || mateType === 'rack-pinion' ? assemblyTreeRows(gearDocument) : []
  const gearRowsByPath = new Map<string, AssemblyTreeRow>(gearRows.map(row => [JSON.stringify(row.path), row]))
  const gearAxes = mateType === 'gear' || mateType === 'screw' || mateType === 'rack-pinion' ? (preview?.reply.scene ?? scene)?.bodies.filter(body => body.visible).flatMap(body => body.faces).flatMap(face => {
    const reference = scopedAssemblyFace(face, scopePath)
    if (!reference || !axis(reference)) return []
    const path = face.selection.component.occurrencePath, row = gearRowsByPath.get(JSON.stringify(path))
    if (face.support?.kind !== 'cylinder') return []
    return [{ key: assemblyFaceKey(face), reference, radius: face.support.radius, nativeAxis: face.support.axis, label: `${row?.occurrence.name ?? 'Componente'} · ${path.join(' / ')} · Cilindro R${face.support.radius} · eje local (${face.support.axis.join(', ')}) · ${reference.component.definition.id} · ${reference.component.definition.revision} · ${reference.face.sourceFeatureId}` }]
  }) ?? [] : []
  const rackPinions = gearAxes
  const rackScene = preview?.reply.scene ?? scene
  const rackEditingRadius = editingRack ? rackScene?.bodies.flatMap(body => body.faces).find(face => {
    const reference = scopedAssemblyFace(face, scopePath)
    return !!reference && axis(reference) && sameAxisReference(reference, editingRack.first)
  })?.support : undefined
  const rackNativeRadius = rackEditingRadius?.kind === 'cylinder' ? rackEditingRadius.radius : undefined
  const rackChoices = [...gearAxes.map(value => ({ ...value, label: `${value.reference.component.occurrencePath.join(' / ')} · Eje cilíndrico · dirección canónica (${canonicalAssemblyRackDirection(value.nativeAxis).join(', ')}) · ${value.reference.component.definition.id} · ${value.reference.component.definition.revision}` })),
    ...(mateType === 'rack-pinion' ? rackScene?.bodies.filter(body => body.visible).flatMap(body => body.edges ?? []).flatMap(edge => {
      const reference = scopedAssemblyEdge(edge, scopePath)
      if (!reference || edge.support?.kind !== 'line') return []
      return [{ key: assemblyEdgeKey(edge), reference, label: `${edge.selection.component.occurrencePath.join(' / ')} · Arista lineal · punto local (${edge.support.point.join(', ')}) · dirección canónica (${canonicalAssemblyRackDirection(edge.support.axis).join(', ')}) · ${reference.component.definition.id} · ${reference.component.definition.revision} · ${reference.body?.bodyId ?? 'agregado'} · ${reference.edge.sourceFeatureId}` }]
    }) ?? [] : [])]
  const hingeFaceMeshes = isHinge ? (scene?.bodies.filter(b=>b.visible).flatMap(b=>b.faces) ?? []).filter(face=>{const ref=scopedAssemblyFace(face,scopePath);return ref && hingeReferences.some(r=>sameHingeReference(r,ref))}) : []
  const hingeEdgeMeshes = isHinge ? (scene?.bodies.filter(b=>b.visible).flatMap(b=>b.edges ?? []) ?? []).filter(edge=>{const ref=scopedAssemblyEdge(edge,scopePath);return ref && hingeReferences.some(r=>sameHingeReference(r,ref))}) : []
  const widthFaceMeshes = isWidth ? faceChoices.filter(face => widthReferences.some(reference => reference && JSON.stringify(reference) === JSON.stringify(scopedAssemblyPlaneFace(face,scopePath)))) : []
  const symmetrySelected = isSymmetry ? symmetryReferences.map((reference, index) => symmetryPickForReference(scene, scopePath, symmetryFamily, index as SymmetryPickSlot, reference)).filter(value => value !== null) : []
  const symmetrySelectedFaces = symmetrySelected.map(value => value.actual).filter((value): value is AssemblySceneFace => 'face' in value.selection)
  const symmetrySelectedEdges = symmetrySelected.map(value => value.actual).filter((value): value is AssemblySceneEdge => 'edge' in value.selection)
  const symmetrySelectedVertices = symmetrySelected.map(value => value.actual).filter((value): value is AssemblySceneVertex => 'vertex' in value.selection)
  const rackSelectedFaces = isHinge ? hingeFaceMeshes : isSymmetry ? symmetrySelectedFaces : isWidth ? widthFaceMeshes : mateType === 'rack-pinion' ? rackScene?.bodies.flatMap(body => body.faces).filter(face => rackKeys.includes(assemblyFaceKey(face))) ?? [] : isLimitDistance ? limitFaceMeshes : isDirection || isLimitAngle || mateType === 'angle' ? directionFaceMeshes : isTangent ? tangentFaceMeshes : isCylinderTangent ? cylinderFaceMeshes : isSphereTangent ? sphereFaceMeshes : editedFaceMeshes ?? selectedFaceMeshes
  const rackSelectedEdges = isHinge ? hingeEdgeMeshes : isSymmetry ? symmetrySelectedEdges : mateType === 'rack-pinion' ? rackScene?.bodies.flatMap(body => body.edges ?? []).filter(edge => rackKeys.includes(assemblyEdgeKey(edge))) ?? [] : directionEdgeMeshes
  const gearCarriers = gearRows.filter(row => inside(row.path, scopePath) && !row.suppressed).map(row => ({ key: JSON.stringify(row.path),
    label: `${row.occurrence.name} · ${row.path.join(' / ')} · ${row.definition.id} · ${row.definition.revision}`,
    reference: { occurrencePath: row.path.slice(scopePath.length), definition: { ...row.occurrence.definition } } }))
  const chooseMateType = (next: typeof mateType) => {
    if (operation.current || hasStaging() || replaceDialog
      || currentPreview.current && (standardPreviewFamily || next === 'hinge' || next === 'circular-path' || next === 'line-path' || next === 'profile-center' || next === 'symmetry' || next === 'width' || next === 'limit-directed-angle' || next === 'limit-angle' || next === 'limit-distance' || next === 'parallel' || next === 'perpendicular' || next === 'tangent' || cylinderTangentType(next) || sphereTangentType(next))
      || ordinaryEdit && next !== mateType || angleEdit && next !== 'angle' || distanceEdit && next !== 'distance' || editingHinge && next !== 'hinge' || editingCircularPath && next !== 'circular-path' || editingLinePath && next !== 'line-path' || editingProfile && next !== 'profile-center' || editingSymmetry && next !== 'symmetry' || editingWidth && next !== 'width' || editingDirection && next !== 'parallel' && next !== 'perpendicular' || editingTangent && next !== 'tangent' || (editingCylinderTangent || editingSphereTangent || editingLimitDistance || editingLimitAngle || editingLimitDirectedAngle) && next !== mateType) return
    const pendingPick = preselectionPick.current
    const keepSecondPick = pendingPick?.generation === generation.current && pendingPick.signature === serialized
      && pendingPick.scope === currentFileScope.current && pendingPick.scene === scene && !referenceEditing
      && references[0] && !references[1] && isAssemblyOrdinaryCreationType(next)
      && assemblyRelationDefault([references[0]], next) === next
    creationReferenceDraft.current = null
    preselectionPick.current = null
    clearSymmetryPicking()
    if (next !== mateType) hingeContext.current = null
    if (isHinge !== (next === 'hinge')) { setHingeReferences([null,null,null,null]); resetHingeStops(); setEditingHingeId(null); setHingeAlignment('') }
    setHingePicking(null)
    if(isSymmetry!==(next==='symmetry')){setSymmetryReferences([null,null,null]);setEditingSymmetryId(null);setSymmetryAlignment('')}
    if (isWidth !== (next === 'width')) { setWidthReferences([null,null,null,null]); setEditingWidthId(null); setWidthBranch(''); setTabBranch(''); setWidthAlignment('') }
    if (isLimitDirectedAngle !== (next === 'limit-directed-angle') || isLimitAngle !== (next === 'limit-angle') || isLimitDistance !== (next === 'limit-distance') || isTangent !== (next === 'tangent') || isCylinderTangent !== cylinderTangentType(next) || isSphereTangent !== sphereTangentType(next) || isSphereTangent && next !== mateType) { setReferences([null, null]); setWidthReferences([null,null,null,null]); setEditingWidthId(null); setTangentReferences([null, null]); setCylinderReferences([null, null]); setSphereReferences([null, null]); setLimitReferences([null, null]); setLimitAngleReferences([null, null]); setLimitDirectedSelection(['', '', '']); setCylinderLarger(''); setSphereLarger(''); setSelectedFaceMeshes([]); setFaceChoice('') }
    if(next==='circular-path'){setPickingFaces(false);setPickingLinearEdges(false);setDragMode('off')}
    if(next!=='circular-path')setEditingCircularPathId(null)
    if(isCircularPath!==(next==='circular-path'))setCircularPathReset(v=>v+1)
    if (next !== 'line-path') setEditingLinePathId(null)
    if (isLinePath !== (next === 'line-path')) setLinePathReset(value => value + 1)
    if (next !== 'profile-center') setEditingProfileId(null)
    if (isProfile !== (next === 'profile-center')) setProfileReset(value => value + 1)
    if (ordinaryEdit && next !== mateType) { setOrdinaryEdit(null); setReleaseRotation(false) }
    if (next !== 'angle') setAngleEdit(null)
    if (next !== 'distance') setDistanceEdit(null)
    setMateType(next); setEditingGearId(null); setEditingScrewId(null); setEditingRackId(null)
    if (next !== 'parallel' && next !== 'perpendicular') setDirectionEdit(null)
    if (next !== 'tangent') setEditingTangentId(null)
    if (!cylinderTangentType(next)) setEditingCylinderTangentId(null)
    if (!sphereTangentType(next)) setEditingSphereTangentId(null)
    if (next !== 'limit-distance') setEditingLimitDistanceId(null)
    if (next !== 'limit-angle') setEditingLimitAngleId(null)
    if (next !== 'limit-directed-angle') setEditingLimitDirectedAngleId(null)
    setRackPicking(null); setRackKeys(['', '']); setPickingFaces(!!keepSecondPick); setPickingLinearEdges(false); setWidthPicking(null)
    if (keepSecondPick) { preselectionPick.current = pendingPick; setEndpointSlot(1) }
  }
  const beginRelationFromSelection = () => {
    if (!mounted.current || dragging.current || dragSession.current) return
    const panel = () => openManager('relations', '[aria-label="Tipo de relación"]')
    // Navigation can resume a retained preview/editor; only a clean entry may prefill.
    if (operation.current || hasStaging() || currentPreview.current || editingBlocked || draft || replaceDialog
      || referenceEditing || editingGear || editingScrew || editingRack || !isAssemblyOrdinaryCreationType(mateType)) {
      panel(); return
    }
    if (normalViewBlocked || normalViewCurrent.current.context !== normalViewContext || normalViewCurrent.current.blocked
      || serialized !== serializeAssemblyDocument(current.current) || JSON.stringify(scopePath) !== currentFileScope.current) return
    const selected = resolveAssemblyRelationSelection(normalViewSelection, normalViewContext, treeOrigins)
    if (selected.status !== 'ready') {
      panel()
      if (selected.status === 'invalid') notify(selected.message ?? 'Vuelve a seleccionar una o dos referencias actuales del ámbito.', true)
      return
    }
    const nextType = assemblyRelationDefault(selected.references, mateType)
    if (!nextType) { panel(); notify('Estas referencias requieren un editor con roles específicos.', true); return }
    chooseMateType(nextType)
    setReferences([structuredClone(selected.references[0]), selected.references[1] ? structuredClone(selected.references[1]) : null])
    setSelectedFaceMeshes(selected.faces); setFaceChoice(''); setEdgeChoice(''); setDragMode('off')
    const needsSecond = selected.references.length === 1
    setEndpointSlot(needsSecond ? 1 : 0)
    preselectionPick.current = needsSecond ? { signature: serialized, scope: JSON.stringify(scopePath), scene: scene!, generation: generation.current, slot: 1 } : null
    setPickingFaces(needsSecond); setPickingLinearEdges(false)
    openManager('relations', needsSecond ? '[aria-label="Referencia 2 de la relación"]' : '[aria-label="Tipo de relación"]')
    notify(needsSecond ? 'Referencia 1 preparada. Selecciona la referencia 2 o elige un origen en el panel.'
      : 'Dos referencias preparadas en el orden seleccionado. Revisa el tipo y pulsa Vista previa.')
  }
  const circularPathChoices=scene?assemblyCircularPathCatalogChoices({...scene,bodies:scene.bodies.filter(body=>body.visible)}).filter(c=>c.reference.component.occurrencePath.length>scopePath.length&&scopePath.every((id,i)=>c.reference.component.occurrencePath[i]===id)).map(c=>({...c,reference:{...c.reference,component:{...c.reference.component,occurrencePath:c.reference.component.occurrencePath.slice(scopePath.length)}}})):[]
  const circularContextKey=JSON.stringify([serialized,scopePath,generation.current,confirmedScene.current?.scene.sceneId??null,mateType,editingCircularPathId])
  if(circularPathEpoch.current.key!==circularContextKey)circularPathEpoch.current={key:circularContextKey,value:circularPathEpoch.current.value+1}
  const circularPathTicket={signature:serialized,scope:JSON.stringify(scopePath),generation:generation.current,sceneId:confirmedScene.current?.scene.sceneId??null,family:mateType,epoch:circularPathEpoch.current.value}
  circularPathContext.current=circularPathTicket
  const linePathChoices = assemblyLinePathUiChoices(scene, scopePath)
  const linePathTicket = { signature: serialized, scope: JSON.stringify(scopePath), generation: generation.current, sceneId: confirmedScene.current?.scene.sceneId ?? null, family: mateType }
  linePathContext.current = linePathTicket
  const profileFaces: ProfileFaceChoice[] = (scene?.bodies.filter(body => body.visible).flatMap(body => body.faces) ?? []).flatMap(face => {
    if (face.support?.kind !== 'plane' || !inside(face.selection.component.occurrencePath, scopePath)) return []
    try { const reference = validateAssemblyProfileFaceSelection({ ...face.selection, component: { ...face.selection.component, occurrencePath: face.selection.component.occurrencePath.slice(scopePath.length) } }); return [{ key: assemblyFaceKey(face), label: face.selection.component.occurrencePath.join(' / ') + ' · Plano · (' + face.support.point.map(value => Number(value.toPrecision(5))).join(', ') + ') · ' + face.selection.face.key, reference }] } catch { return [] }
  })
  const profileEdges: ProfileEdgeChoice[] = (scene?.bodies.filter(body => body.visible).flatMap(body => body.edges ?? []) ?? []).flatMap(edge => {
    if (!edge.support || !inside(edge.selection.component.occurrencePath, scopePath)) return []
    const owner = profileFaces.find(face => JSON.stringify(face.reference.component) === JSON.stringify({ ...edge.selection.component, occurrencePath: edge.selection.component.occurrencePath.slice(scopePath.length) }) && JSON.stringify(face.reference.body) === JSON.stringify(edge.selection.body))
    return owner ? [{ key: assemblyEdgeKey(edge), label: edge.selection.component.occurrencePath.join(' / ') + ' · LINE · (' + edge.support.point.map(value => Number(value.toPrecision(5))).join(', ') + ') · ' + edge.selection.edge.key, faceOwner: owner.reference, edge: structuredClone(edge.selection.edge) }] : []
  })
  const widthChoices: WidthPlaneChoice[] = faceChoices.flatMap(face => { const reference=scopedAssemblyPlaneFace(face,scopePath); return reference ? [{key:assemblyFaceKey(face),label:referenceLabel(reference),reference}] : [] })
  const datumOwners = [{key:'scope',component:null}, ...availableComponents.map(row=>({key:JSON.stringify(row.path),component:{occurrencePath:row.path.slice(scopePath.length),definition:{...row.occurrence.definition}}}))]
  for (const owner of datumOwners) for (const plane of ['XY','XZ','YZ'] as const) widthChoices.push({key:'datum:'+owner.key+':'+plane,label:(owner.component?.occurrencePath.join(' / ') ?? 'Ámbito actual')+' · '+plane,reference:{kind:'principal-plane',component:owner.component,plane}})
  const symmetryChoices:{key:string;label:string;reference:SymmetryUiReference}[]=[]
  const symmetryChoice=(reference:SymmetryUiReference,label:string)=>symmetryChoices.push({key:JSON.stringify(reference),reference,label})
  if(symmetryFamily==='plane')for(const choice of widthChoices)symmetryChoice(choice.reference,choice.label)
  if(isSymmetry)for(const body of scene?.bodies??[]){
    if(!body.visible)continue
    if(symmetryFamily==='point')for(const vertex of body.vertexPoints??[]){
      if(!inside(vertex.selection.component.occurrencePath,scopePath))continue
      const selection=structuredClone(vertex.selection);selection.component.occurrencePath=selection.component.occurrencePath.slice(scopePath.length)
      symmetryChoice({kind:'vertex',...selection,support:'point'},selection.component.occurrencePath.join(' / ')+' · vértice ('+vertex.point.map(v=>Number(v.toPrecision(5))).join(', ')+') mm')
    }
    if(symmetryFamily==='line')for(const edge of body.edges??[]){const reference=scopedAssemblyEdge(edge,scopePath);if(reference)symmetryChoice(reference,reference.component.occurrencePath.join(' / ')+' · recta ('+edge.support!.point.map(v=>Number(v.toPrecision(5))).join(', ')+') mm')}
    for(const face of body.faces){
      const ref=symmetryFamily==='sphere'?assemblySceneSphereSurfaceReference(face):symmetryFamily==='cylinder'?assemblySceneCylinderSurfaceReference(face):symmetryFamily==='line'&&face.support?.kind==='cylinder'?assemblySceneFaceReference(face):null
      if(!ref||!inside(ref.component.occurrencePath,scopePath))continue
      ref.component.occurrencePath=ref.component.occurrencePath.slice(scopePath.length)
      if(symmetryFamily==='line'&&ref.support!=='axis')continue
      symmetryChoice(ref,ref.component.occurrencePath.join(' / ')+' · '+(symmetryFamily==='line'?'eje cilíndrico explícito':symmetryFamily==='sphere'?'superficie esférica':'superficie cilíndrica')+' · '+(face.sphereSurface?.center??face.support?.point??[]).map(v=>Number(v.toPrecision(5))).join(', ')+' mm')
    }
  }
  const { axes: hingeAxes, planes: hingePlanes } = assemblyHingeChoices(scene, scopePath,
    widthChoices.filter(choice => choice.reference.kind === 'principal-plane'))
  const hingeAngularPlanes=hingePlanes.filter(c=>c.reference.kind==='face'&&c.reference.support==='plane')
  const hingeContextKey = JSON.stringify([serialized,scopePath,generation.current,confirmedScene.current?.scene.sceneId ?? null,mateType,editingHingeId,hingeLimited,hingeStart,hingeSweep,mateName,hingeAlignment])
  if (hingeEpoch.current.key !== hingeContextKey) hingeEpoch.current = {key:hingeContextKey,value:hingeEpoch.current.value+1}
  const hingeTicket: HingeUiTicket = {signature:serialized,scope:JSON.stringify(scopePath),generation:generation.current,sceneId:confirmedScene.current?.scene.sceneId ?? null,family:mateType,epoch:hingeEpoch.current.value,limited:hingeLimited}
  hingeContext.current = hingeTicket
  const activeHingePick = currentHingePick(hingePicking, hingeTicket, !isHinge || symmetryBlocked || dragActive || !!dragSession.current) ? hingePicking : null
  const hingeMayEdit = (ticket: HingeUiTicket) => symmetryMayEdit() && !dragSession.current && !dragActive && hingeLiveCurrent(ticket)
  const clearHingePicking = () => { setHingePicking(null); setPickingFaces(false); setPickingLinearEdges(false) }
  const toggleHingePicking = (slot: HingeUiSlot, producer: 'face'|'line-edge') => {
    if (!hingeMayEdit(hingeTicket) || slot >= hingeReferencesRef.current.length || producer === 'line-edge' && slot >= 2) return
    if (activeHingePick?.slot === slot && activeHingePick.producer === producer) { clearHingePicking(); return }
    const ticket = {...hingeTicket,slot,producer}; setHingePicking(ticket); setWidthPicking(null); clearSymmetryPicking(); setRackPicking(null); setDragMode('off')
    setPickingFaces(producer === 'face'); setPickingLinearEdges(producer === 'line-edge')
  }
  const relationReferences = referenceEditTicket ? editedReferences ?? [null, null] : isLimitAngle ? limitAngleEndpoints : isLimitDistance ? limitEndpoints : isSphereTangent ? sphereEndpoints : isCylinderTangent ? cylinderEndpoints : isTangent ? tangentEndpoints : isDirection ? directionReferences : references
  const hasGenericReferences = !isHinge && !isCircularPath && !isLinePath && !isProfile && !isSymmetry && !isWidth && mateType !== 'gear' && mateType !== 'screw' && mateType !== 'rack-pinion' && !isLimitDirectedAngle
  const relationSelectionGuidance = (selectedSlot?: 0 | 1) => {
    if (isHinge || isCircularPath || isLinePath || isProfile || isSymmetry || isWidth || isLimitDirectedAngle || mateType === 'gear' || mateType === 'screw' || mateType === 'rack-pinion') return 'Configura las referencias y los parámetros en el panel de la relación.'
    const missing = relationReferences.flatMap((reference, index) => !reference && index !== selectedSlot ? [index + 1] : [])
    if (missing.length) return 'Selecciona ' + (missing.length === 1 ? 'la referencia ' : 'las referencias ') + missing.join(' y ') + '.'
    const action = referenceEditing ? 'Vista previa de los cambios' : isLimitAngle ? 'Vista previa del intervalo' : 'Vista previa de la nueva relación'
    return 'Revisa el nombre y los parámetros; pulsa «' + action + '». Después de verificarla, podrás Aplicar.'
  }
  const referenceBlocked = editingBlocked || !!preview || !!draft || replaceDialog || standardPreviewFamily && referenceEditing && !editedReferences
  const originKinds = standardAssemblyOriginKinds(mateType)
  const originBlocked = referenceBlocked || !!draft || dragActive || !!dragSession.current || sceneSignature.current !== serialized
    || confirmedScene.current?.signature !== serialized || confirmedScene.current?.scene !== scene
    || !originDisplays.some(value => value.reference.kind === 'principal-axis' ? originKinds.axes : originKinds.planes)
  const activeOriginPicking = originPicking && managerTab === 'relations' && !originBlocked
    && !pickingFaces && !pickingLinearEdges && !symmetryPicking && !hingePicking && !widthPicking && !rackPicking && dragMode === 'off'
  useEffect(() => { if (showOriginAxes) setOriginControlsOpen(true) }, [showOriginAxes])
  useEffect(() => { if (showOriginPlanes) setOriginControlsOpen(true) }, [showOriginPlanes])
  useEffect(() => { if (activeOriginPicking) setOriginControlsOpen(true) }, [activeOriginPicking])
  const originTicket: StandardAssemblyOriginPickTicket = { signature: serialized, scope: JSON.stringify(scopePath), generation: generation.current,
    sceneId: scene?.sceneId ?? null, family: mateType, slot: endpointSlot, armed: activeOriginPicking, blocked: originBlocked }
  originPickContext.current = originTicket
  const originRoleReferences = isHinge ? hingeReferences : isSymmetry ? symmetryReferences : isWidth ? widthReferences : originKinds.axes || originKinds.planes ? relationReferences : []
  const selectedOriginReferences = originRoleReferences.filter((reference): reference is AssemblyOriginReference => !!reference && (reference.kind === 'principal-axis' || reference.kind === 'principal-plane'))
  useEffect(() => { stopOriginPicking() }, [serialized, scopePath, selectedPath, mateType, endpointSlot, originOwner, showOriginAxes, showOriginPlanes, busy, preview, draft])
  useEffect(() => {
    if (pickingFaces || pickingLinearEdges || symmetryPicking || hingePicking || widthPicking || rackPicking || dragMode !== 'off') stopOriginPicking()
  }, [pickingFaces, pickingLinearEdges, symmetryPicking, hingePicking, widthPicking, rackPicking, dragMode])
  const beginOriginPick = () => {
    if (originBlocked || operation.current || hasStaging() || currentPreview.current || !mounted.current) return
    if (activeOriginPicking) { stopOriginPicking(); return }
    openManager('relations')
    clearSymmetryPicking(); setHingePicking(null); setWidthPicking(null); setRackPicking(null); setDragMode('off')
    originPickingRef.current = true; setOriginPicking(true)
  }
  const pickOrigin = (incoming: AssemblyOriginReference | null) => {
    if (!originPickingRef.current || managerTabRef.current !== 'relations' || !mounted.current || operation.current || hasStaging()
      || currentPreview.current || replaceDialog || dragSession.current || dragging.current || !referenceEditorIsCurrent()
      || originTicket.signature !== serializeAssemblyDocument(current.current) || originTicket.generation !== generation.current
      || originTicket.scope !== currentFileScope.current || originTicket.sceneId !== confirmedScene.current?.scene.sceneId
      || confirmedScene.current?.signature !== originTicket.signature || sceneSignature.current !== originTicket.signature) return
    const reference = standardAssemblyOriginPick(incoming, originDisplays, originTicket, originPickContext.current)
    if (!reference) return
    stopOriginPicking()
    if (isLimitAngle) setLimitAngleReferences(values => { const next: typeof values = [...values]; next[endpointSlot] = reference; return next })
    else if (reference.kind === 'principal-plane' && isLimitDistance) setLimitReferences(values => { const next: typeof values = [...values]; next[endpointSlot] = reference; return next })
    else if (reference.kind === 'principal-plane' && isTangent) setTangentReferences(values => { const next: typeof values = [...values]; next[endpointSlot] = reference; return next })
    else if (reference.kind === 'principal-plane' && mateType === 'plane-sphere-tangent') setSphereReferences(values => { const next: typeof values = [...values]; next[endpointSlot] = reference; return next })
    else setRelationReference(endpointSlot, reference)
    setEndpointSlot(endpointSlot === 0 ? 1 : 0)
    notify('Origen seleccionado en referencia ' + (endpointSlot + 1) + '. ' + relationSelectionGuidance(endpointSlot))
  }
  const symmetryPickingBlocked = symmetryBlocked || dragActive || !!dragSession.current || sceneSignature.current !== serialized || confirmedScene.current?.signature !== serialized
  const activeSymmetryPick = currentSymmetryPick(symmetryPicking, { signature: serialized, scope: JSON.stringify(scopePath), generation: generation.current, sceneId: confirmedScene.current?.scene.sceneId ?? null, family: symmetryFamily, blocked: !isSymmetry || symmetryPickingBlocked }) ? symmetryPicking : null
  const toggleSymmetryPicking = (slot: SymmetryPickSlot, lineProducer: SymmetryPickTicket['lineProducer'] = null) => {
    if (!isSymmetry || !symmetryMayEdit() || symmetryPickingBlocked) return
    const producer = symmetryPickProducer(symmetryFamily, slot, lineProducer)
    if (!producer) return
    if (activeSymmetryPick?.slot === slot && activeSymmetryPick.producer === producer) { clearSymmetryPicking(); return }
    const ticket: SymmetryPickTicket = { slot, family: symmetryFamily, producer, lineProducer, signature: serialized, scope: JSON.stringify(scopePath), generation: generation.current, sceneId: confirmedScene.current!.scene.sceneId }
    setSymmetryPicking(ticket); setWidthPicking(null); setRackPicking(null); setDragMode('off')
    setPickingFaces(producer !== 'vertex' && producer !== 'line-edge'); setPickingLinearEdges(producer === 'line-edge')
  }
  const widthPickingBlocked = editingBlocked || !!preview || !!draft || replaceDialog || sceneSignature.current !== serialized || confirmedScene.current?.signature !== serialized
  const widthPickingSlot = isWidth && pickingFaces && widthPicking?.signature === serialized && widthPicking.scope === JSON.stringify(scopePath)
    && widthPicking.generation === generation.current ? widthPicking.slot : null
  const toggleWidthPicking = (slot: WidthUiSlot) => {
    if (!isWidth || operation.current || hasStaging() || currentPreview.current || widthPickingBlocked) return
    const active = widthPickingSlot === slot
    setWidthPicking(active ? null : { slot, signature: serialized, scope: JSON.stringify(scopePath), generation: generation.current })
    setPickingFaces(!active); setPickingLinearEdges(false); setDragMode('off'); setRackPicking(null)
  }
  useEffect(() => {
    if (sourceUpdate || documentUpdate || replacementReview) { managerTabRef.current = 'relations'; setManagerTab('relations') }
  }, [sourceUpdate, documentUpdate, replacementReview])
  const newDocumentBlocked = editingBlocked || !!draft || !!preview || referenceEditing
  const newDocumentBlockedRef = useRef(newDocumentBlocked); newDocumentBlockedRef.current = newDocumentBlocked
  const newDocumentEditorBlocked = !!rootRevision || referenceEditing || !!draft
  const newDocumentEditorBlockedRef = useRef(newDocumentEditorBlocked); newDocumentEditorBlockedRef.current = newDocumentEditorBlocked
  const newAssembly = () => void (async () => {
    if (newDocumentRequest.current || newDocumentBlockedRef.current || operation.current || hasStaging() || replaceAnswer.current) return
    newDocumentRequest.current = true
    const source = current.current, id = generation.current, scope = currentFileScope.current
    // Save-and-continue releases the authoritative operation ref before its
    // queued busy=false render. Do not reject that completed save on stale UI busy.
    const fresh = () => mounted.current && current.current === source && generation.current === id && currentFileScope.current === scope
      && !newDocumentEditorBlockedRef.current && !operation.current && !hasStaging() && !currentPreview.current
    try {
      await requestNewDocument({ choose: newDocumentDialog.choose, current: fresh, confirm: () => mayReplace(), create: kind => {
        if (kind === 'part') onOpenPart(createDocument('Pieza1'))
        else replace(createEmptyAssembly())
      } })
    } catch (reason) { if (mounted.current) notify((reason as Error).message, true) }
    finally { newDocumentRequest.current = false }
  })()
  const exampleAssembly = () => void (async () => { if (await mayReplace()) replace(createAssemblyExample()) })()
  const contextBlocked = editingBlocked || !!draft || !!preview || replaceDialog || !!streamProjection || bomOpen
    || dragActive || !!dragSession.current || !!dragging.current || pickingFaces || pickingLinearEdges
    || !!symmetryPicking || !!hingePicking || !!widthPicking || !!rackPicking || activeOriginPicking
    || !scene || sceneSignature.current !== serialized || confirmedScene.current?.signature !== serialized
    || confirmedScene.current?.scene !== scene
  const contextCurrent = useRef({ target: contextTarget, reset: treeReset, blocked: contextBlocked, originSelection: treeOriginSelection })
  contextCurrent.current = { target: contextTarget, reset: treeReset, blocked: contextBlocked, originSelection: treeOriginSelection }
  const contextMayOpen = () => !contextBlocked && !contextCurrent.current.blocked && mounted.current
    && !operation.current && !hasStaging() && !currentPreview.current && !dragSession.current && !dragging.current
    && serialized === serializeAssemblyDocument(current.current) && JSON.stringify(scopePath) === currentFileScope.current
  const contextBase = (point: { x: number; y: number }, element: HTMLElement) => ({ point, element,
    reset: treeReset, signature: serialized, scope: JSON.stringify(scopePath), generation: generation.current })
  const openComponentContext = (componentPath: string[], point: { x: number; y: number }, element: HTMLElement, fromTree = false) => {
    if (!contextMayOpen()) return
    const ticket = createAssemblyComponentContextTarget(current.current, scopePath, componentPath)
    if (!ticket) return
    if (fromTree) setNormalSelection(nominateAssemblyNormalUnsupported(JSON.stringify(['component', componentPath]), normalViewContext))
    abandonInsertionSelection(); setTreeOriginSelection(null)
    if (fileTicket.current?.purpose === 'update' || linkedTicket.current) generation.current++
    setSelectedPath([...componentPath])
    setContextTarget({ ...contextBase(point, element), kind: 'component', ticket })
  }
  const openOriginContext = (entry: AssemblyOriginTreeEntry, point: { x: number; y: number }, element: HTMLElement) => {
    if (!contextMayOpen() || treeOriginCurrent.current.blocked) return
    const ticket = retainAssemblyOriginTreeSelection(entry, treeOriginContext)
    if (!resolveAssemblyOriginTreeSelection(ticket, treeOriginCurrent.current.entries, treeOriginCurrent.current.context)) return
    abandonInsertionSelection(); setDragMode('off'); setTreeOriginSelection(ticket)
    setNormalSelection(previous => nominateAssemblyNormalOrigin(previous, entry, normalViewContext, false))
    setContextTarget({ ...contextBase(point, element), kind: 'origin', ticket })
  }
  const openViewportContext = (target: AssemblyViewportContextTarget) => {
    if (!contextMayOpen()) return
    if (target.kind === 'component') {
      const ticket = createAssemblyComponentContextTarget(current.current, scopePath, target.component.occurrencePath)
      if (ticket && assemblyDefinitionKey(ticket.component.definition) === assemblyDefinitionKey(target.component.definition))
        openComponentContext(target.component.occurrencePath, target.point, target.restoreFocusElement)
    } else if (target.kind === 'origin') {
      const entry = resolveAssemblyOriginContextEntry(target.reference, scopePath, treeOrigins, selectedTreeOrigin)
      if (entry) openOriginContext(entry, target.point, target.restoreFocusElement)
    } else setContextTarget({ ...contextBase(target.point, target.restoreFocusElement), kind: 'background' })
  }
  const contextIsCurrent = (target: ContextTarget) => {
    const live = contextCurrent.current
    if (live.target !== target || live.blocked || !mounted.current || operation.current || hasStaging() || currentPreview.current
      || dragSession.current || dragging.current || target.reset !== live.reset || target.generation !== generation.current
      || target.signature !== serializeAssemblyDocument(current.current) || target.scope !== currentFileScope.current) return false
    if (target.kind === 'component') return !live.originSelection && !!resolveAssemblyComponentContextTarget(target.ticket,
      current.current, JSON.parse(currentFileScope.current), JSON.parse(currentFileSelection.current))
    if (target.kind === 'origin') return live.originSelection === target.ticket && !treeOriginCurrent.current.blocked
      && !!resolveAssemblyOriginTreeSelection(target.ticket, treeOriginCurrent.current.entries, treeOriginCurrent.current.context)
    return true
  }
  const activeContext = contextTarget && contextIsCurrent(contextTarget) ? contextTarget : null
  useLayoutEffect(() => { if (contextTarget && !activeContext) setContextTarget(null) }, [contextTarget, activeContext])
  const contextRow = activeContext?.kind === 'component'
    ? resolveAssemblyComponentContextTarget(activeContext.ticket, committed, scopePath, selectedPath) : null
  const contextOrigin = activeContext?.kind === 'origin'
    ? resolveAssemblyOriginTreeSelection(activeContext.ticket, treeOrigins, treeOriginContext) : null
  const contextAction = (action: () => void) => { if (activeContext && contextIsCurrent(activeContext)) action() }
  const contextEdit = (field: 'fixed' | 'visible' | 'suppressed') => contextAction(() => {
    if (activeContext?.kind !== 'component') return
    const row = resolveAssemblyComponentContextTarget(activeContext.ticket, current.current,
      JSON.parse(currentFileScope.current), JSON.parse(currentFileSelection.current))
    if (!row) return
    const common = { scope: row.parent, occurrenceId: row.occurrence.id }
    if (field === 'fixed') edit({ ...common, type: 'set-occurrence-fixed', fixed: !row.occurrence.fixed })
    else if (field === 'visible') edit({ ...common, type: 'set-occurrence-visible', visible: !row.occurrence.visible })
    else edit({ ...common, type: 'set-occurrence-suppressed', suppressed: !row.occurrence.suppressed })
  })
  const contextActions: CadContextAction[] = contextRow ? [
    { id: 'view-normal', label: 'Normal a', disabled: !canNormal, onSelect: () => contextAction(() => viewButton('normal')) },
    { id: 'component-properties', label: 'Propiedades del componente', icon: Settings2, onSelect: () => contextAction(() => openManager('properties', '[aria-label="Nombre del componente"]')) },
    { id: 'component-move', label: 'Mover componente', icon: Move3D, disabled: contextRow.occurrence.fixed || contextRow.suppressed,
      onSelect: () => contextAction(() => openManager('properties', '.assembly-movement h3')) },
    { id: 'component-fixed', label: contextRow.occurrence.fixed ? 'Flotar' : 'Fijar', onSelect: () => contextEdit('fixed') },
    { id: 'component-visible', label: contextRow.occurrence.visible ? 'Ocultar' : 'Mostrar', onSelect: () => contextEdit('visible') },
    { id: 'component-suppressed', label: contextRow.occurrence.suppressed ? 'Activar' : 'Suprimir', onSelect: () => contextEdit('suppressed') },
  ] : contextOrigin ? [
    { id: 'view-normal', label: 'Normal a', disabled: !canNormal, onSelect: () => contextAction(() => viewButton('normal')) },
    { id: 'origin-controls', label: 'Referencias de origen', onSelect: () => contextAction(() => {
      setOriginControlsOpen(true); openManager('relations', '#assembly-relation-origins summary')
    }) },
    { id: 'origin-owner', label: 'Seleccionar componente propietario', disabled: !contextOrigin.ownerPath.length,
      onSelect: () => contextAction(() => { abandonInsertionSelection(); setTreeOriginSelection(null); setNormalSelection(nominateAssemblyNormalUnsupported(JSON.stringify(['component', contextOrigin.ownerPath]), normalViewContext)); setSelectedPath([...contextOrigin.ownerPath]) }) },
  ] : [...standardViews, { name: 'normal' as const, label: 'Normal a' }, { name: 'fit' as const, label: 'Ajustar a pantalla' }, { name: 'previous' as const, label: 'Vista anterior' }].map(({ name, label }) => ({ id: `view-${name}`,
    label, disabled: viewHistory.navigating || name === 'normal' && !canNormal || name === 'previous' && !viewHistory.canPrevious, onSelect: () => contextAction(() => viewButton(name)) }))
  const menus: AssemblyMenuDefinition[] = withAssemblyShortcutLabels([
    { id: 'file', label: 'Archivo', items: [
      { id: 'new', label: 'Nuevo…', disabled: newDocumentBlocked || replaceDialog, onSelect: newAssembly },
      { id: 'open', label: 'Abrir…', disabled: editingBlocked || replaceDialog, onSelect: () => void open('open') },
      { id: 'import-step', label: 'Importar STEP estructurado…', disabled: editingBlocked || !!draft || !!preview || replaceDialog, onSelect: () => void importStructural() },
      { id: 'save', label: 'Guardar', disabled: documentEditingBlocked || !!draft, onSelect: () => void save() },
      { id: 'save-as', label: 'Guardar como…', disabled: documentEditingBlocked || !!draft, onSelect: () => void save(true) },
      { id: 'export', label: 'Exportar geometría…', onSelect: () => openManager('evaluate', '#assembly-export-tools') },
    ] },
    { id: 'edit', label: 'Editar', items: [
      { id: 'undo', label: 'Deshacer', disabled: editingBlocked || !history.current.canUndo, onSelect: () => undo() },
      { id: 'redo', label: 'Rehacer', disabled: editingBlocked || !history.current.canRedo, onSelect: () => undo(true) },
      { id: 'component-properties', label: 'Propiedades del componente', disabled: editingBlocked || !selected || !!selectedTreeOrigin, onSelect: () => openManager('properties', '[aria-label="Nombre del componente"]') },
      { id: 'revision', label: 'Crear revisión…', disabled: editingBlocked || !!draft || replaceDialog, onSelect: openRootRevision },
    ] },
    { id: 'view', label: 'Ver', items: [
      ...standardViews.map(({ name, label }) => ({ id: 'view-' + name, label, disabled: !!dragSession.current || viewHistory.navigating, onSelect: () => viewButton(name) })),
      { id: 'view-normal', label: 'Normal a', disabled: !canNormal, onSelect: () => viewButton('normal') },
      { id: 'view-named', label: 'Vistas guardadas…', disabled: !namedViews.canOpen, onSelect: namedViews.open },
      { id: 'view-previous', label: 'Vista anterior', disabled: !!dragSession.current || !viewHistory.canPrevious, onSelect: () => viewButton('previous') },
      { id: 'view-fit', label: 'Ajustar a pantalla', disabled: !!dragSession.current || viewHistory.navigating, onSelect: () => viewButton('fit') },
      { id: 'show-tree', label: 'Árbol de componentes', onSelect: () => openManager('components') },
      { id: 'show-relations', label: 'Propiedades de relación', onSelect: () => openManager('relations', '[aria-label="Tipo de relación"]') },
      { id: 'show-axes', label: 'Ejes de origen', checked: showOriginAxes, onSelect: () => { stopOriginPicking(); setShowOriginAxes(value => !value) } },
      { id: 'show-planes', label: 'Planos de origen', checked: showOriginPlanes, onSelect: () => { stopOriginPicking(); setShowOriginPlanes(value => !value) } },
      { id: 'show-bom', label: 'Lista de materiales', checked: bomOpen, onSelect: () => setBomOpen(value => !value) },
    ] },
    { id: 'insert', label: 'Insertar', items: [
      { id: 'insert-component', label: 'Componente desde archivo…', disabled: editingBlocked || replaceDialog, onSelect: () => void open('insert') },
      { id: 'insert-step', label: 'STEP estructurado…', disabled: editingBlocked || !!draft || !!preview || replaceDialog, onSelect: () => void insertStructural() },
      { id: 'insert-reuse', label: 'Otra ocurrencia de un origen…', onSelect: () => openManager('components', '[aria-label="Origen del componente"]') },
      { id: 'insert-relation', label: 'Relación de posición…', onSelect: beginRelationFromSelection },
    ] },
    { id: 'tools', label: 'Herramientas', items: [
      { id: 'solve', label: 'Resolver ensamblaje', disabled: busy || !!rootRevision || !!referenceEditTicket, onSelect: () => void solve() },
      { id: 'apply', label: 'Aplicar vista previa', disabled: !canApply, onSelect: () => void apply() },
      { id: 'cancel-preview', label: 'Cancelar vista previa', disabled: busy ? !cancelable : !preview && !sourceUpdate && !documentUpdate && !replacementReview, onSelect: cancelToolbarPreview },
      { id: 'interferences', label: 'Comprobar interferencias…', onSelect: () => openManager('evaluate', '.assembly-interference h2') },
      { id: 'measure-angle', label: 'Medir ángulo dirigido…', onSelect: () => openManager('evaluate', 'section[aria-label="Medir ángulo dirigido"]') },
    ] },
    { id: 'help', label: 'Ayuda', items: [
      { id: 'viewport-controls', label: 'Controles del visor', onSelect: () => notify('Clic: seleccionar. Rueda: acercar o alejar. Rueda pulsada: girar. Mayús + rueda pulsada: desplazar. Para relacionar orígenes, abre Relaciones, elige el componente y activa su referencia.') },
      { id: 'examples', label: 'Documentos y ejemplos', onSelect: () => openManager('components', '.assembly-document-tools h3') },
      { id: 'example-assembly', label: 'Ejemplo: placa y dos pasadores', disabled: editingBlocked || replaceDialog, onSelect: exampleAssembly },
    ] },
  ])
  const shortcutPicking = originPicking || pickingFaces || pickingLinearEdges || !!symmetryPicking || !!hingePicking || !!widthPicking || !!rackPicking
  const shortcutCancel = menus.flatMap(menu => menu.items).find(item => item.id === 'cancel-preview')!
  useAssemblyShortcuts({ root: '.assembly-classic-workspace', menus, modal: namedViews.isOpen || newDocumentDialog.isOpen || replaceDialog || !!replaceAnswer.current,
    beforeFile: (id, target) => {
      if (!(target instanceof HTMLInputElement) || target.getAttribute('aria-label') !== 'Nombre del componente') return true
      const typed = target.value, changed = typed !== selected?.occurrence.name
      // Pointer Save already crosses this same synchronous onBlur validation.
      // Keyboard Save must serialize the accepted value, never a visible draft.
      // This window listener is outside React's event boundary: finish the
      // blur commit/render before Save reads current.current and dirty state.
      flushSync(() => target.blur())
      if (target.value !== typed) return false
      if (changed && (id === 'open' || id === 'new')) {
        notify('Nombre actualizado. Repite el comando cuando termine la reconstrucción.')
        return false
      }
      return true
    },
    escape: shortcutPicking ? { disabled: editingBlocked || dragActive || !!dragSession.current, onSelect: () => {
      if (operation.current || hasStaging() || dragActive || dragSession.current) return
      preselectionPick.current = null
      clearSymmetryPicking(); setHingePicking(null); setWidthPicking(null); setRackPicking(null)
      notify('Selección en vista cancelada. Se conservan las referencias y los campos de la relación.')
    } } : shortcutCancel,
  })
  return <div className="assembly-app assembly-classic-workspace" aria-busy={busy}>
    <input ref={fileInput} type="file" accept=".solidflow" hidden onChange={event => {
      const file = event.target.files?.[0], ticket = fileTicket.current; event.target.value = ''; fileTicket.current = null; if (!file || !ticket) return
      void (async () => {
        if (!mounted.current || !assemblyFileTicketIsCurrent(ticket, serializeAssemblyDocument(current.current), generation.current, currentFileScope.current, currentFileSelection.current)) return
        const { purpose } = ticket
        if (purpose === 'open' && !await mayReplace()) return
        if (operation.current || hasStaging()) return
        operation.current = true; setBusy(true)
        ticket.signature = serializeAssemblyDocument(current.current); ticket.generation = generation.current
        try { if (file.size > MAX_ASSEMBLY_BYTES) throw new Error('El documento supera los 20 MB admitidos.'); const content = await file.text(); if (mounted.current && assemblyFileTicketIsCurrent(ticket, serializeAssemblyDocument(current.current), generation.current, currentFileScope.current, currentFileSelection.current)) await readContent(content, purpose, undefined, ticket.source, ticket.replacement, ticket.scope, ticket.sourceKind, ticket.insertionNavigation) }
        catch (reason) { if (mounted.current && (purpose !== 'update' && purpose !== 'replace-component' || ticket.generation === generation.current)) notify((reason as Error).message, true) } finally { if (purpose !== 'update' && purpose !== 'replace-component' || ticket.generation === generation.current) { operation.current = false; if (mounted.current) { setBusy(false); setCancelable(false) } } }
      })()
    }} />
    <input ref={structuralInput} type="file" accept=".step,.stp" hidden onChange={event=>{
      const file=event.target.files?.[0],pending=structuralRead.current;event.target.value='';structuralRead.current=null;if(!pending)return
      if(!file){pending.resolve(null);return}if(file.size>MAX_STEP_BYTES){pending.reject(Error('El STEP supera los 8 MB admitidos.'));return}
      void file.arrayBuffer().then(data=>pending.resolve({name:file.name,data:new Uint8Array(data)}),pending.reject)
    }} />
    <AssemblyShellHeader menus={menus} name={committed.name} dirty={dirty} fileTitle={path} fileLabel={path ? path.split(/[\\/]/).pop() : 'Sin guardar'}>
      <nav className="assembly-quickbar" aria-label="Archivo e historial del ensamblaje">
        <button title="Nuevo" disabled={newDocumentBlocked || replaceDialog} onClick={newAssembly}><FilePlus2 size={19} aria-hidden="true" /><span className="command-header-icon-label">Nuevo</span></button>
        <button title="Abrir" disabled={editingBlocked || replaceDialog} onClick={() => void open('open')}><FolderOpen size={19} aria-hidden="true" /><span className="command-header-icon-label">Abrir</span></button>
        <button title="Guardar" disabled={documentEditingBlocked || !!draft} onClick={() => void save()}><Save size={19} aria-hidden="true" /><span className="command-header-icon-label">Guardar</span></button>
        <button title="Guardar como" disabled={documentEditingBlocked || !!draft} onClick={() => void save(true)}><SavePen size={19} aria-hidden="true" /><span className="command-header-icon-label">Guardar como</span></button>
        <button title="Deshacer ensamblaje" aria-label="Deshacer ensamblaje" disabled={editingBlocked || !history.current.canUndo} onClick={() => undo()}><Undo2 size={19} aria-hidden="true" /></button>
        <button title="Rehacer ensamblaje" aria-label="Rehacer ensamblaje" disabled={editingBlocked || !history.current.canRedo} onClick={() => undo(true)}><Redo2 size={19} aria-hidden="true" /></button>
      </nav>
    </AssemblyShellHeader>
    <div className="assembly-command-manager">
      <nav className="assembly-toolbar" aria-label="Herramientas de ensamblaje">
        <div className="assembly-command-panel" data-assembly-command-panel="assembly" id="standard-command-panel-assembly" role="tabpanel" aria-labelledby="standard-command-tab-assembly" hidden={ribbonTab !== 'assembly'}>
        <AssemblyCommandGroup label="Componentes">
          <button className="assembly-command-large" disabled={editingBlocked || replaceDialog} onClick={() => void open('insert')}><Plus size={25} /><span>Importar componente</span></button>
          <div className="assembly-command-stack">
            <button aria-label="Insertar STEP estructurado" disabled={editingBlocked || !!draft || !!preview || replaceDialog} onClick={()=>void insertStructural()}><FileInput size={17} />Insertar STEP</button>
            <button aria-label="Insertar origen reutilizable" onClick={() => openManager('components', '[aria-label="Origen del componente"]')}><Plus size={17} />Reutilizar origen</button>
          </div>
        </AssemblyCommandGroup>
        <AssemblyCommandGroup label="Relaciones y movimiento">
          <button className="assembly-command-large" aria-label="Relación de ensamblaje" onClick={beginRelationFromSelection}><Link2 size={25} /><span>Relación</span></button>
          <button aria-label="Mover componente" disabled={editingBlocked || !selected || !!selectedTreeOrigin} onClick={() => openManager('properties', '.assembly-movement h3')}><Move3D size={17} />Mover componente</button>
        </AssemblyCommandGroup>
        <AssemblyCommandGroup label="Documento">
          <div className="assembly-command-stack">
            <button aria-label="Crear revisión del ensamblaje" disabled={editingBlocked || !!draft || replaceDialog} onClick={openRootRevision}><GitBranch size={17} />Crear revisión…</button>
            {onOpenConfigured && <button aria-label="Crear configuraciones del ensamblaje" disabled={editingBlocked || !!draft || !!preview || replaceDialog} onClick={() => {
        if (operation.current || hasStaging() || currentPreview.current || replaceDialog) return
        try { const configured = createAssemblyConfiguredDocument(current.current); invalidate(); onOpenConfigured(configured, path) }
        catch (reason) { notify((reason as Error).message, true) }
      }}><Settings2 size={17} />Configuraciones…</button>}
          </div>
        </AssemblyCommandGroup>
        </div>
        <div className="assembly-command-panel" data-assembly-command-panel="relations" id="standard-command-panel-relations" role="tabpanel" aria-labelledby="standard-command-tab-relations" hidden={ribbonTab !== 'relations'}>
        <AssemblyCommandGroup label="Relaciones">
          <div className="assembly-command-stack">
            <button aria-label="Relaciones del ámbito" onClick={() => openManager('relations', '#assembly-existing-relations')}><List size={17} />Relaciones del ámbito</button>
          </div>
        </AssemblyCommandGroup>
        </div>
        <div className="assembly-command-panel" data-assembly-command-panel="evaluate" id="standard-command-panel-evaluate" role="tabpanel" aria-labelledby="standard-command-tab-evaluate" hidden={ribbonTab !== 'evaluate'}>
        <AssemblyCommandGroup label="Evaluar">
          <button className="assembly-command-large" aria-label="Evaluar ensamblaje" onClick={() => openManager('evaluate', '.assembly-interference h2')}><ScanLine size={25} /><span>Interferencias</span></button>
          <div className="assembly-command-stack">
            <button ref={bomToggle} aria-label="Lista de materiales" aria-pressed={bomOpen} aria-controls="assembly-bom-panel" onClick={() => setBomOpen(value => !value)}><List size={19} />Lista de materiales</button>
            <button aria-label="Exportar geometría del ensamblaje" onClick={() => openManager('evaluate', '#assembly-export-tools')}><ArrowDownToLine size={17} />Exportar</button>
          </div>
        </AssemblyCommandGroup>
        </div>
        <AssemblyCommandGroup label="Confirmación" className="assembly-confirm-commands">
          <button className="assembly-primary assembly-command-large" aria-label="Resolver ensamblaje" disabled={busy || !!rootRevision || !!referenceEditTicket} onClick={() => void solve()}><CircleDot size={25} />Resolver</button>
          <div className="assembly-command-stack">
            <button className="assembly-primary" aria-label="Aplicar ensamblaje" disabled={!canApply} onClick={() => void apply()}><Check size={19} />Aplicar</button>
            <button aria-label="Cancelar vista previa del ensamblaje" disabled={busy ? !cancelable : !preview && !sourceUpdate && !documentUpdate && !replacementReview} onClick={cancelToolbarPreview}><X size={19} />Cancelar</button>
          </div>
        </AssemblyCommandGroup>
      </nav>
      <AssemblyCommandTabs kind="standard" value={ribbonTab} onChange={tab => { abandonInsertionSelection(); setRibbonTab(tab) }} />
    </div>
    <main className="assembly-layout">
      <aside ref={manager} className={`assembly-manager-sidebar assembly-manager-${managerTab}`} aria-label="Gestor del ensamblaje">
        <nav className="assembly-manager-tabs" role="tablist" aria-label="Panel del ensamblaje">
          <button id="assembly-tab-components" role="tab" aria-selected={managerTab === 'components'} aria-controls="assembly-panel-components" onClick={() => openManager('components')} title="Árbol de componentes"><Layers size={17} /><span>Componentes</span></button>
          <button id="assembly-tab-properties" role="tab" aria-selected={managerTab === 'properties'} aria-controls="assembly-panel-properties" disabled={editingBlocked || !!selectedTreeOrigin} onClick={() => openManager('properties', selected ? '[aria-label="Nombre del componente"]' : undefined)} title="Propiedades del componente"><Settings2 size={17} /><span>Propiedades</span></button>
          <button id="assembly-tab-relations" role="tab" aria-selected={managerTab === 'relations'} aria-controls="assembly-panel-relations" onClick={() => openManager('relations', '[aria-label="Tipo de relación"]')} title="Propiedades de relación"><Link2 size={17} /><span>Relaciones</span></button>
          <button id="assembly-tab-evaluate" role="tab" aria-selected={managerTab === 'evaluate'} aria-controls="assembly-panel-evaluate" onClick={() => openManager('evaluate')} title="Evaluación del ensamblaje"><ScanLine size={17} /><span>Evaluar</span></button>
        </nav>
        <div id="assembly-panel-components" role="tabpanel" aria-labelledby="assembly-tab-components" tabIndex={-1} hidden={managerTab !== 'components'} className="assembly-sidebar assembly-manager-panel">

      <h2><Layers size={16} />Componentes</h2>
      <div className="assembly-tree-actions"><button type="button" aria-label="Propiedades del componente seleccionado" disabled={editingBlocked || !selected || !!selectedTreeOrigin}
        onClick={() => openManager('properties', '[aria-label="Nombre del componente"]')}><Settings2 size={15} />Propiedades</button></div>
      <AssemblyComponentTree document={committed} selectedPath={selectedPath} resetKey={treeReset} active={managerTab === 'components'}
        originRows={treeOrigins} selectedOriginKey={selectedTreeOrigin?.treeKey} onOrigin={selectTreeOrigin} originDisabled={treeOriginBlocked}
        onComponentContext={(value, point, element) => openComponentContext(value, point, element, true)} onOriginContext={openOriginContext}
        onSelect={value => { abandonInsertionSelection(); setTreeOriginSelection(null); setNormalSelection(nominateAssemblyNormalUnsupported(JSON.stringify(['component', value]), normalViewContext)); if (fileTicket.current?.purpose === 'update' || linkedTicket.current) generation.current++; setSelectedPath(value) }} disabled={editingBlocked} />
      <section className="assembly-section"><h3>Insertar origen reutilizable</h3><select aria-label="Origen del componente" value={sourceKey} disabled={editingBlocked} onChange={event => setSourceKey(event.target.value)}><option value="">Selecciona un origen</option>{committed.definitions.map(value => <option key={assemblyDefinitionKey(value)} value={assemblyDefinitionKey(value)}>{value.kind === 'part' ? value.document.name : value.name} · {value.revision}</option>)}</select>
        <button disabled={editingBlocked || !sourceKey} onClick={reuseComponent}><Plus size={14} />Insertar otra ocurrencia</button></section>

          <section className="assembly-section assembly-document-tools"><h3>Documentos y ejemplos</h3>
            <button aria-label="Importar STEP estructurado" disabled={editingBlocked || !!draft || !!preview || replaceDialog} onClick={()=>void importStructural()}><FileInput size={16} />Importar STEP estructurado</button>
            <button disabled={editingBlocked || replaceDialog} onClick={exampleAssembly}>Placa y dos pasadores</button>
          </section>
        </div>
        <div id="assembly-panel-properties" role="tabpanel" aria-labelledby="assembly-tab-properties" tabIndex={-1} hidden={managerTab !== 'properties'} className="assembly-sidebar assembly-properties assembly-manager-panel assembly-component-manager">
          <header className="assembly-component-manager-header">
            <div><h2>Propiedades del componente</h2>{selected && <span title={selected.path.join(' / ')}>{selected.occurrence.name}</span>}</div>
            <button type="button" aria-label="Volver al árbol de componentes" onClick={() => openManager('components', selected ? '[data-assembly-tree-path][aria-selected="true"]' : undefined)}><Layers size={16} />Modelo</button>
          </header>
          {!selected && <p className="assembly-component-manager-empty">Selecciona un componente en el árbol para ver sus propiedades.</p>}
      <fieldset className="assembly-component-properties" aria-label="Edición del componente seleccionado" hidden={!!selectedTreeOrigin} disabled={!!selectedTreeOrigin}>
      {selected && <section className="assembly-section" key={JSON.stringify(selected.path)}><h3>Componente seleccionado</h3><button aria-label={selected.definition.kind === 'part' ? 'Actualizar pieza' : 'Actualizar subensamblaje'} disabled={editingBlocked || !!preview} onClick={() => void open('update')}>{selected.definition.kind === 'part' ? 'Actualizar pieza' : 'Actualizar subensamblaje'}</button><label>Nombre<input aria-label="Nombre del componente" defaultValue={selected.occurrence.name} disabled={documentEditingBlocked} onBlur={event => {
        if (event.currentTarget.value !== selected.occurrence.name && !edit({ type: 'rename-occurrence', scope: selected.parent, occurrenceId: selected.occurrence.id, name: event.currentTarget.value }))
          event.currentTarget.value = selected.occurrence.name
      }} /></label>
        {selected.definition.kind === 'part' && <details><summary>Sustituir pieza</summary>
          <label>Alcance<select aria-label="Alcance de sustitución" value={replacementMode} disabled={editingBlocked || !!preview || replaceDialog}
            onChange={event => setReplacementMode(event.currentTarget.value as AssemblyPartReplacementRequest['mode'])}>
            <option value="selected">Sólo esta instancia</option><option value="all">Todos los usos de esta revisión</option>
          </select></label>
          <p>{replacementMode === 'selected' ? 'Las otras instancias conservan su pieza. Si el subensamblaje está compartido, se separará su definición para esta instancia.'
            : 'Cambiarán todos los usos de esta revisión, incluidos los suprimidos y los de definiciones sin instancias activas.'}</p>
          <label>Pieza incorporada<select aria-label="Pieza sustituta incorporada" value={replacementTarget} disabled={editingBlocked || !!preview || replaceDialog}
            onChange={event => setReplacementTarget(event.currentTarget.value)}><option value="">Elige otra pieza incorporada</option>
            {committed.definitions.filter(value => value.kind === 'part' && value.id !== selected.definition.id).map(value => <option key={assemblyDefinitionKey(value)} value={assemblyDefinitionKey(value)}>
              {value.kind === 'part' ? value.document.name : ''} · {value.id} · {value.revision}
            </option>)}
          </select></label>
          <button aria-label="Revisar sustitución incorporada" disabled={editingBlocked || !!preview || replaceDialog || !committed.definitions.some(value => value.kind === 'part' && value.id !== selected.definition.id && assemblyDefinitionKey(value) === replacementTarget)} onClick={() => void replaceWithEmbeddedPart()}>Usar pieza incorporada</button>
          <button aria-label="Elegir pieza sustituta" disabled={editingBlocked || !!preview || replaceDialog} onClick={() => void open('replace-component')}>Elegir pieza desde archivo</button>
          <p>Se conserva la posición declarada y se revisan las relaciones antes de Aplicar.</p>
        </details>}
        {selected.path.length > 1 && <p className="assembly-muted">El nombre, los estados y los controles de posición editan la definición compartida en todas sus instancias. La sustitución tiene su propio alcance.</p>}
        {(['fixed', 'visible', 'suppressed'] as const).map(field => <label className="assembly-check" key={field}><input type="checkbox" checked={selected.occurrence[field]} disabled={documentEditingBlocked} onChange={event => { const common = { scope: selected.parent, occurrenceId: selected.occurrence.id }; if (field === 'fixed') edit({ ...common, type: 'set-occurrence-fixed', fixed: event.target.checked }); else if (field === 'visible') edit({ ...common, type: 'set-occurrence-visible', visible: event.target.checked }); else edit({ ...common, type: 'set-occurrence-suppressed', suppressed: event.target.checked }) }} />{field === 'fixed' ? 'Fijo respecto a su padre' : field === 'visible' ? 'Visible' : 'Suprimido'}</label>)}
        <button className="assembly-danger" disabled={editingBlocked} onClick={() => edit({ type: 'delete-occurrence', scope: selected.parent, occurrenceId: selected.occurrence.id })}><Trash2 size={14} />Eliminar ocurrencia</button></section>}
      {selected && <AssemblyLinkedSourcePanel sourceLink={selected.definition.sourceLink} sourceKind={selected.definition.kind}
        connected={!!linkedBindings.current.get(linkedEpoch.current, selected.definition)}
        available={typeof window !== 'undefined' && !!window.solidflow?.chooseLinkedSource}
        disabled={editingBlocked || !!preview || !!draft || replaceDialog}
        onChoose={() => void loadLinkedSource()} onReload={() => void loadLinkedSource(true)} onDetach={() => void detachLinkedSource()} />}
      {selected && <AssemblyMovementPanel key={JSON.stringify([selected.path, selected.occurrence.definition])} component={{ occurrencePath: [...selected.path], definition: { ...selected.occurrence.definition } }}
        pose={selected.occurrence.pose} resetKey={movementReset} name={selected.occurrence.name} scopeName={movementScope?.kind === 'assembly' ? movementScope.name : 'su ensamblaje contenedor'}
        fixed={selected.occurrence.fixed} suppressed={selected.suppressed} disabled={editingBlocked || !!draft || !!preview || replaceDialog}
        drivenName={rows.find(row => preview?.reply.movement && samePath(row.path, preview.reply.movement.drivenComponent.occurrencePath))?.occurrence.name}
        witness={preview?.reply.movement && samePath(preview.reply.movement.component.occurrencePath, selected.path)
          && assemblyDefinitionKey(preview.reply.movement.component.definition) === assemblyDefinitionKey(selected.occurrence.definition) ? preview.reply.movement : undefined}
        motionWitness={preview?.reply.motion && samePath(preview.reply.motion.component.occurrencePath, selected.path)
          && assemblyDefinitionKey(preview.reply.motion.component.definition) === assemblyDefinitionKey(selected.occurrence.definition) ? preview.reply.motion : undefined}
        onPreview={request => void move(request)} />}
      {selected && <AssemblyTranslationPanel key={JSON.stringify(['translation', selected.path, selected.occurrence.definition])}
        frame={translationEligibility.frame} name={selected.occurrence.name} blockedReason={translationEligibility.reason}
        drivenName={rows.find(row => translationEligibility.frame && samePath(row.path, translationEligibility.frame.drivenComponent.occurrencePath))?.occurrence.name}
        disabled={editingBlocked || !!draft || !!preview || replaceDialog || sceneSignature.current !== serialized || confirmedScene.current?.signature !== serialized}
        witness={preview?.reply.translation && samePath(preview.reply.translation.component.occurrencePath, selected.path)
          && assemblyDefinitionKey(preview.reply.translation.component.definition) === assemblyDefinitionKey(selected.occurrence.definition) ? preview.reply.translation : undefined}
        checks={preview?.reply.translation ? preview.reply.checks : undefined} onPreview={(request, options) => void translate(request, options)} />}

      </fieldset>
        </div>
        <div id="assembly-panel-relations" role="tabpanel" aria-labelledby="assembly-tab-relations" tabIndex={-1} hidden={managerTab !== 'relations'} className="assembly-properties assembly-manager-panel">
                {displayedProjection && <AssemblyDragProjectionPanel projection={displayedProjection.projection} checks={displayedProjection.checks} pending={!!dragSession.current}
        selectedName={rows.find(row => samePath(row.path, displayedProjection.projection.component.occurrencePath))?.occurrence.name ?? 'Componente seleccionado'}
        drivenName={rows.find(row => samePath(row.path, displayedProjection.projection.drivenComponent.occurrencePath))?.occurrence.name ?? 'Grupo raíz'} />}
      {sourceUpdate && <AssemblySourceUpdatePanel review={sourceUpdate.review} document={sourceUpdate.document} repaired={sourceUpdate.repaired} busy={busy} cancelable={cancelable} onRepair={repairSource} onSolve={() => void solve()} onCancel={cancel} />}
      {documentUpdate && <AssemblyDocumentSourceUpdatePanel review={documentUpdate.review} decisions={documentUpdate.decisions} busy={busy} cancelable={cancelable}
        onRepair={repairDocumentSource} onMateDecision={decideDocumentMate} onSolve={() => void solveDocumentUpdate()} onCancel={cancel} />}
      {replacementReview && <AssemblyReplacementPanel review={replacementReview.review} decisions={replacementReview.decisions} busy={busy} cancelable={cancelable}
        onRepair={repairReplacement} onDecisionsChange={changeReplacementDecisions} onSolve={() => void solveReplacement()} onCancel={cancel} />}

                <section className="assembly-section"><h2><Link2 size={16} />Relaciones</h2>
        <div className="assembly-property-confirmation"><button aria-label="Aplicar desde propiedades de relación" title="Aplicar" disabled={!canApply} onClick={() => void apply()}><Check size={19} /></button><button aria-label="Cancelar desde propiedades de relación" title="Cancelar" disabled={busy ? !cancelable : !preview && !sourceUpdate && !documentUpdate && !replacementReview} onClick={cancelToolbarPreview}><X size={19} /></button></div>
        <label>Relación<select aria-label="Tipo de relación" value={mateType} disabled={editingBlocked || replaceDialog || !!ordinaryEdit || !!angleEdit || !!distanceEdit || !!editingHinge || !!editingCircularPath || !!editingLinePath || !!editingProfile || !!editingSymmetry || !!editingWidth || standardPreviewFamily && !!preview || !!editingTangent || !!editingCylinderTangent || !!editingSphereTangent || !!editingLimitDistance || !!editingLimitAngle || !!editingLimitDirectedAngle} onChange={event => chooseMateType(event.target.value as typeof mateType)}><option value="hinge" disabled={referenceEditing}>Bisagra</option><option value="circular-path" disabled={referenceEditing}>Punto sobre trayecto circular</option><option value="line-path" disabled={referenceEditing}>Punto sobre trayecto LINE</option><option value="profile-center" disabled={referenceEditing}>Centro de perfiles acotados</option><option value="symmetry" disabled={referenceEditing}>Simetría · tres referencias</option><option value="width" disabled={referenceEditing}>Anchura centrada · cuatro planos</option><option value="concentric" disabled={referenceEditing}>Concéntrica</option><option value="coincident" disabled={referenceEditing}>Coincidente</option><option value="distance" disabled={referenceEditing}>Distancia firmada</option><option value="limit-distance" disabled={!!preview || referenceEditing}>Distancia con límites</option><option value="angle" disabled={referenceEditing}>Ángulo</option><option value="limit-angle" disabled={!!preview || referenceEditing}>Ángulo principal con límites</option><option value="limit-directed-angle" disabled={!!preview || referenceEditing}>Ángulo dirigido con límites</option><option value="parallel" disabled={!!preview || !!editingTangent || !!editingCylinderTangent || !!editingSphereTangent || !!editingLimitDistance || !!editingLimitAngle || !!editingLimitDirectedAngle}>Paralela</option><option value="perpendicular" disabled={!!preview || !!editingTangent || !!editingCylinderTangent || !!editingSphereTangent || !!editingLimitDistance || !!editingLimitAngle || !!editingLimitDirectedAngle}>Perpendicular</option><option value="tangent" disabled={!!preview || !!editingDirection || !!editingCylinderTangent || !!editingSphereTangent || !!editingLimitDistance || !!editingLimitAngle || !!editingLimitDirectedAngle}>Tangente plano–cilindro</option><option value="skew-cylinder-tangent" disabled={!!preview || !!editingDirection || !!editingTangent || !!editingSphereTangent || !!editingLimitDistance || !!editingLimitAngle || !!editingLimitDirectedAngle}>Tangente entre cilindros no paralelos</option><option value="parallel-cylinder-tangent" disabled={!!preview || !!editingDirection || !!editingTangent || !!editingSphereTangent || !!editingLimitDistance || !!editingLimitAngle || !!editingLimitDirectedAngle}>Tangente entre cilindros con paralelismo</option><option value="plane-sphere-tangent" disabled={!!preview || referenceEditing}>Tangente plano–esfera</option><option value="sphere-sphere-tangent" disabled={!!preview || referenceEditing}>Tangente esfera–esfera</option><option value="cylinder-sphere-tangent" disabled={!!preview || referenceEditing}>Tangente cilindro–esfera</option><option value="gear" disabled={referenceEditing}>Engranaje</option><option value="screw" disabled={referenceEditing}>Tornillo</option><option value="rack-pinion" disabled={referenceEditing}>Cremallera y piñón</option></select></label>
<label>Ámbito<select aria-label="Ámbito de las relaciones" value={JSON.stringify(scopePath)} disabled={editingBlocked || !!preview} onChange={event => { if (operation.current || hasStaging() || currentPreview.current || replaceDialog) return; abandonInsertionSelection(); creationReferenceDraft.current = null; preselectionPick.current = null; generation.current++; setOrdinaryEdit(null); setReleaseRotation(false); setAngleEdit(null); setDistanceEdit(null); setScopePath(JSON.parse(event.target.value) as string[]); setReferences([null, null]); setWidthReferences([null,null,null,null]); setEditingWidthId(null); setTangentReferences([null, null]); setCylinderReferences([null, null]); setSphereReferences([null, null]); setLimitReferences([null, null]); setLimitAngleReferences([null, null]); setLimitDirectedSelection(['', '', '']); setCylinderLarger(''); setSphereLarger(''); setSelectedFaceMeshes([]); setComponentLock(['', '']); setEditingGearId(null); setEditingScrewId(null); setEditingRackId(null); setDirectionEdit(null); setEditingTangentId(null); setEditingCylinderTangentId(null); setEditingSphereTangentId(null); setEditingLimitDistanceId(null); setEditingLimitAngleId(null); setEditingLimitDirectedAngleId(null); setRackKeys(['', '']); setRackPicking(null); setPickingLinearEdges(false); setEdgeChoice('') }}><option value="[]">{committed.name} · raíz</option>{rows.filter(row => row.definition.kind === 'assembly' && !row.suppressed).map(row => <option key={JSON.stringify(row.path)} value={JSON.stringify(row.path)}>{row.path.join(' / ')} · definición compartida</option>)}</select></label>
        {hasGenericReferences && <><div className="assembly-endpoints">{relationReferences.map((reference, index) => <div className="assembly-reference-slot" key={index}>
          <button aria-label={`Referencia ${index + 1} de la relación`} disabled={referenceBlocked} className={endpointSlot === index ? 'active' : ''} onClick={() => {
            if (referenceBlocked || operation.current || hasStaging() || currentPreview.current || !referenceEditorIsCurrent()) return
            stopOriginPicking(); setDragMode('off'); setPickingLinearEdges(false); setEndpointSlot(index as 0 | 1); setPickingFaces(true)
          }}><strong>Referencia {index + 1}</strong><span title={reference ? JSON.stringify(reference) : undefined}>{assemblyReferenceCardLabel(reference, rows, scopePath)}</span></button>
          {editedReferences && <button title="Quitar referencia" aria-label={`Quitar referencia ${index + 1} de la relación`} disabled={referenceBlocked || !reference} onClick={() => {
            if (referenceBlocked || operation.current || hasStaging() || currentPreview.current || !referenceEditorIsCurrent()) return
            stopOriginPicking(); setRelationReference(index as 0 | 1, null); setEndpointSlot(index as 0 | 1); setSelectedFaceMeshes([]); setPickingFaces(false); setPickingLinearEdges(false)
            notify('Selecciona una nueva referencia antes de verificar los cambios.')
          }}><X size={14} aria-hidden="true" /></button>}
        </div>)}</div>
        {!editingBlocked && !replaceDialog && <p className="assembly-muted" data-assembly-relation-guidance="">{canApply ? 'Vista previa verificada. Revisa el resultado y pulsa Aplicar.' : preview ? 'Revisa el resultado de la vista previa; Aplicar requiere una verificación vigente.' : relationSelectionGuidance()}</p>}
        </>}
        <details id="assembly-relation-origins" className="assembly-origin-disclosure" open={originControlsOpen} onToggle={event => setOriginControlsOpen(event.currentTarget.open)}>
          <summary id="assembly-origin-summary" aria-label="Mostrar referencias de origen" aria-controls="assembly-origin-controls">
            Referencias de origen{activeOriginPicking && <span role="status">Referencia {endpointSlot + 1} · selección activa</span>}
          </summary>
          <div id="assembly-origin-controls" className="assembly-origin-tools" role="group" aria-label="Orígenes visibles del ensamblaje">
            <label><input type="checkbox" checked={showOriginAxes} onChange={event => { stopOriginPicking(); setShowOriginAxes(event.target.checked) }} />Mostrar ejes</label>
            <label><input type="checkbox" checked={showOriginPlanes} onChange={event => { stopOriginPicking(); setShowOriginPlanes(event.target.checked) }} />Mostrar planos</label>
            <select aria-label="Orígenes visibles de" value={originOwner} onChange={event => { stopOriginPicking(); setOriginOwner(event.target.value as typeof originOwner) }}>
              <option value="scope">Ámbito actual</option><option value="selected">Componente seleccionado</option><option value="both">Ambos</option>
            </select>
            <button aria-label="Seleccionar orígenes" aria-pressed={activeOriginPicking} disabled={originBlocked} onClick={beginOriginPick}>
              {activeOriginPicking ? 'Cancelar selección de origen' : 'Seleccionar origen'}
            </button>
            {activeOriginPicking && <span role="status">Referencia {endpointSlot + 1}: selecciona {originKinds.axes && originKinds.planes ? 'un eje o plano' : originKinds.axes ? 'un eje' : 'un plano'} visible</span>}
            {originOwner !== 'scope' && !originDisplays.some(value => value.reference.component) && (showOriginAxes || showOriginPlanes) && <span>Selecciona un componente visible dentro del ámbito.</span>}
          </div>
        </details>
        {hasGenericReferences && <>
        <label>Cara del ensamblaje<select aria-label="Cara de referencia" value={faceChoice} disabled={referenceBlocked} onChange={event => setFaceChoice(event.target.value)}><option value="">Selecciona una cara actual</option>{faceChoices.map(face => <option key={assemblyFaceKey(face)} value={assemblyFaceKey(face)}>{face.selection.component.occurrencePath.join(' / ')} · {face.sphereSurface ? `Superficie esférica R${face.sphereSurface.radius} · centro (${face.sphereSurface.center.map(value => Number(value.toPrecision(5))).join(', ')})` : <>{face.support?.kind === 'cylinder' ? `${isTangent || isCylinderTangent || isSphereTangent ? 'Superficie cilíndrica' : 'Cilindro'} R${face.support.radius}` : 'Plano'} · ({face.support?.point.map(value => Number(value.toPrecision(5))).join(', ')})</>}</option>)}</select></label>
        <button disabled={referenceBlocked || !faceChoices.some(face => assemblyFaceKey(face) === faceChoice)} onClick={() => { const face = faceChoices.find(value => assemblyFaceKey(value) === faceChoice); if (face) pickFace(face) }}>Usar cara en referencia {endpointSlot + 1}</button>
        {(isDirection || isLimitAngle || mateType === 'angle') && <><label>Arista lineal del ensamblaje<select aria-label="Arista de referencia" value={edgeChoice} disabled={referenceBlocked || !!editingLimitAngle} onChange={event => setEdgeChoice(event.target.value)}><option value="">Selecciona una arista lineal actual</option>{edgeChoices.map(edge => <option key={assemblyEdgeKey(edge)} value={assemblyEdgeKey(edge)}>{edge.selection.component.occurrencePath.join(' / ')} · Arista lineal · {edge.selection.body?.bodyId ?? 'agregado'} · {edge.selection.edge.sourceFeatureId} · ({edge.support?.point.map(value => Number(value.toPrecision(5))).join(', ')})</option>)}</select></label><button disabled={referenceBlocked || !!editingLimitAngle || !edgeChoices.some(edge => assemblyEdgeKey(edge) === edgeChoice)} onClick={() => { const edge = edgeChoices.find(value => assemblyEdgeKey(value) === edgeChoice); if (edge) pickDirectionEdge(edge) }}>Usar arista en referencia {endpointSlot + 1}</button></>}
        {(!standardPreviewFamily || !!ordinaryEdit || !!distanceEdit || !!angleEdit) && <label>Nombre<input aria-label="Nombre de la relación" value={mateName} disabled={editingBlocked || !!preview} onChange={event => setMateName(event.target.value)} /></label>}</>}

        {isDirection && <AssemblyDirectionMatePanel type={mateType} first={directionReferences[0]} second={directionReferences[1]} name={mateName} alignment={alignment}
          editing={!!directionEdit} disabled={editingBlocked || !!preview || replaceDialog || !!directionEdit && !editingDirection} onName={setMateName} onAlignment={setAlignment}
          onPreview={directionEdit ? editDirection : addMate} onCancelEdit={endDirectionEdit} />}
        {isSymmetry && <div className="assembly-symmetry-panel">
          <p>Selecciona dos entidades de la misma familia y un plano de simetría.</p>
          <label>Familia de simetría<select aria-label="Familia de simetría" value={symmetryFamily} disabled={symmetryBlocked} onChange={event=>{if(!symmetryMayEdit())return;clearSymmetryPicking();setSymmetryFamily(event.target.value as SymmetryUiFamily);setSymmetryReferences([null,null,null]);setSymmetryAlignment('')}}>{([['point','Puntos'],['line','Rectas'],['plane','Planos'],['sphere','Esferas'],['cylinder','Cilindros']] as const).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
          {([0,1,2] as const).map(index=>{
            const choices=index===2?widthChoices:symmetryChoices,ref=symmetryReferences[index],found=choices.find(c=>sameSymmetryReference(c.reference,ref)),value=found?.key??(ref?'retained':'')
            return <div key={index}><label>{SYMMETRY_ROLE_LABELS[index]}<select aria-label={SYMMETRY_ROLE_LABELS[index]} disabled={symmetryBlocked} value={value} onChange={event=>{if(!symmetryMayEdit())return;clearSymmetryPicking();const choice=choices.find(c=>c.key===event.target.value);setSymmetryReferences(values=>{const next:SymmetryUiReferences=[...values];next[index]=choice?structuredClone(choice.reference):null;return next})}}><option value="">Selecciona un soporte actual</option>{ref&&!found&&<option value="retained">Referencia guardada · pendiente de verificación</option>}{choices.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
              {index < 2 && symmetryFamily === 'line' ? <>
                <button aria-label={'Seleccionar ' + SYMMETRY_ROLE_LABELS[index] + ' como arista lineal en el modelo'} aria-pressed={activeSymmetryPick?.slot === index && activeSymmetryPick.producer === 'line-edge'} disabled={symmetryPickingBlocked} onClick={() => toggleSymmetryPicking(index as SymmetryPickSlot, 'line-edge')}>Seleccionar arista lineal</button>
                <button aria-label={'Seleccionar ' + SYMMETRY_ROLE_LABELS[index] + ' como eje cilíndrico en el modelo'} aria-pressed={activeSymmetryPick?.slot === index && activeSymmetryPick.producer === 'cylinder-axis'} disabled={symmetryPickingBlocked} onClick={() => toggleSymmetryPicking(index as SymmetryPickSlot, 'cylinder-axis')}>Seleccionar eje cilíndrico</button>
              </> : <button aria-label={'Seleccionar ' + SYMMETRY_ROLE_LABELS[index] + ' en el modelo'} aria-pressed={activeSymmetryPick?.slot === index} disabled={symmetryPickingBlocked} onClick={() => toggleSymmetryPicking(index as SymmetryPickSlot)}>Seleccionar en el modelo</button>}
            </div>
          })}
          {symmetryFamily!=='point'&&symmetryFamily!=='sphere'&&<label>Orientación de simetría<select aria-label="Orientación de simetría" disabled={symmetryBlocked} value={symmetryAlignment} onChange={event=>{if(symmetryMayEdit()){clearSymmetryPicking();setSymmetryAlignment(event.target.value as typeof symmetryAlignment)}}}><option value="">Elige orientación reflejada</option><option value="aligned">Alineada</option><option value="opposed">Opuesta</option></select></label>}
          {activeSymmetryPick && <button aria-label="Cancelar selección de simetría" disabled={symmetryPickingBlocked} onClick={clearSymmetryPicking}>Cancelar selección</button>}
          <label>Nombre<input aria-label="Nombre de simetría" disabled={symmetryBlocked} value={mateName} onChange={event=>{if(symmetryMayEdit()){clearSymmetryPicking();setMateName(event.target.value)}}} /></label>
          <button disabled={symmetryBlocked||symmetryReferences.some(r=>!r)||!mateName.trim()||(symmetryFamily!=='point'&&symmetryFamily!=='sphere'&&!symmetryAlignment)} onClick={previewSymmetry}>{editingSymmetry?'Vista previa de la edición de simetría':'Vista previa de simetría'}</button>
          {editingSymmetry&&<button disabled={symmetryBlocked} onClick={()=>{if(!symmetryMayEdit())return;clearSymmetryPicking();setEditingSymmetryId(null);setSymmetryReferences([null,null,null]);setSymmetryAlignment('')}}>Cancelar edición de simetría</button>}
        </div>}
        {isCircularPath&&<AssemblyCircularPathMatePanel key={JSON.stringify([serialized,scopePath,editingCircularPathId,circularPathReset])} mate={editingCircularPath} points={linePathChoices.points} paths={circularPathChoices} guides={linePathChoices.guides} disabled={symmetryBlocked} onPreview={previewCircularPath} onCancelEdit={()=>{if(symmetryMayEdit()){setEditingCircularPathId(null);setCircularPathReset(v=>v+1)}}}/>}
        {isLinePath && <AssemblyLinePathMatePanel key={JSON.stringify([serialized,scopePath,editingLinePathId,linePathReset])} mate={editingLinePath} points={linePathChoices.points} edges={linePathChoices.edges} guides={linePathChoices.guides} disabled={symmetryBlocked} onPreview={previewLinePath} onCancelEdit={() => { if (symmetryMayEdit()) { setEditingLinePathId(null); setLinePathReset(value => value + 1) } }} />}
        {isHinge && <AssemblyHingeMatePanel references={hingeReferences} axes={hingeAxes} planes={hingePlanes} name={mateName} alignment={hingeAlignment} editing={!!editingHinge}
          limited={hingeLimited} start={hingeStart} sweep={hingeSweep}
          disabled={symmetryBlocked || dragActive || !!dragSession.current} picking={activeHingePick}
          onLimited={value=>{if(!hingeMayEdit(hingeTicket))return;hingeContext.current=null;clearHingePicking();setHingeLimited(value);setHingeStart('');setHingeSweep('');const r=hingeReferencesRef.current;setHingeReferences(value?[r[0],r[1],r[2],r[3],null,null]:[r[0],r[1],r[2],r[3]])}}
          onStart={value=>{if(!hingeMayEdit(hingeTicket))return;hingeContext.current=null;clearHingePicking();setHingeStart(value)}} onSweep={value=>{if(!hingeMayEdit(hingeTicket))return;hingeContext.current=null;clearHingePicking();setHingeSweep(value)}}
          onReference={(slot,ref)=>{if(!hingeMayEdit(hingeTicket)||slot>=hingeReferencesRef.current.length)return; const choices=slot<2?hingeAxes:slot<4?hingePlanes:hingeAngularPlanes;if(ref&&choices.filter(c=>sameHingeReference(c.reference,ref)).length!==1)return;hingeContext.current=null;hingeEpoch.current.value++;clearHingePicking();const refs:HingeUiReferences=[...hingeReferencesRef.current];refs[slot]=ref?structuredClone(ref):null;setHingeReferences(refs)}}
          onName={value=>{if(hingeMayEdit(hingeTicket)){hingeContext.current=null;clearHingePicking();setMateName(value)}}} onAlignment={value=>{if(hingeMayEdit(hingeTicket)){hingeContext.current=null;clearHingePicking();setHingeAlignment(value)}}}
          onPick={toggleHingePicking} onPreview={()=>previewHinge(hingeTicket)}
          onCancelEdit={()=>{if(!hingeMayEdit(hingeTicket))return;hingeContext.current=null;clearHingePicking();setEditingHingeId(null);setHingeReferences([null,null,null,null]);resetHingeStops();setHingeAlignment('')}} />}
        {isProfile && <AssemblyProfileCenterMatePanel key={JSON.stringify([serialized,scopePath,editingProfileId,profileReset])} mate={editingProfile} faces={profileFaces} edges={profileEdges} disabled={symmetryBlocked} onPreview={previewProfile} onCancelEdit={() => { if (symmetryMayEdit()) { setEditingProfileId(null); setProfileReset(value => value + 1) } }} />}
        {isWidth && <AssemblyWidthMatePanel references={widthReferences} choices={widthChoices} name={mateName} widthBranch={widthBranch} tabBranch={tabBranch} alignment={widthAlignment} editing={!!editingWidth} disabled={widthPickingBlocked} pickingIndex={widthPickingSlot} onPick={toggleWidthPicking}
          onReference={(index,reference)=>{if(operation.current||hasStaging()||currentPreview.current||draft||replaceDialog)return;setWidthPicking(null);setPickingFaces(false);setWidthReferences(values=>{const next:WidthUiReferences=[...values];next[index]=reference;return next})}}
          onName={value=>{if(!operation.current&&!hasStaging()&&!currentPreview.current&&!replaceDialog)setMateName(value)}} onWidthBranch={value=>{if(!operation.current&&!hasStaging()&&!currentPreview.current&&!replaceDialog)setWidthBranch(value)}} onTabBranch={value=>{if(!operation.current&&!hasStaging()&&!currentPreview.current&&!replaceDialog)setTabBranch(value)}} onAlignment={value=>{if(!operation.current&&!hasStaging()&&!currentPreview.current&&!replaceDialog)setWidthAlignment(value)}} onPreview={previewWidth}
          onCancelEdit={()=>{if(operation.current||hasStaging()||currentPreview.current||replaceDialog)return;setWidthPicking(null);setPickingFaces(false);setEditingWidthId(null);setWidthReferences([null,null,null,null]);setSelectedFaceMeshes([])}} />}
        {isTangent && <AssemblyTangentMatePanel first={tangentEndpoints[0]} second={tangentEndpoints[1]} name={mateName} side={tangentSide}
          editing={!!editingTangent} disabled={editingBlocked || !!preview || replaceDialog}
          onName={value => { if (!operation.current && !hasStaging() && !currentPreview.current && !replaceDialog) setMateName(value) }}
          onSide={value => { if (!operation.current && !hasStaging() && !currentPreview.current && !replaceDialog) setTangentSide(value) }}
          onPreview={editingTangent ? editTangent : addMate} onCancelEdit={() => { if (operation.current || hasStaging() || currentPreview.current || replaceDialog) return; setEditingTangentId(null); setTangentReferences([null, null]); setSelectedFaceMeshes([]) }} />}
        {isCylinderTangent && <AssemblyCylinderTangentMatePanel type={mateType} first={cylinderEndpoints[0]} second={cylinderEndpoints[1]} firstLabel={cylinderFaceLabel(cylinderEndpoints[0])} secondLabel={cylinderFaceLabel(cylinderEndpoints[1])} name={mateName} branchKind={cylinderBranchKind} larger={cylinderLarger}
          editing={!!editingCylinderTangent} disabled={editingBlocked || !!preview || replaceDialog}
          onName={value => { if (!operation.current && !hasStaging() && !currentPreview.current && !replaceDialog) setMateName(value) }}
          onBranch={value => { if (!operation.current && !hasStaging() && !currentPreview.current && !replaceDialog) { setCylinderBranchKind(value); setCylinderLarger('') } }}
          onLarger={value => { if (!operation.current && !hasStaging() && !currentPreview.current && !replaceDialog) setCylinderLarger(value) }}
          onPreview={editingCylinderTangent ? editCylinderTangent : addMate} onCancelEdit={() => { if (operation.current || hasStaging() || currentPreview.current || replaceDialog) return; setEditingCylinderTangentId(null); setEditingSphereTangentId(null); setEditingLimitDistanceId(null); setEditingLimitAngleId(null); setEditingLimitDirectedAngleId(null); setCylinderReferences([null, null]); setSphereReferences([null, null]); setLimitReferences([null, null]); setLimitAngleReferences([null, null]); setLimitDirectedSelection(['', '', '']); setCylinderLarger(''); setSphereLarger(''); setSelectedFaceMeshes([]) }} />}
        {isSphereTangent && <AssemblySphereTangentMatePanel type={mateType} first={sphereEndpoints[0]} second={sphereEndpoints[1]} firstLabel={sphereFaceLabel(sphereEndpoints[0])} secondLabel={sphereFaceLabel(sphereEndpoints[1])} name={mateName} side={sphereSide} branchKind={sphereBranchKind} larger={sphereLarger}
          editing={!!editingSphereTangent} disabled={editingBlocked || !!preview || replaceDialog}
          onName={value => { if (!operation.current && !hasStaging() && !currentPreview.current && !replaceDialog) setMateName(value) }}
          onSide={value => { if (!operation.current && !hasStaging() && !currentPreview.current && !replaceDialog) setSphereSide(value) }}
          onBranch={value => { if (!operation.current && !hasStaging() && !currentPreview.current && !replaceDialog) { setSphereBranchKind(value); setSphereLarger('') } }}
          onLarger={value => { if (!operation.current && !hasStaging() && !currentPreview.current && !replaceDialog) setSphereLarger(value) }}
          onPreview={editingSphereTangent ? editSphereTangent : addMate} onCancelEdit={() => { if (operation.current || hasStaging() || currentPreview.current || replaceDialog) return; setEditingSphereTangentId(null); setEditingLimitDistanceId(null); setEditingLimitAngleId(null); setEditingLimitDirectedAngleId(null); setSphereReferences([null, null]); setLimitReferences([null, null]); setLimitAngleReferences([null, null]); setLimitDirectedSelection(['', '', '']); setSphereLarger(''); setSelectedFaceMeshes([]) }} />}
        {isLimitDistance && <AssemblyLimitDistanceMatePanel first={limitEndpoints[0]} second={limitEndpoints[1]} name={mateName} alignment={alignment} minimum={limitMinimum} maximum={limitMaximum}
          editing={!!editingLimitDistance} disabled={editingBlocked || !!preview || replaceDialog}
          onName={value => { if (!operation.current && !hasStaging() && !currentPreview.current && !replaceDialog) setMateName(value) }}
          onAlignment={value => { if (!operation.current && !hasStaging() && !currentPreview.current && !replaceDialog) setAlignment(value) }}
          onMinimum={value => { if (!operation.current && !hasStaging() && !currentPreview.current && !replaceDialog) setLimitMinimum(value) }}
          onMaximum={value => { if (!operation.current && !hasStaging() && !currentPreview.current && !replaceDialog) setLimitMaximum(value) }}
          onPreview={editingLimitDistance ? editLimitDistance : addMate} onCancelEdit={() => { if (operation.current || hasStaging() || currentPreview.current || replaceDialog) return; setEditingLimitDistanceId(null); setEditingLimitAngleId(null); setEditingLimitDirectedAngleId(null); setLimitReferences([null, null]); setLimitAngleReferences([null, null]); setLimitDirectedSelection(['', '', '']); setSelectedFaceMeshes([]) }} />}
        {isLimitDirectedAngle && <AssemblyLimitDirectedAngleMatePanel choices={directedChoices} selection={limitDirectedSelection} scopePath={scopePath}
          name={mateName} start={limitDirectedStart} sweep={limitDirectedSweep} editing={!!editingLimitDirectedAngle} disabled={editingBlocked || !!preview || replaceDialog}
          onName={value => { if (!operation.current && !hasStaging() && !currentPreview.current && !replaceDialog) setMateName(value) }}
          onStart={value => { if (!operation.current && !hasStaging() && !currentPreview.current && !replaceDialog) setLimitDirectedStart(value) }}
          onSweep={value => { if (!operation.current && !hasStaging() && !currentPreview.current && !replaceDialog) setLimitDirectedSweep(value) }}
          onSelect={(slot, key) => { if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || key && !directedChoices.some(choice => choice.key === key)) return
            setLimitDirectedSelection(values => { const next: AssemblyDirectedAngleSelection = [...values]; next[slot] = key; return next }) }}
          onPreview={previewLimitDirectedAngle} onCancelEdit={() => { if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog) return; setEditingLimitDirectedAngleId(null); setLimitDirectedSelection(['', '', '']) }} />}
        {isLimitAngle && <AssemblyLimitAngleMatePanel first={limitAngleEndpoints[0]} second={limitAngleEndpoints[1]} name={mateName} minimum={limitAngleMinimum} maximum={limitAngleMaximum}
          editing={!!editingLimitAngle} disabled={editingBlocked || !!preview || replaceDialog} onName={setMateName} onMinimum={setLimitAngleMinimum} onMaximum={setLimitAngleMaximum}
          onPreview={editingLimitAngle ? editLimitAngle : addMate} onCancelEdit={() => { if (operation.current || hasStaging() || currentPreview.current || replaceDialog) return; setEditingLimitAngleId(null); setEditingLimitDirectedAngleId(null); setLimitAngleReferences([null, null]); setLimitDirectedSelection(['', '', '']); setSelectedFaceMeshes([]) }} />}
        {mateType === 'gear' && <AssemblyGearPanel key={JSON.stringify([scopeReference, editingGear?.id ?? 'new'])} mate={editingGear} axes={gearAxes} carriers={gearCarriers} scopeName={scope.name}
          disabled={editingBlocked || replaceDialog || !!editingGear && !!preview} canCapture={canApply && !sourceUpdate && !documentUpdate && !replacementReview && !replaceDialog}
          onCapture={request => void captureGear(request)} onEdit={editGear} onCancelEdit={() => setEditingGearId(null)} />}
        {mateType === 'screw' && <AssemblyScrewPanel key={JSON.stringify([scopeReference, editingScrew?.id ?? 'new'])} mate={editingScrew} axes={gearAxes}
          disabled={editingBlocked || replaceDialog || !!editingScrew && !!preview} canCapture={canApply && !sourceUpdate && !documentUpdate && !replacementReview && !replaceDialog}
          onCapture={request => void captureScrew(request)} onEdit={editScrew} onCancelEdit={() => setEditingScrewId(null)} />}
        {mateType === 'rack-pinion' && <AssemblyRackPinionPanel key={JSON.stringify([scopeReference, editingRack?.id ?? 'new'])} mate={editingRack} pinions={rackPinions} racks={rackChoices} firstKey={rackKeys[0]} secondKey={rackKeys[1]}
          nativeRadius={rackNativeRadius}
          disabled={editingBlocked || replaceDialog || !!editingRack && !!preview} canCapture={canApply && !sourceUpdate && !documentUpdate && !replacementReview && !replaceDialog}
          onChoice={rackChoice} onPick={beginRackPick} onCapture={request => void captureRack(request)} onEdit={editRack} onCancelEdit={() => setEditingRackId(null)} />}
        {mateType !== 'angle' && mateType !== 'gear' && mateType !== 'screw' && mateType !== 'rack-pinion' && (!standardPreviewFamily || !!ordinaryEdit || !!distanceEdit) && <label>Orientación<select aria-label="Orientación de la relación" value={alignment} disabled={editingBlocked || !!preview} onChange={event => setAlignment(event.target.value as typeof alignment)}><option value="aligned">Alineada</option><option value="opposed">Opuesta</option></select></label>}
        {(mateType === 'distance' || mateType === 'angle') && <label>{mateType === 'distance' ? 'Distancia · mm' : 'Ángulo · grados'}<input aria-label={mateType === 'distance' ? 'Distancia firmada' : 'Ángulo de relación'} type="number" value={mateValue} disabled={editingBlocked || !!preview} onChange={event => setMateValue(event.target.value)} /></label>}
        {ordinaryEdit && <div role="region" aria-label={mateType === 'concentric' ? 'Edición de concentricidad' : 'Edición de coincidencia'}>
          <p>Selecciona una referencia para sustituirla. Verifica los cambios antes de Aplicar; cancelar la vista previa conserva el borrador.</p>
          {editingOrdinary?.type === 'concentric' && editingOrdinary.rotationLock && <>
            <label className="assembly-check"><input type="checkbox" aria-label="Desbloquear giro" checked={releaseRotation} disabled={editingBlocked || !!preview || replaceDialog} onChange={event => setReleaseRotation(event.target.checked)} />Desbloquear giro</label>
            <p>El bloqueo se conserva entre los mismos componentes. Si cambias uno de ellos, elige Desbloquear giro y vuelve a verificar la relación.</p>
          </>}
          <button className="assembly-primary" aria-label="Vista previa de la relación editada"
            disabled={editingBlocked || !!preview || replaceDialog || !editingOrdinary || !editedReferences || !assemblyOrdinaryMateUiEdit(editingOrdinary, { name: mateName, alignment, releaseRotation, references: editedReferences })}
            onClick={editOrdinary}>Vista previa de los cambios</button>
          <button aria-label="Terminar edición de relación" disabled={editingBlocked || !!preview || replaceDialog} onClick={endOrdinaryEdit}>Terminar edición</button>
        </div>}
        {distanceEdit && <><p>Selecciona una referencia para sustituirla. Verifica los cambios antes de Aplicar; cancelar la vista previa conserva el borrador.</p>
          <button className="assembly-primary" aria-label="Vista previa de la distancia editada"
            disabled={editingBlocked || !!preview || replaceDialog || !editingDistance || !editedReferences?.every(reference => reference && plane(reference)) || !mateName.trim() || !mateValue.trim() || !Number.isFinite(Number(mateValue))}
            onClick={editDistance}>Vista previa de los cambios</button>
          <button aria-label="Terminar edición de distancia" disabled={editingBlocked || !!preview || replaceDialog} onClick={endDistanceEdit}>Terminar edición</button></>}
        {angleEdit && <><p>Selecciona una referencia para sustituirla. Verifica los cambios antes de Aplicar; cancelar la vista previa conserva el borrador.</p>
          <button className="assembly-primary" aria-label="Vista previa del ángulo editado"
            disabled={editingBlocked || !!preview || replaceDialog || !editingAngle || !editedReferences?.every(Boolean) || !mateName.trim() || !mateValue.trim() || !Number.isFinite(Number(mateValue)) || Number(mateValue) < 0 || Number(mateValue) > 180}
            onClick={editAngle}>Vista previa de los cambios</button>
          <button aria-label="Terminar edición de ángulo" disabled={editingBlocked || !!preview || replaceDialog} onClick={endAngleEdit}>Terminar edición</button></>}
        {mateType !== 'gear' && mateType !== 'screw' && mateType !== 'rack-pinion' && <>{!standardPreviewFamily && <button className="assembly-primary" disabled={editingBlocked || !!preview || !references[0] || !references[1]} onClick={addMate}>Vista previa de la nueva relación</button>}
        {['concentric', 'parallel', 'perpendicular', 'angle', 'limit-angle'].includes(mateType) && <details><summary>Usar un eje de origen</summary><select aria-label="Componente del eje de origen" value={datumComponent} disabled={referenceBlocked} onChange={event => setDatumComponent(event.target.value)}><option value="scope">{scopePath.length ? 'Ámbito actual' : 'Raíz'}</option>{availableComponents.map(row => <option key={JSON.stringify(row.path)} value={JSON.stringify(row.path)}>{row.path.join(' / ')}</option>)}</select><select aria-label="Eje de origen" value={datumAxis} disabled={referenceBlocked} onChange={event => setDatumAxis(event.target.value as typeof datumAxis)}>{(['X', 'Y', 'Z'] as const).map(value => <option key={value}>{value}</option>)}</select><button disabled={referenceBlocked} onClick={useOriginAxis}>Usar eje en referencia {endpointSlot + 1}</button></details>}
        {(!referenceEditTicket || mateType !== 'concentric') && !isHinge && !isProfile && !isSymmetry && !isWidth && !isLimitDirectedAngle && !isCylinderTangent && (!isSphereTangent || mateType === 'plane-sphere-tangent') && <details><summary>Usar un plano principal</summary><select aria-label="Componente del plano" value={datumComponent} disabled={referenceBlocked} onChange={event => setDatumComponent(event.target.value)}><option value="scope">Ámbito actual</option>{availableComponents.map(row => <option key={JSON.stringify(row.path)} value={JSON.stringify(row.path)}>{row.path.join(' / ')}</option>)}</select><select aria-label="Plano principal" value={datumPlane} disabled={referenceBlocked} onChange={event => setDatumPlane(event.target.value as Plane)}>{(['XY', 'XZ', 'YZ'] as const).map(value => <option key={value}>{value}</option>)}</select><button disabled={referenceBlocked} onClick={datum}>Usar en referencia {endpointSlot + 1}</button></details>}</>}
      </section>
      <section id="assembly-existing-relations" tabIndex={-1} className="assembly-section"><h3>Relaciones del ámbito</h3>{scope.mates.map(mate => <div className="assembly-mate-row" key={mate.id}><label className="assembly-check"><input type="checkbox" aria-label={`Activar ${mate.name}`} checked={!(solveSuppression(mate.type) ? gearScope.mates.find(value => value.id === mate.id)?.suppressed ?? mate.suppressed : mate.suppressed)} disabled={editingBlocked || !!referenceEditTicket || solveSuppression(mate.type) && (!!preview || replaceDialog)} onChange={event => { if (operation.current || hasStaging() || savedReferenceEditIsActive() || solveSuppression(mate.type) && (currentPreview.current || replaceDialog)) return; const { id: _id, ...value } = mate; const update: AssemblyEdit = { type: 'update-mate', scope: scopeReference, mateId: mate.id, mate: { ...value, suppressed: !event.target.checked } }; if (solveSuppression(mate.type)) { try { void solve(applyAssemblyEdit(current.current, update)) } catch (reason) { notify((reason as Error).message, true) } } else edit(update) }} /><span>{mate.name}<small>{mate.type==='hinge'?(mate.stops?'Bisagra · giro limitado · seis referencias · inicio '+mate.stops.arc.start+'° · recorrido '+mate.stops.arc.sweep+'°':'Bisagra · giro libre · cuatro referencias'):mate.type==='circular-path'?'Punto sobre arco · '+mate.position.mode+' · '+(mate.position.mode==='free'?mate.position.domain:mate.position.distanceMm+' mm'):mate.type === 'line-path' ? 'Punto sobre LINE · ' + mate.position.mode + ' · ' + (mate.orientation.pitchYaw === 'free' ? 'orientación libre' : 'eje ' + mate.orientation.pitchYaw.axis.toUpperCase() + (mate.orientation.pitchYaw.reverse ? ' opuesto' : ' directo')) : mate.type === 'profile-center' ? 'Centro de perfiles · ' + (mate.orientation.mode === 'rectangle' ? 'ejes materiales · ' + mate.orientation.quarterTurns + ' cuartos' : 'círculos · giro libre') : mate.type === 'width' ? 'Anchura centrada · cuatro planos · ' + (mate.alignment === 'aligned' ? 'bisectrices alineadas' : 'bisectrices opuestas') : mate.type === 'gear' ? `Engranaje · ${mate.ratio.numerator}:${mate.ratio.denominator} · ${mate.direction === 'opposed' ? 'opuesto' : 'mismo sentido'}` : mate.type === 'screw' ? `Tornillo · ${mate.lead} mm/vuelta · ${mate.reverse ? 'avance invertido' : 'avance directo'}` : mate.type === 'rack-pinion' ? `Cremallera y piñón · ${mate.conversion.override === null ? 'diámetro nativo' : mate.conversion.override + (mate.conversion.mode === 'diameter' ? ' mm de diámetro' : ' mm/vuelta')} · ${mate.reverse ? 'avance invertido' : 'avance directo'}` : mate.type === 'plane-sphere-tangent' ? 'Tangente plano–esfera · lado ' + (mate.side === 'positive' ? 'positivo' : 'negativo') : mate.type === 'sphere-sphere-tangent' || mate.type === 'cylinder-sphere-tangent' ? assemblySphereTangentFamilyLabel(mate.type) + ' · ' + (mate.branch.kind === 'external' ? 'externa' : 'interna · mayor: referencia ' + (mate.branch.larger === 'first' ? '1' : '2')) : mate.type === 'limit-directed-angle' ? 'Ángulo dirigido con límites · inicio ' + mate.arc.start + '° · recorrido ' + mate.arc.sweep + '°' : mate.type === 'limit-angle' ? "Ángulo principal con límites · [" + mate.limits.minimum + ', ' + mate.limits.maximum + ']°' : mate.type === 'limit-distance' ? "Distancia con límites · [" + mate.limits.minimum + ', ' + mate.limits.maximum + '] mm · ' + (mate.alignment === 'aligned' ? 'alineada' : 'opuesta') : mate.type === 'tangent' ? `Tangente plano–cilindro · lado ${mate.side === 'positive' ? 'positivo' : 'negativo'}` : mate.type === 'skew-cylinder-tangent' || mate.type === 'parallel-cylinder-tangent' ? (mate.type === 'skew-cylinder-tangent' ? 'Tangente entre cilindros no paralelos' : 'Tangente entre cilindros con paralelismo') + ' · ' + (mate.branch.kind === 'external' ? 'externa' : 'interna · mayor: referencia ' + (mate.branch.larger === 'first' ? '1' : '2')) : mate.type === 'parallel' || mate.type === 'perpendicular' ? `${mate.type === 'parallel' ? 'Paralela' : 'Perpendicular'} · ${mate.alignment === null ? 'sin sentido alineado/opuesto' : mate.alignment === 'aligned' ? 'alineada' : 'opuesta'}` : mate.type}{mate.type === 'concentric' && mate.rotationLock ? ' · giro bloqueado' : ''}</small></span></label>
        {mate.type==='circular-path'&&<button aria-label={`Editar trayecto circular ${mate.name}`} disabled={editingBlocked||!!preview||replaceDialog||referenceEditing} onClick={()=>beginCircularPathEdit(mate)}>Editar</button>}
        {mate.type === 'line-path' && <button aria-label={`Editar trayecto LINE ${mate.name}`} disabled={editingBlocked || !!preview || replaceDialog || referenceEditing} onClick={() => beginLinePathEdit(mate)}>Editar</button>}
        {mate.type === 'profile-center' && <button aria-label={`Editar centro de perfiles ${mate.name}`} disabled={editingBlocked || !!preview || replaceDialog || referenceEditing} onClick={() => beginProfileEdit(mate)}>Editar</button>}
        {mate.type === 'symmetry' && <button aria-label={`Editar simetría ${mate.name}`} disabled={editingBlocked||!!preview||replaceDialog||referenceEditing} onClick={()=>beginSymmetryEdit(mate)}>Editar</button>}
        {mate.type === 'width' && <button aria-label={`Editar anchura ${mate.name}`} disabled={editingBlocked || !!preview || replaceDialog || referenceEditing} onClick={()=>beginWidthEdit(mate)}>Editar</button>}
        {(mate.type === 'coincident' || mate.type === 'concentric') && <button aria-label={`Editar ${mate.type === 'concentric' ? 'concentricidad' : 'coincidencia'} ${mate.name}`} disabled={editingBlocked || !!preview || replaceDialog || referenceEditing || !!editingGear || !!editingScrew || !!editingRack} onClick={() => beginOrdinaryEdit(mate)}>Editar</button>}
        {mate.type === 'distance' && <button aria-label={`Editar distancia ${mate.name}`} disabled={editingBlocked || !!preview || replaceDialog || referenceEditing} onClick={() => beginDistanceEdit(mate)}>Editar</button>}
        {mate.type === 'angle' && <button aria-label={`Editar ángulo ${mate.name}`} disabled={editingBlocked || !!preview || replaceDialog || referenceEditing} onClick={() => beginAngleEdit(mate)}>Editar</button>}
        {(mate.type === 'parallel' || mate.type === 'perpendicular') && <button aria-label={`Editar relación ${mate.name}`} disabled={editingBlocked || !!preview || replaceDialog || !!referenceEditTicket} onClick={() => beginDirectionEdit(mate)}>Editar</button>}
        {mate.type === 'hinge' && <button aria-label={`Editar bisagra ${mate.name}`} disabled={editingBlocked || !!preview || replaceDialog || !!referenceEditTicket} onClick={() => beginHingeEdit(mate)}>Editar</button>}
        {mate.type === 'tangent' && <button aria-label={`Editar tangencia ${mate.name}`} disabled={editingBlocked || !!preview || replaceDialog || !!referenceEditTicket} onClick={() => beginTangentEdit(mate)}>Editar</button>}
        {(mate.type === 'skew-cylinder-tangent' || mate.type === 'parallel-cylinder-tangent') && <button aria-label={`Editar tangencia entre cilindros ${mate.name}`} disabled={editingBlocked || !!preview || replaceDialog || !!referenceEditTicket} onClick={() => beginCylinderTangentEdit(mate)}>Editar</button>}
        {(mate.type === 'plane-sphere-tangent' || mate.type === 'sphere-sphere-tangent' || mate.type === 'cylinder-sphere-tangent') && <button aria-label={`Editar tangencia con esfera ${mate.name}`} disabled={editingBlocked || !!preview || replaceDialog || !!referenceEditTicket} onClick={() => beginSphereTangentEdit(mate)}>Editar</button>}
        {mate.type === 'limit-directed-angle' && <button aria-label={`Editar límite dirigido ${mate.name}`} disabled={editingBlocked || !!preview || replaceDialog || !!referenceEditTicket} onClick={() => beginLimitDirectedAngleEdit(mate)}>Editar</button>}
        {mate.type === 'limit-angle' && <button aria-label={`Editar intervalo angular ${mate.name}`} disabled={editingBlocked || !!preview || replaceDialog || !!referenceEditTicket} onClick={() => beginLimitAngleEdit(mate)}>Editar</button>}
        {mate.type === 'limit-distance' && <button aria-label={`Editar intervalo entre planos ${mate.name}`} disabled={editingBlocked || !!preview || replaceDialog || !!referenceEditTicket} onClick={() => beginLimitDistanceEdit(mate)}>Editar</button>}
        {mate.type === 'gear' && <button aria-label={`Editar engranaje ${mate.name}`} disabled={editingBlocked || !!preview || replaceDialog || !!referenceEditTicket} onClick={() => { if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || savedReferenceEditIsActive()) return; setMateType('gear'); setDirectionEdit(null); setEditingTangentId(null); setEditingCylinderTangentId(null); setEditingSphereTangentId(null); setEditingLimitDistanceId(null); setEditingLimitAngleId(null); setEditingLimitDirectedAngleId(null); setEditingGearId(mate.id); setEditingScrewId(null); setPickingFaces(false); setDragMode('off') }}>Editar</button>}
        {mate.type === 'screw' && <button aria-label={`Editar tornillo ${mate.name}`} disabled={editingBlocked || !!preview || replaceDialog || !!referenceEditTicket} onClick={() => { if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || savedReferenceEditIsActive()) return; setMateType('screw'); setDirectionEdit(null); setEditingTangentId(null); setEditingCylinderTangentId(null); setEditingSphereTangentId(null); setEditingLimitDistanceId(null); setEditingLimitAngleId(null); setEditingLimitDirectedAngleId(null); setEditingScrewId(mate.id); setEditingGearId(null); setPickingFaces(false); setDragMode('off') }}>Editar</button>}
        {mate.type === 'rack-pinion' && <button aria-label={`Editar cremallera y piñón ${mate.name}`} disabled={editingBlocked || !!preview || replaceDialog || !!referenceEditTicket} onClick={() => { if (operation.current || hasStaging() || currentPreview.current || draft || replaceDialog || savedReferenceEditIsActive()) return; setMateType('rack-pinion'); setDirectionEdit(null); setEditingTangentId(null); setEditingCylinderTangentId(null); setEditingSphereTangentId(null); setEditingLimitDistanceId(null); setEditingLimitAngleId(null); setEditingLimitDirectedAngleId(null); setEditingRackId(mate.id); setEditingGearId(null); setEditingScrewId(null); setRackPicking(null); setPickingFaces(false); setDragMode('off') }}>Editar</button>}
        {mate.type === 'concentric' && !mate.suppressed && <button title="Capturar bloqueo de giro desde la vista previa verificada" aria-label={`Bloquear giro ${mate.name}`} disabled={!canApply || !!referenceEditTicket || !!sourceUpdate || !!documentUpdate || !!replacementReview} onClick={() => void capture(mate.id)}><LockKeyhole size={14} /></button>}
        <button aria-label={`Eliminar ${mate.name}`} disabled={editingBlocked || !!referenceEditTicket || solveDeletion(mate.type) && (!!preview || replaceDialog)} onClick={() => deleteRelation(mate)}><Trash2 size={14} /></button></div>)}{!scope.mates.length && <p className="assembly-muted">No hay relaciones en este ámbito.</p>}
        <details><summary>Bloquear posición relativa</summary>{[0, 1].map(index => <select key={index} aria-label={`Componente ${index + 1} del bloqueo`} value={componentLock[index]} disabled={editingBlocked} onChange={event => setComponentLock(values => values.map((value, i) => i === index ? event.target.value : value))}><option value="">Selecciona componente {index + 1}</option>{availableComponents.map(row => <option key={JSON.stringify(row.path)} value={JSON.stringify(row.path)}>{row.path.join(' / ')}</option>)}</select>)}<button disabled={!canApply || !!referenceEditTicket || !!sourceUpdate || !!documentUpdate || !!replacementReview || !componentLock[0] || !componentLock[1]} onClick={() => void capture()}>Capturar y resolver desde la vista previa</button></details>
      </section><AssemblySolveSummary scopes={reports} document={committed} />{symmetryReports.length>0&&<section className="assembly-solve-summary" role="region" aria-label="Simetría verificada"><strong>Simetría · tres soportes actuales</strong>{symmetryReports.map(report=><p key={JSON.stringify([report.scopePath,report.mateId])}>{report.entityKind} · posición {report.positionErrorMm.toPrecision(6)} mm{report.angleRadians!==null?' · ángulo '+report.angleRadians.toPrecision(6)+' rad':''}{report.radiusDifferenceMm!==null?' · diferencia de radios '+report.radiusDifferenceMm.toPrecision(6)+' mm':''} · incertidumbre posicional {report.uncertainty.positionMm.toPrecision(6)} mm{report.uncertainty.angleRad!==null?' · angular '+report.uncertainty.angleRad.toPrecision(6)+' rad':''}{report.uncertainty.radiusMm!==null?' · radio '+report.uncertainty.radiusMm.toPrecision(6)+' mm':''}</p>)}<p>Soportes infinitos; estimación de primer orden, sin certificado metrológico ni comprobación de contacto.</p></section>}{canApply && preview && preview.reply.checks.every(check => check.satisfied) && <><AssemblyCircularPathSupportSummary document={preview.reply.document} reports={preview.reply.circularPaths ?? []} /><AssemblyLinePathSupportSummary document={preview.reply.document} reports={preview.reply.linePaths ?? []} /><AssemblyProfileCenterSupportSummary document={preview.reply.document} reports={preview.reply.profileCenters ?? []} /></>}<AssemblyHingeSupportSummary document={preview?.reply.document ?? committed} reports={canApply && preview && preview.reply.checks.every(c=>c.satisfied) ? preview.reply.hinges ?? [] : []} /><AssemblyWidthSupportSummary document={preview?.reply.document ?? committed} reports={widthReports} /><AssemblyTangentSupportSummary document={preview?.reply.document ?? committed} reports={tangentReports} /><AssemblyCylinderTangentSupportSummary document={preview?.reply.document ?? committed} reports={cylinderReports} /><AssemblySphereTangentSupportSummary document={preview?.reply.document ?? committed} reports={sphereReports} /><AssemblyLimitDistanceSupportSummary document={preview?.reply.document ?? committed} reports={limitReports} /><AssemblyLimitAngleSupportSummary document={preview?.reply.document ?? committed} reports={limitAngleReports} /><AssemblyLimitDirectedAngleSupportSummary document={preview?.reply.document ?? committed} reports={limitDirectedAngleReports} />
      {preview && <section className="assembly-section"><h3>Comprobaciones físicas</h3>{preview.reply.checks.map(check => <p key={check.constraintId}>{check.satisfied ? '✓' : '⚠'} {check.constraintId}<small>{check.lengthResidual.toExponential(2)} / {check.lengthTolerance.toExponential(2)} mm · {check.angleResidual.toExponential(2)} / {check.angleTolerance.toExponential(2)} rad</small></p>)}</section>}

        </div>
        <div id="assembly-panel-evaluate" role="tabpanel" aria-labelledby="assembly-tab-evaluate" tabIndex={-1} hidden={managerTab !== 'evaluate'} className="assembly-properties assembly-manager-panel">
          <div id="assembly-export-tools" tabIndex={-1}>
      <AssemblyExportPanel disabled={operation.current || !canExportAssemblyGeometry(geometryExportState())} onExport={format => void exportGeometry(format)} />
      <AssemblyDirectedAnglePanel choices={directedChoices} selection={directedSelection} scopePath={scopePath} scopeName={scope.name}
        report={directedReport} disabled={editingBlocked || !!draft || !!preview || replaceDialog || sceneSignature.current !== serialized} pending={directedPending.current}
        onSelect={selectDirectedAngle} onMeasure={() => void measureDirected()} onClear={clearDirectedAngle} />
      <AssemblyInterferencePanel report={analysisReport} selectedPairId={selectedAnalysisPair?.id ?? null} clearance={analysisClearance} includeHidden={includeHidden} includeWithinComponent={includeWithinComponent} treatSubassembliesAsComponents={treatSubassembliesAsComponents}
        onTreatSubassembliesAsComponentsChange={value => changeAnalysisOptions(analysisClearance, includeHidden, analysisScope, includeWithinComponent, value)}
        scope={analysisScope} choices={analysisChoices} onIncludeWithinComponentChange={value => changeAnalysisOptions(analysisClearance, includeHidden, analysisScope, value)} onScopeChange={value => changeAnalysisOptions(analysisClearance, includeHidden, value)}
        disabled={editingBlocked || !!preview || replaceDialog} onClearanceChange={value => changeAnalysisOptions(value, includeHidden)} onIncludeHiddenChange={value => changeAnalysisOptions(analysisClearance, value)}
        onInspect={() => void inspect()} onSelectPair={setAnalysisPair} onClear={clearInspection} showingHidden={analysisHidden} />
</div>
        </div>
      </aside>
      <section className="assembly-canvas" data-assembly-browse-mode={browseSelectionMode} data-normal-selection-kind={normalResolution.target?.kind ?? 'invalid'} data-normal-selection-keys={JSON.stringify(normalViewSelection?.items.map(value => [value.kind, value.key]) ?? [])} data-normal-enabled={canNormal}><CompactViewportToolbar label="Controles del visor del ensamblaje" className="assembly-view-tools"><ViewportToolGroup label="Vistas del ensamblaje"><ViewOrientationControls onView={viewButton} disabled={!!dragSession.current || viewHistory.navigating} canPrevious={viewHistory.canPrevious} canNormal={canNormal} onNamedViews={namedViews.open} canNamedViews={namedViews.canOpen} /><button title="Isométrica" disabled={!!dragSession.current || viewHistory.navigating} onClick={() => viewButton('iso')}><ViewportToolIcon name="iso" label="Isométrica" /></button><button title="Frontal" disabled={!!dragSession.current || viewHistory.navigating} onClick={() => viewButton('front')}><ViewportToolIcon name="front" label="Frontal" /></button><button title="Superior" disabled={!!dragSession.current || viewHistory.navigating} onClick={() => viewButton('top')}><ViewportToolIcon name="top" label="Superior" /></button><button title="Ajustar" disabled={!!dragSession.current || viewHistory.navigating} onClick={() => viewButton('fit')}><ViewportToolIcon name="fit" label="Ajustar" /></button></ViewportToolGroup><ViewportToolGroup label="Selección previa"><button aria-label="Preseleccionar caras" title="Preseleccionar caras · Ctrl para añadir o quitar" aria-pressed={browseSelectionMode === 'face'} disabled={normalViewBlocked} onClick={() => setBrowseSelectionMode('face')}><ViewportToolIcon name="face" label="Preseleccionar caras" /></button><button aria-label="Preseleccionar aristas lineales" title="Preseleccionar aristas lineales · Ctrl para añadir o quitar" aria-pressed={browseSelectionMode === 'edge'} disabled={normalViewBlocked} onClick={() => setBrowseSelectionMode('edge')}><ViewportToolIcon name="edge" label="Preseleccionar aristas lineales" /></button></ViewportToolGroup><ViewportToolGroup label="Selección de referencias"><button title="Seleccionar caras" className={pickingFaces ? 'active' : ''} aria-pressed={pickingFaces} disabled={isHinge || isCircularPath || isLinePath || isSymmetry || (isWidth ? widthPickingBlocked : referenceBlocked)} onClick={() => { openManager('relations'); if (isWidth) { const missing = widthReferences.findIndex(value => value === null); toggleWidthPicking(widthPickingSlot ?? (missing < 0 ? 0 : missing as WidthUiSlot)); return } setDragMode('off'); setPickingLinearEdges(false); setPickingFaces(!pickingFaces) }}><ViewportToolIcon name="face" label="Seleccionar caras" /></button>
        {(isDirection || isLimitAngle || mateType === 'angle') && <button title="Seleccionar aristas lineales" aria-label="Seleccionar aristas lineales" aria-pressed={pickingLinearEdges} disabled={referenceBlocked || !!editingLimitAngle || sceneSignature.current !== serialized} onClick={() => { openManager('relations'); setDragMode('off'); setPickingFaces(false); setPickingLinearEdges(!pickingLinearEdges) }}><ViewportToolIcon name="edge" label="Seleccionar aristas" /></button>}
        </ViewportToolGroup><ViewportToolGroup label="Manipulación del componente" className="assembly-drag-tools"><button title="Arrastrar posición" aria-label="Arrastrar posición" aria-pressed={dragMode === 'translate'} disabled={editingBlocked || !!draft || !!preview || replaceDialog || !eligibleDragFrame} onClick={() => { setTreeOriginSelection(null); setNormalSelection(null); clearSymmetryPicking(); setDragMode('translate') }}><ViewportToolIcon name="translate" label="Arrastrar posición" /></button>
        <button title="Arrastrar giro" aria-label="Arrastrar giro" aria-pressed={dragMode === 'rotate'} disabled={editingBlocked || !!draft || !!preview || replaceDialog || !eligibleDragFrame} onClick={() => { setTreeOriginSelection(null); setNormalSelection(null); clearSymmetryPicking(); setDragMode('rotate') }}><ViewportToolIcon name="rotate" label="Arrastrar giro" /></button>
        <button title="Desactivar manipulador" aria-label="Desactivar manipulador" disabled={!!dragSession.current || dragMode === 'off'} onClick={() => setDragMode('off')}><ViewportToolIcon name="stop" label="Desactivar manipulador" /></button></ViewportToolGroup></CompactViewportToolbar>
      <AssemblyViewport originLabelTopInset={44} scene={scene} view={view} viewHistory={viewHistory} selectedPath={selectedTreeOrigin ? [] : selectedPath} selectedFaces={normalViewBlocked ? rackSelectedFaces : [...rackSelectedFaces, ...browseFaces]} selectedEdges={normalViewBlocked ? rackSelectedEdges : [...rackSelectedEdges, ...browseResolution.edges]} selectedAnalysisPair={selectedAnalysisPair} browseSelectionMode={browseSelectionMode}
        onContextTarget={openViewportContext}
        originReferences={!normalViewBlocked && browseOrigins.length ? browseOrigins : selectedTreeOrigin ? [selectedTreeOrigin.display] : originDisplays}
        selectedOrigins={!normalViewBlocked && browseOrigins.length ? browseOrigins.map(value => value.reference) : selectedTreeOrigin ? [selectedTreeOrigin.display.reference] : selectedOriginReferences} pickingOrigins={activeOriginPicking} onOrigin={pickOrigin}
        pickingFaces={isSymmetry ? !!activeSymmetryPick && activeSymmetryPick.producer !== 'vertex' && activeSymmetryPick.producer !== 'line-edge' : pickingFaces || !!rackPicking && rackPicking.kind !== 'rack-edge'} pickingEdges={isSymmetry ? activeSymmetryPick?.producer === 'line-edge' : pickingLinearEdges || rackPicking?.kind === 'rack-edge'} disabled={editingBlocked || replaceDialog || !!preview && !rackPicking}
        drag={dragMode !== 'off' && !activeSymmetryPick && !pickingFaces && !pickingLinearEdges && !sourceUpdate && !documentUpdate && !replacementReview && !preview && !draft && !replaceDialog && (dragAnchor.current ?? eligibleDragFrame)
          ? { frame: (dragAnchor.current ?? eligibleDragFrame)!, mode: dragMode, active: dragActive } : undefined}
        onDragStart={beginDrag} onDragTarget={dragTarget} onDragEnd={endDrag} onDragCancel={cancel}
        pickingVertices={isSymmetry && activeSymmetryPick?.producer === 'vertex'} selectedVertices={symmetrySelectedVertices} onVertex={vertex => { if (managerTabRef.current === 'relations') pickSymmetryVertex(vertex) }}
        onViewSelection={nominateViewSelection} onComponent={component => { abandonInsertionSelection(); setTreeOriginSelection(null); if (linkedTicket.current) generation.current++; setSelectedPath(component?.occurrencePath ?? []) }} onFace={face => { if (managerTabRef.current === 'relations') (rackPicking ? pickRackFace : pickFace)(face) }} onEdge={edge => { if (managerTabRef.current === 'relations') (rackPicking ? pickRackEdge : pickDirectionEdge)(edge) }} />
      <div className="assembly-canvas-label"><strong>{displayed.name}</strong><span>{rackPicking ? rackPicking.kind === 'rack-edge' ? 'Selecciona una arista lineal actual de la cremallera' : rackPicking.kind === 'pinion' ? 'Selecciona el cilindro actual del piñón' : 'Selecciona el eje cilíndrico actual de la cremallera' : dragSession.current ? 'Arrastre · destinos nativos verificados · todavía sin aplicar' : preview ? 'Vista previa · todavía sin aplicar' : documentUpdate ? 'Actualización de subensamblaje · pendiente de resolver y aplicar' : sourceUpdate ? 'Actualización de origen · pendiente de resolver y aplicar' : replacementReview ? 'Sustitución de pieza · pendiente de resolver y aplicar' : activeSymmetryPick ? 'Selecciona ' + SYMMETRY_ROLE_LABELS[activeSymmetryPick.slot] + (activeSymmetryPick.producer === 'line-edge' ? ' · arista lineal' : activeSymmetryPick.producer === 'cylinder-axis' ? ' · eje cilíndrico' : '') : activeHingePick ? 'Selecciona ' + HINGE_ROLE_LABELS[activeHingePick.slot] : widthPickingSlot !== null ? 'Selecciona ' + WIDTH_ROLE_LABELS[widthPickingSlot] : pickingFaces ? `Selecciona referencia ${endpointSlot + 1}` : 'Componentes independientes · mm'}</span></div>
      {!scene?.bodies.length && !busy && <div className="assembly-empty"><Component size={42} /><h2>Diseña un conjunto de piezas</h2><p>Importa una pieza o abre el ejemplo original para empezar.</p></div>}
    </section>
    </main>
    {bomOpen && <AssemblyBomPanel report={bom.report} error={bom.error} options={bomOptions} selectedPath={selectedPath} disabled={bomBlocked}
      onOptionsChange={options => { if (!operation.current && !hasStaging() && !currentPreview.current && !draft && !replaceDialog) setBomOptions(options) }}
      onSelect={componentPath => { if (!operation.current && !hasStaging() && !currentPreview.current && !draft && !replaceDialog) { abandonInsertionSelection(); setNormalSelection(nominateAssemblyNormalUnsupported(JSON.stringify(['component', componentPath]), normalViewContext)); setPickingFaces(false); if (fileTicket.current?.purpose === 'update' || linkedTicket.current) generation.current++; setSelectedPath(componentPath) } }}
      onExport={() => void exportBom()} onClose={() => { restoreBomFocus.current = true; setBomOpen(false); setRibbonTab('evaluate') }} />}
    <footer className={`assembly-status ${error ? 'error' : ''}`} role="status" aria-live="polite">{busy && <Loader2 size={14} className="assembly-spinner" />}<span>{message}</span>{scene && <small>{scene.solidCount} sólidos · {scene.prototypeCount} orígenes · {scene.volume.toLocaleString(undefined, { maximumFractionDigits: 3 })} mm³</small>}</footer>
    {activeContext && <CadContextMenu targetName={contextRow?.occurrence.name ?? contextOrigin?.display.label ?? 'Vista del ensamblaje'}
      actions={contextActions} point={activeContext.point} restoreFocusElement={activeContext.element} onClose={() => setContextTarget(null)} />}
    {rootRevision && <AssemblyRootRevisionDialog id={committed.id} currentRevision={committed.revision} revision={rootRevision.revision} error={rootRevision.error}
      onRevision={revision => setRootRevision(value => value && { ...value, revision, error: '' })} onPreview={() => void previewRootRevision()} onCancel={() => setRootRevision(null)} />}
    {namedViews.isOpen && <NamedViewsDialog views={namedViews.views} canSave={namedViews.canSave} canUpdate={namedViews.canUpdate}
      onSave={namedViews.save} onShow={namedViews.show} onDelete={namedViews.remove} onRename={namedViews.rename} onUpdate={namedViews.update} onClose={namedViews.close} />}
    {newDocumentDialog.dialog}
    {replaceDialog && <div className="assembly-modal-backdrop"><div ref={replaceModal} className="assembly-modal" role="dialog" aria-modal="true" aria-label="Cambios sin guardar"><h2>Hay cambios sin guardar</h2><p>Guarda el ensamblaje antes de sustituirlo.</p>{draft && <p>Aplica o cancela la vista previa para guardar sus cambios.</p>}<div><button disabled={!!draft || busy} onClick={() => void save().then(success => { if (success) answerReplace(true) })}>Guardar y continuar</button><button onClick={() => answerReplace(true)}>Continuar sin guardar</button><button onClick={() => answerReplace(false)}>Cancelar</button></div></div></div>}
  </div>
}
