import { useMemo, useState } from 'react';
import type { BodyReference, Feature, RepetitionFeature } from '../cad/kernel.types';
import { createdBodyIds, featureBodyOutputIds, featureBodyOutputIncludes } from '../model/bodyReferences';
import { isAllFeaturePattern } from '../model/featurePatterns';
import { sameBodyReference } from '../model/bodyCommands';

export interface BodyPatternEditor {
  bodies: readonly { ref: BodyReference; name: string }[];
  existing: boolean;
  picking: boolean;
  loading: boolean;
  onSelection: (references: BodyReference[]) => void;
  onPicking: (picking: boolean) => void;
  message?: string;
}

const key = (reference: BodyReference) => JSON.stringify([reference.bodyId, reference.sourceFeatureId]);

export interface BodyPatternHistoryChoice {
  ref: BodyReference;
  name: string;
  unavailable: boolean;
}

export interface BodyPatternHistoryStep {
  id: string;
  name: string;
  choices: BodyPatternHistoryChoice[];
}

/** Linear passes over saved ownership; retired records never become a giant option list. */
export function bodyPatternHistoryChoices(features: readonly Feature[], selection: readonly BodyReference[]): {
  steps: BodyPatternHistoryStep[];
  selected: BodyPatternHistoryChoice[];
} {
  const selectedKeys = new Set(selection.map(key));
  const owners = new Map(features.map(feature => [feature.id, feature]));
  const creators = new Map<string, { name: string; unavailable: boolean }>();
  for (const feature of features) {
    const slots = (feature.type === 'linearPattern' || feature.type === 'circularPattern' || feature.type === 'mirror') && feature.bodyPattern?.mode === 'new'
      ? new Map(feature.bodyPattern.instances.map(slot => [slot.bodyId, slot])) : null;
    const omitted = feature.type === 'linearPattern' ? new Set(feature.skipped.map(address => address.join(',')))
      : feature.type === 'circularPattern' ? new Set(feature.skipped.map(String)) : new Set<string>();
    for (const bodyId of createdBodyIds(feature)) {
      const slot = slots?.get(bodyId);
      const position = !slot ? '' : feature.type === 'mirror' ? ' · Reflejo'
        : feature.type === 'linearPattern' ? ` · Copia ${slot.address.split(',').map(value => Number(value) + 1).join(', ')}`
          : ` · Copia ${Number(slot.address) + 1}`;
      creators.set(bodyId, { name: `${feature.name}${position}`,
        unavailable: feature.suppressed || slot?.retired === true || !!slot && omitted.has(slot.address) });
    }
  }
  const selectedChoices = new Map<string, BodyPatternHistoryChoice>();
  const steps: BodyPatternHistoryStep[] = [];
  // Potential current membership is advanced once. ALL never expands every
  // retired/consumed creation in the saved ledger into ordinary UI options.
  const possibleCurrent = new Set<string>();
  for (const owner of features) {
    const choices: BodyPatternHistoryChoice[] = [];
    const all = (owner.type === 'linearPattern' || owner.type === 'circularPattern' || owner.type === 'mirror')
      && owner.featurePattern && isAllFeaturePattern(owner.featurePattern);
    const outputs = all ? new Set(possibleCurrent) : new Set(featureBodyOutputIds(owner));
    if (all) for (const reference of selection) {
      if (reference.sourceFeatureId === owner.id && featureBodyOutputIncludes(owner, reference.bodyId, features)) outputs.add(reference.bodyId);
    }
    for (const bodyId of outputs) {
      const ref = { bodyId, sourceFeatureId: owner.id }, referenceKey = key(ref), creator = creators.get(bodyId);
      const unavailable = owner.suppressed || !creator || creator.unavailable || !!all && !possibleCurrent.has(bodyId);
      if (unavailable && !selectedKeys.has(referenceKey)) continue;
      const choice = { ref, name: `${creator?.name ?? 'Cuerpo'} — ${owner.name}`, unavailable };
      choices.push(choice);
      if (selectedKeys.has(referenceKey)) selectedChoices.set(referenceKey, choice);
    }
    if (choices.length) steps.push({ id: owner.id, name: owner.name, choices });
    if (owner.suppressed) continue;
    if (owner.type === 'combine' && !owner.keepTools) {
      const consumed = owner.operation === 'subtract' ? owner.tools : owner.operands;
      for (const reference of consumed) possibleCurrent.delete(reference.bodyId);
    }
    for (const bodyId of createdBodyIds(owner)) if (!creators.get(bodyId)?.unavailable) possibleCurrent.add(bodyId);
  }
  return { steps, selected: selection.map(reference => selectedChoices.get(key(reference)) ?? {
    ref: { ...reference }, unavailable: true,
    name: `${creators.get(reference.bodyId)?.name ?? 'Cuerpo no disponible'} — ${owners.get(reference.sourceFeatureId)?.name ?? 'Paso no disponible'}`,
  }) };
}

