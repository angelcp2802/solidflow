import {expect,it} from 'vitest'
import {evaluateLinePathRoll} from './assemblyLinePathRollGeometry'
import type {Vec3} from '../cad/kernel.types'
const dot=(a:Vec3,b:Vec3)=>a.reduce((sum,v,i)=>sum+v*b[i],0)
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
// Independent Rodrigues matrix action for finite perturbations; no production rotations.
function perturb(v:Vec3,axis:Vec3,angle:number):Vec3{const n=Math.hypot(...axis),k=axis.map(x=>x/n) as Vec3,c=Math.cos(angle),s=Math.sin(angle),kv=cross(k,v);return v.map((x,i)=>c*x+s*kv[i]+(1-c)*k[i]*dot(k,v)) as Vec3}
function physical(b:Vec3,t:Vec3,g:Vec3){const U=b.map((x,i)=>x-dot(b,t)*t[i]) as Vec3,V=g.map((x,i)=>x-dot(g,t)*t[i]) as Vec3;return Math.atan2(Math.hypot(...cross(U,V)),dot(U,V))}
it('matches a literal projected quarterturn and both explicit signs',()=>{
 expect(evaluateLinePathRoll([0,1,0],[0,0,1],[.6,0,.8],false,[0,0,0],1e-8).theta).toBeCloseTo(Math.PI/2,14)
 expect(evaluateLinePathRoll([0,1,0],[0,0,1],[.6,0,.8],true,[0,0,0],1e-8).theta).toBeCloseTo(-Math.PI/2,14)
})
it('encloses finite angular changes for 128 independent direction perturbations',()=>{
 const b:Vec3=[0,1,0],t:Vec3=[0,0,1],g:Vec3=[.6,0,.8],errors:[number,number,number]=[.004,.003,.005],r=evaluateLinePathRoll(b,t,g,false,errors,.1)
 const nominal=physical(b,t,g);expect(nominal).toBeCloseTo(Math.PI/2,14)
 for(let i=1;i<=128;i++){
 const vectors=[b,t,g].map((v,role)=>perturb(v,[Math.sin(i+role),Math.cos(2*i-role),Math.sin(3*i+role+.4)],errors[role]*((i%7)+1)/7))
 expect(Math.abs(physical(vectors[0],vectors[1],vectors[2])-nominal)).toBeLessThanOrEqual(r.angularError)
 }
})
it('rejects a projection ball containing zero and wide tangent uncertainty',()=>{
 expect(()=>evaluateLinePathRoll([0,1,0],[0,0,1],[1e-6,0,Math.sqrt(1-1e-12)],false,[0,0,1e-5],.1)).toThrow(RangeError)
 expect(()=>evaluateLinePathRoll([0,1,0],[0,0,1],[1,0,0],false,[0,Math.PI/2,0],.1)).toThrow(RangeError)
})
it('does not execute direction-error accessors',()=>{
 let reads=0;const errors=[0,0,0] as [number,number,number];Object.defineProperty(errors,'2',{enumerable:true,get(){reads++;return 0}})
 expect(()=>evaluateLinePathRoll([0,1,0],[0,0,1],[1,0,0],false,errors,1e-8)).toThrow();expect(reads).toBe(0)
})
