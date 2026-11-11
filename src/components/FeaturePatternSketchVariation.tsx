import { useState } from 'react';
import type { Feature, RepetitionFeature } from '../cad/kernel.types';
import { withFeaturePatternSketchRadius } from '../model/featurePatternCommands';
import { activeFeaturePatternAddresses } from '../model/featurePatterns';
import { isRecipeSketchRadius, recipeCircleDrivingRadius } from '../model/featureRecipeSketchVariation';

function instanceLabel(type: RepetitionFeature['type'], address: string): string {
  if (type === 'mirror') return 'Simetría';
  if (type === 'circularPattern') return `Instancia ${Number(address) + 1}`;
  return `Instancia ${address.split(',').map(index => Number(index) + 1).join(', ')}`;
}

function RadiusField({ current, loading, onAssign }: { current: number; loading: boolean; onAssign: (value: number) => void }) {
  const [raw, setRaw] = useState(String(current));
  const value = Number(raw), valid = isRecipeSketchRadius(value);
  return <>
    <label className="number-field"><span>Radio para asignar</span><div>
      <input type="number" min={.01} max={100_000} step="any" inputMode="decimal" aria-label="Radio del croquis de la instancia"
        aria-invalid={!valid || undefined} value={raw} disabled={loading} onChange={event => setRaw(event.target.value)} />
      <small>mm</small>
    </div></label>
    <button type="button" className="outline-button" disabled={loading || !valid}
      onClick={() => { if (valid && !loading) onAssign(value); }}>Asignar radio</button>
  </>;
}

export default function FeaturePatternSketchVariation({ feature, features, loading, onChange }: {
  feature: RepetitionFeature; features: readonly Feature[]; loading: boolean; onChange: (patch: Partial<Feature>) => void;
}) {
  const [selectedAddress, setSelectedAddress] = useState('');
  const operation = feature.featurePattern;
  if (operation?.mode !== 'regenerate' || operation.scope !== 'selected' || feature.source.mode !== 'features') return null;
  if (operation.variation.kind === 'dimensions') return null;
  const rows = operation.variation.kind === 'sketchDimensions' ? operation.variation.values : [];
  const seedId = feature.source.featureIds.length === 1 ? feature.source.featureIds[0] : undefined;
  const seed = features.find(item => item.id === seedId);
  const sketch = seed?.type === 'cut' ? features.find(item => item.id === seed.sketchId) : undefined;
  const radius = recipeCircleDrivingRadius(seed, sketch);
  if (!radius && !rows.length) return null;
  let addresses: string[] = [];
  try { addresses = activeFeaturePatternAddresses(feature); }
  catch { /* Retain unavailable saved rows so the user can remove them. */ }
  const address = addresses.includes(selectedAddress) ? selectedAddress : addresses[0];
  const current = rows.find(row => row.address === address)?.value ?? radius?.value;
  const edit = (key: string, value: number | null) => {
    if (!loading) onChange({ featurePattern: withFeaturePatternSketchRadius(feature, features, key, value).featurePattern });
  };
  return <div className="property-section">
    <h3>Radios del croquis por instancia</h3>
    <p className="muted-small">Las copias sin radio asignado usan el de la semilla. El centro del círculo se mantiene fijo.</p>
    {radius && address && current !== undefined && <>
      <label className="number-field"><span>Instancia</span>
        <select aria-label="Instancia para variar su radio" disabled={loading} value={address}
          onChange={event => setSelectedAddress(event.target.value)}>
          {addresses.map(key => <option key={key} value={key}>{instanceLabel(feature.type, key)}</option>)}
        </select>
      </label>
      <RadiusField key={JSON.stringify([feature.id, sketch?.id, radius.constraintId, address, current])} current={current} loading={loading}
        onAssign={value => edit(address, value)} />
    </>}
    {rows.length > 0 && <ol className="body-operand-order" aria-label="Radios asignados">
      {rows.map(row => {
        const label = instanceLabel(feature.type, row.address);
        const available = !!radius && row.sketchId === sketch?.id && row.constraintId === radius.constraintId && addresses.includes(row.address);
        return <li key={row.address}><span>{label} · {row.value} mm{available ? '' : ' · no disponible'}</span>
          <button type="button" disabled={loading} aria-label={`Quitar radio de ${label}`} onClick={() => edit(row.address, null)}>Quitar</button>
        </li>;
      })}
    </ol>}
  </div>;
}
