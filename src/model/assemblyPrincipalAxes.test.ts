import { expect, it } from 'vitest';
import { validateAssemblyGeometryReference, validateAssemblyMate, parseAssemblyDocument, serializeAssemblyDocument,
  type AssemblyPrincipalAxisReference, type EmbeddedAssemblyDefinition, type EmbeddedPartDefinition } from './assemblyDocument';
import { assemblyDirectionReferenceKind } from './assemblyDirectionMates';
import { assemblyConfigurationCoreFixture } from './assemblyConfigurationCore.test-utils';
import { inspectAssemblyMateReferences } from './assemblyReferences';
import { inspectAssemblyConfigurationMateReferences } from './assemblyConfigurationReferences';
import { validateAssemblyConfiguredMateEdit } from './assemblyConfiguredMateEditing';
import { validateAssemblyConfiguredMechanicalSpec } from './assemblyConfiguredMechanicalEditing';
import { prepareAssemblyPartUpdate, repairAssemblyEndpoint } from './assemblySourceUpdates';
import { prepareAssemblyPartReplacement } from './assemblyReplacement';
import { prepareAssemblyDocumentUpdate } from './assemblySubassemblyUpdates';
import { createAssemblyRootRevision } from './assemblyRevisions';
import { identityRigidPose, transformRigidDirection } from './rigidPose';
import { solveRigidMates } from './assemblySolver';
import { evaluateRigidMates } from './assemblyMateEquations';
import type { RigidMateProblem, RigidMateSupport } from './assemblySolveTypes';

// Original symbolic datums and Cartesian numerical oracles, no native evidence.
const axis = (name: 'X'|'Y'|'Z' = 'Z', component: AssemblyPrincipalAxisReference['component'] = null): AssemblyPrincipalAxisReference =>
  ({ kind: 'principal-axis', axis: name, component });
const common = { id: 'origin-relation', name: 'Original datum relation', suppressed: false };
const concentric = () => ({ ...common, type: 'concentric' as const, first: axis(), second: axis(), alignment: 'aligned' as const, rotationLock: null });

it('strictly serializes explicit X/Y/Z origin datums and rejects material or executable fields', () => {
  for (const name of ['X','Y','Z'] as const) {
    expect(validateAssemblyGeometryReference(axis(name))).toEqual(axis(name));
    expect(assemblyDirectionReferenceKind(axis(name))).toBe('line');
  }
  for (const bad of [{ ...axis(), axis: 'x' }, { ...axis(), axis: 'XY' }, { ...axis(), radius: 1 },
    { ...axis(), body: null }, { ...axis(), plane: 'XY' }, { kind: 'principal-axis', axis: 'Z' }])
    expect(() => validateAssemblyGeometryReference(bad)).toThrow();
  let calls = 0;
  const bad = { ...axis() };
  Object.defineProperty(bad, 'axis', { enumerable: true, get() { calls++; return 'Z'; } });
  expect(() => validateAssemblyGeometryReference(bad)).toThrow(); expect(calls).toBe(0);
  const { document } = assemblyConfigurationCoreFixture(); document.mates = [concentric()];
  expect(parseAssemblyDocument(serializeAssemblyDocument(document)).mates).toEqual(document.mates);
});

it('admits direction and angle intent while retaining plane and material-mechanical restrictions', () => {
  const a = axis('X'), b = axis('Y');
  for (const declaration of [
    { ...common, type: 'parallel', first:a, second:b, alignment:'aligned' },
    { ...common, type: 'perpendicular', first:a, second:b, alignment:null },
    { ...common, type: 'angle', first:a, second:b, angle:90 },
    { ...common, type: 'limit-angle', coordinate:'principal-direction', first:a, second:b, limits:{minimum:20,maximum:120} },
    { ...common, type: 'limit-directed-angle', coordinate:'directed-about-axis', first:a, second:b, guide:axis('Z'), arc:{start:0,sweep:120} },
  ]) expect(validateAssemblyMate(declaration)).toEqual(declaration);
  expect(() => validateAssemblyMate({ ...common, type:'coincident', first:a, second:b, alignment:'aligned' })).toThrow();
  expect(() => validateAssemblyMate({ ...concentric(), rotationLock:[0,0,0,1] })).toThrow(/bloqueo/);
  expect(() => validateAssemblyConfiguredMechanicalSpec({ ...common, type:'concentric', first:a, second:b, alignment:'aligned' })).toThrow(/bloqueo/);
  const { document } = assemblyConfigurationCoreFixture();
  expect(validateAssemblyConfiguredMateEdit({ scopePath:[], definition:{id:document.id,revision:document.revision}, configuration:null,
    change:{kind:'add',mate:concentric()} }).change).toEqual({kind:'add',mate:concentric()});
});

