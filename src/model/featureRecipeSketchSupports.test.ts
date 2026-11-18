import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import type { Feature, RepetitionFeature } from '../cad/kernel.types';
import { validateFeaturePatternDeclaration } from './featurePatterns';
import { parseDocument, serializeDocument, updateFeature, validateDocument } from './document';
import { principalRecipeDatumChain, transformedSketchSupports } from './recipeDatumChain';
import { withFeaturePatternMode, withFeaturePatternScope, withFeaturePatternSeeds, withTransformedSketchSupports } from './featurePatternCommands';

const require = createRequire(import.meta.url);
function example() {
  const doc = validateDocument(require('../../scripts/desktop-pattern-sketch-support-original.cjs')());
  const p = doc.features.at(-1)! as RepetitionFeature;
  const history = new Map(doc.features.slice(0,-1).map(item => [item.id,item]));
  const recipe = withTransformedSketchSupports(withFeaturePatternMode(p,'regenerate'), history, true);
  if (recipe.featurePattern?.mode !== 'regenerate') throw Error('Original selected recipe missing.');
  return { doc: { ...doc, features: [...history.values(),recipe] }, recipe, history, policies: recipe.featurePattern.referencePolicies };
}

// Both fixtures are original project primitives. Keep the exact earlier face
// producer and opaque locator; this is saved membership, not new face authority.
function faceRootedExample() {
  const { doc } = example();
  const faceFixture = require('../cad/fixtures/pattern-world-face-limit-original.json');
  const support = structuredClone(faceFixture.features.find((feature: Feature) => feature.id === 'seed-limit').endCondition.target);
  const before = validateDocument({ ...doc, features: [...structuredClone(faceFixture.features.slice(0, 6)), ...doc.features] });
  const changed = { ...before, features: before.features.map(feature => feature.id === 'datum-a' ? { ...feature, support } : feature) };
  return { before, changed, support };
}

it('preserves exact transformed support membership and explicit deselection across a document roundtrip', () => {
  const { doc, recipe, history, policies } = example();
  expect(policies.map(item=>item.featureId)).toEqual(['datum-a','datum-b','profile-c']);
  expect(parseDocument(serializeDocument(doc)).features).toEqual(doc.features);
  const suppressed = { ...doc, features: doc.features.map(item=>item.id==='datum-b'?{ ...item,suppressed:true }:item) };
  expect(parseDocument(serializeDocument(suppressed)).features).toEqual(suppressed.features);
  expect(withFeaturePatternSeeds(recipe,['seed-limit'],history).featurePattern).toEqual(recipe.featurePattern);
  expect(withFeaturePatternSeeds(recipe,['create-S'],history).featurePattern).toMatchObject({ referencePolicies: [] });
  expect(withTransformedSketchSupports(recipe,history,false).featurePattern).toMatchObject({ referencePolicies: [] });
  expect(() => withFeaturePatternScope(recipe,'all')).toThrow();
  expect(policies).toHaveLength(3);
});

it.each(['world','instance','owner','getter','hidden','duplicate','orphan','future','foreign-sketch','disconnected-datum'] as const)('rejects %s support input without reading an accessor', fault => {
  const { doc, policies }=example();
  let reads=0;
  const first=policies[0] as unknown as Record<string,unknown>;
  if(fault==='world'||fault==='instance') first.placement=fault;
  if(fault==='owner') first.owner={bodyId:'S',sourceFeatureId:'seed-limit'};
  if(fault==='getter') Object.defineProperty(first,'placement',{get(){reads++;return 'transform';}, enumerable:true});
  if(fault==='hidden') Object.defineProperty(first,'featureId',{enumerable:false});
  if(fault==='duplicate') policies.push({...policies[1]});
  if(fault==='orphan') first.featureId='other-feature';
  if(fault==='future') first.featureId=doc.features.at(-1)!.id;
  if(fault==='foreign-sketch') first.featureId='profile-S';
  if(fault==='disconnected-datum') {
    const b=doc.features.find(item=>item.id==='datum-b')!;
    if(b.type!=='plane') throw Error('Original datum missing');
    b.support={kind:'principal',plane:'XY'};
  }
  expect(()=>validateDocument(doc)).toThrow();
  expect(reads).toBe(0);
});

