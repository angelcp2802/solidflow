import type {Vec3} from '../cad/kernel.types'
import {RotationChartError} from './assemblyKinematics'

/** Lengths share the caller's conditioning; errors never enlarge tolerances.
 * radial/tangent are the material START frame, not a guessed circle seam. */
export interface CircularPathGeometryInput {
 point:Vec3; radial:Vec3; tangent:Vec3; radius:number; sweep:number
 position:{mode:'free';domain:'trim'|'support-circle'}|{mode:'coordinate';distance:number}
 positionError:number; radiusError:number;
 /** Angular envelope of the whole proper orthogonal start frame, not merely its normal. */
 frameErrorRad:number; sweepErrorRad:number; lengthTolerance:number
}
export interface CircularPathGeometryResult {
 rows:{residual:number;gradient:Vec3}[]
 inequalities:{bound:'minimum'|'maximum';margin:number;gradient:Vec3;error:number}[]
 tangent:Vec3; radial:Vec3; normal:Vec3; phaseGradient:Vec3; phaseRad:number
 positionResidual:number; positionError:number; tangentErrorRad:number; phaseErrorRad:number
 /** A current centered-chart readout; never a persisted phase or native mode. */
 coordinate:number
}
const ROUND=256*Number.EPSILON,MIN=2**-1022
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
const scale=(a:Vec3,s:number)=>a.map(v=>v*s) as Vec3
const add=(a:Vec3,b:Vec3)=>a.map((v,i)=>v+b[i]) as Vec3
const sub=(a:Vec3,b:Vec3)=>a.map((v,i)=>v-b[i]) as Vec3
const norm=(a:Vec3)=>Math.hypot(...a)
const chord=(angle:number)=>2*Math.sin(Math.min(angle,Math.PI)/2)
function record(value:unknown,keys:string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Circular path geometry requires plain data.')
 const result:Record<string,unknown>={}
 for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key)!;if(typeof key!=='string'||!keys.includes(key)||!d.enumerable||!('value'in d))throw Error('Circular path geometry requires exact own data.');result[key]=d.value}
 if(keys.some(k=>!Object.hasOwn(result,k)))throw Error('Incomplete circular path geometry.')
 return result
}
function vector(value:unknown):Vec3{
 if(!Array.isArray(value)||value.length!==3||Reflect.ownKeys(value).length!==4)throw Error('Circular path geometry requires dense vectors.')
 return [0,1,2].map(i=>{const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!('value'in d)||typeof d.value!=='number'||!Number.isFinite(d.value))throw Error('Circular path vector must contain finite own data.');return d.value}) as Vec3
}
function scalar(value:unknown,positive=false):number{if(typeof value!=='number'||!Number.isFinite(value)||value<0||positive&&value===0)throw Error('Circular path dimensions/errors must be finite and nonnegative.');return value}
/** Original mathematical circle/trim residuals and finite input-error envelopes.
 * The explicit arithmetic allowance is not a formal IEEE interval certificate. */