export default function BodyPatternPanel({ feature, features, editor, onChange }: {
  feature: RepetitionFeature;
  features: Feature[];
  editor: BodyPatternEditor;
  onChange: (patch: Partial<Feature>) => void;
}) {
  const history = useMemo(() => feature.source.mode === 'bodies' && feature.source.scope === 'historical'
    ? bodyPatternHistoryChoices(features, feature.source.bodies) : { steps: [], selected: [] }, [features, feature.source]);
  const firstSource = feature.source.mode === 'bodies' ? feature.source.bodies[0]?.sourceFeatureId : undefined;
  const [selectedStep, setSelectedStep] = useState(firstSource ?? '');
  if (feature.source.mode !== 'bodies' || !feature.bodyPattern) return null;
  const source = feature.source, operation = feature.bodyPattern;
  const step = history.steps.find(candidate => candidate.id === selectedStep)
    ?? history.steps.find(candidate => candidate.id === firstSource) ?? history.steps.at(-1);
  const choices = source.scope === 'current' ? editor.bodies.map(body => ({ ...body, unavailable: false }))
    : step?.choices ?? [];
  const select = (reference: BodyReference, checked: boolean) => editor.onSelection(checked
    ? [...source.bodies, { ...reference }]
    : source.bodies.filter(candidate => !sameBodyReference(candidate, reference)));
  const target = operation.mode === 'merge' ? operation.target : null;
  return <div className="property-section">
    <h3>Cuerpos para repetir</h3>
    <label className="number-field"><span>Estado de las semillas</span>
      <select aria-label="Estado de los cuerpos semilla" value={source.scope} disabled={editor.loading}
        onChange={event => onChange({ source: { ...source, scope: event.target.value as 'current' | 'historical' } })}>
        <option value="current">Estado actual</option>
        <option value="historical">Paso del historial</option>
      </select>
    </label>
    {source.scope === 'historical' && <label className="number-field"><span>Paso del historial</span>
      <select aria-label="Paso del historial para cuerpos semilla" value={step?.id ?? ''} disabled={editor.loading || !history.steps.length}
        onChange={event => setSelectedStep(event.target.value)}>
        {!history.steps.length && <option value="">No hay cuerpos disponibles</option>}
        {history.steps.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
      </select>
    </label>}
    <div className="pattern-feature-list" aria-label="Cuerpos semilla">
      {choices.map(choice => {
        const checked = source.bodies.some(reference => sameBodyReference(reference, choice.ref));
        const anotherState = source.bodies.some(reference => reference.bodyId === choice.ref.bodyId && !sameBodyReference(reference, choice.ref));
        return <label key={key(choice.ref)} className="check-option">
          <input type="checkbox" aria-label={`Repetir cuerpo ${choice.name}`} checked={checked}
            disabled={editor.loading || !checked && (choice.unavailable || anotherState || source.bodies.length >= 32)}
            onChange={event => select(choice.ref, event.target.checked)} />
          <span>{choice.name}{choice.unavailable ? ' · no disponible' : ''}</span>
        </label>;
      })}
      {source.scope === 'current' && source.bodies.filter(reference => !choices.some(choice => sameBodyReference(choice.ref, reference))).map(reference =>
        <label key={key(reference)} className="check-option"><input type="checkbox" checked
          aria-label="Quitar cuerpo semilla no disponible" onChange={() => select(reference, false)} />
          Cuerpo no disponible · vuelve a seleccionarlo
        </label>)}
    </div>
    {source.scope === 'historical' && <ol className="body-operand-order" aria-label="Semillas seleccionadas del historial">
      {history.selected.map((choice, index) => <li key={key(choice.ref)}>
        <span>{choice.name}{choice.unavailable ? ' · no disponible' : ''}</span>
        <button type="button" disabled={editor.loading} aria-label={`Quitar semilla ${index + 1}: ${choice.name}`}
          onClick={() => select(choice.ref, false)}>Quitar</button>
      </li>)}
    </ol>}
    <button className="outline-button" disabled={editor.loading} aria-pressed={editor.picking}
      onClick={() => editor.onPicking(!editor.picking)}>{editor.picking ? 'Terminar selección de semillas' : 'Seleccionar semillas en la vista'}</button>
    <label className="number-field"><span>Resultado de las copias</span>
      <select aria-label="Resultado de las copias" value={operation.mode} disabled={editor.existing || editor.loading}
        onChange={event => {
          const merge = event.target.value === 'merge';
          onChange({ bodyPattern: merge ? { mode: 'merge', target: { bodyId: '', sourceFeatureId: '' } }
            : { mode: 'new', instances: [] }, ...(feature.type === 'mirror' ? { mergeBodies: merge } : {}) });
        }}>
        <option value="new">Cuerpos nuevos</option><option value="merge">Añadir a un cuerpo</option>
      </select>
    </label>
    {target && <label className="number-field"><span>Cuerpo destino</span>
      <select aria-label="Cuerpo destino de las copias" value={key(target)} disabled={editor.loading}
        onChange={event => {
          const body = editor.bodies.find(candidate => key(candidate.ref) === event.target.value);
          if (body) onChange({ bodyPattern: { mode: 'merge', target: { ...body.ref } } });
        }}>
        {!editor.bodies.some(body => sameBodyReference(body.ref, target)) && <option value={key(target)}>
          {target.bodyId ? 'Destino no disponible · vuelve a seleccionarlo' : 'Selecciona un cuerpo destino'}
        </option>}
        {editor.bodies.map(body => <option key={key(body.ref)} value={key(body.ref)}>{body.name}</option>)}
      </select>
    </label>}
    <p className="muted-small">Las semillas se conservan. {operation.mode === 'new'
      ? 'Cada copia queda como un cuerpo independiente.' : 'Solo las copias se añaden al destino seleccionado; el resultado debe quedar conectado.'}</p>
    {editor.message && <p className="muted-small" role="alert">{editor.message}</p>}
  </div>;
}
