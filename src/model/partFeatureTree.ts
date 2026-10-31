import type { Feature, SketchFeature } from '../cad/kernel.types';
import { featureSketchIds } from './featureInputs';

export interface PartFeatureTreeGroup {
  feature: Feature;
  children: SketchFeature[];
  expanded: boolean;
  forcedOpen: boolean;
}

/** A shared sketch has a separate tree occurrence beneath each consuming operation. */
export function treeOccurrenceKey(featureId: string, parentId?: string): string {
  return JSON.stringify([parentId ?? null, featureId]);
}

/** JSON escapes lone surrogates before URI encoding, preserving every valid document ID. */
export function partTreeChildrenId(featureId: string): string {
  return `part-tree-children-${encodeURIComponent(JSON.stringify(featureId))}`;
}

/** Derives presentation only; expansion and filtering never change the document or saved expansion. */
export function buildPartFeatureTree(
  features: readonly Feature[],
  expandedIds: ReadonlySet<string>,
  query: string,
): PartFeatureTreeGroup[] {
  const sketches = new Map(features.filter((feature): feature is SketchFeature => feature.type === 'sketch')
    .map(sketch => [sketch.id, sketch]));
  const consumed = new Set(features.flatMap(featureSketchIds));
  const search = query.trim().toLowerCase();
  const groups: PartFeatureTreeGroup[] = [];
  for (const feature of features) {
    if (feature.type === 'sketch' && consumed.has(feature.id)) continue;
    const inputs = [...new Set(featureSketchIds(feature))]
      .map(id => sketches.get(id))
      .filter((sketch): sketch is SketchFeature => !!sketch);
    const parentMatches = feature.name.toLowerCase().includes(search);
    const children = search && !parentMatches
      ? inputs.filter(sketch => sketch.name.toLowerCase().includes(search)) : inputs;
    if (search && !parentMatches && children.length === 0) continue;
    const forcedOpen = !!search && children.length > 0;
    groups.push({ feature, children, forcedOpen,
      expanded: children.length > 0 && (forcedOpen || expandedIds.has(feature.id)) });
  }
  return groups;
}

/** Reveals the requested occurrence when valid, otherwise every owner of an existing sketch. */
export function revealPartSketchOwners(
  features: readonly Feature[],
  sketchId: string,
  preferredOwnerId?: string,
): string[] {
  if (!features.some(feature => feature.id === sketchId && feature.type === 'sketch')) return [];
  const owners = [...new Set(features.filter(feature => featureSketchIds(feature).includes(sketchId))
    .map(feature => feature.id))];
  return preferredOwnerId !== undefined && owners.includes(preferredOwnerId) ? [preferredOwnerId] : owners;
}