export function evaluateCircularPathGeometry(input:CircularPathGeometryInput):CircularPathGeometryResult{
 const raw=record(input,['point','radial','tangent','radius','sweep','position','positionError','radiusError','frameErrorRad','sweepErrorRad','lengthTolerance'])
 const point=vector(raw.point),a=vector(raw.radial),b=vector(raw.tangent),R=scalar(raw.radius,true),beta=scalar(raw.sweep,true),tol=scalar(raw.lengthTolerance,true)
 if(beta>=2*Math.PI)throw Error('Material arc requires a proper open sweep below one turn.')
 const E=scalar(raw.positionError),ER=scalar(raw.radiusError),suppliedFrame=scalar(raw.frameErrorRad),EB=scalar(raw.sweepErrorRad)
 if(ER>=R)throw new RangeError('Circular path precisionLimit: radius uncertainty reaches zero.')
 if(EB>=Math.min(beta,2*Math.PI-beta))throw new RangeError('Circular path precisionLimit: uncertain sweep is not a proper open trim.')
 const na=norm(a),nb=norm(b);if(!Number.isFinite(na)||!Number.isFinite(nb)||Math.abs(na-1)>1e-8||Math.abs(nb-1)>1e-8)throw Error('Circular path frame must be near unit.')
 const u=scale(a,1/na),bt=scale(b,1/nb),d=dot(u,bt)
 if(Math.abs(d)>1e-8)throw Error('Circular path frame must be near perpendicular.')
 const projected=sub(bt,scale(u,d)),v=scale(projected,1/norm(projected)),n=cross(u,v)
 // Charge the actual Gram-Schmidt direction change and norm defects; never
 // silently erase a supplied near-frame defect during normalization.
 const EF=suppliedFrame+Math.asin(Math.min(1,Math.abs(d)))+Math.abs(na-1)+Math.abs(nb-1)+ROUND
 const h=beta/2,m=add(scale(u,Math.cos(h)),scale(v,Math.sin(h))),q=add(scale(u,-Math.sin(h)),scale(v,Math.cos(h)))
 const D=norm(point),arithmetic=ROUND*(D+R),length=R*beta
 if(![D,EF,arithmetic,length].every(Number.isFinite)||R<MIN||length<MIN)throw new RangeError('Circular path precisionLimit: finite dimensions unavailable.')
 const positionValue=raw.position
 if(!positionValue||typeof positionValue!=='object')throw Error('Circular path position is required.')
 const mode=Object.getOwnPropertyDescriptor(positionValue,'mode');if(!mode?.enumerable||!('value'in mode))throw Error('Circular position mode must be own data.')
 const position=mode.value==='free'?record(positionValue,['mode','domain']):record(positionValue,['mode','distance'])
 if(position.mode!=='free'&&position.mode!=='coordinate'||position.mode==='free'&&!['trim','support-circle'].includes(position.domain as string))throw Error('Unknown circular path position policy.')
 const rows:CircularPathGeometryResult['rows']=[],inequalities:CircularPathGeometryResult['inequalities']=[]
 let radial:Vec3,tangent:Vec3,phaseGradient:Vec3=[0,0,0],phaseRad:number,phaseErrorRad:number,positionResidual:number,positionError:number,coordinate:number,tangentErrorRad:number
 if(position.mode==='coordinate'){
  const s=scalar(position.distance);if(s>length)throw Error('Fixed material coordinate is outside its trim.')
  const minimumRadius=R-ER;if(!(minimumRadius>0))throw new RangeError('Circular path precisionLimit: radius uncertainty reaches zero.')
  const parameter=s/R,parameterError=Math.abs(parameter)*(ER/minimumRadius)+ROUND*(1+Math.abs(parameter))
  radial=add(scale(u,Math.cos(parameter)),scale(v,Math.sin(parameter)));tangent=add(scale(u,-Math.sin(parameter)),scale(v,Math.cos(parameter)))
  const target=scale(radial,R),defect=sub(point,target)
  rows.push(...defect.map((residual,i)=>({residual,gradient:([0,1,2].map(j=>i===j?1:0) as Vec3)})))
  phaseRad=parameter-h;phaseErrorRad=parameterError+EB/2;coordinate=s
  positionResidual=norm(defect)
  // Also retain possible trim-end uncertainty at a fixed endpoint. This bounds
  // distance to the uncertain open arc without extending its declared range.
  const trimEndError=ER*beta+(R+ER)*EB
  positionError=E+ER+(R+ER)*chord(EF+parameterError)+trimEndError+arithmetic
  tangentErrorRad=EF+parameterError+ROUND
 }else{
  const z=dot(n,point),w=sub(point,scale(n,z)),rho=norm(w)
  if(!(rho>=MIN))throw new RotationChartError('Circular radial chart is unavailable at its center.')
  radial=scale(w,1/rho);tangent=cross(n,radial)
  const C=dot(m,w),S=dot(q,w);phaseRad=Math.atan2(S,C);coordinate=R*(phaseRad+h)
  // A finite 2D coefficient-error ball excludes zero before asin is used.
  const coefficientError=E+D*chord(EF)+arithmetic,EQ=Math.SQRT2*coefficientError
  if(!(EQ<rho))throw new RangeError('Circular path precisionLimit: uncertain radial phase may vanish.')
  const radialPhaseError=Math.asin(EQ/rho)+ROUND
  phaseErrorRad=radialPhaseError+EB/2
  phaseGradient=scale(add(scale(m,-S/rho),scale(q,C/rho)),1/rho)
  const radialDefect=rho-R;rows.push({residual:z,gradient:[...n]},{residual:radialDefect,gradient:[...radial]})
  if(position.domain==='trim'){
   if(Math.PI-Math.abs(phaseRad)<=phaseErrorRad+ROUND)throw new RotationChartError('Circular trim phase reaches its complement chart cut.')
   const marginError=(R+ER)*(radialPhaseError+EB)+ER*(Math.abs(phaseRad)+h)+arithmetic
   inequalities.push({bound:'minimum',margin:R*(h+phaseRad),gradient:scale(phaseGradient,R),error:marginError},{bound:'maximum',margin:R*(h-phaseRad),gradient:scale(phaseGradient,-R),error:marginError})
   const end=add(scale(u,Math.cos(beta)),scale(v,Math.sin(beta)))
   positionResidual=Math.abs(phaseRad)<=h?Math.hypot(z,radialDefect):Math.min(norm(sub(point,scale(u,R))),norm(sub(point,scale(end,R))))
  }else positionResidual=Math.hypot(z,radialDefect)
  // Hausdorff displacement of the circle/trim plus point error is a finite
  // distance-to-set envelope, independent of nearest-point branch changes.
  positionError=E+ER+(R+ER)*chord(EF+(position.domain==='trim'?EB:0))+arithmetic
  tangentErrorRad=EF+radialPhaseError+ROUND
 }
 if(![positionResidual,positionError,phaseRad,phaseErrorRad,tangentErrorRad,coordinate,...radial,...tangent,...n,...phaseGradient,...rows.flatMap(x=>[x.residual,...x.gradient]),...inequalities.flatMap(x=>[x.margin,x.error,...x.gradient])].every(Number.isFinite))throw new RangeError('Circular path precisionLimit: arithmetic exceeds finite precision.')
 if(positionError>tol)throw new RangeError('Circular path precisionLimit: input error exceeds the requested length band.')
 return {rows,inequalities,tangent,radial,normal:n,phaseGradient,phaseRad,positionResidual,positionError,tangentErrorRad,phaseErrorRad,coordinate}
}
