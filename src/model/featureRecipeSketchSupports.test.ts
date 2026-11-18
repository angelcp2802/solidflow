import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import type { Feature, RepetitionFeature } from '../cad/kernel.types';
import { validateFeaturePatternDeclaration } from './featurePatterns';
import { parseDocument, serializeDocument, validateDocument } from './document';
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
