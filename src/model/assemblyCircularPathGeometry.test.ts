import {expect,it} from 'vitest'
import {evaluateCircularPathGeometry,type CircularPathGeometryInput} from './assemblyCircularPathGeometry'
import {RotationChartError} from './assemblyKinematics'
import type {Vec3} from '../cad/kernel.types'
const base=(point:Vec3=[Math.SQRT2,Math.SQRT2,0]):CircularPathGeometryInput=>({point,radial:[1,0,0],tangent:[0,1,0],radius:2,sweep:Math.PI/2,position:{mode:'free',domain:'trim'},positionError:0,radiusError:0,frameErrorRad:0,sweepErrorRad:0,lengthTolerance:1e-6})
const near=(a:readonly number[],b:readonly number[],band=1e-12)=>a.forEach((v,i)=>expect(Math.abs(v-b[i])).toBeLessThanOrEqual(band))
const dot=(a:Vec3,b:Vec3)=>a.reduce((s,v,i)=>s+v*b[i],0)
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
function rotate(v:Vec3,w:Vec3):Vec3{const angle=Math.hypot(...w);if(angle===0)return [...v];const k=w.map(x=>x/angle)as Vec3,c=Math.cos(angle),s=Math.sin(angle),kv=cross(k,v);return v.map((x,i)=>x*c+kv[i]*s+k[i]*dot(k,v)*(1-c))as Vec3}
for(const [point,s]of [[[2,0,0],0],[[Math.SQRT2,Math.SQRT2,0],Math.PI/2],[[0,2,0],Math.PI]]as const)it('minor arc literal material coordinate '+s,()=>{
 const r=evaluateCircularPathGeometry(base([...point]));expect(r.rows).toHaveLength(2);expect(r.inequalities).toHaveLength(2);expect(r.positionResidual).toBeLessThan(1e-14);expect(r.coordinate).toBeCloseTo(s,13);expect(r.inequalities[0].margin).toBeCloseTo(s,13);expect(r.inequalities[1].margin).toBeCloseTo(Math.PI-s,13);near(r.normal,[0,0,1]);near(r.tangent,[-point[1]/2,point[0]/2,0])
})
it('keeps the selected major trim and distinguishes trim distance from support-circle',()=>{
 const q=base([Math.sqrt(3),-1,0]);q.sweep=3*Math.PI/2;const trim=evaluateCircularPathGeometry(q),support=evaluateCircularPathGeometry({...q,position:{mode:'free',domain:'support-circle'}});expect(trim.positionResidual).toBeCloseTo(Math.sqrt(8-4*Math.sqrt(3)),13);expect(support.positionResidual).toBeLessThan(1e-14);expect(support.inequalities).toEqual([]);expect(trim.inequalities.some(x=>x.margin<0)).toBe(true);expect(evaluateCircularPathGeometry({...q,point:[-2,0,0]}).positionResidual).toBe(0)
})
it('cuts only the trim complement chart and never adds that cut to support-circle',()=>{
 const point:Vec3=[-Math.SQRT2,-Math.SQRT2,0];expect(()=>evaluateCircularPathGeometry(base(point))).toThrow(RotationChartError);const r=evaluateCircularPathGeometry({...base(point),position:{mode:'free',domain:'support-circle'}});expect(r.positionResidual).toBeLessThan(1e-14);expect(r.inequalities).toEqual([])
})
it('free center is a radial chart failure but fixed material target remains regular there',()=>{
 expect(()=>evaluateCircularPathGeometry(base([0,0,0]))).toThrow(RotationChartError);const r=evaluateCircularPathGeometry({...base([0,0,0]),position:{mode:'coordinate',distance:Math.PI/2}});expect(r.rows).toHaveLength(3);near(r.rows.map(x=>x.residual),[-Math.SQRT2,-Math.SQRT2,0]);expect(r.positionResidual).toBeCloseTo(2,14);expect(r.phaseGradient).toEqual([0,0,0]);near(r.radial,[Math.SQRT1_2,Math.SQRT1_2,0]);near(r.tangent,[-Math.SQRT1_2,Math.SQRT1_2,0])
})
it('measures the actual norm even when each scalar circle row fits individually',()=>{
 const q=base([2+8e-7,0,8e-7]),r=evaluateCircularPathGeometry(q);expect(r.rows.every(x=>Math.abs(x.residual)<1e-6)).toBe(true);expect(r.positionResidual).toBeGreaterThan(q.lengthTolerance)
})
it('uses a literal proper 3D path frame instead of assuming global XY',()=>{
 const q=base([1.2,0,1.6]);q.radial=[.6,0,.8];q.tangent=[0,1,0];const r=evaluateCircularPathGeometry(q);expect(r.positionResidual).toBeLessThan(1e-14);near(r.normal,[-.8,0,.6]);near(r.radial,[.6,0,.8]);near(r.tangent,[0,1,0]);expect(r.coordinate).toBeCloseTo(0,14)
})
it('charges normalization and Gram-Schmidt defect without erasing supplied uncertainty',()=>{
 const exact=evaluateCircularPathGeometry(base()),q=base();q.radial=[1+2e-10,0,0];q.tangent=[3e-10,1-1e-10,0];const r=evaluateCircularPathGeometry(q);expect(r.positionError).toBeGreaterThan(exact.positionError);expect(r.tangentErrorRad).toBeGreaterThan(exact.tangentErrorRad);near(r.normal,[0,0,1]);expect(()=>evaluateCircularPathGeometry({...q,lengthTolerance:1e-12})).toThrow(/precisionLimit/)
})
for(const mode of ['free','coordinate']as const)it('point/radius/frame/sweep finite envelope for '+mode,()=>{
 const q=base([.2,-2.1,.4]);q.position=mode==='free'?{mode:'free',domain:'trim'}:{mode:'coordinate',distance:Math.PI/2};q.positionError=.01;q.radiusError=.02;q.frameErrorRad=.003;q.sweepErrorRad=.004;q.lengthTolerance=1
 const r=evaluateCircularPathGeometry(q);let maximum=0
 const actualDistance=(p:Vec3,a:Vec3,b:Vec3,R:number,beta:number)=>{const n=cross(a,b),x=dot(a,p),y=dot(b,p),z=dot(n,p),angle=Math.atan2(y,x),phase=angle<0?angle+2*Math.PI:angle;return phase<=beta?Math.hypot(z,Math.hypot(x,y)-R):Math.min(Math.hypot(...p.map((v,i)=>v-R*a[i])),Math.hypot(...p.map((v,i)=>v-R*(Math.cos(beta)*a[i]+Math.sin(beta)*b[i]))))}
 for(const signP of [-1,1])for(const signR of [-1,1])for(const signF of [-1,1])for(const signB of [-1,1]){const point=q.point.map((v,i)=>v+(i===2?signP*.01:0))as Vec3,R=2+signR*.02,w:Vec3=[signF*.003/Math.sqrt(2),signF*.003/Math.sqrt(2),0],a=rotate([1,0,0],w),b=rotate([0,1,0],w),beta=q.sweep+signB*.004;const defect=mode==='free'?actualDistance(point,a,b,R,beta):Math.hypot(...point.map((v,i)=>v-R*(Math.cos(Math.PI/2/R)*a[i]+Math.sin(Math.PI/2/R)*b[i])));maximum=Math.max(maximum,Math.abs(defect-r.positionResidual));expect(Math.abs(defect-r.positionResidual)).toBeLessThanOrEqual(r.positionError)}expect(maximum).toBeGreaterThan(.005)
})
it('withholds uncertain radial phase, radius denominator and open-sweep identity',()=>{
 const near=base([1e-6,0,0]);near.positionError=1e-5;near.lengthTolerance=1;expect(()=>evaluateCircularPathGeometry(near)).toThrow(/precisionLimit/);expect(()=>evaluateCircularPathGeometry({...base(),radiusError:2,position:{mode:'coordinate',distance:0},lengthTolerance:10})).toThrow(/radius uncertainty/);expect(()=>evaluateCircularPathGeometry({...base(),sweep:2*Math.PI-1e-9,sweepErrorRad:1e-8})).toThrow(/proper open trim/)
})
it('fixed distance rejects outside trim instead of periodic wrapping or extrapolating',()=>{
 for(const distance of [-1,Math.PI+1])expect(()=>evaluateCircularPathGeometry({...base(),position:{mode:'coordinate',distance}})).toThrow();expect(()=>evaluateCircularPathGeometry({...base(),radius:0})).toThrow();expect(()=>evaluateCircularPathGeometry({...base(),sweep:2*Math.PI})).toThrow()
})
it('never executes outer or nested getters and rejects sparse vectors',()=>{
 let reads=0;const a=base();Object.defineProperty(a,'radius',{enumerable:true,get(){reads++;return 2}});expect(()=>evaluateCircularPathGeometry(a)).toThrow();const b=base();Object.defineProperty(b.position,'mode',{enumerable:true,get(){reads++;return'free'}});expect(()=>evaluateCircularPathGeometry(b)).toThrow();const c=base();c.point=Array(3)as Vec3;expect(()=>evaluateCircularPathGeometry(c)).toThrow();expect(reads).toBe(0)
})
for(const major of [false,true])it('independent central differences of all point rows, phase and both bounds major='+major,()=>{
 const q=base([-.7,2.3,.4]);if(major)q.sweep=3*Math.PI/2;const r=evaluateCircularPathGeometry(q)
 for(const h of [1e-5,2e-6])for(let j=0;j<3;j++){const low=structuredClone(q),high=structuredClone(q);low.point[j]-=h;high.point[j]+=h;const a=evaluateCircularPathGeometry(low),b=evaluateCircularPathGeometry(high);r.rows.forEach((row,i)=>expect(Math.abs((b.rows[i].residual-a.rows[i].residual)/(2*h)-row.gradient[j])).toBeLessThan(2e-8));r.inequalities.forEach((row,i)=>expect(Math.abs((b.inequalities[i].margin-a.inequalities[i].margin)/(2*h)-row.gradient[j])).toBeLessThan(2e-8));expect(Math.abs((b.phaseRad-a.phaseRad)/(2*h)-r.phaseGradient[j])).toBeLessThan(2e-8)}
})
it('fixed full-vector gradient is identity and conditioning scales lengths only',()=>{
 const q=base([.8,.9,.3]);q.position={mode:'coordinate',distance:.7};const r=evaluateCircularPathGeometry(q);r.rows.forEach((row,i)=>near(row.gradient,[0,1,2].map(j=>i===j?1:0)));for(const k of [1e-200,1e-6,1e6,1e200]){const z=structuredClone(q);z.point=z.point.map(x=>x*k)as Vec3;z.radius*=k;z.position={mode:'coordinate',distance:.7*k};z.lengthTolerance*=k;const v=evaluateCircularPathGeometry(z);expect(v.positionResidual/k).toBeCloseTo(r.positionResidual,12);expect(v.positionError/k).toBeCloseTo(r.positionError,12);near(v.tangent,r.tangent);near(v.radial,r.radial)}
})

