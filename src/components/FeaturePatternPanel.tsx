import { useMemo, useState } from 'react';
import type { BodyReference, Feature, RepetitionFeature } from '../cad/kernel.types';
import { sameBodyReference } from '../model/bodyCommands';
import { withFeaturePatternBindings } from '../model/featurePatternCommands';
import { MAX_FEATURE_PATTERN_CONTRIBUTIONS, MAX_FEATURE_PATTERN_TARGETS } from '../model/featurePatterns';
import { bodyPatternHistoryChoices, type BodyPatternEditor } from './BodyPatternPanel';

const key = (reference: BodyReference) => JSON.stringify([reference.bodyId, reference.sourceFeatureId]);
const PAGE_SIZE = 64;

export default function FeaturePatternPanel({ feature, features, editor, onChange }: {
  feature: RepetitionFeature;
  features: readonly Feature[];
  editor: BodyPatternEditor;
  onChange: (patch: Partial<Feature>) => void;
}) {
  const operation = feature.featurePattern;
  const history = useMemo(() => bodyPatternHistoryChoices(features, operation?.bindings.map(binding => binding.source) ?? []),
    [features, operation?.bindings]);
  const [selectedStep, setSelectedStep] = useState(operation?.bindings[0]?.source.sourceFeatureId ?? '');
  const [choicePage, setChoicePage] = useState(0);
  if (feature.source.mode !== 'features' || !operation) return null;
  const steps = history.steps.filter(step => feature.source.mode === 'features' && feature.source.featureIds.includes(step.id));
  const step = steps.find(candidate => candidate.id === selectedStep) ?? steps[0];
  const choices = step?.choices ?? [];
  const pages = Math.max(1, Math.ceil(choices.length / PAGE_SIZE));
  const page = Math.min(choicePage, pages - 1);
  const displayed = choices.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const changeBindings = (bindings: typeof operation.bindings) =>
    onChange({ featurePattern: withFeaturePatternBindings(feature, bindings).featurePattern });
  const selectGeometry = (reference: BodyReference, checked: boolean) => changeBindings(checked
    ? [...operation.bindings, { source: { ...reference }, targetBodyIds: operation.targets.map(target => target.bodyId) }]
    : operation.bindings.filter(binding => !sameBodyReference(binding.source, reference)));
  const selectTarget = (reference: BodyReference, checked: boolean) => editor.onSelection(checked
    ? [...operation.targets, { ...reference }]
    : operation.targets.filter(target => !sameBodyReference(target, reference)));
  const targetName = (reference: BodyReference) => editor.bodies.find(body => sameBodyReference(body.ref, reference))?.name ?? 'Destino no disponible';
  return <>
    <div className="property-section">
      <h3>Geometría de las operaciones</h3>
      <label className="number-field"><span>Operación seleccionada</span>
        <select aria-label="Operación para seleccionar su geometría" value={step?.id ?? ''} disabled={editor.loading || !steps.length}
          onChange={event => { setSelectedStep(event.target.value); setChoicePage(0); }}>
          {!steps.length && <option value="">Selecciona una operación con cuerpos</option>}
          {steps.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
        </select>
      </label>
      <div className="pattern-feature-list" aria-label="Resultados de la operación para repetir">
        {displayed.map(choice => {
          const checked = operation.bindings.some(binding => sameBodyReference(binding.source, choice.ref));
          return <label key={key(choice.ref)} className="check-option">
            <input type="checkbox" checked={checked} aria-label={`Repetir geometría de ${choice.name}`}
              disabled={editor.loading || !checked && (choice.unavailable || operation.bindings.length >= MAX_FEATURE_PATTERN_CONTRIBUTIONS)}
              onChange={event => selectGeometry(choice.ref, event.target.checked)} />
            <span>{choice.name}{choice.unavailable ? ' · no disponible' : ''}</span>
          </label>;
        })}
      </div>
      {pages > 1 && <div className="pattern-direction-presets" aria-label="Páginas de resultados de la operación">
        <button type="button" disabled={page === 0} aria-label="Página anterior de geometrías" onClick={() => setChoicePage(page - 1)}>Anterior</button>
        <span>{page + 1} / {pages}</span>
        <button type="button" disabled={page + 1 === pages} aria-label="Página siguiente de geometrías" onClick={() => setChoicePage(page + 1)}>Siguiente</button>
      </div>}
      <p className="muted-small">Elige los resultados cuya geometría quieres repetir. La vista previa comprobará qué estados del historial están disponibles.</p>
      <ol className="body-operand-order" aria-label="Geometrías seleccionadas para repetir">
        {operation.bindings.map((binding, index) => {
          const choice = history.selected[index];
          const name = choice?.name ?? 'Geometría no disponible';
          return <li key={key(binding.source)}>
            <span>{name}{choice?.unavailable ? ' · no disponible' : ''}</span>
            <button type="button" disabled={editor.loading} aria-label={`Quitar geometría ${index + 1}: ${name}`}
              onClick={() => selectGeometry(binding.source, false)}>Quitar</button>
            <details>
              <summary>Destinos de esta geometría</summary>
              <div className="pattern-feature-list">
                {operation.targets.map(target => <label key={key(target)} className="check-option">
                  <input type="checkbox" checked={binding.targetBodyIds.includes(target.bodyId)} disabled={editor.loading}
                    aria-label={`Aplicar ${name} a ${targetName(target)}`}
                    onChange={event => changeBindings(operation.bindings.map((candidate, candidateIndex) => candidateIndex !== index ? candidate : {
                      source: { ...candidate.source }, targetBodyIds: event.target.checked
                        ? [...candidate.targetBodyIds, target.bodyId]
                        : candidate.targetBodyIds.filter(bodyId => bodyId !== target.bodyId),
                    }))} />
                  <span>{targetName(target)}</span>
                </label>)}
              </div>
            </details>
          </li>;
        })}
      </ol>
    </div>
    <div className="property-section">
      <h3>Cuerpos destino</h3>
      <div className="pattern-feature-list" aria-label="Cuerpos destino de la repetición de operaciones">
        {editor.bodies.map(body => {
          const checked = operation.targets.some(target => sameBodyReference(target, body.ref));
          return <label key={key(body.ref)} className="check-option">
            <input type="checkbox" checked={checked} aria-label={`Aplicar repetición a ${body.name}`}
              disabled={editor.loading || !checked && operation.targets.length >= MAX_FEATURE_PATTERN_TARGETS}
              onChange={event => selectTarget(body.ref, event.target.checked)} />
            <span>{body.name}</span>
          </label>;
        })}
        {operation.targets.filter(target => !editor.bodies.some(body => sameBodyReference(body.ref, target))).map(target =>
          <label key={key(target)} className="check-option">
            <input type="checkbox" checked disabled={editor.loading} aria-label="Quitar destino no disponible de la repetición"
              onChange={() => selectTarget(target, false)} />
            Destino no disponible · vuelve a seleccionarlo
          </label>)}
      </div>
      <button type="button" className="outline-button" disabled={editor.loading} aria-pressed={editor.picking}
        onClick={() => editor.onPicking(!editor.picking)}>{editor.picking ? 'Terminar selección de destinos' : 'Seleccionar destinos en la vista'}</button>
      <p className="muted-small">Solo se modifica el material de los destinos seleccionados. Los cuerpos que no cambien conservan su estado.</p>
      {editor.message && <p className="muted-small" role="alert">{editor.message}</p>}
    </div>
  </>;
}
