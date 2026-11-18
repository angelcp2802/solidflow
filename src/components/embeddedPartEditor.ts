import type { Document } from '../model/document'
import type { EmbeddedPartActivation, EmbeddedPartWork } from './embeddedPartWork'

/** Current editor inputs, compared by identity; this is not native CAD proof. */
export interface EmbeddedPartBuildSnapshot {
  document: Document
  features: Document['features']
  sourceFeatures: Document['features'] | null
}

/** Temporary editor boundary. It receives no parent file path or file grants. */
export interface EmbeddedPartEditorProps {
  sessionId: string
  assemblyName: string
  componentName: string
  initialDocument: Document
  baselineSerialized: string
  work: EmbeddedPartWork<EmbeddedPartBuildSnapshot>
  activation: EmbeddedPartActivation
  active: boolean
  onReturn: (document: Document, activation: EmbeddedPartActivation, snapshot: EmbeddedPartBuildSnapshot) => boolean
  onDiscard: () => void
  onDirtyChange: (changed: boolean, unfinished: boolean) => void
}