it('retains a shared ancestor after removing only one selected seed', () => {
  const { history, recipe }=example();
  const prior=history.get('seed-limit')!, sketch=history.get('profile-c')!;
  if(prior.type!=='cut'||sketch.type!=='sketch'||recipe.source.mode!=='features') throw Error('Original source missing');
  const sibling:Feature={...sketch,id:'sibling-sketch'}, second:Feature={...prior,id:'sibling-seed',sketchId:sibling.id};
  history.set(sibling.id,sibling);history.set(second.id,second);
  const multi=withTransformedSketchSupports({...recipe,source:{...recipe.source,featureIds:[prior.id,second.id]}},history,true);
  const retained=withFeaturePatternSeeds(multi,[second.id],history).featurePattern;
  expect(retained?.mode==='regenerate' && retained.referencePolicies.map(item=>item.featureId)).toEqual(['datum-a','datum-b','sibling-sketch']);
});

it('bounds the detached support table independently of the existing limit table', () => {
  const { recipe } = example();
  const operation = recipe.featurePattern;
  if (operation?.mode !== 'regenerate') throw Error('Original recipe missing');
  operation.referencePolicies = Array.from({ length: 256 }, (_, index) => ({
    featureId: 'test-datum-' + index, path: 'support', placement: 'transform' }));
  expect(() => validateFeaturePatternDeclaration(recipe)).not.toThrow();
  operation.referencePolicies.push({ featureId: 'one-too-many', path: 'support', placement: 'transform' });
  expect(() => validateFeaturePatternDeclaration(recipe)).toThrow();
});

it('retains connected support records when an upstream thin section temporarily prevents recipe regeneration', () => {
  const { doc, policies } = example();
  const seed = doc.features.find(item => item.id === 'seed-limit');
  if (seed?.type !== 'cut') throw Error('Original cut missing');
  seed.thinWall = { kind: 'mid-plane', thickness: 1 };
  const reopened = parseDocument(serializeDocument(doc));
  expect(reopened.features.at(-1)).toMatchObject({ featurePattern: { referencePolicies: policies } });
  const repaired = reopened.features.find(item => item.id === seed.id);
  if (repaired?.type !== 'cut') throw Error('Original cut missing');
  delete repaired.thinWall;
  expect(parseDocument(serializeDocument(reopened)).features.at(-1)).toEqual(doc.features.at(-1));
});

it('retains connected support identities on a face-rooted datum through edit, save, reopen and repair', () => {
  const { before, support } = faceRootedExample(), original = serializeDocument(before);
  const changed = updateFeature(before, 'datum-a', { support });
  const reopened = parseDocument(serializeDocument(changed));
  expect(reopened.features.at(-1)).toEqual(before.features.at(-1));
  const repaired = updateFeature(reopened, 'datum-a', { support: { kind: 'principal', plane: 'XY' } });
  expect(repaired.features).toEqual(before.features);
  expect(serializeDocument(before)).toBe(original);
});

it('keeps face-rooted membership distinct from active principal-only support and preserves a retained seed', () => {
  const { changed } = faceRootedExample();
  const history = new Map(changed.features.slice(0, -1).map(feature => [feature.id, feature]));
  const lookup = (id: string) => history.get(id), seed = lookup('seed-limit');
  expect(transformedSketchSupports(seed, lookup, 'membership').map(item => item.id)).toEqual(['datum-a', 'datum-b', 'profile-c']);
  expect(transformedSketchSupports(seed, lookup)).toEqual([]);
  expect(principalRecipeDatumChain('datum-b', lookup)).toBeNull();
  expect(principalRecipeDatumChain('datum-b', lookup, true)).toBeNull();
  const recipe = changed.features.at(-1)! as RepetitionFeature;
  expect(withFeaturePatternSeeds(recipe, ['seed-limit'], history).featurePattern).toEqual(recipe.featurePattern);
});

it.each(['orphan-face', 'future-face', 'producer-policy', 'getter'] as const)('keeps %s outside the saved face-rooted membership boundary', fault => {
  const { changed } = faceRootedExample();
  const root = changed.features.find(feature => feature.id === 'datum-a');
  const recipe = changed.features.at(-1)! as RepetitionFeature;
  if (root?.type !== 'plane' || root.support.kind !== 'face' || recipe.featurePattern?.mode !== 'regenerate') throw Error('Original face support absent');
  let reads = 0;
  if (fault === 'orphan-face') root.support.face.sourceFeatureId = 'missing-face-producer';
  if (fault === 'future-face') root.support.face.sourceFeatureId = 'create-A';
  if (fault === 'producer-policy') recipe.featurePattern.referencePolicies[0].featureId = 'shared-cut';
  if (fault === 'getter') Object.defineProperty(recipe.featurePattern.referencePolicies[0], 'placement', { enumerable: true, get() { reads++; return 'transform'; } });
  expect(() => validateDocument(changed)).toThrow(); expect(reads).toBe(0);
});
