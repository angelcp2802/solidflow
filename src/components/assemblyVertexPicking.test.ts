import { expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { assemblyReferencePickMode, assemblyVertexKey, createAssemblyVertexMarkers, disposeAssemblyVertexMarkers, pickAssemblyVertex, type VertexPickBody } from './assemblyVertexPicking'
import type { AssemblySceneBody, AssemblySceneVertex } from '../cad/kernel.assembly-types'
import type { Vec3 } from '../cad/kernel.types'

// Original display boxes and literal camera coordinates. No native proof or human interaction.
const size = { width: 1000, height: 1000 }, center = { x: 500, y: 500 }
function camera(perspective = false) {
  const c = perspective ? new THREE.PerspectiveCamera(90,1,.1,100) : new THREE.OrthographicCamera(-5,5,5,-5,.1,100)
  c.position.set(0,0,10); c.lookAt(0,0,0); c.updateProjectionMatrix(); c.updateMatrixWorld(); return c
}
function fixture(points: Vec3[] = [[0,0,1]], occurrence = 'a'): VertexPickBody {
  const component = { occurrencePath: [occurrence], definition: { id:'part', revision:'r1' } }, bodyRef = { bodyId:'box',sourceFeatureId:'solid' }
  const vertexPoints = points.map<AssemblySceneVertex>((p,i) => ({ selection: { component,body:bodyRef,vertex: {sourceFeatureId:'solid',key:'vertex-v1|'+i.toString(16).padStart(64,'0')} }, point:[...p],worldPoint:[...p],tolerance:1e-7 }))
  const body: AssemblySceneBody = { component,body:bodyRef,name:occurrence,visible:true,worldPose:{translation:[0,0,0],rotation:[0,0,0,1]},vertices:[],normals:[],triangles:[],edgeLines:[],faces:[],vertexPoints,volume:8,area:24,solidCount:1,bounds:{min:[-1,-1,-1],max:[1,1,1]} }
  return {body,object:new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}))}
}
it('selects exact current DTO using orthographic and perspective clip projection',()=>{
  const f=fixture(); for(const c of [camera(),camera(true)]) expect(pickAssemblyVertex(c,[f],center,size)).toBe(f.body.vertexPoints![0])
})
it('uses CSS pixels across zoom and rejects viewport/outside-camera coordinates',()=>{
  const f=fixture([[1,0,1]]),c=camera(); c.zoom=2;c.updateProjectionMatrix()
  expect(pickAssemblyVertex(c,[f],{x:707,y:500},size)).toBe(f.body.vertexPoints![0])
  expect(pickAssemblyVertex(c,[f],{x:709,y:500},size)).toBeNull()
  expect(pickAssemblyVertex(c,[f],{x:-1,y:500},size)).toBeNull()
  expect(pickAssemblyVertex(c,[fixture([[0,0,11]])],center,size)).toBeNull()
  expect(pickAssemblyVertex(camera(true),[fixture([[0,0,11]])],center,size)).toBeNull()
})
it('rejects own-body back points rather than exempting owner mesh',()=>{
  const f=fixture([[0,0,-1]]); expect(pickAssemblyVertex(camera(),[f],center,size)).toBeNull()
})
it('all visible bodies occlude, even bodies without vertex catalog; hidden ones do not',()=>{
  const f=fixture(),block=fixture([], 'block');block.object.position.z=3
  expect(pickAssemblyVertex(camera(),[f,block],center,size)).toBeNull()
  block.body.visible=false;expect(pickAssemblyVertex(camera(),[f,block],center,size)).toBe(f.body.vertexPoints![0])
})
it('returns no mesh-derived point when the current native catalog is missing',()=>{
  const f=fixture(); delete f.body.vertexPoints;expect(pickAssemblyVertex(camera(),[f],center,size)).toBeNull()
})
it('same key on different occurrences remains distinct, and coincident candidates reject',()=>{
  const a=fixture(),b=fixture([[0,0,1]],'b')
  expect(assemblyVertexKey(a.body.vertexPoints![0])).not.toBe(assemblyVertexKey(b.body.vertexPoints![0]))
  expect(pickAssemblyVertex(camera(),[a,b],center,size)).toBeNull()
})
it('duplicate identity, mismatched owner/revision/body and nonfinite native metadata do not select',()=>{
  const f=fixture(),v=f.body.vertexPoints![0];f.body.vertexPoints!.push(structuredClone(v));expect(pickAssemblyVertex(camera(),[f],center,size)).toBeNull()
  for(const mutate of [(x:AssemblySceneVertex)=>{x.selection.component.definition.revision='r2'},(x:AssemblySceneVertex)=>{x.selection.body=null},(x:AssemblySceneVertex)=>{x.worldPoint[0]=NaN}]){
    const b=fixture();b.body.vertexPoints![0]=structuredClone(b.body.vertexPoints![0]);mutate(b.body.vertexPoints![0]);expect(pickAssemblyVertex(camera(),[b],center,size)).toBeNull()
  }
})
it('retains F64 world coordinate rather than converting selection position to Float32',()=>{
  const f=fixture([[16777217,0,1]]),c=camera(); f.object.position.x=16777217;c.position.x=16777217;c.lookAt(16777217,0,0);c.updateMatrixWorld()
  expect(pickAssemblyVertex(c,[f],center,size)).toBe(f.body.vertexPoints![0]);expect(f.body.vertexPoints![0].worldPoint[0]).toBe(16777217)
})
it('rejects malformed view/threshold and excessive optional metadata conservatively',()=>{
  const f=fixture();for(const t of [0,-1,Infinity,NaN,33])expect(pickAssemblyVertex(camera(),[f],center,size,t)).toBeNull()
  expect(pickAssemblyVertex(camera(),[f],center,{width:NaN,height:100})).toBeNull()
  f.body.vertexPoints=Array(65537).fill(f.body.vertexPoints![0]);expect(pickAssemblyVertex(camera(),[f],center,size)).toBeNull()
})
it('rejects newline-suffixed native keys and explicit body/vertex source mismatches',()=>{
  for(const mutate of [(v:AssemblySceneVertex)=>{v.selection.vertex.key+='\n'},(v:AssemblySceneVertex)=>{v.selection.vertex.sourceFeatureId='different-producer'}]){
    const f=fixture();mutate(f.body.vertexPoints![0]);expect(pickAssemblyVertex(camera(),[f],center,size)).toBeNull()
  }
})
it('invalid coordinate on a duplicate identity cannot manufacture a selectable singleton',()=>{
  const f=fixture(),bad=structuredClone(f.body.vertexPoints![0]);bad.worldPoint[2]=NaN;f.body.vertexPoints!.push(bad)
  expect(pickAssemblyVertex(camera(),[f],center,size)).toBeNull()
})
it('selects a real front box corner but rejects its own-body hidden back corner',()=>{
  const f=fixture([[1,1,1],[1,1,-1]]),p={x:600,y:400}
  expect(pickAssemblyVertex(camera(),[f],p,size)).toBe(f.body.vertexPoints![0])
  f.body.vertexPoints!.shift();expect(pickAssemblyVertex(camera(),[f],p,size)).toBeNull()
})
it.each([{width:722,height:483},{width:722,height:503},{width:962,height:802},{width:738,height:494}])('selects an axial original prism corner at CSS size $width×$height while retaining occlusion and ties',viewSize=>{
  const f=fixture([[10,7,2],[10,7,6]]),span=33.24936089611347,height=viewSize.height
  f.object.geometry.dispose();f.object.geometry=new THREE.BoxGeometry(4,6,4).translate(12,4,4)
  const c=new THREE.OrthographicCamera(-span*.65*viewSize.width/height,span*.65*viewSize.width/height,span*.65,-span*.65,span*.001,span*20)
  c.position.set(10.7,-3.3000000000000007,3-span*2);c.lookAt(10.7,-3.3000000000000007,3);c.updateProjectionMatrix();c.updateMatrixWorld()
  const pixels=height/(span*1.3),p={x:viewSize.width/2+.7*pixels,y:height/2-10.3*pixels}
  expect(pickAssemblyVertex(c,[f],p,viewSize)).toBe(f.body.vertexPoints![0])
  const front=f.body.vertexPoints!.shift()!
  expect(pickAssemblyVertex(c,[f],p,viewSize)).toBeNull()
  f.body.vertexPoints!.unshift(front)
  const blocker=fixture([],'blocker');blocker.object.geometry.dispose();blocker.object.geometry=new THREE.BoxGeometry(4,6,4).translate(12,4,-2)
  expect(pickAssemblyVertex(c,[f,blocker],p,viewSize)).toBeNull()
  blocker.body.visible=false
  expect(pickAssemblyVertex(c,[f,blocker],p,viewSize)).toBe(front)
  const duplicate=fixture([[10,7,2]],'coincident');duplicate.object.geometry.dispose();duplicate.object.geometry=new THREE.BoxGeometry(4,6,4).translate(12,4,4)
  expect(pickAssemblyVertex(c,[f,duplicate],p,viewSize)).toBeNull()
})
it('rejects a nonfinite or materially displaced projection round trip instead of moving its ray to the catalog',()=>{
  for(const offset of [.1,Infinity]){
    const c=camera();c.projectionMatrixInverse.elements[12]+=offset
    expect(pickAssemblyVertex(c,[fixture()],center,size)).toBeNull()
  }
})
it('projects an off-axis real corner using perspective aspect and near/far clipping',()=>{
  const f=fixture([[1,1,1]]),c=new THREE.PerspectiveCamera(90,2,.1,100);c.position.set(0,0,10);c.lookAt(0,0,0);c.updateProjectionMatrix()
  // tan(45)=1; depth9; aspect2 => ndc (1/18,1/9).
  const p={x:1000*19/36,y:500*4/9},s={width:1000,height:500}
  expect(pickAssemblyVertex(c,[f],p,s,1e-8)).toBe(f.body.vertexPoints![0])
  c.near=10;c.updateProjectionMatrix();expect(pickAssemblyVertex(c,[f],p,s)).toBeNull()
  c.near=.1;c.far=8;c.updateProjectionMatrix();expect(pickAssemblyVertex(c,[f],p,s)).toBeNull()
})
it('retains own-body occlusion and coincident-owner rejection in an off-axis perspective view',()=>{
  const f=fixture([[1,1,1],[1,1,-1]]),c=new THREE.PerspectiveCamera(90,2,.1,100),s={width:1000,height:500}
  c.position.set(0,0,10);c.lookAt(0,0,0);c.updateProjectionMatrix()
  const p={x:1000*19/36,y:500*4/9}
  expect(pickAssemblyVertex(c,[f],p,s)).toBe(f.body.vertexPoints![0])
  f.body.vertexPoints!.shift()
  expect(pickAssemblyVertex(c,[f],{x:1000*23/44,y:500*5/11},s)).toBeNull()
  const a=fixture([[1,1,1]],'a'),b=fixture([[1,1,1]],'b')
  expect(pickAssemblyVertex(c,[a,b],p,s)).toBeNull()
})
it('treats exact half-pixel ties conservatively and preserves the exact CSS threshold boundary',()=>{
  const c=new THREE.OrthographicCamera(-1,1,1,-1,.1,100);c.position.set(0,0,10);c.lookAt(0,0,0);c.updateProjectionMatrix()
  const s={width:1024,height:1024},p={x:512,y:512},f=fixture([[0,0,1],[1/1024,0,1]])
  expect(pickAssemblyVertex(c,[f],p,s)).toBeNull()
  f.body.vertexPoints![1].worldPoint[0]=1/512
  expect(pickAssemblyVertex(c,[f],p,s)).toBe(f.body.vertexPoints![0])
  f.body.vertexPoints!.pop()
  expect(pickAssemblyVertex(c,[f],{x:520,y:512},s)).toBe(f.body.vertexPoints![0])
  expect(pickAssemblyVertex(c,[f],{x:521,y:512},s)).toBeNull()
})
it('requires exclusive pick intent so contradictory modes cannot call another producer',()=>{
  expect(assemblyReferencePickMode({})).toBeNull()
  expect(assemblyReferencePickMode({pickingVertices:true})).toBe('vertex')
  expect(assemblyReferencePickMode({pickingEdges:true})).toBe('edge')
  expect(assemblyReferencePickMode({pickingFaces:true})).toBe('face')
  for(const value of [{pickingVertices:true,pickingFaces:true},{pickingVertices:true,pickingEdges:true},{pickingEdges:true,pickingFaces:true}])expect(assemblyReferencePickMode(value)).toBe('conflict')
})
it('rebinds markers to current catalog coordinates and omits stale/ambiguous/hidden entries',()=>{
  const f=fixture(),old=structuredClone(f.body.vertexPoints![0]);old.worldPoint=[100,200,300]
  const markers=createAssemblyVertexMarkers([f],[old],null)
  expect(markers.children[0].position.toArray()).toEqual([0,0,1])
  const stale=structuredClone(old);stale.selection.component.definition.revision='old'
  expect(createAssemblyVertexMarkers([f],[stale],null).children).toHaveLength(0)
  f.body.visible=false;expect(createAssemblyVertexMarkers([f],[old],null).children).toHaveLength(0)
  f.body.visible=true;const bad=structuredClone(f.body.vertexPoints![0]);bad.worldPoint[0]=NaN;f.body.vertexPoints!.push(bad)
  expect(createAssemblyVertexMarkers([f],[old],null).children).toHaveLength(0)
  disposeAssemblyVertexMarkers(markers)
})
it('caps markers and disposes every geometry/material before clearing',()=>{
  const f=fixture(Array.from({length:6},(_,i)=>[i,0,1])),v=f.body.vertexPoints!
  const markers=createAssemblyVertexMarkers([f],v,assemblyVertexKey(v[5]))
  expect(markers.children).toHaveLength(5)
  const disposals=markers.children.map(object=>{expect(object).toBeInstanceOf(THREE.Points);const p=object as THREE.Points<THREE.BufferGeometry,THREE.PointsMaterial>;expect(Array.from(p.geometry.getAttribute('position').array)).toEqual([0,0,0]);return [vi.spyOn(p.geometry,'dispose'),vi.spyOn(p.material,'dispose')]})
  disposeAssemblyVertexMarkers(markers);expect(markers.children).toHaveLength(0)
  for(const row of disposals)for(const spy of row)expect(spy).toHaveBeenCalledOnce()
})
