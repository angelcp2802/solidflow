import { useState } from 'react';
import type { Feature, RepetitionFeature } from '../cad/kernel.types';
import { withFeaturePatternSketchDimension } from '../model/featurePatternCommands';
import { activeFeaturePatternAddresses } from '../model/featurePatterns';
import { isRecipeSketchDimensionValue, MAX_RECIPE_SKETCH_DIMENSIONS, MAX_RECIPE_SKETCH_DIMENSIONS_PER_INSTANCE, recipeSketchDrivingDimensions } from '../model/featureRecipeSketchVariation';

const dimensionLabels = { radius: 'Radio', width: 'Anchura', height: 'Altura' } as const;

function instanceLabel(type: RepetitionFeature['type'], address: string): string {
  if (type === 'mirror') return 'Simetría';
  if (type === 'circularPattern') return `Instancia ${Number(address) + 1}`;
  return `Instancia ${address.split(',').map(index => Number(index) + 1).join(', ')}`;
}

function DimensionField({ current, loading, blocked, label, onAssign }: {
  current: number; loading: boolean; blocked: boolean; label: string; onAssign: (value: number) => void;
}) {
  const [raw, setRaw] = useState(String(current));
  const value = Number(raw), valid = isRecipeSketchDimensionValue(value);
  const canAssign = valid && !loading && !blocked;
  return <>
    <label className="number-field"><span>{label} para asignar</span><div>
      <input type="number" min={.01} max={100_000} step="any" inputMode="decimal" aria-label={`${label} del croquis de la instancia`}
        aria-invalid={!valid || undefined} value={raw} disabled={loading} onChange={event => setRaw(event.target.value)} />
      <small>mm</small>
    </div></label>
    <button type="button" className="outline-button" disabled={!canAssign}
      onClick={() => { if (canAssign) onAssign(value); }}>Asignar {label.toLowerCase()}</button>
  </>;
}

export default function FeaturePatternSketchVariation({ feature, features, loading, onChange }: {
  feature: RepetitionFeature; features: readonly Feature[]; loading: boolean; onChange: (patch: Partial<Feature>) => void;
}) {
  const [selectedAddress, setSelectedAddress] = useState('');
  const [selectedConstraint, setSelectedConstraint] = useState('');
  const operation = feature.featurePattern;
  if (operation?.mode !== 'regenerate' || operation.scope !== 'selected' || feature.source.mode !== 'features') return null;
  if (operation.variation.kind === 'dimensions') return null;
  const rows = operation.variation.kind === 'sketchDimensions' ? operation.variation.values : [];
  const seedId = feature.source.featureIds.length === 1 ? feature.source.featureIds[0] : undefined;
  const seed = features.find(item => item.id === seedId);
  const sketch = seed?.type === 'cut' || seed?.type === 'extrude' ? features.find(item => item.id === seed.sketchId) : undefined;
  const drivers = recipeSketchDrivingDimensions(seed, sketch);
  if (!drivers.length && !rows.length) return null;
  let addresses: string[] = [];
  try { addresses = activeFeaturePatternAddresses(feature); }
  catch { /* Retain unavailable saved rows so the user can remove them. */ }
  const address = addresses.includes(selectedAddress) ? selectedAddress : addresses[0];
  const driver = drivers.find(item => item.constraintId === selectedConstraint) ?? drivers[0];
  const radiusOnly = driver?.parameter === 'radius';
  const instanceRows = rows.filter(row => row.address === address);
  const assigned = instanceRows.find(row => row.constraintId === driver?.constraintId);
  const stale = !!assigned && assigned.sketchId !== sketch?.id;
  const current = assigned && !stale ? assigned.value : driver?.value;
  const full = !assigned && (rows.length >= MAX_RECIPE_SKETCH_DIMENSIONS
    || instanceRows.length >= MAX_RECIPE_SKETCH_DIMENSIONS_PER_INSTANCE);
  const edit = (key: string, constraintId: string, value: number | null) => {
    if (!loading) onChange({ featurePattern: withFeaturePatternSketchDimension(feature, features, key, constraintId, value).featurePattern });
  };
  return <div className="property-section">
    <h3>{radiusOnly ? 'Radios del croquis por instancia' : 'Cotas del croquis por instancia'}</h3>
    {driver && <p className="muted-small">{radiusOnly
      ? 'Las copias sin radio asignado usan el de la semilla. El centro del círculo se mantiene fijo.'
      : 'Cada copia usa las cotas de la semilla salvo las que asignes aquí. La esquina de anclaje se mantiene fija.'}</p>}
    {driver && address && current !== undefined && <>
      <label className="number-field"><span>Instancia</span>
        <select aria-label={radiusOnly ? 'Instancia para variar su radio' : 'Instancia para variar sus cotas'} disabled={loading} value={address}
          onChange={event => setSelectedAddress(event.target.value)}>
          {addresses.map(key => <option key={key} value={key}>{instanceLabel(feature.type, key)}</option>)}
        </select>
      </label>
      {drivers.length > 1 && <label className="number-field"><span>Cota</span>
        <select aria-label="Cota del croquis para variar" disabled={loading} value={driver.constraintId}
          onChange={event => setSelectedConstraint(event.target.value)}>
          {drivers.map(item => <option key={item.constraintId} value={item.constraintId}>{dimensionLabels[item.parameter]}</option>)}
        </select>
      </label>}
      <DimensionField key={JSON.stringify([feature.id, sketch?.id, driver.constraintId, address, current])} current={current}
        loading={loading} blocked={full || stale} label={dimensionLabels[driver.parameter]} onAssign={value => edit(address, driver.constraintId, value)} />
      {full && <p className="muted-small">Quita una cota asignada antes de añadir otra.</p>}
      {stale && <p className="muted-small">Quita la cota no disponible antes de asignarla al croquis actual.</p>}
    </>}
    {rows.length > 0 && <ol className="body-operand-order" aria-label={radiusOnly ? 'Radios asignados' : 'Cotas asignadas'}>
      {rows.map(row => {
        const instance = instanceLabel(feature.type, row.address);
        const rowDriver = row.sketchId === sketch?.id ? drivers.find(item => item.constraintId === row.constraintId) : undefined;
        const dimension = rowDriver ? dimensionLabels[rowDriver.parameter] : 'Cota';
        const available = !!rowDriver && addresses.includes(row.address);
        return <li key={JSON.stringify([row.address, row.constraintId])}>
          <span>{instance}{rowDriver?.parameter === 'radius' ? '' : ` · ${dimension}`} · {row.value} mm{available ? '' : ' · no disponible'}</span>
          <button type="button" disabled={loading}
            aria-label={`Quitar ${dimension.toLowerCase()} de ${instance}${rowDriver ? '' : ` (${row.constraintId})`}`}
            onClick={() => edit(row.address, row.constraintId, null)}>Quitar</button>
        </li>;
      })}
    </ol>}
  </div>;
}