it('requires positive radius under its full uncertainty even with a loose free band',()=>{
 for(const domain of ['trim','support-circle']as const)expect(()=>evaluateCircularPathGeometry({...base(),position:{mode:'free',domain},radiusError:2,lengthTolerance:100})).toThrow(/radius uncertainty/)
})
it('retains sweep uncertainty in the centered chart cut and full upper margin',()=>{
 const q=base(),h=q.sweep/2,theta=h+Math.PI-1e-5;q.point=[2*Math.cos(theta),2*Math.sin(theta),0];q.sweepErrorRad=4e-5;q.lengthTolerance=.01;expect(()=>evaluateCircularPathGeometry(q)).toThrow(RotationChartError)
 const plain=base([2,0,0]);plain.sweepErrorRad=.001;plain.lengthTolerance=1;const r=evaluateCircularPathGeometry(plain);expect(r.inequalities[1].error).toBeGreaterThanOrEqual(2*.001)
})
it('bounds actual lower and upper margins under independent finite point/frame/radius/sweep perturbations',()=>{
 const q=base([1.3,1.2,.4]);q.positionError=.002;q.radiusError=.003;q.frameErrorRad=.004;q.sweepErrorRad=.005;q.lengthTolerance=1;const r=evaluateCircularPathGeometry(q)
 for(const sp of [-1,1])for(const sr of [-1,1])for(const sf of [-1,1])for(const sb of [-1,1]){const point=q.point.map((v,i)=>v+(i===0?sp*.002:0))as Vec3,w:Vec3=[sf*.004/Math.sqrt(3),sf*.004/Math.sqrt(3),sf*.004/Math.sqrt(3)],a=rotate([1,0,0],w),b=rotate([0,1,0],w),radius=2+sr*.003,beta=q.sweep+sb*.005,theta=Math.atan2(dot(b,point),dot(a,point)),margins=[radius*theta,radius*(beta-theta)];for(let i=0;i<2;i++)expect(Math.abs(margins[i]-r.inequalities[i].margin)).toBeLessThanOrEqual(r.inequalities[i].error)}
})
it('keeps free phase gradients homogeneous without squared-radius overflow or underflow',()=>{
 const q=base([1.3,1.2,.4]),r=evaluateCircularPathGeometry(q)
 for(const k of [1e-200,1e200]){const a=evaluateCircularPathGeometry({...q,point:q.point.map(x=>x*k)as Vec3,radius:q.radius*k,lengthTolerance:q.lengthTolerance*k});near(a.phaseGradient.map(x=>x*k),r.phaseGradient,1e-12);near(a.rows[1].gradient,r.rows[1].gradient,1e-12);expect(a.positionResidual/k).toBeCloseTo(r.positionResidual,12)}
})
