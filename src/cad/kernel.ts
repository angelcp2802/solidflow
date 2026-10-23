import { validateStepSource, type StepSource } from '../model/stepSource';
import type { CadExportFormat, CadResult, Feature, KernelRequest, KernelResponse, KernelValue } from './kernel.types';
import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyComponentReference, type AssemblyDefinitionReference, type AssemblyDocument, type AssemblySourceLink } from '../model/assemblyDocument';
import type { AssemblyAppliedReply, AssemblyGearCaptureRequest, AssemblyScrewCaptureRequest, AssemblyRackPinionCaptureRequest, AssemblyPreviewReply, AssemblyScene } from './kernel.assembly-types';
import type { AssemblySolveOptions } from './kernel.assembly-solve';
import type { AssemblySourceUpdateReview } from './kernel.assembly-source-updates';
import type { Document } from '../model/document';
import type { AssemblyInterferenceOptions, AssemblyInterferenceReport } from '../model/assemblyInterference';
import type { AssemblyComponentMove } from '../model/assemblyMovement';
import type { AssemblyComponentMotion } from '../model/assemblyMotion';
import type { AssemblyWorldComponentMove } from '../model/assemblyDrag';
import type { AssemblyComponentDrag } from '../model/assemblyProjectionIntent';
import type { AssemblyPartReplacementRequest } from '../model/assemblyReplacement';
import type { AssemblyReplacementReview, AssemblyReplacementDecisions } from './kernel.assembly-replacement';
import type { AssemblyDocumentUpdateReview, AssemblyDocumentUpdateDecisions } from './kernel.assembly-document-update-types';
import { validateAssemblyDirectedAngleRequest, type AssemblyDirectedAngleRequest, type AssemblyDirectedAngleReport } from '../model/assemblyDirectedAngle';
import { captureConfiguredAssemblyWorkerContext, captureConfiguredAssemblySolveOptions, type ConfiguredAssemblyWorkerContext } from './kernel.assembly-configuration-context';
import type { ConfiguredAssemblyPreviewReply, ConfiguredAssemblyAppliedReply } from './kernel.assembly-configuration-session';
import type { ConfiguredAssemblyScene } from './kernel.assembly-configuration-scene';
import type { ConfiguredAssemblySolveOptions } from './kernel.assembly-configuration-solve';

let worker: Worker | null = null;
let nextId = 0;
let generation = 0;
let initialization: Promise<void> | null = null;
const pending = new Map<number, {
  resolve: (value: KernelValue) => void;
  reject: (error: Error) => void;
}>();

function getWorker(): Worker {
  if (worker) return worker;
  const activeWorker = new Worker(new URL('./kernel.worker.ts', import.meta.url), { type: 'module' });
  worker = activeWorker;
  activeWorker.onmessage = (event: MessageEvent<KernelResponse>) => {
    if (worker !== activeWorker) return;
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.ok) request.resolve(response.value);
    else request.reject(new Error(response.error));
  };
  activeWorker.onerror = (event) => {
    if (worker !== activeWorker) return;
    const error = new Error(event.message || 'El motor CAD dejó de responder. Vuelve a reconstruir la pieza.');
    pending.forEach((request) => request.reject(error));
    pending.clear();
    worker?.terminate();
    worker = null;
    initialization = null;
    generation++;
  };
  return worker;
}

type RequestInput = KernelRequest extends infer T
  ? T extends KernelRequest ? Omit<T, 'id'> : never
  : never;

