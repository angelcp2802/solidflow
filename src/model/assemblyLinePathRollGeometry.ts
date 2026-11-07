import type { Vec3 } from '../cad/kernel.types'
const EPS=Number.EPSILON
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
const mul=(v:Vec3,s:number)=>v.map(x=>x*s) as Vec3
const sub=(a:Vec3,b:Vec3)=>a.map((v,i)=>v-b[i]) as Vec3
/** Original numerical projected-direction chart. Inputs are unit world vectors.
 * Errors bound angular input variation; the arithmetic allowance is not an IEEE
 * interval certificate. Formal role order is point axis, path tangent, guide. */
export function evaluateLinePathRoll(b:Vec3,t:Vec3,g:Vec3,reverse:boolean,errors:readonly[number,number,number],band:number){
 for(const vector of [b,t,g]){
  if(!Array.isArray(vector)||vector.length!==3||Reflect.ownKeys(vector).length!==4)throw Error('LINE roll requires dense unit vectors.')
  for(let i=0;i<3;i++){const d=Object.getOwnPropertyDescriptor(vector,String(i));if(!d?.enumerable||!('value'in d)||typeof d.value!=='number'||!Number.isFinite(d.value))throw Error('LINE roll requires own finite vector data.')}
  if(Math.abs(Math.hypot(...vector)-1)>1e-12)throw Error('LINE roll requires unit directions.')
 }
 if(typeof reverse!=='boolean'||!Number.isFinite(band)||band<=0||band>=Math.PI||!Array.isArray(errors)||errors.length!==3||Reflect.ownKeys(errors).length!==4)throw Error('Invalid LINE roll bands or direction errors.')
 for(let i=0;i<3;i++){const d=Object.getOwnPropertyDescriptor(errors,String(i));if(!d?.enumerable||!('value'in d)||typeof d.value!=='number'||!Number.isFinite(d.value)||d.value<0)throw Error('LINE roll errors must be nonnegative own finite data.')}
 const project=(x:Vec3)=>sub(x,mul(t,dot(t,x))),U=project(b),V=project(g),lu=Math.hypot(...U),lv=Math.hypot(...V),round=256*EPS
 if(![lu,lv].every(x=>Number.isFinite(x)&&x>=2**-1022))throw new RangeError('Projected LINE roll direction is unavailable.')
 const u=mul(U,1/lu),v=mul(V,(reverse?-1:1)/lv),C=dot(v,u),S=dot(t,cross(v,u)),theta=Math.atan2(S,C),denom=C*C+S*S
 const cone=(error:number,length:number)=>{
  const delta=2*Math.sin(Math.min(error,Math.PI)/2)+Math.sin(Math.min(errors[1],Math.PI/2))+round
  if(!Number.isFinite(delta)||delta>=length)throw new RangeError('LINE roll uncertainty cannot exclude a zero projection.')
  return Math.asin(delta/length)
 }
 const angularError=cone(errors[0],lu)+cone(errors[2],lv)+round
 if(!Number.isFinite(angularError)||angularError>band)throw new RangeError('LINE roll precisionLimit: angular band cannot be retained.')
 const derivatives:Vec3[]=[]
 for(let role=0;role<3;role++){
 const cols:number[]=[]
 for(const w of [[1,0,0],[0,1,0],[0,0,1]] as Vec3[]){
  const dt=role===1?cross(w,t):[0,0,0] as Vec3,db=role===0?cross(w,b):[0,0,0] as Vec3,dg=role===2?cross(w,g):[0,0,0] as Vec3
  const dP=(x:Vec3,dx:Vec3)=>sub(sub(dx,mul(dt,dot(t,x))),mul(t,dot(dt,x)+dot(t,dx)))
  const dU=dP(b,db),dV=dP(g,dg),du=mul(sub(dU,mul(u,dot(u,dU))),1/lu),dv=mul(sub(dV,mul(v,dot(v,dV))),(reverse?-1:1)/lv)
  const dC=dot(dv,u)+dot(v,du),dS=dot(dt,cross(v,u))+dot(t,[...cross(dv,u)].map((x,i)=>x+cross(v,du)[i]) as Vec3)
  cols.push((C*dS-S*dC)/denom)
 }
 derivatives.push(cols as Vec3)
 }
 if(![theta,...derivatives.flat()].every(Number.isFinite))throw new RangeError('LINE roll arithmetic is not finite.')
 return {theta,angularError,derivatives}
}
