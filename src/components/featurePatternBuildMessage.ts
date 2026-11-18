import { principalRecipeDatumChain } from '../model/recipeDatumChain';
import { isBodyCatalogFaceKey } from '../cad/kernel.semantic-references';
import type { Feature, FeatureError, RepetitionFeature } from '../cad/kernel.types';

const firstLimit = 'endCondition.target';
const secondLimit = 'secondDirection.endCondition.target';
type LimitPath = typeof firstLimit | typeof secondLimit;

const missingPolicy = 'An external/internal support needs a saved remap policy; no world/latest/nearest default.';
const missingLimits = [
  { path: firstLimit, direction: 1, suffix: `:${firstLimit}: ${missingPolicy}` },
  { path: secondLimit, direction: 2, suffix: `:${secondLimit}: ${missingPolicy}` },
] as const;

export function featurePatternWorldLimitLabel(seedName: string, path: LimitPath): string {
  return `Mantener el plano límite${path === secondLimit ? ' de dirección 2' : ''} de ${seedName}`;
}

/** The worker DTO retains its raw message. Only guide a current, offered checkbox. */
export function featurePatternBuildMessage(diagnostic: FeatureError, pattern: RepetitionFeature, prefix: readonly Feature[]): string {
  const operation = pattern.featurePattern;
  const { message } = diagnostic;
  if (diagnostic.id !== pattern.id || pattern.source.mode !== 'features' || operation?.mode !== 'regenerate') return message;
  const limit = missingLimits.find(({ suffix }) => message.endsWith(suffix));
  if (!limit) return message;
  const seedId = message.slice(0, -limit.suffix.length);
  if (!pattern.source.featureIds.includes(seedId)
    || operation.referencePolicies.some(policy => policy.featureId === seedId && policy.path === limit.path)) return message;
  const seed = prefix.find(feature => feature.id === seedId);
  if (!seed || seed.suppressed || seed.type !== 'extrude' && seed.type !== 'cut') return message;
  const second = seed.secondDirection;
  const end = limit.path === firstLimit ? seed.endCondition : second?.enabled ? second.endCondition : undefined;
  if (end?.kind !== 'upToSurface') return message;
  if (end.target.kind === 'face' && isBodyCatalogFaceKey(end.target.face.key) && !pattern.source.featureIds.includes(end.target.face.sourceFeatureId)) return `Para recalcular la dirección ${limit.direction}, selecciona el cuerpo histórico de la cara límite de ${seed.name}.`;
  if (end.target.kind === 'plane') {
    const planes = new Map(prefix.filter(item => item.type === 'plane').map(item => [item.id, item]));
    if (principalRecipeDatumChain(end.target.planeId, id => planes.get(id))) return `Para recalcular la dirección ${limit.direction}, elige si el plano límite de ${seed.name} se mantiene fijo o se transforma con cada copia.`;
  }
  if (end.target.kind !== 'principal') return message;
  const label = featurePatternWorldLimitLabel(seed.name, limit.path);
  return `Para recalcular la dirección ${limit.direction} hasta el plano ${end.target.plane}, activa «${label}» en «Planos límite».`;
}
