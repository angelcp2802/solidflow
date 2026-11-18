import { validateAssemblyMate, type AssemblyMate } from './assemblyDocument'

export type AssemblyConfigurationMechanicalMate = Extract<AssemblyMate,
  {type:'concentric'|'lock'|'gear'|'screw'|'rack-pinion'}>
/** Complete declared capture/winding replacement, never a parameter edit or
 * evidence that these values were measured from the current native geometry. */
export type AssemblyConfigurationCapture =
  | Pick<Extract<AssemblyMate,{type:'concentric'}>, 'type'|'rotationLock'>
  | Pick<Extract<AssemblyMate,{type:'lock'}>, 'type'|'relativePose'>
  | Pick<Extract<AssemblyMate,{type:'gear'}>, 'type'|'neutralRotations'|'angles'|'phase'>
  | Pick<Extract<AssemblyMate,{type:'screw'}>, 'type'|'neutralRotation'|'neutralTravel'|'angle'>
  | Pick<Extract<AssemblyMate,{type:'rack-pinion'}>, 'type'|'neutralRotation'|'neutralTravel'|'angle'>
export function isAssemblyConfigurationMechanicalMate(mate:AssemblyMate):mate is AssemblyConfigurationMechanicalMate {
  return mate.type==='concentric'||mate.type==='lock'||mate.type==='gear'||mate.type==='screw'||mate.type==='rack-pinion'
}
function fields(mate:AssemblyConfigurationMechanicalMate):AssemblyConfigurationCapture {
  switch(mate.type){
    case 'concentric':return {type:mate.type,rotationLock:mate.rotationLock}
    case 'lock':return {type:mate.type,relativePose:mate.relativePose}
    case 'gear':return {type:mate.type,neutralRotations:mate.neutralRotations,angles:mate.angles,phase:mate.phase}
    case 'screw':case 'rack-pinion':return {type:mate.type,neutralRotation:mate.neutralRotation,neutralTravel:mate.neutralTravel,angle:mate.angle}
  }
}
function keys(type:AssemblyConfigurationMechanicalMate['type']):string[] {
  switch(type){
    case 'concentric':return ['type','rotationLock']
    case 'lock':return ['type','relativePose']
    case 'gear':return ['type','neutralRotations','angles','phase']
    case 'screw':case 'rack-pinion':return ['type','neutralRotation','neutralTravel','angle']
  }
}
function checked(mate:AssemblyConfigurationMechanicalMate,input:unknown):AssemblyConfigurationMechanicalMate {
  if(!input||typeof input!=='object'||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw Error('Configuration capture requires a plain data record.')
  const descriptors=Object.getOwnPropertyDescriptors(input),names=keys(mate.type),values:Record<string,unknown>=Object.create(null)
  if(Reflect.ownKeys(descriptors).length!==names.length)throw Error('Configuration capture fields must be complete and exact.')
  for(const key of Reflect.ownKeys(descriptors)){
    if(typeof key!=='string'||!names.includes(key)||!descriptors[key].enumerable||!('value'in descriptors[key])||descriptors[key].value===undefined)throw Error('Unknown or executable configuration capture field.')
    values[key]=descriptors[key].value
  }
  if(values.type!==mate.type)throw Error('Configuration capture has a different mechanical family.')
  // The saved syntax parser bounds and validates nested arrays/records before
  // reading any capture values. Only the whitelisted keys can replace data.
  const result=validateAssemblyMate({...mate,...values})
  if(!isAssemblyConfigurationMechanicalMate(result))throw Error('Configuration capture family changed.')
  return result
}
export interface AssemblyConfigurationCaptureValidator {
  validateCapture(input:unknown):AssemblyConfigurationCapture
  apply(input:unknown):AssemblyConfigurationMechanicalMate
}
function freezeOwned(value:object,seen=new WeakSet<object>()):void {
  if(seen.has(value))return
  seen.add(value)
  for(const child of Object.values(value))if(child&&typeof child==='object')freezeOwned(child,seen)
  Object.freeze(value)
}
/** Own and validate one base declaration for a closed local validation batch.
 * No caller provider/callback, capture proof or reusable native authority is
 * accepted. Every capture still passes the complete nested mate parser. */
export function createAssemblyConfigurationCaptureValidator(baseMate:AssemblyMate):AssemblyConfigurationCaptureValidator {
  const mate=validateAssemblyMate(baseMate)
  if(!isAssemblyConfigurationMechanicalMate(mate))throw Error('Configuration captures require a declared mechanical family.')
  freezeOwned(mate)
  return Object.freeze({
    validateCapture(input:unknown){return fields(checked(mate,input))},
    apply(input:unknown){return checked(mate,input)},
  })
}
/** Detached normalized capture data. No native capture/proof authority. */
export function validateAssemblyConfigurationCapture(baseMate:AssemblyMate,input:unknown):AssemblyConfigurationCapture {
  return createAssemblyConfigurationCaptureValidator(baseMate).validateCapture(input)
}
/** Detached full mate with unchanged authored references, parameters and
 * suppression. Public calls always validate and detach their own base first. */
export function applyAssemblyConfigurationCapture(baseMate:AssemblyMate,capture:unknown):AssemblyMate {
  return createAssemblyConfigurationCaptureValidator(baseMate).apply(capture)
}
