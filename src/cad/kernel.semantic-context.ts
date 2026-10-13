import type { Feature, PlaneSupport } from './kernel.types';
import {
  SEMANTIC_PRISM_LIMITS, type EntityPrismContextV2, type PrismHistoryEntryV2,
} from './kernel.semantic-references';

/**
 * The identity history is the ordered dependency closure of this producer,
 * not the complete document. Unrelated features and continuous placements must
 * not become identity inputs. Unsupported ancestry explicitly keeps legacy
 * construction; this function does not infer a different generating source.
 */
export function entityPrismContextFromFeatures(
  features: readonly Feature[], sourceFeatureId: string,
): EntityPrismContextV2 | undefined {
  const sourceIndex = features.findIndex(feature => feature.id === sourceFeatureId);
  const source = features[sourceIndex];
  if (!source || source.type !== 'extrude' || source.suppressed || source.endCondition ||
      !Number.isFinite(source.depth) || source.depth === 0) return undefined;
  const previous = new Map<string, { feature: Feature; index: number }>();
  for (let index = 0; index <= sourceIndex; index++) {
    const feature = features[index];
    if (previous.has(feature.id)) return undefined;
    previous.set(feature.id, { feature, index });
  }
  const required = new Set<string>();
  const supportSource = (support: PlaneSupport): string | undefined =>
    support.kind === 'plane' ? support.planeId : support.kind === 'face' ? support.face.sourceFeatureId : undefined;
  const visit = (id: string, before: number): boolean => {
    const record = previous.get(id);
    if (!record || record.index >= before) return false;
    if (required.has(id)) return true;
    const feature = record.feature;
    if (feature.type !== 'plane' && feature.type !== 'sketch' && feature.type !== 'extrude') return false;
    if (feature.type === 'extrude' && (feature.endCondition || (feature.id !== sourceFeatureId && !feature.suppressed))) return false;
    required.add(id);
    if (required.size > SEMANTIC_PRISM_LIMITS.maxHistory) return false;
    const dependency = feature.type === 'extrude' ? feature.sketchId
      : feature.type === 'plane' ? supportSource(feature.support)
        : feature.type === 'sketch' && feature.support ? supportSource(feature.support) : undefined;
    return dependency === undefined || visit(dependency, record.index);
  };
  if (!visit(sourceFeatureId, sourceIndex + 1)) return undefined;
  const history: PrismHistoryEntryV2[] = [];
  for (let index = 0; index <= sourceIndex; index++) {
    const feature = features[index];
    if (!required.has(feature.id)) continue;
    if (feature.type === 'plane') history.push({ id: feature.id, type: feature.type, suppressed: feature.suppressed,
      support: structuredClone(feature.support), reversed: feature.reversed });
    else if (feature.type === 'sketch') history.push({ id: feature.id, type: feature.type, suppressed: feature.suppressed,
      plane: feature.plane, ...(feature.support ? { support: structuredClone(feature.support) } : {}) });
    else if (feature.type === 'extrude') history.push({ id: feature.id, type: feature.type, suppressed: feature.suppressed,
      sketchId: feature.sketchId, symmetric: feature.symmetric, direction: feature.depth > 0 ? 'positive' : 'negative' });
  }
  return { sourceFeatureId, sketchFeatureId: source.sketchId, history };
}