it('inspects reused component and assembly datums in their full effective scope without topology lookup', () => {
  const { document, catalog } = assemblyConfigurationCoreFixture();
  const s = document.definitions.find(d => d.kind === 'assembly') as EmbeddedAssemblyDefinition;
  s.mates = [{ ...concentric(), second:axis('Z',{occurrencePath:['b'],definition:{id:'configuration-B',revision:'r1'}}) }];
  document.mates = [{ ...concentric(), second:axis('X',{occurrencePath:['right'],definition:{id:s.id,revision:s.revision}}) }];
  const ordinary = inspectAssemblyMateReferences(document);
  expect(ordinary).toHaveLength(3);
  expect(JSON.stringify(ordinary)).not.toContain('REQUIRES_PART');
  const effective = inspectAssemblyConfigurationMateReferences(document,catalog,'mixed');
  const nested = effective.filter(row=>row.scopePath.length===1);
  const expected = [[10,0,0],[30,4,0]];
  nested.forEach((row,i)=>row.roles.find(role=>role.side==='second')!.candidate!.worldPose.translation.forEach((value,j)=>
    expect(Math.abs(value-expected[i][j])).toBeLessThan(1e-12)));
  expect(effective.flatMap(row=>row.roles.flatMap(role=>role.diagnostics))).toEqual([]);
});

it('keeps source revision changes explicit and retains a current datum during all-use replacement', () => {
  const { document } = assemblyConfigurationCoreFixture();
  const part = document.definitions.find(d=>d.id==='configuration-A') as EmbeddedPartDefinition;
  const component = {occurrencePath:['left','a'],definition:{id:part.id,revision:part.revision}};
  document.mates = [{...concentric(),second:axis('Z',component)}];
  const scope = {id:document.id,revision:document.revision};
  const plan = prepareAssemblyPartUpdate(document,component.definition,part.document,'r2');
  expect(plan.endpoints).toHaveLength(1);
  expect(JSON.stringify(inspectAssemblyMateReferences(plan.document))).toContain('STALE_DEFINITION');
  const repaired = repairAssemblyEndpoint(plan.document,{scope,mateId:common.id,side:'second'},axis('Z',{...component,definition:plan.replacement}));
  expect(JSON.stringify(inspectAssemblyMateReferences(repaired))).not.toContain('STALE_DEFINITION');
  const replacement = prepareAssemblyPartReplacement(document,{component,mode:'all',part:{...part.document,id:'replacement-part'},revision:'new-r1',ancestorRevisions:[]});
  expect(replacement.endpoints).toHaveLength(1);
  expect(replacement.endpoints[0].retainFrame).toBe(true);
});

it('rekeys a root datum in a dormant containing assembly without changing the axis or null frame', () => {
  const { document } = assemblyConfigurationCoreFixture();
  const component = {occurrencePath:['root-use'],definition:{id:document.id,revision:document.revision}};
  const holder:EmbeddedAssemblyDefinition = {kind:'assembly',id:'datum-holder',revision:'h1',name:'Original holder',
    createdAt:document.createdAt,updatedAt:document.updatedAt,occurrences:[{id:'root-use',name:'Root use',definition:component.definition,
      pose:identityRigidPose(),fixed:false,suppressed:true,visible:true}],mates:[{...concentric(),second:axis('Y',component)}]};
  document.definitions.push(holder);
  const revised = createAssemblyRootRevision(document,'root-r2');
  const mate = (revised.definitions.at(-1) as EmbeddedAssemblyDefinition).mates[0];
  expect(mate.type).toBe('concentric');
  if(mate.type!=='concentric') throw Error('Expected concentric');
  expect(mate.first).toEqual(axis());
  expect(mate.second).toEqual(axis('Y',{...component,definition:{id:document.id,revision:'root-r2'}}));
});