function request<T extends KernelValue>(input: RequestInput): Promise<T> {
  return new Promise((resolve, reject) => {
    const activeWorker = getWorker();
    const id = ++nextId;
    pending.set(id, { resolve: (value) => resolve(value as T), reject });
    try {
      activeWorker.postMessage({ ...input, id });
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}

export function initKernel(): Promise<void> {
  if (!initialization) {
    const initializing = request<null>({ action: 'init' })
      .then(() => undefined)
      .catch((error: unknown) => {
        if (initialization === initializing) initialization = null;
        throw error;
      });
    initialization = initializing;
  }
  return initialization;
}

export async function buildModel(features: Feature[]): Promise<CadResult> {
  const requestedGeneration = generation;
  await initKernel();
  if (requestedGeneration !== generation) throw new Error('El motor CAD se ha cerrado.');
  return request<CadResult>({ action: 'build', features });
}

/** Supply the committed document to export independently of debounced previews. */
export async function exportCad(format: CadExportFormat, features?: Feature[]): Promise<Blob> {
  const requestedGeneration = generation;
  await initKernel();
  if (requestedGeneration !== generation) throw new Error('El motor CAD se ha cerrado.');
  return request<Blob>({ action: 'export', format, features });
}

async function assemblyRequest<T extends AssemblyScene | AssemblyPreviewReply | AssemblyAppliedReply | AssemblySourceUpdateReview | AssemblyReplacementReview | AssemblyDocumentUpdateReview | AssemblyInterferenceReport | AssemblyDirectedAngleReport | null>(input: RequestInput): Promise<T> {
  const requestedGeneration = generation;
  await initKernel();
  if (requestedGeneration !== generation) throw new Error('El motor CAD se ha cerrado.');
  return request<T>(input);
}
export function buildAssembly(document: AssemblyDocument): Promise<AssemblyScene> {
  return assemblyRequest({ action: 'build-assembly', document });
}
/** Capture complete configured declarations before initialization can yield.
 * Native handles never cross this worker boundary; only its opaque token does. */
export async function buildConfiguredAssembly(current: ConfiguredAssemblyWorkerContext): Promise<ConfiguredAssemblyScene> {
  const owned = captureConfiguredAssemblyWorkerContext(current), epoch = generation;
  await initKernel();
  if (epoch !== generation) throw Error('El motor CAD se ha cerrado.');
  return request<ConfiguredAssemblyScene>({ action: 'build-configured-assembly', current: owned });
}
export async function previewConfiguredAssembly(current: ConfiguredAssemblyWorkerContext, options: ConfiguredAssemblySolveOptions = {}): Promise<ConfiguredAssemblyPreviewReply> {
  const owned = captureConfiguredAssemblyWorkerContext(current), policy = captureConfiguredAssemblySolveOptions(options), epoch = generation;
  await initKernel();
  if (epoch !== generation) throw Error('El motor CAD se ha cerrado.');
  return request<ConfiguredAssemblyPreviewReply>({ action: 'preview-configured-assembly', current: owned, options: policy });
}
export async function applyConfiguredAssembly(current: ConfiguredAssemblyWorkerContext, token: string): Promise<ConfiguredAssemblyAppliedReply> {
  const owned = captureConfiguredAssemblyWorkerContext(current), epoch = generation;
  if (typeof token !== 'string' || !token || token.length > 128) throw Error('Configured preview token is invalid.');
  await initKernel();
  if (epoch !== generation) throw Error('El motor CAD se ha cerrado.');
  return request<ConfiguredAssemblyAppliedReply>({ action: 'apply-configured-assembly', current: owned, token });
}
export async function discardConfiguredAssembly(token: string): Promise<null> {
  if (typeof token !== 'string' || !token || token.length > 128) throw Error('Configured preview token is invalid.');
  const epoch = generation;
  await initKernel();
  if (epoch !== generation) throw Error('El motor CAD se ha cerrado.');
  return request<null>({ action: 'discard-configured-assembly', token });
}
/** Flat geometry from the detached committed snapshot; never a display preview. */
export async function exportAssemblyCad(document: AssemblyDocument, format: CadExportFormat): Promise<Blob> {
  if (format !== 'step' && format !== 'stl') throw new Error('Formato de exportación desconocido.');
  // Capture before asynchronous initialization; caller mutations cannot change
  // which committed document is sent after the worker becomes ready.
  const snapshot = validateAssemblyDocument(document), requestedGeneration = generation;
  await initKernel();
  if (requestedGeneration !== generation) throw new Error('El motor CAD se ha cerrado.');
  return request<Blob>({ action: 'export-assembly', document: snapshot, format });
}
/** Exact owned bytes are captured before worker initialization. */
function ownedStructuralStepSource(source: StepSource): StepSource {
  if (!source || Object.getPrototypeOf(source) !== Object.prototype || Reflect.ownKeys(source).length !== 4) throw new Error('Fuente STEP no válida.');
  const fields = ['format', 'encoding', 'data', 'sha256'] as const;
  const owned: Record<string, unknown> = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(source, field);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw new Error('Fuente STEP no válida.');
    owned[field] = descriptor.value;
  }
  return validateStepSource(owned);
}

export async function importAssemblyStep(source: StepSource): Promise<AssemblyDocument> {
  const snapshot = ownedStructuralStepSource(source), requestedGeneration = generation;
  await initKernel();
  if (requestedGeneration !== generation) throw new Error('El motor CAD se ha cerrado.');
  const result = validateAssemblyDocument(await request<AssemblyDocument>({ action: 'import-assembly-step', source: snapshot }));
  serializeAssemblyDocument(result); // Includes the final exact 20 MiB UTF-8 document bound.
  return result;
}

/** Compose an independently admitted neutral graph without replacing the parent. */
export async function insertAssemblyStep(current: AssemblyDocument, source: StepSource, scope?: AssemblyDefinitionReference): Promise<AssemblyDocument> {
  const document = validateAssemblyDocument(current), snapshot = ownedStructuralStepSource(source);
  serializeAssemblyDocument(document);
  let target: AssemblyDefinitionReference | undefined;
  if (scope !== undefined) {
    if (!scope || ![Object.prototype, null].includes(Object.getPrototypeOf(scope)) || Reflect.ownKeys(scope).length !== 2) throw new Error('Ámbito de inserción no válido.');
    const id = Object.getOwnPropertyDescriptor(scope, 'id'), revision = Object.getOwnPropertyDescriptor(scope, 'revision');
    if (!id?.enumerable || !revision?.enumerable || !('value' in id) || !('value' in revision)
      || typeof id.value !== 'string' || typeof revision.value !== 'string') throw new Error('Ámbito de inserción no válido.');
    const found = [document, ...document.definitions].find(node => node.kind === 'assembly' && node.id === id.value && node.revision === revision.value);
    if (!found) throw new Error('El ámbito de inserción no pertenece al documento actual.');
    target = { id: found.id, revision: found.revision };
  }
  const requestedGeneration = generation;
  await initKernel();
  if (requestedGeneration !== generation) throw new Error('El motor CAD se ha cerrado.');
  const result = validateAssemblyDocument(await request<AssemblyDocument>({ action: 'insert-assembly-step', current: document, source: snapshot,
    ...(target === undefined ? {} : { scope: target }) }));
  serializeAssemblyDocument(result);
  return result;
}

/** Independent structural export; no ambient preview or source capability. */
export async function exportAssemblyStep(document: AssemblyDocument): Promise<Blob> {
  const snapshot = validateAssemblyDocument(document), requestedGeneration = generation;
  serializeAssemblyDocument(snapshot);
  await initKernel();
  if (requestedGeneration !== generation) throw new Error('El motor CAD se ha cerrado.');
  const result = await request<Blob>({ action: 'export-assembly-step', document: snapshot });
  if (!(result instanceof Blob) || result.size <= 0 || result.size > 256 * 1024 * 1024) throw new Error('Respuesta STEP estructural no válida.');
  return result;
}

/** Native source review is staging data; only a fresh solve can grant Apply. */
export function reviewAssemblyPartUpdate(current: AssemblyDocument, source: AssemblyDefinitionReference,
  part: Document, revision: string, sourceLink?: AssemblySourceLink): Promise<AssemblySourceUpdateReview> {
  return assemblyRequest({ action: 'review-assembly-part-update', current, source, part, revision, ...(sourceLink === undefined ? {} : {sourceLink}) });
}
/** Only repairs to the retained source plan are accepted before native Solve. */
export function previewAssemblyPartUpdate(current: AssemblyDocument, reviewId: string, proposed: AssemblyDocument): Promise<AssemblyPreviewReply> {
  return assemblyRequest({ action: 'preview-assembly-part-update', current, reviewId, proposed });
}
export function discardAssemblyPartUpdate(reviewId?: string): Promise<void> {
  if (!worker) return Promise.resolve();
  return request<null>({ action: 'discard-assembly-part-update', reviewId }).then(() => undefined);
}
/** Review grants no Apply authority; the worker retains the exact private COW plan. */
export function reviewAssemblyPartReplacement(current: AssemblyDocument, request: AssemblyPartReplacementRequest): Promise<AssemblyReplacementReview> {
  return assemblyRequest({ action: 'review-assembly-part-replacement', current, request });
}
/** Only decisions from the review inventory cross RPC, never a renderer candidate. */
export function previewAssemblyPartReplacement(current: AssemblyDocument, reviewId: string, decisions: AssemblyReplacementDecisions): Promise<AssemblyPreviewReply> {
  return assemblyRequest({ action: 'preview-assembly-part-replacement', current, reviewId, decisions });
}
export function discardAssemblyPartReplacement(reviewId?: string): Promise<void> {
  if (!worker) return Promise.resolve();
  return request<null>({ action: 'discard-assembly-part-replacement', reviewId }).then(() => undefined);
}
/** Source-local inspection grants no Apply authority. */
export function reviewAssemblyDocumentUpdate(current: AssemblyDocument, source: AssemblyDefinitionReference, incoming: AssemblyDocument, sourceLink?: AssemblySourceLink): Promise<AssemblyDocumentUpdateReview> {
  return assemblyRequest({ action: 'review-assembly-document-update', current, source, incoming, ...(sourceLink === undefined ? {} : {sourceLink}) });
}
/** A private review plus bounded decisions is required for an authenticated solve. */
export function previewAssemblyDocumentUpdate(current: AssemblyDocument, reviewId: string, decisions: AssemblyDocumentUpdateDecisions): Promise<AssemblyPreviewReply> {
  return assemblyRequest({ action: 'preview-assembly-document-update', current, reviewId, decisions });
}
export function discardAssemblyDocumentUpdate(reviewId?: string): Promise<void> {
  if (!worker) return Promise.resolve();
  return request<null>({ action: 'discard-assembly-document-update', reviewId }).then(() => undefined);
}
/** Read-only measurements from fresh native placements; no Apply authority. */
export function inspectAssemblyInterferences(current: AssemblyDocument, options?: Partial<AssemblyInterferenceOptions>): Promise<AssemblyInterferenceReport> {
  return assemblyRequest({ action: 'inspect-assembly-interferences', current, options });
}
/** Measure detached committed geometry; a report never supplies Apply authority. */
export async function measureAssemblyDirectedAngle(current: AssemblyDocument, input: AssemblyDirectedAngleRequest): Promise<AssemblyDirectedAngleReport> {
  const snapshot = validateAssemblyDocument(current), request = validateAssemblyDirectedAngleRequest(input);
  return assemblyRequest({ action: 'measure-assembly-directed-angle', current: snapshot, request });
}
export function previewAssembly(current: AssemblyDocument, proposed: AssemblyDocument = current, options?: AssemblySolveOptions): Promise<AssemblyPreviewReply> {
  return assemblyRequest({ action: 'preview-assembly', current, proposed, options });
}
/** Root revision is authored privately; labels and reports supply no native proof. */
export function previewAssemblyRootRevision(current: AssemblyDocument, revision: string): Promise<AssemblyPreviewReply> {
  return assemblyRequest({ action: 'preview-assembly-root-revision', current, revision });
}
/** Absolute local target, with the selected component anchored only during solving. */
export function moveAssemblyComponent(current: AssemblyDocument, move: AssemblyComponentMove, options?: AssemblySolveOptions): Promise<AssemblyPreviewReply> {
  return assemblyRequest({ action: 'move-assembly-component', current, move, options });
}
/** Explicit intrinsic local increment, including full turns, at verified stations. */
export function moveAssemblyComponentMotion(current: AssemblyDocument, motion: AssemblyComponentMotion, options?: AssemblySolveOptions): Promise<AssemblyPreviewReply> {
  return assemblyRequest({ action: 'move-assembly-component-motion', current, motion, options });
}
/** World-space intent for the root rigid owner, verified by a fresh native solve. */
export function moveAssemblyWorldComponent(current: AssemblyDocument, move: AssemblyWorldComponentMove, options?: AssemblySolveOptions): Promise<AssemblyPreviewReply> {
  return assemblyRequest({ action: 'move-assembly-world-component', current, move, options });
}
/** Soft pointer intent projected onto the saved native mate system. */
export function projectAssemblyDrag(current: AssemblyDocument, drag: AssemblyComponentDrag, options?: AssemblySolveOptions): Promise<AssemblyPreviewReply> {
  return assemblyRequest({ action: 'project-assembly-component', current, drag, options });
}
/** Rectilinear world translation with native distance advancement before contact. */
export function translateAssemblyUntilContact(current: AssemblyDocument,
  translation: import('../model/assemblyTranslation').AssemblyTranslationRequest,
  stopOptions?: Partial<import('../model/assemblyTranslation').AssemblyTranslationStopOptions>, options?: AssemblySolveOptions): Promise<AssemblyPreviewReply> {
  return assemblyRequest({ action: 'translate-assembly-until-contact', current, translation, stopOptions, options });
}
export function applyAssemblyPreview(current: AssemblyDocument, token: string): Promise<AssemblyAppliedReply> {
  return assemblyRequest({ action: 'apply-assembly', current, token });
}
export function discardAssemblyPreview(token?: string): Promise<void> {
  // Leaving a workspace must not create a new worker merely to discard it.
  if (!worker) return Promise.resolve();
  return request<null>({ action: 'discard-assembly', token }).then(() => undefined);
}
export function captureAssemblyRotationLock(current: AssemblyDocument, token: string, mateId: string, scope?: AssemblyDefinitionReference): Promise<AssemblyPreviewReply> {
  return assemblyRequest({ action: 'lock-assembly-rotation', current, token, mateId, scope });
}
export function captureAssemblyComponentLock(current: AssemblyDocument, token: string, first: AssemblyComponentReference,
  second: AssemblyComponentReference, scope?: AssemblyDefinitionReference): Promise<AssemblyPreviewReply> {
  return assemblyRequest({ action: 'lock-assembly-components', current, token, first, second, scope });
}
/** Capture gear zero frames from an authenticated native preview, then solve. */
export function captureAssemblyGear(current: AssemblyDocument, token: string, request: AssemblyGearCaptureRequest,
  scope?: AssemblyDefinitionReference): Promise<AssemblyPreviewReply> {
  return assemblyRequest({ action: 'capture-assembly-gear', current, token, request, scope });
}
export function captureAssemblyScrew(current: AssemblyDocument, token: string, request: AssemblyScrewCaptureRequest,
  scope?: AssemblyDefinitionReference): Promise<AssemblyPreviewReply> {
  return assemblyRequest({ action: 'capture-assembly-screw', current, token, request, scope });
}
export function captureAssemblyRackPinion(current: AssemblyDocument, token: string, request: AssemblyRackPinionCaptureRequest,
  scope?: AssemblyDefinitionReference): Promise<AssemblyPreviewReply> {
  return assemblyRequest({ action: 'capture-assembly-rack-pinion', current, token, request, scope });
}

export function disposeKernel(): void {
  generation++;
  worker?.terminate();
  worker = null;
  initialization = null;
  pending.forEach((entry) => entry.reject(new Error('El motor CAD se ha cerrado.')));
  pending.clear();
}

if (import.meta.hot) import.meta.hot.dispose(disposeKernel);
