import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import {setOC,getOC,cast,makeLine,makeCircle,makeEllipse,type Edge} from 'replicad'
import {beforeAll,it,expect,vi} from 'vitest'
import {withNativeOwners,NativeCleanupError,type NativeOwners,type NativeOwner} from './kernel.native-ownership'
import * as ownership from './kernel.native-ownership'
import {ownedNativeTopology} from './kernel.native-topology'
import {observeAssemblyArcPath,evaluateAssemblyArcPath} from './kernel.assembly-arc-path'
beforeAll(async()=>setOC(await initOpenCascade({wasmBinary:await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm'))})),60000)
const near=(a:readonly number[],b:readonly number[],band=1e-10)=>{expect(a.length).toBe(b.length);a.forEach((v,i)=>expect(Math.abs(v-b[i])).toBeLessThanOrEqual(band))}
function arc(o:NativeOwners,first=0,last=Math.PI/2,tilted=false):Edge{
 const oc=getOC(),center=o.own(new oc.gp_Pnt(3,-2,5)),normal=o.own(new oc.gp_Dir(0,tilted ? 0.6 : 0,tilted ? 0.8 : 1)),x=o.own(new oc.gp_Dir(1,0,0)),frame=o.own(new oc.gp_Ax2(center,normal,x)),circle=o.own(new oc.gp_Circ(frame,2)),builder=o.own(new oc.BRepBuilderAPI_MakeEdge(circle,first,last))
 return o.own(cast(o.own(builder.Edge()))) as Edge
}
function endpoints(o:NativeOwners,e:Edge){const vertices=ownedNativeTopology(e,'vertex');o.ownAll(vertices);return vertices}
it('authenticates either actual endpoint of a quarter arc and evaluates material distance',()=>withNativeOwners(o=>{
 const e=arc(o),vs=endpoints(o,e)
 for(let i=0;i<2;i++){const r=observeAssemblyArcPath(e,vs[i]);expect(r.kind).toBe('circle');expect(r.closed).toBe(false);expect(r.sense).toBe(i===0?1:-1);expect(r.startParameter).toBe(i===0?0:Math.PI/2);expect(r.lengthMm).toBeCloseTo(Math.PI,12);near(r.startPoint,i===0?[5,-2,5]:[3,0,5]);near(r.endPoint,i===0?[3,0,5]:[5,-2,5]);const half=evaluateAssemblyArcPath(e,vs[i],{kind:'arc-length',distanceMm:Math.PI/2});near(half.point,[3+Math.SQRT2,-2+Math.SQRT2,5]);near(half.tangent,i===0?[-Math.SQRT1_2,Math.SQRT1_2,0]:[Math.SQRT1_2,-Math.SQRT1_2,0]);expect(half.arcLengthMm).toBe(Math.PI/2)}
 expect(e.wrapped.IsNull()).toBe(false)
}))
it('does not exchange chosen material origin when native traversal is reversed',()=>withNativeOwners(o=>{
 const e=arc(o),vs=endpoints(o,e),reversed=o.own(cast(o.own(e.wrapped.Reversed()))) as Edge
 for(const v of vs){const a=observeAssemblyArcPath(e,v),b=observeAssemblyArcPath(reversed,v);expect(b.parameterDomain).toEqual(a.parameterDomain);expect(b.sense).toBe(a.sense);near(b.startPoint,a.startPoint);near(b.endPoint,a.endPoint);near(evaluateAssemblyArcPath(reversed,v,{kind:'arc-length',distanceMm:0}).tangent,evaluateAssemblyArcPath(e,v,{kind:'arc-length',distanceMm:0}).tangent)}
}))
it('retains a shifted native parameter domain and the major trim rather than shortest circle',()=>withNativeOwners(o=>{
 const e=arc(o,Math.PI/4,7*Math.PI/4),vs=endpoints(o,e),a=observeAssemblyArcPath(e,vs[0]),b=observeAssemblyArcPath(e,vs[1]);expect(a.parameterDomain.first).toBeCloseTo(Math.PI/4,14);expect(a.parameterDomain.last).toBeCloseTo(7*Math.PI/4,14);expect(a.lengthMm).toBeCloseTo(3*Math.PI,12);expect(b.sense).toBe(-1);near(a.startPoint,[3+Math.SQRT2,-2+Math.SQRT2,5]);near(b.startPoint,[3+Math.SQRT2,-2-Math.SQRT2,5]);const half=evaluateAssemblyArcPath(e,vs[0],{kind:'arc-length',distanceMm:1.5*Math.PI});near(half.point,[1,-2,5]);near(half.tangent,[0,-1,0]);expect(evaluateAssemblyArcPath(e,vs[1],{kind:'parameter',parameter:Math.PI}).arcLengthMm).toBeCloseTo(1.5*Math.PI,12)
}))
it('uses actual oblique circle frame and original 3D center for points and tangents',()=>withNativeOwners(o=>{
 const e=arc(o,0,Math.PI/2,true),vs=endpoints(o,e),r=evaluateAssemblyArcPath(e,vs[0],{kind:'arc-length',distanceMm:Math.PI});near(r.point,[3,-.4,3.8]);near(r.tangent,[-1,0,0]);near(r.observation.normal,[0,.6,.8]);near(r.observation.center,[3,-2,5])
}))
it('rejects foreign equal-coordinate endpoint and nonincident vertex by native identity',()=>withNativeOwners(o=>{
 const e=arc(o),other=arc(o),foreign=endpoints(o,other),line=o.own(makeLine([3,-2,5],[3,-2,6])),nonincident=endpoints(o,line);expect(()=>observeAssemblyArcPath(e,foreign[0])).toThrow(/exact endpoint/);expect(()=>observeAssemblyArcPath(e,nonincident[0])).toThrow(/exact endpoint/)
}))
it('rejects complete seam circles, LINE and unsupported ellipse without promoting their proof',()=>withNativeOwners(o=>{
 for(const e of [o.own(makeCircle(2)),o.own(makeLine([0,0,0],[2,0,0])),o.own(makeEllipse(3,2))]){const vs=endpoints(o,e);expect(()=>observeAssemblyArcPath(e,vs[0])).toThrow()}
}))
it('rejects malformed coordinates and parameters outside this trim without wrapping or extrapolating',()=>withNativeOwners(o=>{
 const e=arc(o),vs=endpoints(o,e);for(const coordinate of [{kind:'arc-length',distanceMm:-1},{kind:'arc-length',distanceMm:Math.PI+1},{kind:'parameter',parameter:-.1},{kind:'parameter',parameter:Math.PI/2+.1}]as const)expect(()=>evaluateAssemblyArcPath(e,vs[0],coordinate)).toThrow(/outside/)
 let calls=0;const bad={kind:'arc-length'};Object.defineProperty(bad,'distanceMm',{enumerable:true,get(){calls++;return 0}});expect(()=>evaluateAssemblyArcPath(e,vs[0],bad as never)).toThrow();expect(calls).toBe(0);expect(e.wrapped.IsNull()).toBe(false)
}))
it('rejects failed or ambiguous endpoint parameter metadata and retains borrowed native owners',()=>withNativeOwners(o=>{
 const e=arc(o),vs=endpoints(o,e),spy=vi.spyOn(getOC().BRep_Tool,'Parameter');try{spy.mockImplementation(()=>{throw Error('arcparameterfault')});expect(()=>observeAssemblyArcPath(e,vs[0])).toThrow('arcparameterfault');spy.mockReturnValue(0);expect(()=>observeAssemblyArcPath(e,vs[0])).toThrow(/parameters/);spy.mockReturnValue(NaN);expect(()=>observeAssemblyArcPath(e,vs[0])).toThrow(/parameters/)}finally{spy.mockRestore()}expect(e.wrapped.IsNull()).toBe(false)
}))
it('refuses insufficient requested numerical resolution rather than widening it',()=>withNativeOwners(o=>{
 const e=arc(o),vs=endpoints(o,e);expect(()=>observeAssemblyArcPath(e,vs[0],{lengthToleranceMm:1e-12})).toThrow(/precisionLimit/);expect(()=>evaluateAssemblyArcPath(e,vs[0],{kind:'arc-length',distanceMm:0},{angleToleranceRad:1e-16})).toThrow(/precisionLimit/);expect(observeAssemblyArcPath(e,vs[0]).kind).toBe('circle')
}))
it('withholds arc output on real native release failure and preserves borrowed edge',()=>withNativeOwners(o=>{
 const e=arc(o),vs=endpoints(o,e),own=ownership.NativeOwners.prototype.own;let patched=false;const spy=vi.spyOn(ownership.NativeOwners.prototype,'own').mockImplementation(function<T extends NativeOwner>(this:NativeOwners,v:T):T{if(v instanceof getOC().TopExp_Explorer&&!patched){patched=true;const release=v.delete.bind(v);v.delete=()=>{release();throw Error('arcreleasefault')}}return own.call(this,v) as T})
 try{expect(()=>observeAssemblyArcPath(e,vs[0])).toThrow(NativeCleanupError);expect(patched).toBe(true)}finally{spy.mockRestore()}expect(e.wrapped.IsNull()).toBe(false)
}))

it('retains an actual native trim crossing 2pi and authenticates both material endpoints without modulo',()=>withNativeOwners(o=>{
 const e=arc(o,7*Math.PI/4,9*Math.PI/4),vs=endpoints(o,e)
 for(let i=0;i<2;i++){const r=observeAssemblyArcPath(e,vs[i]);expect(r.parameterDomain.first).toBeCloseTo(7*Math.PI/4,14);expect(r.parameterDomain.last).toBeCloseTo(9*Math.PI/4,14);expect(r.lengthMm).toBeCloseTo(Math.PI,12);near(r.startPoint,i===0?[3+Math.SQRT2,-2-Math.SQRT2,5]:[3+Math.SQRT2,-2+Math.SQRT2,5]);near(r.endPoint,i===0?[3+Math.SQRT2,-2+Math.SQRT2,5]:[3+Math.SQRT2,-2-Math.SQRT2,5]);const middle=evaluateAssemblyArcPath(e,vs[i],{kind:'arc-length',distanceMm:Math.PI/2});near(middle.point,[5,-2,5]);near(middle.tangent,i===0?[0,1,0]:[0,-1,0]);expect(middle.parameter).toBeCloseTo(2*Math.PI,14);const parameter=evaluateAssemblyArcPath(e,vs[i],{kind:'parameter',parameter:2*Math.PI});near(parameter.point,[5,-2,5]);near(parameter.tangent,i===0?[0,1,0]:[0,-1,0]);expect(parameter.arcLengthMm).toBeCloseTo(Math.PI/2,12)}
}))