it('plans a subassembly axis as a frame datum rather than demanding a material part terminal', () => {
  const { document } = assemblyConfigurationCoreFixture();
  const s = document.definitions.find(d=>d.kind==='assembly') as EmbeddedAssemblyDefinition;
  const owner = {occurrencePath:['left'],definition:{id:s.id,revision:s.revision}};
  document.mates = [{...concentric(),second:axis('Y',owner)}];
  const incoming = {...document,...s,version:2 as const,units:'mm' as const,revision:'s-r2',
    definitions:document.definitions.filter(d=>d.kind==='part'),mates:[]};
  const plan=prepareAssemblyDocumentUpdate(document,owner.definition,incoming);
  expect(plan.unresolvedEndpoints).toEqual([]);
  expect(plan.endpoints).toHaveLength(1);
  expect(plan.endpoints[0].endpoint).toEqual(axis('Y',owner));
});

function numeric(second: 'line'|'cylinder', reverse = false):RigidMateProblem {
  const firstSupport:RigidMateSupport={kind:'line',point:[0,0,0],axis:[0,0,1],tolerance:0};
  const secondSupport:RigidMateSupport=second==='line' ? {...firstSupport} :
    {kind:'cylinder',point:[0,0,0],axis:[0,0,1],xDirection:[1,0,0],radius:2,tolerance:0};
  const fixed={bodyId:null,frame:identityRigidPose(),support:firstSupport};
  const moving={bodyId:'moving',frame:identityRigidPose(),support:secondSupport};
  return {bodies:[{id:'moving',fixed:false,pose:{translation:[3,-4,7],rotation:[0,0,Math.sin(.2),Math.cos(.2)]}}],
    constraints:[{id:'coaxial',type:'concentric',first:reverse?moving:fixed,second:reverse?fixed:moving,alignment:'aligned',rotationLock:null}],
    origin:[0,0,0],lengthScale:10,lengthTolerance:1e-6,angleTolerance:1e-8};
}
it.each(['line','cylinder'] as const)('solves line/%s coaxial supports with exactly axial slide and physical spin free', kind => {
  for(const reverse of [false,true]) {
    const input=numeric(kind,reverse), before=structuredClone(input), result=solveRigidMates(input);
    expect(result.status).toBe('underdefined'); expect(result.rank).toBe(4); expect(result.localDOF).toBe(2);
    const pose=result.poses!.get('moving')!;
    expect(Math.abs(pose.translation[0])).toBeLessThan(1e-6); expect(Math.abs(pose.translation[1])).toBeLessThan(1e-6);
    const direction=transformRigidDirection(pose,[0,0,1]);
    expect(Math.abs(direction[0])).toBeLessThan(1e-8); expect(Math.abs(direction[1])).toBeLessThan(1e-8);
    expect(Math.abs(direction[2]-1)).toBeLessThan(1e-8);
    const displaced={...input,bodies:[{...input.bodies[0],pose:{translation:[0,0,23] as [number,number,number],rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2] as [number,number,number,number]}}]};
    expect(evaluateRigidMates(displaced).checks.every(check=>check.satisfied)).toBe(true);
    expect(solveRigidMates(displaced).poses!.get('moving')).toEqual(displaced.bodies[0].pose);
    expect(input).toEqual(before);
  }
});
it('rejects numeric rotation capture for datum lines without silently unlocking the relation', () => {
  const input=numeric('cylinder'); const mate=input.constraints[0];
  if(mate.type!=='concentric') throw Error('Expected concentric');
  mate.rotationLock=[0,0,0,1];
  const result=solveRigidMates(input); expect(result.status).toBe('invalidInput'); expect(result.poses).toBeNull();
  expect(mate.rotationLock).toEqual([0,0,0,1]);
});
