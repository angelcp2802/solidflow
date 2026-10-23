import { assemblyDefinitionKey, type AssemblyDocument, type AssemblyDefinitionReference, type AssemblyMate } from './assemblyDocument'
import { evaluateAssemblyConfiguration, type AssemblyConfigurationCatalog } from './assemblyConfigurationCore'
import { planAssemblyConfigurationSolve } from './assemblyConfigurationSolveGraph'
import { inspectAssemblyConfigurationMateReferences } from './assemblyConfigurationReferences'
import { validateAssemblyConfigurationCapture, type AssemblyConfigurationCapture } from './assemblyConfigurationCapture'
import { validateRigidPose, type RigidPose } from './rigidPose'

export interface AssemblyConfigurationSolveStateUpdate {
  definition: AssemblyDefinitionReference
  configuration: string | null
  poses: { id: string; pose: RigidPose }[]
  gearAngles: { mateId: string; first: number; second: number }[]
  screwAngles: { mateId: string; angle: number }[]
  rackPinionAngles: { mateId: string; angle: number }[]
}
type ReadonlyData<T> = T extends object ? { readonly [K in keyof T]: ReadonlyData<T[K]> } : T
function freeze<T>(value:T, seen=new WeakSet<object>()):ReadonlyData<T> {
  if(value && typeof value==='object' && !seen.has(value)) {
    seen.add(value); for(const child of Object.values(value)) freeze(child,seen); Object.freeze(value)
  }
  return value as ReadonlyData<T>
}
function record(value:unknown, keys:string[]):Record<string,unknown> {
  if(!value || typeof value!=='object' || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) throw Error('Solve state requires plain own data.')
  const fields=Object.getOwnPropertyDescriptors(value)
  if(Reflect.ownKeys(fields).length!==keys.length) throw Error('Solve state fields must be exact and complete.')
  for(const key of Reflect.ownKeys(fields)) {
    if(typeof key!=='string' || !keys.includes(key) || !fields[key].enumerable || !('value' in fields[key]) || fields[key].value===undefined) throw Error('Unknown or executable solve state field.')
  }
  return value as Record<string,unknown>
}
function array(value:unknown):unknown[] {
  if(!Array.isArray(value) || Object.getPrototypeOf(value)!==Array.prototype || value.length>4096 || Reflect.ownKeys(value).length!==value.length+1) throw Error('Solve output must be a bounded dense array.')
  for(let i=0;i<value.length;i++) {
    const field=Object.getOwnPropertyDescriptor(value,String(i))
    if(!field || !field.enumerable || !('value'in field) || field.value===undefined) throw Error('Executable or sparse solve output.')
  }
  return value
}
function text(value:unknown,maximum=200):string {
  if(typeof value!=='string' || !value.trim() || value.length>maximum || /[\x00-\x1f\x7f]/.test(value)) throw Error('Invalid solve state identifier.')
  return value
}
function finite(value:unknown):number {
  if(typeof value!=='number' || !Number.isFinite(value)) throw Error('Solve winding must be finite.')
  return value
}
function capture(mate:AssemblyMate):AssemblyConfigurationCapture {
  switch(mate.type) {
    case 'gear': return validateAssemblyConfigurationCapture(mate,{type:mate.type,neutralRotations:mate.neutralRotations,angles:mate.angles,phase:mate.phase})
    case 'screw': case 'rack-pinion': return validateAssemblyConfigurationCapture(mate,{type:mate.type,neutralRotation:mate.neutralRotation,neutralTravel:mate.neutralTravel,angle:mate.angle})
    default: throw Error('Not a lifted mechanical declaration.')
  }
}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)

/** Authored numerical writeback only. No native proof, capture or Apply authority.
 * Shared child state changes propagate to all parent uses selecting that state.
 * Base changes explicitly preserve prior named-state inheritance under Core caps. */
