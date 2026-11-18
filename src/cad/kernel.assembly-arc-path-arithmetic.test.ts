import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import {setOC,getOC,cast,type Edge} from 'replicad'
import {beforeAll,it,expect,vi} from 'vitest'
import {withNativeOwners,type NativeOwners} from './kernel.native-ownership'
import {ownedNativeTopology} from './kernel.native-topology'
import {observeAssemblyArcPath,evaluateAssemblyArcPath} from './kernel.assembly-arc-path'
import {observeAssemblyPathCurve,assemblyCircleSweepArithmetic} from './kernel.assembly-path-curves'
import * as curveQueries from './kernel.assembly-path-curves'
import type {Vec3} from './kernel.types'
beforeAll(async()=>setOC(await initOpenCascade({wasmBinary:await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm'))})),60000)
const near=(a:readonly number[],b:readonly number[],band=1e-12)=>a.forEach((x,i)=>expect(Math.abs(x-b[i])).toBeLessThanOrEqual(band))
const dot=(a:Vec3,b:Vec3)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
function original(o:NativeOwners,first=0,last=Math.PI/2,center:Vec3=[3,-2,5],radius=2){const oc=getOC(),p=o.own(new oc.gp_Pnt(...center)),n=o.own(new oc.gp_Dir(0,0,1)),x=o.own(new oc.gp_Dir(1,0,0)),a=o.own(new oc.gp_Ax2(p,n,x)),c=o.own(new oc.gp_Circ(a,radius)),builder=o.own(new oc.BRepBuilderAPI_MakeEdge(c,first,last)),edge=o.own(cast(o.own(builder.Edge())))as Edge,vertices=ownedNativeTopology(edge,'vertex');o.ownAll(vertices);return{edge,vertices}}
for(const [first,last]of [[0,Math.PI/2],[Math.PI/4,7*Math.PI/4],[7*Math.PI/4,9*Math.PI/4]])it('proper material start frame and separate finite budgets '+first+'..'+last,()=>withNativeOwners(o=>{
 const {edge,vertices}=original(o,first,last)
 for(let i=0;i<2;i++){const r=observeAssemblyArcPath(edge,vertices[i]),u=i===0?first:last,sign=i===0?1:-1;near(r.materialFrame.radial,[Math.cos(u),Math.sin(u),0]);near(r.materialFrame.tangent,[-sign*Math.sin(u),sign*Math.cos(u),0]);near(r.materialFrame.normal,[0,0,sign]);near(cross(r.materialFrame.radial,r.materialFrame.tangent),r.materialFrame.normal);expect(dot(r.materialFrame.radial,r.materialFrame.tangent)).toBeCloseTo(0,14);expect(r.arithmetic.referenceModel).toBe('current-native-analytic-float64');expect(r.arithmetic.radiusMm).toBeGreaterThan(0);expect(r.radiusMm-r.arithmetic.radiusMm).toBeGreaterThan(0);const sweep=last-first;expect(sweep-r.arithmetic.sweepRad).toBeGreaterThan(0);expect(sweep+r.arithmetic.sweepRad).toBeLessThan(2*Math.PI);expect(r.arithmetic.frameRad).toBeGreaterThan(128*Number.EPSILON);expect(r.arithmetic.frameRad).toBeLessThan(1e-8);const reversed=o.own(cast(o.own(edge.wrapped.Reversed())))as Edge,a=observeAssemblyArcPath(reversed,vertices[i]);near(a.materialFrame.radial,r.materialFrame.radial);near(a.materialFrame.tangent,r.materialFrame.tangent);expect(a.arithmetic).toEqual(r.arithmetic)}
}))
it('translation and radius changes affect only their appropriate arithmetic budgets',()=>withNativeOwners(o=>{
 const a=original(o),b=original(o,0,Math.PI/2,[3e6,-2e6,5e6]),c=original(o,0,Math.PI/2,[3,-2,5],10),bands={lengthToleranceMm:1,angleToleranceRad:1e-6},x=observeAssemblyArcPath(a.edge,a.vertices[0],bands),y=observeAssemblyArcPath(b.edge,b.vertices[0],bands),z=observeAssemblyArcPath(c.edge,c.vertices[0],bands);expect(y.arithmetic.positionMm).toBeGreaterThan(x.arithmetic.positionMm*1e5);expect(y.arithmetic.radiusMm).toBe(x.arithmetic.radiusMm);expect(y.arithmetic.sweepRad).toBe(x.arithmetic.sweepRad);expect(y.arithmetic.frameRad).toBe(x.arithmetic.frameRad);expect(z.arithmetic.positionMm).toBe(x.arithmetic.positionMm);expect(z.arithmetic.radiusMm/x.arithmetic.radiusMm).toBe(5);expect(z.arithmetic.sweepRad).toBe(x.arithmetic.sweepRad)
}))
it('topological tolerance never becomes radius or angular metrology',()=>withNativeOwners(o=>{
 const {edge,vertices}=original(o),bands={lengthToleranceMm:1,angleToleranceRad:1e-6},before=observeAssemblyArcPath(edge,vertices[0],bands),spy=vi.spyOn(getOC().BRep_Tool,'Tolerance').mockReturnValue(.001)
 try{const after=observeAssemblyArcPath(edge,vertices[0],bands);expect(after.nativeToleranceMm).toBe(.001);expect(after.precision.positionMm).toBeGreaterThan(before.precision.positionMm);expect(after.arithmetic).toEqual(before.arithmetic)}finally{spy.mockRestore()}
}))
it('charges raw unit-normal defects before normalization',()=>withNativeOwners(o=>{
 const {edge,vertices}=original(o),before=observeAssemblyArcPath(edge,vertices[0]),oc=getOC(),method=oc.gp_Ax2.prototype.Direction,spy=vi.spyOn(oc.gp_Ax2.prototype,'Direction').mockImplementation(function(this:InstanceType<typeof oc.gp_Ax2>){const d=method.call(this),z=d.Z.bind(d);d.Z=()=>z()+2e-10;return d})
 try{const after=observeAssemblyArcPath(edge,vertices[0]);expect(after.rawFrameDefects!.normalNorm).toBeGreaterThan(1e-10);expect(after.arithmetic.frameRad).toBeGreaterThan(before.arithmetic.frameRad+1e-10);near(after.materialFrame.normal,[0,0,1])}finally{spy.mockRestore()}
}))
it('charges accepted raw orthogonality defect and rejects an unresolved frame',()=>withNativeOwners(o=>{
 const {edge,vertices}=original(o),before=observeAssemblyArcPath(edge,vertices[0]),oc=getOC(),method=oc.gp_Ax2.prototype.XDirection;let defect=3e-13;const spy=vi.spyOn(oc.gp_Ax2.prototype,'XDirection').mockImplementation(function(this:InstanceType<typeof oc.gp_Ax2>){const d=method.call(this);d.Z=()=>defect;return d})
 try{const after=observeAssemblyArcPath(edge,vertices[0]);expect(after.rawFrameDefects!.orthogonality).toBeGreaterThan(2e-13);expect(after.arithmetic.frameRad).toBeGreaterThan(before.arithmetic.frameRad);near(after.materialFrame.radial,[1,0,0]);defect=2e-11;expect(()=>observeAssemblyArcPath(edge,vertices[0])).toThrow(/raw frame/)}finally{spy.mockRestore()}
}))
it('uses the actual native interval when a builder normalizes its requested large phase',()=>withNativeOwners(o=>{
 const {edge,vertices}=original(o,1e7,1e7+.01),native=observeAssemblyPathCurve(edge,1),r=observeAssemblyArcPath(edge,vertices[0]);expect(native.parameterDomain.first).not.toBe(1e7);expect(r.parameterDomain).toEqual(native.parameterDomain);expect(r.arithmetic.sweepRad).toBeGreaterThanOrEqual(128*Number.EPSILON*(Math.abs(native.parameterDomain.first)+Math.abs(native.parameterDomain.last)));expect(r.arithmetic.radiusMm).toBe(128*Number.EPSILON*2)
}))
it('raw Float64 subtraction allowance exposes cancellation instead of normalizing away parameters',()=>{
 const first=1e13,last=first+.01,span=last-first,error=assemblyCircleSweepArithmetic(first,last);expect(span).toBeGreaterThan(0);expect(error).toBeGreaterThan(span);expect(assemblyCircleSweepArithmetic(0,Math.PI/2)).toBeLessThan(1e-12);expect(()=>assemblyCircleSweepArithmetic(first,first)).toThrow();expect(()=>assemblyCircleSweepArithmetic(0,Infinity)).toThrow()
})
it('reverse material start uses actual last-parameter D1 and retains interior evaluation precision',()=>withNativeOwners(o=>{
 const {edge,vertices}=original(o),r=observeAssemblyArcPath(edge,vertices[1]),e=evaluateAssemblyArcPath(edge,vertices[1],{kind:'arc-length',distanceMm:Math.PI/2});near(r.materialFrame.tangent,[1,0,0]);near(e.observation.materialFrame.tangent,[1,0,0]);near(e.tangent,[Math.SQRT1_2,-Math.SQRT1_2,0]);expect(e.precision.positionMm).toBeGreaterThan(e.observation.arithmetic.positionMm);expect(e.precision.tangentRad).toBeGreaterThan(0);expect(e.observation.arithmetic).toEqual(r.arithmetic);expect(observeAssemblyPathCurve(edge,-1).kind).toBe('circle')
}))

it('withholds material frame when actual reverse-start D1 query fails',()=>withNativeOwners(o=>{
 const {edge,vertices}=original(o),oc=getOC(),method=oc.BRepAdaptor_Curve.prototype.D1,spy=vi.spyOn(oc.BRepAdaptor_Curve.prototype,'D1').mockImplementation(function(this:InstanceType<typeof oc.BRepAdaptor_Curve>,u,p,v){if(u===Math.PI/2)throw Error('actual-last-D1-fault');return method.call(this,u,p,v)})
 try{expect(()=>observeAssemblyArcPath(edge,vertices[1])).toThrow('actual-last-D1-fault')}finally{spy.mockRestore()}expect(edge.wrapped.IsNull()).toBe(false)
}))
it('rejects missing or uncertifiable arithmetic metadata while forwarding actual native geometry unchanged',()=>withNativeOwners(o=>{
 const {edge,vertices}=original(o),actual=curveQueries.observeAssemblyPathCurve
 for(const mode of ['missing','radius-zero','sweep-zero','frame-band','negative-radius','zero-sweep']as const){const spy=vi.spyOn(curveQueries,'observeAssemblyPathCurve').mockImplementation((...args)=>{const result=actual(...args);if(result.kind!=='circle')return result;const arithmetic=result.analyticArithmetic!;return {...result,analyticArithmetic:mode==='missing'?undefined:{...arithmetic,...(mode==='radius-zero'?{radiusMm:result.radiusMm}:mode==='sweep-zero'?{sweepRad:result.parameterDomain.last-result.parameterDomain.first}:mode==='negative-radius'?{radiusMm:-1}:mode==='zero-sweep'?{sweepRad:0}:{frameRad:.1})}}})
 try{expect(()=>observeAssemblyArcPath(edge,vertices[0])).toThrow(/precisionLimit/)}finally{spy.mockRestore()}}
 expect(observeAssemblyArcPath(edge,vertices[0]).arithmetic.referenceModel).toBe('current-native-analytic-float64')
}))

it('does not absorb a D1 point inconsistency within old topology tolerance into analytic arithmetic',()=>withNativeOwners(o=>{
 const {edge,vertices}=original(o),oc=getOC(),method=oc.BRepAdaptor_Curve.prototype.D1,spy=vi.spyOn(oc.BRepAdaptor_Curve.prototype,'D1').mockImplementation(function(this:InstanceType<typeof oc.BRepAdaptor_Curve>,u,p,v){method.call(this,u,p,v);p.SetX(p.X()+1e-8)})
 try{expect(observeAssemblyPathCurve(edge,1).kind).toBe('circle');expect(()=>observeAssemblyArcPath(edge,vertices[0])).toThrow(/precisionLimit/)}finally{spy.mockRestore()}expect(edge.wrapped.IsNull()).toBe(false)
}))
it('rejects a changed analytic circle between material observation and start D1 query',()=>withNativeOwners(o=>{
 const {edge,vertices}=original(o),actual=curveQueries.evaluateAssemblyPathCurve,spy=vi.spyOn(curveQueries,'evaluateAssemblyPathCurve').mockImplementation((...args)=>{const r=actual(...args);return r.observation.kind==='circle'?{...r,observation:{...r.observation,radiusMm:r.observation.radiusMm+1e-9}}:r})
 try{expect(()=>observeAssemblyArcPath(edge,vertices[0])).toThrow(/start changed/)}finally{spy.mockRestore()}
}))

it('interior D1 arithmetic stays separate from topology tolerance and rejects an interior-only numerical defect',()=>withNativeOwners(o=>{
 const {edge,vertices}=original(o),coordinate={kind:'arc-length' as const,distanceMm:Math.PI/2},bands={lengthToleranceMm:1,angleToleranceRad:1e-6},before=evaluateAssemblyArcPath(edge,vertices[0],coordinate,bands),tol=vi.spyOn(getOC().BRep_Tool,'Tolerance').mockReturnValue(.001)
 try{const after=evaluateAssemblyArcPath(edge,vertices[0],coordinate,bands);expect(after.arithmetic).toEqual(before.arithmetic);expect(after.precision.positionMm).toBeGreaterThan(before.precision.positionMm)}finally{tol.mockRestore()}
 const oc=getOC(),method=oc.BRepAdaptor_Curve.prototype.D1,spy=vi.spyOn(oc.BRepAdaptor_Curve.prototype,'D1').mockImplementation(function(this:InstanceType<typeof oc.BRepAdaptor_Curve>,u,p,v){method.call(this,u,p,v);if(u===Math.PI/4)p.SetX(p.X()+1e-8)})
 try{expect(()=>evaluateAssemblyArcPath(edge,vertices[0],coordinate)).toThrow(/precisionLimit/)}finally{spy.mockRestore()}
}))
