import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { cast, getOC, makeBox, makePolygon, makeSphere, setOC, type Vertex } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { createFaceCatalog } from './kernel.faces'
import { createEdgeCatalog } from './kernel.edges'
import { createVertexCatalog, pickableVerticesFromCatalog, resolveVertexReference } from './kernel.vertices'
import { withNativeOwners, NativeCleanupError } from './kernel.native-ownership'
import { ownedNativeTopology } from './kernel.native-topology'
import * as topology from './kernel.native-topology'
import * as references from './kernel.vertex-references'

// Original Cartesian prism dimensions; no mesh or bounding-box data produces a vertex identity.
beforeAll(async()=>setOC(await initOpenCascade({wasmBinary:await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm'))})),60_000)
const near=(a:number,b:number,tol=1e-8)=>expect(Math.abs(a-b)).toBeLessThanOrEqual(tol)
const source='solid-original',lineage='original-rectangle-extrusion'
it('names eight actual box vertices by exact current face/edge incidence and measures independent corners',()=>withNativeOwners(owners=>{
  const shape=owners.own(makeBox([-2,-3,0],[2,3,4])),faces=createFaceCatalog(shape,source,lineage),edges=createEdgeCatalog(shape,source,lineage)
  owners.own({delete:faces.dispose});owners.own({delete:edges.dispose})
  const catalog=createVertexCatalog(shape,source,lineage,faces.entries,edges.entries);owners.own({delete:catalog.dispose})
  expect(catalog.entries).toHaveLength(8);expect(catalog.unresolvedCount).toBe(0)
  const points=pickableVerticesFromCatalog(catalog),expected=[-2,2].flatMap(x=>[-3,3].flatMap(y=>[0,4].map(z=>[x,y,z].join(',')))).sort()
  expect(points.map(v=>v.point.join(',')).sort()).toEqual(expected);expect(new Set(points.map(v=>v.ref.key)).size).toBe(8)
  for(const entry of catalog.entries){expect(entry.ref.key).toMatch(/^vertex-v1\|[0-9a-f]{64}$/);expect(resolveVertexReference(catalog,entry.ref,source)).toBe(entry.vertex)}
  const oc=getOC(),volume=owners.own(new oc.GProp_GProps()),area=owners.own(new oc.GProp_GProps())
  expect(owners.own(new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false)).IsValid()).toBe(true);expect(owners.ownAll(ownedNativeTopology(shape,'solid'))).toHaveLength(1)
  oc.BRepGProp.VolumeProperties(shape.wrapped,volume,1e-10,false,false);oc.BRepGProp.SurfaceProperties(shape.wrapped,area,false,false)
  near(volume.Mass(),96,1e-6);near(area.Mass(),128,1e-6)
  const bounds=owners.own(shape.boundingBox).bounds;expect(bounds).toEqual([[-2,-3,0],[2,3,4]])
  // Reordering borrowed catalogs cannot change incidence identity or own them.
  const reordered=createVertexCatalog(shape,source,lineage,[...faces.entries].reverse(),[...edges.entries].reverse());owners.own({delete:reordered.dispose})
  expect(reordered.entries.map(v=>v.ref.key).sort()).toEqual(catalog.entries.map(v=>v.ref.key).sort())
}),60_000)

it('retains conservative incidence keys across original prism dimension edits while querying changed native points',()=>withNativeOwners(owners=>{
  const keys:string[][]=[]
  for(const width of [4,6]){
    const shape=owners.own(makeBox([-width/2,-3,0],[width/2,3,4])),faces=createFaceCatalog(shape,source,lineage),edges=createEdgeCatalog(shape,source,lineage)
    owners.own({delete:faces.dispose});owners.own({delete:edges.dispose})
    const c=createVertexCatalog(shape,source,lineage,faces.entries,edges.entries);owners.own({delete:c.dispose})
    keys.push(c.entries.map(v=>v.ref.key).sort());expect(pickableVerticesFromCatalog(c).every(v=>Math.abs(v.point[0])===width/2)).toBe(true)
  }
  expect(keys[1]).toEqual(keys[0])
}),60_000)

it('rejects foreign, incomplete and duplicate borrowed native catalogs',()=>withNativeOwners(owners=>{
  const a=owners.own(makeBox([-2,-3,0],[2,3,4])),b=owners.own(makeBox([-2,-3,0],[2,3,4]))
  const fa=createFaceCatalog(a,source,lineage),ea=createEdgeCatalog(a,source,lineage),fb=createFaceCatalog(b,source,lineage)
  owners.own({delete:fa.dispose});owners.own({delete:ea.dispose});owners.own({delete:fb.dispose})
  expect(()=>createVertexCatalog(a,source,lineage,fb.entries,ea.entries)).toThrow(/otro cuerpo/)
  expect(()=>createVertexCatalog(a,source,lineage,fa.entries.slice(1),ea.entries)).toThrow(/cubren/)
  expect(()=>createVertexCatalog(a,source,lineage,[...fa.entries.slice(0,-1),fa.entries[0]],ea.entries)).toThrow(/repite|pierde/)
  expect(()=>createVertexCatalog(a,'another-source',lineage,fa.entries,ea.entries)).toThrow(/otro cuerpo|estado/)
}),60_000)

it('withholds vertices whose incident keys are ambiguous instead of choosing an ordinal',()=>withNativeOwners(owners=>{
  const shape=owners.own(makeBox([-2,-3,0],[2,3,4])),faces=createFaceCatalog(shape,source,lineage),edges=createEdgeCatalog(shape,source,lineage)
  owners.own({delete:faces.dispose});owners.own({delete:edges.dispose})
  const duplicate=faces.entries.map(v=>({...v,ref:{...faces.entries[0].ref}}))
  const c=createVertexCatalog(shape,source,lineage,duplicate,edges.entries);owners.own({delete:c.dispose})
  expect(c.entries).toEqual([]);expect(c.unresolvedCount).toBe(8)
}),60_000)

it('does not name sphere poles from closed or degenerate-only seam incidence',()=>withNativeOwners(owners=>{
  const shape=owners.own(makeSphere(3)),faces=createFaceCatalog(shape,source,lineage),edges=createEdgeCatalog(shape,source,lineage)
  owners.own({delete:faces.dispose});owners.own({delete:edges.dispose})
  const c=createVertexCatalog(shape,source,lineage,faces.entries,edges.entries);owners.own({delete:c.dispose})
  expect(c.entries).toEqual([]);expect(c.unresolvedCount).toBeGreaterThan(0)
}),60_000)

it('rejects resolution after disposal and attempts every transferred vertex release once on cleanup failure',()=>withNativeOwners(owners=>{
  const shape=owners.own(makeBox([-2,-3,0],[2,3,4])),faces=createFaceCatalog(shape,source,lineage),edges=createEdgeCatalog(shape,source,lineage)
  owners.own({delete:faces.dispose});owners.own({delete:edges.dispose})
  const c=createVertexCatalog(shape,source,lineage,faces.entries,edges.entries),ref=c.entries[0].ref,counts=c.entries.map(()=>0),failure=new Error('Original vertex release fault')
  c.entries.forEach((entry,i)=>{const release=entry.vertex.delete.bind(entry.vertex);entry.vertex.delete=()=>{counts[i]++;release();if(i===0)throw failure}})
  let caught:unknown;try{c.dispose()}catch(e){caught=e}
  expect(caught).toBeInstanceOf(NativeCleanupError);expect((caught as AggregateError).errors).toContain(failure);expect(counts).toEqual(Array(8).fill(1))
  c.dispose();expect(counts).toEqual(Array(8).fill(1));expect(()=>resolveVertexReference(c,ref,source)).toThrow(/vigente/);expect(()=>pickableVerticesFromCatalog(c)).toThrow(/vigente/)
}),60_000)

it('releases every received vertex when a later incidence-key construction fails',()=>withNativeOwners(owners=>{
  const shape=owners.own(makeBox([-2,-3,0],[2,3,4])),faces=createFaceCatalog(shape,source,lineage),edges=createEdgeCatalog(shape,source,lineage)
  owners.own({delete:faces.dispose});owners.own({delete:edges.dispose})
  const actualTopology=topology.ownedNativeTopology,actualKey=references.createVertexReference,attempts:number[]=[],failure=new Error('Original fourth vertex descriptor fault');let keys=0
  const instrument:typeof topology.ownedNativeTopology=(s,k)=>{
    const result=actualTopology(s,k)
    if(k==='vertex')for(const vertex of result as Vertex[]){const index=attempts.push(0)-1,release=vertex.delete.bind(vertex);vertex.delete=()=>{attempts[index]++;release()}}
    return result
  }
  const topSpy=vi.spyOn(topology,'ownedNativeTopology').mockImplementation(instrument),keySpy=vi.spyOn(references,'createVertexReference').mockImplementation(d=>{if(++keys===4)throw failure;return actualKey(d)})
  try{expect(()=>createVertexCatalog(shape,source,lineage,faces.entries,edges.entries)).toThrow(failure);expect(attempts.length).toBeGreaterThanOrEqual(8);expect(attempts.every(n=>n===1)).toBe(true)}
  finally{keySpy.mockRestore();topSpy.mockRestore()}
  // Borrowed catalogs and the valid source shape remain usable after failure.
  const clean=createVertexCatalog(shape,source,lineage,faces.entries,edges.entries);owners.own({delete:clean.dispose});expect(clean.entries).toHaveLength(8)
}),60_000)

it('keeps a valid original 256-sided prism usable when point-reference capacity is exceeded',()=>withNativeOwners(owners=>{
  const n=256,radius=10,depth=4,oc=getOC()
  const profile=owners.own(makePolygon(Array.from({length:n},(_,i)=>[radius*Math.cos(2*Math.PI*i/n),radius*Math.sin(2*Math.PI*i/n),0])))
  const vector=owners.own(new oc.gp_Vec(0,0,depth)),builder=owners.own(new oc.BRepPrimAPI_MakePrism(profile.wrapped,vector,false,true)),raw=owners.own(builder.Shape()),shape=owners.own(cast(raw)).asShape3D()
  const faces=createFaceCatalog(shape,source,lineage),edges=createEdgeCatalog(shape,source,lineage)
  owners.own({delete:faces.dispose});owners.own({delete:edges.dispose})
  expect(faces.entries).toHaveLength(n+2)
  const c=createVertexCatalog(shape,source,lineage,faces.entries,edges.entries);owners.own({delete:c.dispose})
  expect(c.entries).toEqual([]);expect(c.unresolvedCount).toBe(2*n);expect(pickableVerticesFromCatalog(c)).toEqual([])
  c.dispose();c.dispose()
  // Unsupported optional point references neither delete nor invalidate the body.
  expect(owners.own(new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false)).IsValid()).toBe(true)
  const volume=owners.own(new oc.GProp_GProps()),area=owners.own(new oc.GProp_GProps()),baseArea=n*radius*radius*Math.sin(2*Math.PI/n)/2,perimeter=2*n*radius*Math.sin(Math.PI/n)
  oc.BRepGProp.VolumeProperties(shape.wrapped,volume,1e-10,false,false);oc.BRepGProp.SurfaceProperties(shape.wrapped,area,false,false)
  near(volume.Mass(),baseArea*depth,1e-5);near(area.Mass(),2*baseArea+perimeter*depth,1e-5)
  const foreign=owners.own(makeBox([-2,-3,0],[2,3,4])),foreignFaces=createFaceCatalog(foreign,source,lineage);owners.own({delete:foreignFaces.dispose})
  expect(()=>createVertexCatalog(shape,source,lineage,[foreignFaces.entries[0],...faces.entries.slice(1)],edges.entries)).toThrow(/otro cuerpo|estado/)
}),60_000)
