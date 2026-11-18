import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, setOC, type Shape3D } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { assemblyDefinitionKey, expandAssemblyParts, parseAssemblyDocument, serializeAssemblyDocument, type AssemblyDocument, type EmbeddedAssemblyDefinition, type EmbeddedPartDefinition } from '../model/assemblyDocument'
import { createStepSource, decodeStepSource, type StepSource } from '../model/stepSource'
import { CadEngine } from './kernel.engine'
import { exportAssemblyStepStructureNative } from './kernel.assembly-step-export'
import { importAssemblyStepStructureNative } from './kernel.assembly-step-import'
import { assemblyStepMultibodyFixture } from './kernel.assembly-step-multibody-fixture.test-utils'
import { placeAssemblyShape, validateAssemblyShape } from './kernel.assembly-placements'
import { NativeOwners, withNativeOwners } from './kernel.native-ownership'
import { stepLengthUnit } from './kernel.step-units'
import type { BodyReference } from './kernel.types'

let source: StepSource
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')), print: () => undefined, printErr: () => undefined }))
  source = createStepSource(new Uint8Array(await exportAssemblyStepStructureNative(assemblyStepMultibodyFixture()).arrayBuffer()))
}, 60_000)
const files = () => [...getOC().FS.readdir('/')].sort()
// Original analytic boxes; 1e-10 relative plus 1e-6 absolute comparison floor.
const near = (a: number, b: number) => { expect(Number.isFinite(a)).toBe(true); expect(Math.abs(a-b)).toBeLessThanOrEqual(Math.max(1e-6,Math.abs(b)*1e-10)) }
const boxes = [
  {v:24,a:52,min:[97,0,18],max:[100,4,20]}, {v:10,a:34,min:[98,0,9],max:[100,5,10]},
  {v:24,a:52,min:[100,0,8],max:[104,3,10]}, {v:10,a:34,min:[89,0,20],max:[90,5,22]},
  {v:24,a:52,min:[0,80,0],max:[4,82,3]}, {v:10,a:34,min:[0,90,0],max:[5,91,2]},
  {v:24,a:52,min:[0,90,-4],max:[3,92,0]}, {v:10,a:34,min:[0,78,10],max:[5,80,11]},
]
function graph(document: AssemblyDocument, right = true) {
  const node = (id: string, revision: string) => document.definitions.find(d=>d.id===id&&d.revision===revision)!
  expect(document.name).toBe('Conjunto "Árbol" Ω'); expect(document.units).toBe('mm'); expect(document.mates).toEqual([])
  expect(document.occurrences.map(o=>o.name)).toEqual(right?['left','right']:['left'])
  const g = node(document.occurrences[0].definition.id,document.occurrences[0].definition.revision) as EmbeddedAssemblyDefinition
  expect(g.kind).toBe('assembly'); expect(g.occurrences.map(o=>o.name)).toEqual(['s'])
  if(right) expect(document.occurrences[1].definition).toEqual(document.occurrences[0].definition)
  const s = node(g.occurrences[0].definition.id,g.occurrences[0].definition.revision) as EmbeddedAssemblyDefinition
  expect(s.kind).toBe('assembly'); expect(s.occurrences.map(o=>o.name)).toEqual(['a','b','c'])
  const parts=s.occurrences.map(o=>node(o.definition.id,o.definition.revision) as EmbeddedPartDefinition)
  expect(document.definitions.filter(d=>d.kind==='part')).toHaveLength(3)
  expect(document.definitions.filter(d=>d.kind==='assembly')).toHaveLength(2)
  expect(parts[0].document.name).toBe(parts[1].document.name)
  expect(assemblyDefinitionKey(parts[0])).not.toBe(assemblyDefinitionKey(parts[1]))
  expect(parts.map(p=>p.document.features[0].type)).toEqual(['importedBodies','importedSolid','importedSolid'])
  const first=parts[0].document.features[0]
  if(first.type!=='importedBodies')throw Error('Expected one persistent multibody part')
  expect(first.bodies).toHaveLength(2);expect(new Set(first.bodies.map(b=>b.bodyId)).size).toBe(2)
  expect(expandAssemblyParts(document)).toHaveLength(right?6:3)
}
function metrics(shape: Shape3D) {
  return withNativeOwners(owners=>{
    expect(validateAssemblyShape(shape)).toBe(1)
    const oc=getOC(),v=owners.own(new oc.GProp_GProps()),a=owners.own(new oc.GProp_GProps())
    oc.BRepGProp.VolumeProperties(shape.wrapped,v,false,false,false);oc.BRepGProp.SurfaceProperties(shape.wrapped,a,false,false)
    return {v:v.Mass(),a:a.Mass(),bounds:owners.own(shape.boundingBox).bounds.map(side=>[...side])}
  })
}
function geometry(document: AssemblyDocument, right = true, scale = 1) {
  const saved=serializeAssemblyDocument(document),remaining=boxes.slice(0,right?8:4).map(b=>({...b,used:false}))
  let n=0,totalV=0,totalA=0
  withNativeOwners(owners=>{
    const engines=new Map<string,{engine:CadEngine;refs:(BodyReference|null)[]}>()
    for(const leaf of expandAssemblyParts(document)) {
      const key=assemblyDefinitionKey(leaf.definition);let entry=engines.get(key)
      if(!entry){
        const engine=new CadEngine();owners.own({delete:()=>engine.dispose()})
        const feature=leaf.definition.document.features[0]
        const sources=feature.type==='importedBodies'?feature.bodies.map(b=>b.source):feature.type==='importedSolid'?[feature.source]:[]
        expect(sources.length).toBeGreaterThan(0);sources.forEach(s=>expect(stepLengthUnit(decodeStepSource(s))).toEqual({millimetersPerUnit:1}))
        const inventory=engine.rebuildForAssemblyReferences(leaf.definition.document.features);expect(inventory.featureErrors).toEqual([])
        if(feature.type==='importedBodies') {
          expect(inventory.kind).toBe('explicit')
          if(inventory.kind!=='explicit')throw Error('Expected explicit body catalog')
          expect(inventory.bodies).toHaveLength(2)
          expect(new Set(inventory.bodies.map(b=>b.ref.bodyId))).toEqual(new Set(feature.bodies.map(b=>b.bodyId)))
        } else expect(inventory.kind).toBe('legacy')
        const refs=inventory.kind==='explicit'?inventory.bodies.map(b=>({...b.ref})):[null]
        entry={engine,refs};engines.set(key,entry)
        const local=refs.map(ref=>metrics(owners.own(engine.copyCurrentBodyShape(ref))))
        const expected=feature.type==='importedBodies'?[{v:24,a:52,b:[[0,0,0],[2,3,4]]},{v:10,a:34,b:[[10,0,0],[11,2,5]]}]
          :[{v:leaf.definition.document.name==='Pieza distinta Ω'?10:24,a:leaf.definition.document.name==='Pieza distinta Ω'?34:52,b:leaf.definition.document.name==='Pieza distinta Ω'?[[0,0,0],[1,2,5]]:[[0,0,0],[2,3,4]]}]
        for(const e of expected){const match=local.filter(m=>Math.abs(m.v-e.v*scale**3)<=Math.max(1e-6,e.v*scale**3*1e-10));expect(match).toHaveLength(1);near(match[0].a,e.a*scale**2);e.b.forEach((side,i)=>side.forEach((x,j)=>near(match[0].bounds[i][j],x*scale)))}
      }
      for(const ref of entry.refs){
        const local=owners.own(entry.engine.copyCurrentBodyShape(ref)),placed=owners.own(placeAssemblyShape(local,leaf.worldPose)),m=metrics(placed)
        const matches=remaining.filter(b=>!b.used&&b.min.every((x,i)=>Math.abs(m.bounds[0][i]-x*scale)<=Math.max(1e-6,Math.abs(x*scale)*1e-10))&&b.max.every((x,i)=>Math.abs(m.bounds[1][i]-x*scale)<=Math.max(1e-6,Math.abs(x*scale)*1e-10)))
        expect(matches).toHaveLength(1);const b=matches[0];b.used=true;near(m.v,b.v*scale**3);near(m.a,b.a*scale**2);totalV+=m.v;totalA+=m.a;n++
      }
    }
    expect(engines.size).toBe(3)
  })
  expect(n).toBe(right?8:4);expect(remaining.every(b=>b.used)).toBe(true);near(totalV,(right?136:68)*scale**3);near(totalA,(right?344:172)*scale**2)
  expect(serializeAssemblyDocument(document)).toBe(saved)
}
it('keeps a multibody product whole through native import, v2 save and repeated structured export',async()=>{
 const before=files(),first=parseAssemblyDocument(serializeAssemblyDocument(importAssemblyStepStructureNative(source)));graph(first);geometry(first)
 const second=importAssemblyStepStructureNative(createStepSource(new Uint8Array(await exportAssemblyStepStructureNative(first).arrayBuffer())));graph(second);geometry(parseAssemblyDocument(serializeAssemblyDocument(second)));expect(files()).toEqual(before)
},60_000)
for(const suppressedRight of [false,true])it('retains hidden bodies and omits suppressed subtrees '+suppressedRight,async()=>{
 const before=files(),input=assemblyStepMultibodyFixture({hiddenRight:true,suppressedRight})
 const imported=importAssemblyStepStructureNative(createStepSource(new Uint8Array(await exportAssemblyStepStructureNative(input).arrayBuffer())));graph(imported,!suppressedRight);geometry(imported,!suppressedRight);expect(files()).toEqual(before)
},60_000)
function declaredUnits(source: StepSource, unit: 'meter' | 'inch'): StepSource {
  let text = new TextDecoder('utf-8', { fatal: true }).decode(decodeStepSource(source))
  if (unit === 'meter') {
    let count = 0
    text = text.replace(/SI_UNIT\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/g, () => { count++; return 'SI_UNIT($,.METRE.)' })
    expect(count).toBeGreaterThan(0)
  } else {
    const ids = [...text.matchAll(/#(\d+)\s*=/g)].map(m => Number(m[1]))
    let next = Math.max(...ids) + 1
    const dimension = next++, measure = next++, millimeter = next++
    let count = 0
    text = text.replace(/#(\d+)\s*=\s*\(\s*LENGTH_UNIT\(\s*\)\s*NAMED_UNIT\(\s*\*\s*\)\s*SI_UNIT\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)\s*\)\s*;/g,
      (_record, id: string) => { count++; return '#' + id + "=(CONVERSION_BASED_UNIT('INCH',#" + measure + ') LENGTH_UNIT() NAMED_UNIT(#' + dimension + '));' })
    expect(count).toBeGreaterThan(0)
    const extra = '#' + dimension + '=DIMENSIONAL_EXPONENTS(1.,0.,0.,0.,0.,0.,0.);\n'
      + '#' + measure + '=LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(25.4),#' + millimeter + ');\n'
      + '#' + millimeter + '=(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.));\n'
    expect(text).toMatch(/ENDSEC;\s*END-ISO-10303-21;/)
    text = text.replace(/ENDSEC;\s*END-ISO-10303-21;/, extra + 'ENDSEC;END-ISO-10303-21;')
  }
  return createStepSource(new TextEncoder().encode(text))
}

for(const [unit,scale] of [['meter',1000],['inch',25.4]] as const)it('normalizes actual per-solid '+unit+' transfer and saved sources to mm',()=>{
 const before=files(),document=parseAssemblyDocument(serializeAssemblyDocument(importAssemblyStepStructureNative(declaredUnits(source,unit))));graph(document);geometry(document,true,scale);expect(files()).toEqual(before)
},60_000)
it('retains two coincident native solids as distinct explicit bodies in one part',async()=>{
 const before=files(),input=assemblyStepMultibodyFixture(),p=input.definitions.find(d=>d.kind==='part'&&d.id==='structure-part-P') as EmbeddedPartDefinition
 const sketch=p.document.features.find(f=>f.id==='second-profile'),solid=p.document.features.find(f=>f.id==='second-solid')
 if(sketch?.type!=='sketch'||solid?.type!=='extrude')throw Error('Original fixture shape')
 sketch.profile={kind:'rectangle',center:[1,1.5],width:2,height:3};solid.depth=4
 const document=importAssemblyStepStructureNative(createStepSource(new Uint8Array(await exportAssemblyStepStructureNative(input).arrayBuffer())));graph(document)
 const imported=expandAssemblyParts(document).find(l=>l.chain.at(-1)?.name==='a')!.definition
 withNativeOwners(owners=>{
  const engine=new CadEngine();owners.own({delete:()=>engine.dispose()});const inventory=engine.rebuildForAssemblyReferences(imported.document.features)
  expect(inventory.featureErrors).toEqual([]);if(inventory.kind!=='explicit')throw Error('Explicit catalog required');expect(inventory.bodies).toHaveLength(2)
  const a=owners.own(engine.copyCurrentBodyShape(inventory.bodies[0].ref)),b=owners.own(engine.copyCurrentBodyShape(inventory.bodies[1].ref)),ma=metrics(a),mb=metrics(b)
  expect(inventory.bodies[0].ref).not.toEqual(inventory.bodies[1].ref);near(ma.v+mb.v,48);near(ma.a+mb.a,104)
  const common=owners.own(a.intersect(b));near(metrics(common).v,24)
 });expect(files()).toEqual(before)
},60_000)
it('rejects a failure on the second native body transfer without a partial document or virtual files',()=>{
 const before=files(),own=NativeOwners.prototype.own;let transfers=0
 const spy=vi.spyOn(NativeOwners.prototype,'own').mockImplementation(function<T extends {delete():void}>(this:NativeOwners,value:T):T{
  if(value instanceof getOC().STEPControl_Reader){const reader=value as unknown as {TransferEntity:(...args:unknown[])=>boolean};const transfer=reader.TransferEntity.bind(reader);Object.defineProperty(value,'TransferEntity',{configurable:true,value:(...args:unknown[])=>{if(++transfers===2)return false;return transfer(...args)}})}
  return own.call(this,value) as T
 })
 try{expect(()=>importAssemblyStepStructureNative(source)).toThrow(/transferencia/);expect(transfers).toBe(2)}finally{spy.mockRestore()}
 expect(files()).toEqual(before)
})
