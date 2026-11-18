import {
  evaluateAssemblyConfiguration, type AssemblyConfigurationCatalog,
  type AssemblyConfigurationAncestry, type AssemblyConfigurationDiagnostic,
} from './assemblyConfigurationCore'
import type { AssemblyDocument, AssemblyDefinitionReference, AssemblyOccurrence, AssemblyMate } from './assemblyDocument'
import type { RigidPose } from './rigidPose'

type DeepReadonly<T> = T extends object ? {readonly [K in keyof T]:DeepReadonly<T[K]>}:T
export type AssemblyConfigurationSolveState = DeepReadonly<{
  key:string
  definition:AssemblyDefinitionReference
  configuration:string|null
  representativePath:string[]
  scopePaths:string[][]
  instances:{scopePath:string[];configurationAncestry:AssemblyConfigurationAncestry[];scopePose:RigidPose;visible:boolean}[]
  /** Complete intrinsic declarations, including suppressed equations/children. */
  occurrences:AssemblyOccurrence[]
  mates:AssemblyMate[]
  childConfigurations:{occurrenceId:string;definition:AssemblyDefinitionReference;configuration:string|null}[]
  /** Unique active assembly child states, in direct occurrence declaration order. */
  dependencies:string[]
  /** Local numerical variables only, never full-document native owner proofs. */
  bodies:{id:string;pose:RigidPose;fixed:boolean}[]
}>
export type AssemblyConfigurationSolvePlan = DeepReadonly<{
  kind:'assembly-configuration-solve-plan'
  source:AssemblyDocument
  catalog:AssemblyConfigurationCatalog
  rootConfiguration:string|null
  status:'ready'|'references-unavailable'
  diagnostics:AssemblyConfigurationDiagnostic[]
  /** Deterministic child-before-parent order; each intrinsic state appears once. */
  states:AssemblyConfigurationSolveState[]
}>
function frozen<T>(value:T,seen=new WeakSet<object>()):DeepReadonly<T> {
  if(value&&typeof value==='object'&&!seen.has(value)){
    seen.add(value);for(const child of Object.values(value))frozen(child,seen);Object.freeze(value)
  }
  return value as DeepReadonly<T>
}
const pathKey=(path:readonly string[])=>JSON.stringify(path)
const stateKey=(definition:AssemblyDefinitionReference,configuration:string|null)=>JSON.stringify([definition.id,definition.revision,configuration])
type Mutable<T> = T extends object ? {-readonly [K in keyof T]:Mutable<T[K]>}:T

/** Pure declaration planning only. Complete source/catalog validation precedes
 * grouping, including dormant variants and unchanged core graph/byte limits.
 * A ready plan is not native reference, solvability or Apply evidence. */
export function planAssemblyConfigurationSolve(document:AssemblyDocument,catalog:AssemblyConfigurationCatalog,rootConfiguration:string|null=null):AssemblyConfigurationSolvePlan {
  const evaluation=evaluateAssemblyConfiguration(document,catalog,rootConfiguration)
  const scopes=new Map(evaluation.scopes.map(scope=>[pathKey(scope.path),scope]))
  const groups=new Map<string,{state:Mutable<AssemblyConfigurationSolveState>;signature:string}>()
  for(const scope of evaluation.scopes){
    if(scope.suppressed)continue
    const key=stateKey(scope.definition,scope.configuration)
    const children=scope.occurrences.flatMap(occurrence=>{
      const child=scopes.get(pathKey([...scope.path,occurrence.id]))
      return child?[{occurrenceId:occurrence.id,definition:{...child.definition},configuration:child.configuration}]:[]
    })
    const dependencies:string[]=[]
    for(const occurrence of scope.occurrences){
      const child=scopes.get(pathKey([...scope.path,occurrence.id]))
      if(!child||child.suppressed)continue
      const dependency=stateKey(child.definition,child.configuration)
      if(!dependencies.includes(dependency))dependencies.push(dependency)
    }
    const intrinsic={definition:scope.definition,configuration:scope.configuration,occurrences:scope.occurrences,mates:scope.mates,childConfigurations:children}
    const signature=JSON.stringify(intrinsic)
    const ancestry=evaluation.scopes.filter(ancestor=>ancestor.path.length<=scope.path.length&&ancestor.path.every((id,i)=>scope.path[i]===id))
      .map(ancestor=>({path:[...ancestor.path],definition:{...ancestor.definition},configuration:ancestor.configuration}))
    const instance={scopePath:[...scope.path],configurationAncestry:ancestry,scopePose:structuredClone(scope.worldPose) as RigidPose,visible:scope.visible}
    const previous=groups.get(key)
    if(previous){
      if(previous.signature!==signature||JSON.stringify(previous.state.dependencies)!==JSON.stringify(dependencies))throw Error('Repeated configured state has inconsistent intrinsic declarations or child selectors.')
      previous.state.scopePaths.push([...scope.path]);previous.state.instances.push(instance)
      continue
    }
    groups.set(key,{signature,state:{key,definition:{...scope.definition},configuration:scope.configuration,
      representativePath:[...scope.path],scopePaths:[[...scope.path]],instances:[instance],
      occurrences:structuredClone(scope.occurrences) as AssemblyOccurrence[],mates:structuredClone(scope.mates) as AssemblyMate[],
      childConfigurations:children,dependencies,
      bodies:scope.occurrences.filter(occurrence=>!occurrence.suppressed).map(occurrence=>({id:occurrence.id,pose:structuredClone(occurrence.pose) as RigidPose,fixed:occurrence.fixed})),
    }})
  }
  const ordered:AssemblyConfigurationSolveState[]=[],visiting=new Set<string>(),complete=new Set<string>()
  function visit(key:string):void {
    if(complete.has(key))return
    if(visiting.has(key))throw Error('Configured state dependency cycle cannot be solved as rigid states.')
    const group=groups.get(key)
    if(!group)throw Error('An active configured child state is missing from the solve plan.')
    visiting.add(key)
    for(const dependency of group.state.dependencies)visit(dependency)
    visiting.delete(key);complete.add(key);ordered.push(group.state)
  }
  for(const key of groups.keys())visit(key)
  return frozen({kind:'assembly-configuration-solve-plan' as const,source:evaluation.source,catalog:evaluation.catalog,
    rootConfiguration:evaluation.rootConfiguration,status:evaluation.status,diagnostics:evaluation.diagnostics,states:ordered})
}