export function stageAssemblyConfigurationSolveState(document:AssemblyDocument,catalog:AssemblyConfigurationCatalog,rootConfiguration:string|null,update:AssemblyConfigurationSolveStateUpdate) {
  const raw=record(update,['definition','configuration','poses','gearAngles','screwAngles','rackPinionAngles'])
  const definition=record(raw.definition,['id','revision'])
  const target={id:text(definition.id),revision:text(definition.revision)}
  const configuration=raw.configuration===null?null:text(raw.configuration,128)
  const poses=new Map<string,RigidPose>()
  for(const value of array(raw.poses)) {
    const row=record(value,['id','pose']),id=text(row.id)
    if(poses.has(id)) throw Error('Duplicate solved body.')
    poses.set(id,validateRigidPose(row.pose))
  }
  function angles(value:unknown,gear:boolean) {
    const result=new Map<string,number[]>()
    for(const entry of array(value)) {
      const row=record(entry,gear?['mateId','first','second']:['mateId','angle']),id=text(row.mateId)
      if(result.has(id)) throw Error('Duplicate lifted mechanical output.')
      result.set(id,gear?[finite(row.first),finite(row.second)]:[finite(row.angle)])
    }
    return result
  }
  const gear=angles(raw.gearAngles,true),screw=angles(raw.screwAngles,false),rack=angles(raw.rackPinionAngles,false)
  const plan=planAssemblyConfigurationSolve(document,catalog,rootConfiguration)
  const state=plan.states.find(s=>assemblyDefinitionKey(s.definition)===assemblyDefinitionKey(target) && s.configuration===configuration)
  if(!state) throw Error('Solve writeback requires an active exact intrinsic state.')
  if(poses.size!==state.bodies.length || state.bodies.some(body=>!poses.has(body.id))) throw Error('Solved body output IDs must exactly match active direct bodies.')
  for(const body of state.bodies) if(body.fixed && !equal(body.pose,poses.get(body.id))) throw Error('A fixed body pose cannot change.')
  const inspections=inspectAssemblyConfigurationMateReferences(document,catalog,rootConfiguration).filter(row=>equal(row.scopePath,state.representativePath))
  const changes=new Map<string,AssemblyConfigurationCapture>()
  for(const [type,outputs] of [['gear',gear],['screw',screw],['rack-pinion',rack]] as const) {
    const mates=state.mates.filter(m=>m.type===type)
    if(outputs.size!==mates.length || mates.some(m=>!outputs.has(m.id))) throw Error('Lifted output IDs must exactly match active and passive mechanical declarations.')
    for(const mate of mates) {
      const inspection=inspections.find(row=>row.mate.id===mate.id)
      if(!inspection || inspection.roles.some(role=>role.diagnostics.length)) throw Error('Unavailable mechanical references cannot be discarded during writeback.')
      const old=capture(mate as AssemblyMate),values=outputs.get(mate.id)!
      changes.set(mate.id,validateAssemblyConfigurationCapture(mate as AssemblyMate,old.type==='gear'?{...old,angles:{first:values[0],second:values[1]}}:{...old,angle:values[0]}))
    }
  }
  const next=structuredClone({document:plan.source,catalog:plan.catalog,rootConfiguration:plan.rootConfiguration}) as {document:AssemblyDocument;catalog:AssemblyConfigurationCatalog;rootConfiguration:string|null}
  const node=assemblyDefinitionKey(next.document)===assemblyDefinitionKey(target)?next.document:next.document.definitions.find(d=>assemblyDefinitionKey(d)===assemblyDefinitionKey(target))
  if(!node || node.kind!=='assembly') throw Error('Solve state owner must be an assembly.')
  const owner=next.catalog.find(row=>assemblyDefinitionKey(row.definition)===assemblyDefinitionKey(target))
  const changedPoses=node.occurrences.filter(o=>poses.has(o.id) && !equal(o.pose,poses.get(o.id)))
  if(configuration===null) {
    for(const variant of owner?.configurations??[]) {
      for(const occurrence of changedPoses) {
        const existing=variant.occurrences.find(row=>row.occurrenceId===occurrence.id)
        if(!existing?.pose) {
          if(existing) existing.pose=structuredClone(occurrence.pose)
          else variant.occurrences.push({occurrenceId:occurrence.id,pose:structuredClone(occurrence.pose)})
        }
      }
      for(const mate of node.mates) {
        const replacement=changes.get(mate.id)
        if(!replacement || equal(capture(mate),replacement)) continue
        const existing=variant.mates.find(row=>row.mateId===mate.id)
        if(!existing?.capture) {
          if(existing) existing.capture=capture(mate)
          else variant.mates.push({mateId:mate.id,suppressed:mate.suppressed,capture:capture(mate)})
        }
      }
    }
    for(const occurrence of node.occurrences) if(poses.has(occurrence.id)) occurrence.pose=poses.get(occurrence.id)!
    node.mates=node.mates.map(mate=>changes.has(mate.id)?{...mate,...changes.get(mate.id)} as AssemblyMate:mate)
  } else {
    const variant=owner?.configurations.find(row=>row.id===configuration)
    if(!variant) throw Error('Named solve state is missing.')
    for(const body of state.bodies) {
      if(equal(body.pose,poses.get(body.id))) continue
      const existing=variant.occurrences.find(row=>row.occurrenceId===body.id)
      if(existing) existing.pose=poses.get(body.id)!
      else variant.occurrences.push({occurrenceId:body.id,pose:poses.get(body.id)!})
    }
    for(const [mateId,replacement] of changes) {
      const effective=state.mates.find(m=>m.id===mateId)!
      if(equal(capture(effective as AssemblyMate),replacement)) continue
      const existing=variant.mates.find(row=>row.mateId===mateId)
      if(existing) existing.capture=replacement
      else variant.mates.push({mateId,suppressed:effective.suppressed,capture:replacement})
    }
  }
  const checked=evaluateAssemblyConfiguration(next.document,next.catalog,next.rootConfiguration)
  return freeze({document:checked.source,catalog:checked.catalog,rootConfiguration:checked.rootConfiguration})
}
