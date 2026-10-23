import { insertAssemblyDocument } from '../model/assemblyImport'
import { applyAssemblyConfiguredMateEdit } from '../model/assemblyConfiguredMateEditing'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { importAssemblyStepStructureNative } from './kernel.assembly-step-import'
import { exportAssemblyStepStructureNative } from './kernel.assembly-step-export'
import { CadEngine } from './kernel.engine'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { ConfiguredAssemblyWorkerSession, captureConfiguredAssemblyRelationEdit } from './kernel.assembly-configuration-session'
import { captureConfiguredAssemblyWorkerContext } from './kernel.assembly-configuration-context'
import { validateConfiguredAssemblySolvePolicy } from './kernel.assembly-configuration-solve'
import { exportAssemblyCadNative } from './kernel.assembly-export'
import { measureAssemblyDirectedAngleNative } from './kernel.assembly-angle-measurement'
import type { KernelRequest, KernelValue } from './kernel.types'

/** Production command routing; caller serializes requests after WASM readiness. */
export class KernelDispatcher {
  #part = new CadEngine()
  #assembly = new AssemblyWorkerSession()
  #configured = new ConfiguredAssemblyWorkerSession()
  handle(request: KernelRequest): KernelValue {
    switch (request.action) {
      case 'init': return null
      case 'build-configured-assembly': return this.#configured.build(request.current)
      case 'preview-configured-assembly':
        captureConfiguredAssemblyWorkerContext(request.current)
        validateConfiguredAssemblySolvePolicy(request.options)
        this.#part.dispose(); this.#assembly.discard()
        return this.#configured.preview(request.current, request.options)
      case 'apply-configured-assembly': return this.#configured.apply(request.current, request.token)
      case 'preview-configured-assembly-relation-edit': {
        const current = captureConfiguredAssemblyWorkerContext(request.current)
        const edit = captureConfiguredAssemblyRelationEdit(request.edit)
        validateConfiguredAssemblySolvePolicy(request.options)
        applyAssemblyConfiguredMateEdit(current.document, edit)
        this.#part.dispose(); this.#assembly.discard()
        return this.#configured.previewEdit(request.current, request.edit, request.options)
      }
      case 'discard-configured-assembly': {
        const token = Object.getOwnPropertyDescriptor(request, 'token')
        if (!token || !('value' in token) || typeof token.value !== 'string' || !token.value || token.value.length > 128) throw Error('Configured preview token is invalid.')
        this.#configured.discard(token.value); return null
      }
      // Standalone structural exchange never consumes workspace capabilities.
      case 'import-assembly-step': {
        const document = importAssemblyStepStructureNative(request.source)
        buildAssemblyScene(document) // Withhold the candidate until independent native scene preparation succeeds.
        return document
      }
      case 'insert-assembly-step': {
        const incoming = importAssemblyStepStructureNative(request.source)
        const candidate = insertAssemblyDocument(request.current, incoming, request.scope)
        buildAssemblyScene(candidate)
        return candidate
      }
      case 'export-assembly-step': return exportAssemblyStepStructureNative(request.document)
      case 'build': this.#configured.discard(); this.#assembly.discard(); return this.#part.build(request.features)
      case 'export': this.#assembly.discard(); return this.#part.export(request.format, request.features)
      // A committed export owns independent engines and placements. It does not
      // replace either workspace or consume a pending assembly capability.
      case 'export-assembly': this.#assembly.discardReplacement(); this.#assembly.discardDocumentUpdate(); this.#assembly.discardPartUpdate(); return exportAssemblyCadNative(request.document, request.format)
      // Independent native measurement preserves pending previews and reviews.
      case 'measure-assembly-directed-angle': return measureAssemblyDirectedAngleNative(request.current, request.request)
      // A canceled request can return after mode replacement. Discard only its
      // matching capability; never release a newly built part's native shape.
      case 'discard-assembly': this.#assembly.discard(request.token); return null
      case 'discard-assembly-part-replacement': this.#assembly.discardReplacement(request.reviewId); return null
      case 'discard-assembly-document-update': this.#assembly.discardDocumentUpdate(request.reviewId); return null
      case 'discard-assembly-part-update': this.#assembly.discardPartUpdate(request.reviewId); return null
      case 'build-assembly': case 'preview-assembly': case 'apply-assembly':
      case 'preview-assembly-root-revision':
      case 'review-assembly-part-update':
      case 'preview-assembly-part-update':
      case 'review-assembly-part-replacement':
      case 'preview-assembly-part-replacement':
      case 'review-assembly-document-update':
      case 'preview-assembly-document-update':
      case 'inspect-assembly-interferences':
      case 'move-assembly-component':
      case 'move-assembly-component-motion':
      case 'move-assembly-world-component':
      case 'project-assembly-component':
      case 'translate-assembly-until-contact':
      case 'lock-assembly-rotation': case 'lock-assembly-components':
      case 'capture-assembly-gear':
      case 'capture-assembly-screw':
      case 'capture-assembly-rack-pinion':
        this.#configured.discard(); this.#part.dispose(); return this.#assembly.handle(request)
      default: throw new Error('Solicitud del motor CAD no admitida.')
    }
  }
  dispose(): void {
    this.#configured.discard(); this.#assembly.discard(); this.#part.dispose()
  }
}
