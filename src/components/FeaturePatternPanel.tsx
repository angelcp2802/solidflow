import { useMemo, useState } from 'react';
import type { BodyReference, Feature, RepetitionFeature } from '../cad/kernel.types';
import { sameBodyReference } from '../model/bodyCommands';
import { withFeaturePatternBindings, withFeaturePatternWorldLimit } from '../model/featurePatternCommands';
import { isAllFeaturePattern, MAX_FEATURE_PATTERN_CONTRIBUTIONS, MAX_FEATURE_PATTERN_TARGETS, type AnyFeaturePatternBinding } from '../model/featurePatterns';
import { bodyPatternHistoryChoices, type BodyPatternEditor } from './BodyPatternPanel';

const key = (reference: BodyReference) => JSON.stringify([reference.bodyId, reference.sourceFeatureId]);
const PAGE_SIZE = 64;

export function FeaturePatternWorldLimits({ feature, features, loading, onChange }: {
  feature: RepetitionFeature; features: readonly Feature[]; loading: boolean; onChange: (patch: Partial<Feature>) => void;
}) {
  const operation = feature.featurePattern;
  if (feature.source.mode !== 'features' || operation?.mode !== 'regenerate') return null;
  const selected = new Set(feature.source.featureIds);
  const worldLimits = features.flatMap(source => {
    if (!selected.has(source.id) || source.suppressed || source.type !== 'extrude' && source.type !== 'cut') return [];
    const ends = [{ end: source.endCondition, path: 'endCondition.target' as const },
      { end: source.secondDirection?.endCondition, path: 'secondDirection.endCondition.target' as const }];
    return ends.flatMap(({ end, path }) => end?.kind === 'upToSurface' && end.target.kind === 'principal' ? [{ source, path }] : []);
  });
  const staleLimits = operation.referencePolicies.filter(policy => !worldLimits.some(limit => limit.source.id === policy.featureId && limit.path === policy.path));
  if (!worldLimits.length && !staleLimits.length) return null;
  return <div className="property-section">
    <h3>Planos límite</h3>
    {worldLimits.map(({ source, path }) => {
      const second = path === 'secondDirection.endCondition.target';
      return <label key={JSON.stringify([source.id, path])} className="check-option">
        <input type="checkbox" disabled={loading}
          aria-label={second ? `Mantener plano límite fijo de dirección 2 de ${source.name}` : `Mantener plano límite fijo de ${source.name}`}
          checked={operation.referencePolicies.some(policy => policy.featureId === source.id && policy.path === path)}
          onChange={event => { if (!loading) onChange({ featurePattern: withFeaturePatternWorldLimit(feature, source.id, event.target.checked, path).featurePattern }); }} />
        <span>{second ? `Mantener el plano límite de dirección 2 de ${source.name}` : `Mantener el plano límite de ${source.name}`}</span>
      </label>;
    })}
    {staleLimits.map(policy => <label key={JSON.stringify([policy.featureId, policy.path])} className="check-option">
      <input type="checkbox" checked disabled={loading}
        aria-label={policy.path === 'secondDirection.endCondition.target' ? 'Quitar plano límite no disponible de dirección 2' : 'Quitar plano límite no disponible'}
        onChange={() => { if (!loading) onChange({ featurePattern: withFeaturePatternWorldLimit(feature, policy.featureId, false, policy.path).featurePattern }); }} />
      <span>Plano límite no disponible{policy.path === 'secondDirection.endCondition.target' ? ' de dirección 2' : ''} · quitar</span>
    </label>)}
    <p className="muted-small">Cada copia termina en el mismo plano principal. Su profundidad se recalcula desde la posición de la copia.</p>
  </div>;
}

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
  const [targetPage, setTargetPage] = useState(0);
  if (feature.source.mode !== 'features' || !operation) return null;
  const selectedOperation = isAllFeaturePattern(operation) ? null : operation;
  const targetPages = Math.max(1, Math.ceil(editor.bodies.length / PAGE_SIZE));
  const currentTargetPage = Math.min(targetPage, targetPages - 1);
  const steps = history.steps.filter(step => feature.source.mode === 'features' && feature.source.featureIds.includes(step.id));
  const step = steps.find(candidate => candidate.id === selectedStep) ?? steps[0];
  const choices = step?.choices ?? [];
  const pages = Math.max(1, Math.ceil(choices.length / PAGE_SIZE));
  const page = Math.min(choicePage, pages - 1);
  const displayed = choices.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const changeBindings = (bindings: readonly AnyFeaturePatternBinding[]) =>
    onChange({ featurePattern: withFeaturePatternBindings(feature, bindings).featurePattern });
  const selectGeometry = (reference: BodyReference, checked: boolean) => changeBindings(checked
    ? [...operation.bindings, selectedOperation
      ? { source: { ...reference }, targetBodyIds: selectedOperation.targets.map(target => target.bodyId) }
      : { source: { ...reference }, targetBodyIds: 'scope' as const }]
    : operation.bindings.filter(binding => !sameBodyReference(binding.source, reference)));
  const selectTarget = (reference: BodyReference, checked: boolean) => {
    if (!selectedOperation) return;
    editor.onSelection(checked ? [...selectedOperation.targets, { ...reference }]
      : selectedOperation.targets.filter(target => !sameBodyReference(target, reference)));
  };
  const targetName = (reference: BodyReference) => editor.bodies.find(body => sameBodyReference(body.ref, reference))?.name ?? 'Destino no disponible';
  return <>
    <FeaturePatternWorldLimits feature={feature} features={features} loading={editor.loading} onChange={onChange} />
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
            {selectedOperation && <details>
              <summary>Destinos de esta geometría</summary>
              <div className="pattern-feature-list">
                {selectedOperation.targets.map(target => <label key={key(target)} className="check-option">
                  <input type="checkbox" checked={Array.isArray(binding.targetBodyIds) && binding.targetBodyIds.includes(target.bodyId)} disabled={editor.loading}
                    aria-label={`Aplicar ${name} a ${targetName(target)}`}
                    onChange={event => changeBindings(operation.bindings.map((candidate, candidateIndex) => candidateIndex !== index ? candidate : {
                      source: { ...candidate.source }, targetBodyIds: event.target.checked
                        ? [...(Array.isArray(candidate.targetBodyIds) ? candidate.targetBodyIds : []), target.bodyId]
                        : (Array.isArray(candidate.targetBodyIds) ? candidate.targetBodyIds : []).filter(bodyId => bodyId !== target.bodyId),
                    }))} />
                  <span>{targetName(target)}</span>
                </label>)}
              </div>
            </details>}
            {!selectedOperation && <span> · Todos los cuerpos actuales al recalcular</span>}
          </li>;
        })}
      </ol>
    </div>
    <div className="property-section">
      <h3>Cuerpos destino</h3>
      {selectedOperation ? <><div className="pattern-feature-list" aria-label="Cuerpos destino de la repetición de operaciones">
        {editor.bodies.map(body => {
          const checked = selectedOperation.targets.some(target => sameBodyReference(target, body.ref));
          return <label key={key(body.ref)} className="check-option">
            <input type="checkbox" checked={checked} aria-label={`Aplicar repetición a ${body.name}`}
              disabled={editor.loading || !checked && selectedOperation.targets.length >= MAX_FEATURE_PATTERN_TARGETS}
              onChange={event => selectTarget(body.ref, event.target.checked)} />
            <span>{body.name}</span>
          </label>;
        })}
        {selectedOperation.targets.filter(target => !editor.bodies.some(body => sameBodyReference(body.ref, target))).map(target =>
          <label key={key(target)} className="check-option">
            <input type="checkbox" checked disabled={editor.loading} aria-label="Quitar destino no disponible de la repetición"
              onChange={() => selectTarget(target, false)} />
            Destino no disponible · vuelve a seleccionarlo
          </label>)}
      </div>
      <button type="button" className="outline-button" disabled={editor.loading} aria-pressed={editor.picking}
        onClick={() => editor.onPicking(!editor.picking)}>{editor.picking ? 'Terminar selección de destinos' : 'Seleccionar destinos en la vista'}</button>
      <p className="muted-small">Solo se modifica el material de los destinos seleccionados. Los cuerpos que no cambien conservan su estado.</p>
      </> : <>
        <p className="muted-small">Todos los cuerpos actuales se vuelven a resolver al recalcular. Esta selección no se guarda como una lista fija. Los cuerpos sin cambio conservan su estado.</p>
        <ul aria-label="Catálogo actual para el alcance todos los cuerpos">
          {editor.bodies.slice(currentTargetPage * PAGE_SIZE, (currentTargetPage + 1) * PAGE_SIZE).map(body => <li key={key(body.ref)}>{body.name}</li>)}
        </ul>
        {targetPages > 1 && <div className="pattern-direction-presets" aria-label="Páginas del catálogo actual">
          <button type="button" disabled={editor.loading || currentTargetPage === 0} onClick={() => setTargetPage(currentTargetPage - 1)}>Anterior</button>
          <span>{currentTargetPage + 1} / {targetPages}</span>
          <button type="button" disabled={editor.loading || currentTargetPage + 1 === targetPages} onClick={() => setTargetPage(currentTargetPage + 1)}>Siguiente</button>
        </div>}
        <p className="muted-small">El alcance dinámico actual admite cortes. Los salientes con todos los cuerpos siguen pendientes.</p>
      </>}
      {editor.message && <p className="muted-small" role="alert">{editor.message}</p>}
    </div>
  </>;
}
