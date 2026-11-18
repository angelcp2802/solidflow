import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import {setOC,getOC,makeLine,cast,type Edge} from 'replicad'
import {beforeAll,it,expect,vi} from 'vitest'
import {withNativeOwners,NativeCleanupError,type NativeOwners,type NativeOwner} from './kernel.native-ownership'
import * as ownership from './kernel.native-ownership'
import {ownedNativeTopology} from './kernel.native-topology'
import {observeAssemblyLinePath} from './kernel.assembly-line-path'
beforeAll(async()=>setOC(await initOpenCascade({wasmBinary:await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm'))})),60000)
const near=(a:readonly number[],b:readonly number[])=>a.forEach((v,i)=>expect(Math.abs(v-b[i])).toBeLessThan(1e-10))
it('uses material identity for either endpoint and preserves it through topology reversal',()=>withNativeOwners(o=>{
 const edge=o.own(makeLine([1,2,3],[4,6,3])), vertices=ownedNativeTopology(edge,'vertex');o.ownAll(vertices)
 for(const vertex of vertices){const direct=observeAssemblyLinePath(edge,vertex), reversed=o.own(cast(o.own(edge.wrapped.Reversed()))) as Edge,r=observeAssemblyLinePath(reversed,vertex);expect(direct.lengthMm).toBe(5);near(r.startPoint,direct.startPoint);near(r.endPoint,direct.endPoint);expect(r.sense).toBe(direct.sense)}
 near(observeAssemblyLinePath(edge,vertices[0]).startPoint,[1,2,3]);near(observeAssemblyLinePath(edge,vertices[1]).startPoint,[4,6,3])
}))
it('rejects a foreign endpoint with exactly equal coordinates and a nonincident material vertex',()=>withNativeOwners(o=>{
 const edge=o.own(makeLine([0,0,0],[5,0,0])), foreign=o.own(makeLine([0,0,0],[0,5,0])), v=ownedNativeTopology(foreign,'vertex');o.ownAll(v)
 expect(()=>observeAssemblyLinePath(edge,v[0])).toThrow(/exact endpoint/);expect(()=>observeAssemblyLinePath(edge,v[1])).toThrow(/exact endpoint/)
}))
it('associates endpoints by exposed native parameter metadata, including shifted parameter domains',()=>withNativeOwners(o=>{
 const oc=getOC(), original=o.own(makeLine([1,2,3],[4,6,3])), native=oc.BRep_Tool.Curve(original.wrapped,0,5), curve=o.own(native.returnValue), builder=o.own(new oc.BRepBuilderAPI_MakeEdge(curve,100,105)),edge=o.own(cast(o.own(builder.Edge()))) as Edge,v=ownedNativeTopology(edge,'vertex');o.ownAll(v)
 const r=observeAssemblyLinePath(edge,v[1]);expect(r.parameterDomain).toEqual({first:100,last:105});expect(r.startParameter).toBe(105);near(r.startPoint,[64,86,3]);near(r.endPoint,[61,82,3])
}))
it('propagates native parameter faults and preserves borrowed owners',()=>withNativeOwners(o=>{
 const edge=o.own(makeLine([0,0,0],[5,0,0])),v=ownedNativeTopology(edge,'vertex');o.ownAll(v);const spy=vi.spyOn(getOC().BRep_Tool,'Parameter').mockImplementation(()=>{throw Error('parameterfault')});try{expect(()=>observeAssemblyLinePath(edge,v[0])).toThrow(/parameterfault/)}finally{spy.mockRestore()}expect(edge.wrapped.IsNull()).toBe(false)
}))

it('withholds material proof on actual native cleanup failure',()=>withNativeOwners(o=>{
 const edge=o.own(makeLine([0,0,0],[5,0,0])),v=ownedNativeTopology(edge,'vertex');o.ownAll(v);const own=ownership.NativeOwners.prototype.own;let patched=false
 const spy=vi.spyOn(ownership.NativeOwners.prototype,'own').mockImplementation(function<T extends NativeOwner>(this:NativeOwners,value:T):T{if(value instanceof getOC().TopExp_Explorer&&!patched){patched=true;const release=value.delete.bind(value);value.delete=()=>{release();throw Error('materialreleasefault')}}return own.call(this,value) as T})
 try{expect(()=>observeAssemblyLinePath(edge,v[0])).toThrow(NativeCleanupError);expect(patched).toBe(true)}finally{spy.mockRestore()}expect(edge.wrapped.IsNull()).toBe(false)
}))
