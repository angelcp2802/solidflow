import { useState } from 'react';
import type { Feature, RepetitionFeature } from '../cad/kernel.types';
import { withFeaturePatternInstanceDepth } from '../model/featurePatternCommands';
import { activeFeaturePatternAddresses } from '../model/featurePatterns';
import { isRecipeInstanceDepth, isRecipeInstanceDepthSeed } from '../model/featureRecipeDepthVariation';

function labelFor(type: RepetitionFeature['type'], address: string): string {
  if (type === 'mirror') return 'Simetría';
  if (type === 'circularPattern') return `Instancia ${Number(address) + 1}`;
  return `Instancia ${address.split(',').map(index => Number(index) + 1).join(', ')}`;
}

function DepthField({ current, loading, onAssign }: { current: number; loading: boolean; onAssign: (value: number) => void }) {
  const [raw, setRaw] = useState(String(current));
  const value = Number(raw);
  const valid = value > 0 && isRecipeInstanceDepth(value);
  return <>
    <label className="number-field"><span>Profundidad para asignar</span><div>
      <input type="number" min={.01} max={100_000} step="any" inputMode="decimal" aria-label="Profundidad de la instancia"
        aria-invalid={!valid || undefined} value={raw} disabled={loading} onChange={event => setRaw(event.target.value)} />
      <small>mm</small>
    </div></label>
    <button type="button" className="outline-button" disabled={loading || !valid}
      onClick={() => { if (valid && !loading) onAssign(value); }}>Asignar profundidad</button>
  </>;
}

export default function FeaturePatternDepthVariation({ feature, features, loading, onChange }: {
  feature: RepetitionFeature;
  features: readonly Feature[];
  loading: boolean;
  onChange: (patch: Partial<Feature>) => void;
}) {
  const [selectedAddress, setSelectedAddress] = useState('');
  const operation = feature.featurePattern;
  if (operation?.mode !== 'regenerate' || operation.scope !== 'selected' || feature.source.mode !== 'features') return null;
  if (operation.variation.kind === 'sketchDimensions') return null;
  const rows = operation.variation.kind === 'dimensions' ? operation.variation.values : [];
  const seedId = feature.source.featureIds.length === 1 ? feature.source.featureIds[0] : undefined;
  const seed = seedId ? features.find(item => item.id === seedId) : undefined;
  const source = seed?.type === 'cut' || seed?.type === 'extrude' ? seed : undefined;
  const sketch = source ? features.find(item => item.id === source.sketchId) : undefined;
  const eligible = source !== undefined && isRecipeInstanceDepthSeed(source, sketch);
  if (!eligible && !rows.length) return null;
  let addresses: string[] = [];
  try { addresses = activeFeaturePatternAddresses(feature); }
  catch { /* Keep existing rows removable while placement controls are invalid. */ }
  const address = addresses.includes(selectedAddress) ? selectedAddress : addresses[0];
  const originalDepth = rows.find(row => row.address === address)?.value ?? source?.depth;
  const edit = (key: string, value: number | null) => {
    if (!loading) onChange({ featurePattern: withFeaturePatternInstanceDepth(feature, key, value).featurePattern });
  };
  return <div className="property-section">
    <h3>Profundidades por instancia</h3>
    <p className="muted-small">Las copias sin profundidad asignada usan la de la semilla. Todas conservan su sentido.</p>
    {eligible && address && originalDepth !== undefined && <>
      <label className="number-field"><span>Instancia</span>
        <select aria-label="Instancia para variar su profundidad" disabled={loading} value={address}
          onChange={event => setSelectedAddress(event.target.value)}>
          {addresses.map(key => <option key={key} value={key}>{labelFor(feature.type, key)}</option>)}
        </select>
      </label>
      <DepthField key={JSON.stringify([feature.id, source.id, address, originalDepth])} current={Math.abs(originalDepth)} loading={loading}
        onAssign={depth => edit(address, Math.sign(source.depth) * depth)} />
    </>}
    {rows.length > 0 && <ol className="body-operand-order" aria-label="Profundidades asignadas">
      {rows.map(row => {
        const label = labelFor(feature.type, row.address);
        const available = eligible && addresses.includes(row.address) && Math.sign(row.value) === Math.sign(source.depth);
        return <li key={row.address}><span>{label} · {Math.abs(row.value)} mm{available ? '' : ' · no disponible'}</span>
          <button type="button" disabled={loading} aria-label={`Quitar profundidad de ${label}`}
            onClick={() => edit(row.address, null)}>Quitar</button>
        </li>;
      })}
    </ol>}
  </div>;
}
