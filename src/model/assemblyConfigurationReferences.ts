import { evaluateAssemblyConfiguration, type AssemblyConfigurationCatalog, type AssemblyConfigurationAncestry, type AssemblyConfigurationScope } from './assemblyConfigurationCore'
import { assemblyMateEndpoints, isAssemblyPathEndpoint, isAssemblyProfileCenterEndpoint, type AssemblyMateEndpointReference, type AssemblyMateEndpointSide } from './assemblyMateEndpoints'
import { assemblyDefinitionKey, type AssemblyDocument, type AssemblyDefinition, type AssemblyDefinitionReference, type AssemblyMate, type AssemblyOccurrence, type AssemblyGeometryReference, type AssemblyCylinderSurfaceReference, type AssemblySphereSurfaceReference, type AssemblyComponentReference, type AssemblyVertexReference } from './assemblyDocument'
import { bodyReferenceCreationFeatureId } from './bodyReferences'
import { composeRigidPoses, type RigidPose } from './rigidPose'
import type { AssemblyComponentCandidate, AssemblyEndpointInspection, AssemblyReferenceDiagnostic, AssemblyReferenceProblem } from './assemblyReferences'

type DeepReadonly<T> = T extends object ? {readonly [K in keyof T]:DeepReadonly<T[K]>}:T
export interface AssemblyConfigurationMateRoleInspection {
  side: AssemblyMateEndpointSide
  reference: AssemblyMateEndpointReference | null
  candidate: AssemblyComponentCandidate | null
  diagnostics: AssemblyReferenceDiagnostic[]
}
export type AssemblyConfigurationMateInspection = DeepReadonly<{
  scopePath:string[]
  scope:AssemblyDefinitionReference
  configuration:string|null
  configurationAncestry:AssemblyConfigurationAncestry[]
  scopePose:RigidPose
  scopeSuppressed:boolean
  suppressed:boolean
  mate:AssemblyMate
  roles:AssemblyConfigurationMateRoleInspection[]
  nativeVerificationRequired:true
}>
type Endpoint = Omit<Extract<AssemblyGeometryReference,{kind:'edge'}>,'support'> | AssemblyGeometryReference | AssemblyCylinderSurfaceReference | AssemblySphereSurfaceReference | AssemblyComponentReference | AssemblyVertexReference
type EffectiveScope = {node:AssemblyDefinition;path:string[];pose:RigidPose;chain:AssemblyOccurrence[];suppressed:boolean;visible:boolean}
type Mutable<T> = T extends object ? {-readonly [K in keyof T]:Mutable<T[K]>}:T
function frozen<T>(value:T,seen=new WeakSet<object>()):DeepReadonly<T> {
  if(value && typeof value==='object' && !seen.has(value)){seen.add(value);for(const child of Object.values(value))frozen(child,seen);Object.freeze(value)}
  return value as DeepReadonly<T>
}
/** Effective declaration inventory only: no native identity, support or satisfaction authority. */
export function inspectAssemblyConfigurationMateReferences(document:AssemblyDocument,catalog:AssemblyConfigurationCatalog,root:string|null=null):readonly AssemblyConfigurationMateInspection[] {
  // Clone only the validated owned evaluation; no alternate AssemblyDocument is fabricated.
  const evaluation=structuredClone(evaluateAssemblyConfiguration(document,catalog,root)) as Mutable<ReturnType<typeof evaluateAssemblyConfiguration>>
  const definitions=new Map<string,AssemblyDefinition>([evaluation.source,...evaluation.source.definitions].map(value=>[assemblyDefinitionKey(value),value]))
  const scopes=new Map<string,AssemblyConfigurationScope>(evaluation.scopes.map(value=>[JSON.stringify(value.path),value]))
  function endpoint(scope: EffectiveScope, reference: Endpoint): AssemblyEndpointInspection {
    const component = 'occurrencePath' in reference ? reference : reference.component
    if (component === null) return { candidate: null, diagnostics: [] }
    const diagnostics: AssemblyReferenceDiagnostic[] = []
    const problem = (code: AssemblyReferenceProblem, path: string[]) => diagnostics.push({ code, path: [...path] })
    let node: AssemblyDefinition = scope.node, path = [...scope.path], pose = scope.pose
    let chain = [...scope.chain], suppressed = scope.suppressed, visible = scope.visible
    for (const id of component.occurrencePath) {
      if (node.kind !== 'assembly') {
        problem('PATH_THROUGH_PART', path)
        return { candidate: null, diagnostics }
      }
      const effective = scopes.get(JSON.stringify(path))
      const occurrence = effective?.occurrences.find(value => value.id === id)
      path = [...path, id]
      if (!occurrence) {
        problem('MISSING_OCCURRENCE', path)
        return { candidate: null, diagnostics }
      }
      pose = composeRigidPoses(pose, occurrence.pose); chain = [...chain, occurrence]
      suppressed ||= occurrence.suppressed; visible &&= occurrence.visible
      // The validated definition graph guarantees this exact revision exists.
      node = definitions.get(assemblyDefinitionKey(occurrence.definition))!
    }
    const candidate = { path, definition: node, chain, worldPose: pose, suppressed, visible }
    if (assemblyDefinitionKey(node) !== assemblyDefinitionKey(component.definition)) problem('STALE_DEFINITION', path)
    if (suppressed) problem('SUPPRESSED_COMPONENT', path)
    // Do not reinterpret stale face IDs against a different part definition.
    if (diagnostics.some(value => value.code === 'STALE_DEFINITION') || !('kind' in reference) || reference.kind === 'principal-plane') {
      return { candidate, diagnostics }
    }
    if (node.kind !== 'part') {
      problem(reference.kind === 'vertex' ? 'VERTEX_REQUIRES_PART' : reference.kind === 'edge' ? 'EDGE_REQUIRES_PART' : 'FACE_REQUIRES_PART', path)
      return { candidate, diagnostics }
    }
    const features = node.document.features
    const topology = reference.kind === 'vertex' ? reference.vertex : reference.kind === 'edge' ? reference.edge : reference.face
    const producer = features.find(value => value.id === topology.sourceFeatureId)
    if (!producer || producer.type === 'sketch' || producer.type === 'plane') problem(reference.kind === 'vertex' ? 'MISSING_VERTEX_PRODUCER' : reference.kind === 'edge' ? 'MISSING_EDGE_PRODUCER' : 'MISSING_FACE_PRODUCER', path)
    else if (producer.suppressed) problem(reference.kind === 'vertex' ? 'SUPPRESSED_VERTEX_PRODUCER' : reference.kind === 'edge' ? 'SUPPRESSED_EDGE_PRODUCER' : 'SUPPRESSED_FACE_PRODUCER', path)
    if (reference.body !== null) {
      if (!bodyReferenceCreationFeatureId(features, reference.body)) problem('MISSING_BODY_STATE', path)
      else if (features.find(value => value.id === reference.body!.sourceFeatureId)?.suppressed) problem('SUPPRESSED_BODY_PRODUCER', path)
      if (topology.sourceFeatureId !== reference.body.sourceFeatureId) problem(reference.kind === 'vertex' ? 'VERTEX_BODY_STATE_MISMATCH' : reference.kind === 'edge' ? 'EDGE_BODY_STATE_MISMATCH' : 'FACE_BODY_STATE_MISMATCH', path)
    }
    return { candidate, diagnostics }
  }

  function role(scope:EffectiveScope,reference:AssemblyMateEndpointReference|null):AssemblyEndpointInspection {
    if(reference===null)return {candidate:null,diagnostics:[]}
    if(isAssemblyProfileCenterEndpoint(reference)){
      const face=endpoint(scope,{kind:'face',...reference.face,support:'plane'})
      if(reference.axis===null)return face
      const edge=endpoint(scope,{kind:'edge',component:reference.face.component,body:reference.face.body,edge:reference.axis.edge})
      return {candidate:face.candidate,diagnostics:[...face.diagnostics,...edge.diagnostics]}
    }
    if(isAssemblyPathEndpoint(reference)){
      const edge=endpoint(scope,{kind:'edge',component:reference.component,body:reference.body,edge:reference.edge})
      const start=endpoint(scope,{kind:'vertex',component:reference.component,body:reference.body,vertex:reference.startVertex,support:'point'})
      return {candidate:edge.candidate,diagnostics:[...edge.diagnostics,...start.diagnostics]}
    }
    return endpoint(scope,reference)
  }
  const result:AssemblyConfigurationMateInspection[]=[]
  for(const current of evaluation.scopes){
    const chain:AssemblyOccurrence[]=[]
    for(let i=0;i<current.path.length;i++){
      const ancestor=scopes.get(JSON.stringify(current.path.slice(0,i)))!
      chain.push(ancestor.occurrences.find(value=>value.id===current.path[i])!)
    }
    const scope:EffectiveScope={node:definitions.get(assemblyDefinitionKey(current.definition))!,path:current.path,pose:current.worldPose,chain,suppressed:current.suppressed,visible:current.visible}
    const ancestry=evaluation.scopes.filter(value=>value.path.length<=current.path.length&&value.path.every((id,i)=>current.path[i]===id))
      .map(value=>({path:value.path,definition:value.definition,configuration:value.configuration}))
    for(const mate of current.mates){
      result.push({scopePath:current.path,scope:current.definition,configuration:current.configuration,configurationAncestry:ancestry,
        scopePose:current.worldPose,scopeSuppressed:current.suppressed,suppressed:current.suppressed||mate.suppressed,mate,
        roles:assemblyMateEndpoints(mate).map(entry=>({side:entry.side,reference:entry.reference,...role(scope,entry.reference)})),nativeVerificationRequired:true as const})
    }
  }
  return frozen(result)
}
