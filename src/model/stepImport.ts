import type { CadResult, Feature } from '../cad/kernel.types';
import { createDocument, validateDocument, type Document } from './document';
import { createStepSource } from './stepSource';

export interface StepFile {
  name: string;
  data: Uint8Array;
}

export type BuildImportedPart = (features: Feature[]) => Promise<CadResult>;

/** Own the selected bytes before async work; do not add the selected file path. */
export async function prepareStepDocument(file: StepFile, build: BuildImportedPart): Promise<Document> {
  if (!/\.(?:step|stp)$/i.test(file.name)) throw new Error('Selecciona un archivo .step o .stp.');
  const basename = file.name.split(/[\\/]/).at(-1) ?? '';
  const name = basename.replace(/\.(?:step|stp)$/i, '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 180) || 'STEP importado';
  const document = validateDocument({
    ...createDocument(name),
    features: [{
      type: 'importedSolid', id: crypto.randomUUID(), name: 'Sólido importado STEP',
      suppressed: false, source: createStepSource(file.data),
    }],
  });
  const result = await build(document.features);
  if (result.featureErrors.length) throw new Error(result.featureErrors.map(error => error.message).join(' · '));
  if (!Number.isFinite(result.volume) || result.volume <= 0 || !result.vertices.length) {
    throw new Error('El STEP no contiene un sólido cerrado válido.');
  }
  return document;
}

interface ImportContext {
  document: Document;
  editing: Feature | null;
}

interface StepImportActions {
  current: () => ImportContext;
  read: () => Promise<StepFile | null>;
  build: BuildImportedPart;
  confirm: () => Promise<boolean>;
  commit: (document: Document) => void;
}

/** Prepare first; the user's replacement decision is the last async step. */
export async function importStepPart(actions: StepImportActions): Promise<'imported' | 'cancelled' | 'stale'> {
  const initial = actions.current();
  if (initial.editing) throw new Error('Acepta o cancela la operación en curso antes de importar.');
  const unchanged = () => {
    const current = actions.current();
    return current.document === initial.document && current.editing === initial.editing;
  };
  const file = await actions.read();
  if (!file) return 'cancelled';
  if (!unchanged()) return 'stale';
  const document = await prepareStepDocument(file, actions.build);
  if (!unchanged()) return 'stale';
  if (!await actions.confirm()) return 'cancelled';
  if (!unchanged()) return 'stale';
  actions.commit(document);
  return 'imported';
}
