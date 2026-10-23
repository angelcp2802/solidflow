import {inspectAssemblyConfigurationMateReferences,type AssemblyConfigurationMateInspection} from '../model/assemblyConfigurationReferences'
import {assemblyMateEndpoints,type AssemblyMateEndpointEntry,type AssemblyMateEndpointReference} from '../model/assemblyMateEndpoints'
import {
 buildConfiguredRelationObservation,configuredResolvedMateWitnesses,
 type ConfiguredResolvedMate,type ConfiguredResolvedBinaryMate,type ConfiguredUnavailableMate,
} from './kernel.assembly-configuration-relations'
import {
  prepareConfiguredAdvancedObservation, observeConfiguredAdvanced,
  type ConfiguredAdvancedPurpose, type ConfiguredAdvancedObservation,
} from './kernel.assembly-configuration-observations'
import type {AssemblyProfileAxisSelection} from '../model/assemblyProfileReferences'
import type {AssemblyLinePathSelection} from '../model/assemblyLinePathReferences'
import type {AssemblyArcPathSelection} from '../model/assemblyArcPathReferences'
import type {AssemblyPathCurveSelection} from '../model/assemblyPathReferences'
import type {AssemblyPathCurveBands,AssemblyPathCurveCoordinate} from './kernel.assembly-path-curves'
import {
  evaluateAssemblyConfiguration, validateAssemblyConfigurationDeclarations, type AssemblyConfigurationCatalog, type AssemblyConfigurationEvaluation,
  type AssemblyConfigurationAncestry,
} from '../model/assemblyConfigurationCore'
import {
  MAX_ASSEMBLY_BYTES, assemblyDefinitionKey, assemblyOccurrencePathKey,
  validateAssemblyDocument, validateAssemblyMate, validateAssemblyPlaneReference, validateAssemblyVertexReference, validateAssemblyGeometryReference,
  validateAssemblyCylinderSurfaceReference, validateAssemblySphereSurfaceReference,
  type AssemblyDocument, type AssemblyDefinition, type AssemblyDefinitionReference,
  type AssemblyComponentReference, type AssemblyPlaneReference, type AssemblyVertexReference,
  type AssemblyGeometryReference, type AssemblyCylinderSurfaceReference, type AssemblySphereSurfaceReference, type AssemblyMate,
} from '../model/assemblyDocument'
import {validateDocument} from '../model/document'
import {validateRigidPose, transformRigidPoint, transformRigidDirection, type RigidPose} from '../model/rigidPose'
import {CadEngine} from './kernel.engine'
import {principalPlaneFrame} from './kernel.frames'
import {NativeCleanupError} from './kernel.native-ownership'
import {
  MAX_ASSEMBLY_NATIVE_BODY_ENTRIES, MAX_ASSEMBLY_NATIVE_FACE_REFERENCES,
  MAX_ASSEMBLY_NATIVE_EDGE_REFERENCES, MAX_ASSEMBLY_NATIVE_VERTEX_REFERENCES,
  type AssemblyFaceSelection, type AssemblyVertexSelection,
} from './kernel.assembly-snapshot'
import type {AssemblyNativeFaceSupport, AssemblyNativePointSupport, AssemblyNativeSupport, AssemblyNativeCylinderSurfaceSupport, AssemblyNativeSphereSurfaceSupport} from './kernel.assembly-supports'
import type {BodyReference, EdgeReference} from './kernel.types'

type ReadonlyData<T> = T extends object ? {readonly [K in keyof T]:ReadonlyData<T[K]>}:T
export interface AssemblyConfigurationGeometryInput {
  document: AssemblyDocument
  catalog: AssemblyConfigurationCatalog
  rootConfiguration: string|null
  /** Controller epoch: advance on every context change, including away/back. */
  generation: number
}
type PlaneSupport=Extract<AssemblyNativeFaceSupport,{kind:'plane'}>
interface ConfiguredBase {
  componentPath:string[]
  definition:AssemblyDefinitionReference
  declaredWorldPose:RigidPose
  configurationAncestry:AssemblyConfigurationAncestry[]
  topLevelOwner:string|null
}
export type ConfiguredPlaneWitness=ReadonlyData<ConfiguredBase & {
  kind:'configured-plane';origin:'native-face'|'principal-plane';localSupport:PlaneSupport;worldSupport:PlaneSupport
}>
export type ConfiguredPointWitness=ReadonlyData<ConfiguredBase & {
  kind:'configured-point';origin:'native-vertex';localSupport:AssemblyNativePointSupport;worldSupport:AssemblyNativePointSupport
}>
export type ConfiguredComponentWitness=ReadonlyData<ConfiguredBase & {kind:'configured-component';origin:'component'}>
export type ConfiguredGeometryWitness=ReadonlyData<ConfiguredBase & {kind:'configured-support';origin:'native-face'|'native-edge'|'principal-plane';localSupport:AssemblyNativeSupport;worldSupport:AssemblyNativeSupport}>
export type ConfiguredDirectionWitness=ReadonlyData<ConfiguredBase & {kind:'configured-direction';origin:'native-face'|'native-edge'|'principal-plane';localSupport:AssemblyNativeSupport;worldSupport:AssemblyNativeSupport}>
export type ConfiguredCylinderSurfaceWitness=ReadonlyData<ConfiguredBase & {kind:'configured-cylinder-surface';origin:'native-cylinder-surface';localSupport:AssemblyNativeCylinderSurfaceSupport;worldSupport:AssemblyNativeCylinderSurfaceSupport}>
export type ConfiguredSphereSurfaceWitness=ReadonlyData<ConfiguredBase & {kind:'configured-sphere-surface';origin:'native-sphere-surface';localSupport:AssemblyNativeSphereSurfaceSupport;worldSupport:AssemblyNativeSphereSurfaceSupport}>
export interface AssemblyConfigurationEdgeSelection {component:AssemblyComponentReference;body:BodyReference|null;edge:EdgeReference}
export type ConfiguredAdvancedWitness=ReadonlyData<ConfiguredBase & ConfiguredAdvancedObservation>
export type ConfiguredProfileWitness=Extract<ConfiguredAdvancedWitness,{kind:'configured-profile'}>
export type ConfiguredProfileAxisWitness=Extract<ConfiguredAdvancedWitness,{kind:'configured-profile-axis'}>
export type ConfiguredLinePathWitness=Extract<ConfiguredAdvancedWitness,{kind:'configured-line-path'}>
export type ConfiguredArcPathWitness=Extract<ConfiguredAdvancedWitness,{kind:'configured-arc-path'}>
export type ConfiguredArcPathEvaluationWitness=Extract<ConfiguredAdvancedWitness,{kind:'configured-arc-evaluation'}>
export type ConfiguredPathCurveWitness=Extract<ConfiguredAdvancedWitness,{kind:'configured-path-curve'}>
export type ConfiguredPathCurveEvaluationWitness=Extract<ConfiguredAdvancedWitness,{kind:'configured-path-evaluation'}>
export type AssemblyConfigurationWitness=ConfiguredPlaneWitness|ConfiguredPointWitness|ConfiguredComponentWitness|ConfiguredGeometryWitness|ConfiguredDirectionWitness|ConfiguredCylinderSurfaceWitness|ConfiguredSphereSurfaceWitness|ConfiguredAdvancedWitness
const proofs=new WeakMap<object,{owner:AssemblyConfigurationGeometrySnapshot;placementSum:number;depth:number}>()
const relationProofs=new WeakMap<object,{owner:AssemblyConfigurationGeometrySnapshot;children:readonly AssemblyConfigurationWitness[]}>()

/** Authentic configuration proof arithmetic, never a DTO or legacy grant. */
export function assemblyConfigurationPlacementArithmetic(value:AssemblyConfigurationWitness,input:AssemblyConfigurationGeometryInput):{placementSum:number;depth:number}{
  const proof=value&&typeof value==='object'?proofs.get(value):undefined
  if(!proof)throw Error('La referencia no pertenece a una sesión configurada auténtica.')
  proof.owner.assertWitness(value,input)
  return {placementSum:proof.placementSum,depth:proof.depth}
}
function freeze<T>(value:T,seen=new WeakSet<object>()):ReadonlyData<T>{
  if(value&&typeof value==='object'&&!seen.has(value)){
    seen.add(value);for(const child of Object.values(value))freeze(child,seen);Object.freeze(value)
  }
  return value as ReadonlyData<T>
}
function capture(input:AssemblyConfigurationGeometryInput,expanded:true):{evaluation:AssemblyConfigurationEvaluation;signature:string}
function capture(input:AssemblyConfigurationGeometryInput,expanded?:false):{signature:string}
function capture(input:AssemblyConfigurationGeometryInput,expanded=false){
  if(!input||typeof input!=='object'||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw Error('El contexto configurado debe ser un registro de datos.')
  const fields=Object.getOwnPropertyDescriptors(input),names=['document','catalog','rootConfiguration','generation']
  if(Reflect.ownKeys(fields).length!==names.length||names.some(key=>!fields[key]?.enumerable||!('value'in fields[key])||fields[key].value===undefined))throw Error('El contexto configurado requiere sus cuatro campos de datos exactos.')
  const generation=fields.generation.value
  if(typeof generation!=='number'||!Number.isSafeInteger(generation)||generation<0)throw Error('La generación configurada debe ser un entero seguro no negativo.')
  // Construction still admits the complete expanded tree. Currentness needs
  // the same normalized declaration signature, not another expansion of the
  // already admitted immutable context. Every declaration is parsed afresh.
  const evaluation=expanded?evaluateAssemblyConfiguration(fields.document!.value!,fields.catalog!.value,fields.rootConfiguration!.value!)
    :validateAssemblyConfigurationDeclarations(fields.document!.value!,fields.catalog!.value,fields.rootConfiguration!.value!)
  const signature=JSON.stringify({document:evaluation.source,catalog:evaluation.catalog,rootConfiguration:evaluation.rootConfiguration,generation})
  if(new TextEncoder().encode(signature).byteLength>MAX_ASSEMBLY_BYTES)throw Error('El contexto configurado supera 20 MiB.')
  return {evaluation,signature}
}
interface PartState {
  engine:CadEngine
  faces:Omit<AssemblyFaceSelection,'component'>[]
  vertices:Omit<AssemblyVertexSelection,'component'>[]
  edges:Omit<AssemblyConfigurationEdgeSelection,'component'>[]
  bodyEntries:number
}
interface Placement {
  definition:AssemblyDefinition
  pose:RigidPose
  suppressed:boolean
  ancestry:AssemblyConfigurationAncestry[]
}

/** Separate live native geometry for one complete effective configuration.
 * No evaluation DTO, flattened document, solver token or legacy proof is admitted. */
export class AssemblyConfigurationGeometrySnapshot {
  #evaluation:AssemblyConfigurationEvaluation
  #signature:string
  #alive=true
  #parts=new Map<string,PartState>()
  #definitions=new Map<string,AssemblyDefinition>()
  #scopes=new Map<string,AssemblyConfigurationEvaluation['scopes'][number]>()
  #leaves=new Map<string,AssemblyConfigurationEvaluation['parts'][number]>()

  constructor(input:AssemblyConfigurationGeometryInput){
    const captured=capture(input,true);this.#evaluation=captured.evaluation;this.#signature=captured.signature
    for(const node of [this.#evaluation.source,...this.#evaluation.source.definitions]){
      // The engine receives a separate validated source below; this index is
      // declaration identity only and never rewrites its effective occurrences.
      this.#definitions.set(assemblyDefinitionKey(node),node as AssemblyDefinition)
    }
    for(const scope of this.#evaluation.scopes)this.#scopes.set(JSON.stringify(scope.path),scope)
    for(const part of this.#evaluation.parts)this.#leaves.set(JSON.stringify(part.path),part)
    try{
      let prototypeBodies=0,expandedBodies=0,faces=0,edges=0,vertices=0
      for(const part of this.#evaluation.parts){
        if(part.suppressed)continue
        const key=assemblyDefinitionKey(part.definition),existing=this.#parts.get(key)
        if(existing){
          expandedBodies+=existing.bodyEntries
          if(expandedBodies>MAX_ASSEMBLY_NATIVE_BODY_ENTRIES)throw Error('El contexto supera el presupuesto de cuerpos expandidos.')
          continue
        }
        const engine=new CadEngine(),state:PartState={engine,faces:[],vertices:[],edges:[],bodyEntries:0}
        this.#parts.set(key,state) // Own before a rebuild can partially fail.
        const result=engine.rebuildForAssemblyReferences(validateDocument(part.definition.document).features)
        if(result.featureErrors.length)throw Error('No se pudo reconstruir una pieza configurada: '+result.featureErrors.map(error=>error.message).join('; '))
        state.bodyEntries=result.kind==='explicit'?result.bodies.length:result.kind==='legacy'?1:0
        prototypeBodies+=state.bodyEntries;expandedBodies+=state.bodyEntries
        faces+=result.kind==='explicit'?result.bodies.reduce((n,b)=>n+b.faces.length,0):result.kind==='legacy'?result.faces.length:0
        edges+=result.kind==='explicit'?result.bodies.reduce((n,b)=>n+b.edges.length,0):result.kind==='legacy'?result.edges.length:0
        vertices+=result.kind==='explicit'?result.bodies.reduce((n,b)=>n+b.vertexRefs.length,0):result.kind==='legacy'?result.vertexRefs.length:0
        if(prototypeBodies>MAX_ASSEMBLY_NATIVE_BODY_ENTRIES||expandedBodies>MAX_ASSEMBLY_NATIVE_BODY_ENTRIES
          ||faces>MAX_ASSEMBLY_NATIVE_FACE_REFERENCES||edges>MAX_ASSEMBLY_NATIVE_EDGE_REFERENCES||vertices>MAX_ASSEMBLY_NATIVE_VERTEX_REFERENCES)throw Error('El contexto configurado supera el presupuesto nativo de cuerpos o referencias.')
        state.faces=result.kind==='explicit'?result.bodies.flatMap(body=>body.faces.map(face=>({body:structuredClone(body.ref),face:structuredClone(face)}))):result.kind==='legacy'?result.faces.map(face=>({body:null,face:structuredClone(face)})):[]
        state.vertices=result.kind==='explicit'?result.bodies.flatMap(body=>body.vertexRefs.map(vertex=>({body:structuredClone(body.ref),vertex:structuredClone(vertex)}))):result.kind==='legacy'?result.vertexRefs.map(vertex=>({body:null,vertex:structuredClone(vertex)})):[]
        state.edges=result.kind==='explicit'?result.bodies.flatMap(body=>body.edges.map(edge=>({body:structuredClone(body.ref),edge:structuredClone(edge)}))):result.kind==='legacy'?result.edges.map(edge=>({body:null,edge:structuredClone(edge)})):[]
        this.#current(input)
      }
      this.#current(input)
    }catch(error){this.#fail(error)}
  }
  #available():void{if(!this.#alive)throw Error('La sesión nativa configurada ya no está vigente.')}
  #current(input:AssemblyConfigurationGeometryInput):void{
    this.#available()
    try{
      if(capture(input).signature!==this.#signature)throw Error('El contexto configurado cambió; reconstruye su sesión nativa.')
      this.#available()
    }catch(error){this.#fail(error)}
  }
  #fail(error:unknown):never{
    try{this.dispose()}catch(cleanup){throw new NativeCleanupError({error},[cleanup],'Configured native query or release failed.')}
    throw error
  }
  #path(path:readonly string[]):string[]{return JSON.parse(assemblyOccurrencePathKey(path)) as string[]}
  #placement(path:readonly string[]):Placement{
    const key=JSON.stringify(path),part=this.#leaves.get(key)
    if(part)return {definition:part.definition as AssemblyDefinition,pose:validateRigidPose(part.worldPose),suppressed:part.suppressed,ancestry:structuredClone(part.configurationAncestry) as AssemblyConfigurationAncestry[]}
    const scope=this.#scopes.get(key)
    if(!scope)throw Error('La ruta configurada no existe o atraviesa una pieza.')
    const definition=this.#definitions.get(assemblyDefinitionKey(scope.definition))!
    const ancestry=this.#evaluation.scopes.filter(value=>value.path.length<=path.length&&value.path.every((id,i)=>path[i]===id))
      .sort((a,b)=>a.path.length-b.path.length).map(value=>({path:[...value.path],definition:{...value.definition},configuration:value.configuration}))
    return {definition,pose:validateRigidPose(scope.worldPose),suppressed:scope.suppressed,ancestry}
  }
  #component(scopePath:readonly string[],reference:AssemblyComponentReference|null):{base:ConfiguredBase;placement:Placement}{
    const scope=this.#placement(scopePath)
    if(scope.definition.kind!=='assembly')throw Error('El contexto de referencia debe ser un ensamblaje configurado.')
    const path=reference===null?[...scopePath]:[...scopePath,...reference.occurrencePath],placement=this.#placement(path)
    if(placement.suppressed)throw Error('La ocurrencia configurada seleccionada está suprimida.')
    if(reference&&assemblyDefinitionKey(reference.definition)!==assemblyDefinitionKey(placement.definition))throw Error('La referencia pertenece a otra definición o revisión configurada.')
    return {placement,base:{componentPath:path,definition:{id:placement.definition.id,revision:placement.definition.revision},declaredWorldPose:placement.pose,configurationAncestry:placement.ancestry,topLevelOwner:path[0]??null}}
  }
  #arithmetic(path:readonly string[]):{placementSum:number;depth:number}{
    let placementSum=0
    for(let i=0;i<path.length;i++){
      const scope=this.#scopes.get(JSON.stringify(path.slice(0,i)))
      const occurrence=scope?.occurrences.find(value=>value.id===path[i])
      if(!occurrence)throw Error('La cadena efectiva de colocación ya no existe.')
      placementSum+=Math.hypot(...occurrence.pose.translation)
      if(!Number.isFinite(placementSum))throw Error('La cadena efectiva excede el presupuesto aritmético finito.')
    }
    return {placementSum,depth:path.length}
  }
  #issue<T extends AssemblyConfigurationWitness>(value:T):T{
    this.#available();proofs.set(value,{owner:this,...this.#arithmetic(value.componentPath)});return value
  }
  listFaces(input:AssemblyConfigurationGeometryInput,fullPartPath:readonly string[]):AssemblyFaceSelection[]{
    this.#current(input)
    const path=this.#path(fullPartPath),placement=this.#placement(path)
    if(placement.definition.kind!=='part'||placement.suppressed)throw Error('Selecciona una pieza configurada activa.')
    const state=this.#parts.get(assemblyDefinitionKey(placement.definition))
    if(!state)throw Error('La pieza configurada no tiene geometría nativa actual.')
    const result=state.faces.map(value=>({component:{occurrencePath:[...path],definition:{id:placement.definition.id,revision:placement.definition.revision}},body:value.body?structuredClone(value.body):null,face:structuredClone(value.face)}))
    this.#current(input);return result
  }
  listVertices(input:AssemblyConfigurationGeometryInput,fullPartPath:readonly string[]):AssemblyVertexSelection[]{
    this.#current(input)
    const path=this.#path(fullPartPath),placement=this.#placement(path)
    if(placement.definition.kind!=='part'||placement.suppressed)throw Error('Selecciona una pieza configurada activa.')
    const state=this.#parts.get(assemblyDefinitionKey(placement.definition))
    if(!state)throw Error('La pieza configurada no tiene geometría nativa actual.')
    const result=state.vertices.map(value=>({component:{occurrencePath:[...path],definition:{id:placement.definition.id,revision:placement.definition.revision}},body:value.body?structuredClone(value.body):null,vertex:structuredClone(value.vertex)}))
    this.#current(input);return result
  }
  listEdges(input:AssemblyConfigurationGeometryInput,fullPartPath:readonly string[]):AssemblyConfigurationEdgeSelection[]{
    this.#current(input)
    const path=this.#path(fullPartPath),placement=this.#placement(path)
    if(placement.definition.kind!=='part'||placement.suppressed)throw Error('Selecciona una pieza configurada activa.')
    const state=this.#parts.get(assemblyDefinitionKey(placement.definition))
    if(!state)throw Error('La pieza configurada no tiene geometría nativa actual.')
    const result=state.edges.map(value=>({component:{occurrencePath:[...path],definition:{id:placement.definition.id,revision:placement.definition.revision}},body:value.body?structuredClone(value.body):null,edge:structuredClone(value.edge)}))
    this.#current(input);return result
  }
  resolveComponentReference(input:AssemblyConfigurationGeometryInput,reference:AssemblyComponentReference|null,scope:readonly string[]=[]):ConfiguredComponentWitness{
    this.#current(input)
    // Reuse only the strict component locator syntax; no plane proof is issued.
    const parsed=validateAssemblyPlaneReference({kind:'principal-plane',component:reference,plane:'XY'})
    const {base}=this.#component(this.#path(scope),parsed.component)
    try{this.#current(input);return this.#issue(freeze({...base,kind:'configured-component',origin:'component'}))}
    catch(error){return this.#fail(error)}
  }
  resolveReference(input:AssemblyConfigurationGeometryInput,reference:AssemblyGeometryReference,scope:readonly string[]=[]):ConfiguredGeometryWitness{
    this.#current(input)
    const parsed=validateAssemblyGeometryReference(reference),scopePath=this.#path(scope)
    return this.#geometry(input,parsed,scopePath,false) as ConfiguredGeometryWitness
  }
  resolveDirectionReference(input:AssemblyConfigurationGeometryInput,reference:AssemblyGeometryReference,scope:readonly string[]=[]):ConfiguredDirectionWitness{
    this.#current(input)
    const parsed=validateAssemblyGeometryReference(reference),scopePath=this.#path(scope)
    return this.#geometry(input,parsed,scopePath,true) as ConfiguredDirectionWitness
  }
  #geometry(input:AssemblyConfigurationGeometryInput,parsed:AssemblyGeometryReference,scopePath:readonly string[],directionOnly:boolean):ConfiguredGeometryWitness|ConfiguredDirectionWitness{
    const {base,placement}=this.#component(scopePath,parsed.component)
    if(parsed.kind!=='principal-plane'&&placement.definition.kind!=='part')throw Error('La geometría configurada seleccionada requiere una pieza.')
    const state=parsed.kind==='principal-plane'?undefined:this.#parts.get(assemblyDefinitionKey(placement.definition))
    if(parsed.kind!=='principal-plane'&&!state)throw Error('La pieza configurada no tiene geometría nativa actual.')
    try{
      let localSupport:AssemblyNativeSupport,origin:'native-face'|'native-edge'|'principal-plane'
      if(parsed.kind==='principal-plane'){
        const frame=principalPlaneFrame(parsed.plane)
        localSupport={kind:'plane',point:frame.origin,normal:frame.normal,xDirection:frame.xDirection,tolerance:0};origin='principal-plane'
      }else if(parsed.kind==='edge'){
        localSupport=state!.engine.inspectCurrentEdgeSupport(parsed.edge,parsed.body);origin='native-edge'
      }else{
        localSupport=directionOnly?state!.engine.inspectCurrentDirectionFaceSupport(parsed.face,parsed.body):state!.engine.inspectCurrentFaceSupport(parsed.face,parsed.body)
        if((parsed.support==='plane'&&localSupport.kind!=='plane')||(parsed.support==='axis'&&localSupport.kind!=='cylinder'))throw Error('El soporte nativo no coincide con el propósito configurado.')
        origin='native-face'
      }
      const worldSupport:AssemblyNativeSupport=localSupport.kind==='line'
        ? {...localSupport,point:transformRigidPoint(placement.pose,localSupport.point),axis:transformRigidDirection(placement.pose,localSupport.axis)}
        : localSupport.kind==='cylinder'
          ? {...localSupport,point:transformRigidPoint(placement.pose,localSupport.point),axis:transformRigidDirection(placement.pose,localSupport.axis),xDirection:transformRigidDirection(placement.pose,localSupport.xDirection)}
          : {...localSupport,point:transformRigidPoint(placement.pose,localSupport.point),normal:transformRigidDirection(placement.pose,localSupport.normal),xDirection:transformRigidDirection(placement.pose,localSupport.xDirection)}
      const directions=worldSupport.kind==='line'?worldSupport.axis:worldSupport.kind==='plane'?[...worldSupport.normal,...worldSupport.xDirection]:[...worldSupport.axis,...worldSupport.xDirection]
      if(![...worldSupport.point,...directions].every(Number.isFinite))throw Error('El soporte configurado excede las coordenadas finitas.')
      this.#current(input)
      return this.#issue(freeze({...base,kind:directionOnly?'configured-direction':'configured-support',origin,localSupport,worldSupport}))
    }catch(error){return this.#fail(error)}
  }
  resolveCylinderSurfaceReference(input:AssemblyConfigurationGeometryInput,reference:AssemblyCylinderSurfaceReference,scope:readonly string[]=[]):ConfiguredCylinderSurfaceWitness{
    this.#current(input)
    const parsed=validateAssemblyCylinderSurfaceReference(reference),{base,placement}=this.#component(this.#path(scope),parsed.component)
    if(placement.definition.kind!=='part')throw Error('La superficie cilíndrica requiere una pieza configurada.')
    const state=this.#parts.get(assemblyDefinitionKey(placement.definition))
    if(!state)throw Error('La pieza configurada no tiene geometría nativa actual.')
    try{
      const localSupport=state.engine.inspectCurrentCylinderSurfaceSupport(parsed.face,parsed.body)
      const worldSupport={...localSupport,point:transformRigidPoint(placement.pose,localSupport.point),axis:transformRigidDirection(placement.pose,localSupport.axis),xDirection:transformRigidDirection(placement.pose,localSupport.xDirection)}
      if(![...worldSupport.point,...worldSupport.axis,...worldSupport.xDirection,worldSupport.radius,worldSupport.tolerance].every(Number.isFinite))throw Error('La superficie configurada excede las coordenadas finitas.')
      this.#current(input)
      return this.#issue(freeze({...base,kind:'configured-cylinder-surface',origin:'native-cylinder-surface',localSupport,worldSupport}))
    }catch(error){return this.#fail(error)}
  }
  resolveSphereSurfaceReference(input:AssemblyConfigurationGeometryInput,reference:AssemblySphereSurfaceReference,scope:readonly string[]=[]):ConfiguredSphereSurfaceWitness{
    this.#current(input)
    const parsed=validateAssemblySphereSurfaceReference(reference),{base,placement}=this.#component(this.#path(scope),parsed.component)
    if(placement.definition.kind!=='part')throw Error('La superficie esférica requiere una pieza configurada.')
    const state=this.#parts.get(assemblyDefinitionKey(placement.definition))
    if(!state)throw Error('La pieza configurada no tiene geometría nativa actual.')
    try{
      const localSupport=state.engine.inspectCurrentSphereSurfaceSupport(parsed.face,parsed.body)
      const worldSupport={...localSupport,center:transformRigidPoint(placement.pose,localSupport.center)}
      if(![...worldSupport.center,worldSupport.radius,worldSupport.tolerance].every(Number.isFinite))throw Error('La superficie configurada excede las coordenadas finitas.')
      this.#current(input)
      return this.#issue(freeze({...base,kind:'configured-sphere-surface',origin:'native-sphere-surface',localSupport,worldSupport}))
    }catch(error){return this.#fail(error)}
  }
  #advanced(input:AssemblyConfigurationGeometryInput,purpose:ConfiguredAdvancedPurpose,selection:unknown,scope:readonly string[],bands?:unknown,coordinate?:unknown):ConfiguredAdvancedWitness{
    this.#current(input)
    const prepared=prepareConfiguredAdvancedObservation(purpose,selection,bands,coordinate),scopePath=this.#path(scope)
    const {base,placement}=this.#component(scopePath,prepared.component)
    if(placement.definition.kind!=='part')throw Error('La referencia avanzada requiere una pieza configurada.')
    const state=this.#parts.get(assemblyDefinitionKey(placement.definition))
    if(!state)throw Error('La pieza configurada no tiene geometría nativa actual.')
    const arithmetic=this.#arithmetic(base.componentPath)
    try{
      // Only these seven closed purposes reach the helper; an arbitrary
      // callback, provider, prepared DTO or observation is never accepted.
      const observation=observeConfiguredAdvanced(state.engine,prepared,placement.pose,arithmetic)
      this.#current(input)
      return this.#issue(freeze({...base,...observation}))
    }catch(error){return this.#fail(error)}
  }
  resolveProfileFaceSelection(input:AssemblyConfigurationGeometryInput,selection:AssemblyFaceSelection,scope:readonly string[]=[],bands?:{lengthToleranceMm?:number;angleToleranceRad?:number}):ConfiguredProfileWitness{
    return this.#advanced(input,'profile',selection,scope,bands) as ConfiguredProfileWitness
  }
  resolveProfileAxisSelection(input:AssemblyConfigurationGeometryInput,selection:AssemblyProfileAxisSelection,scope:readonly string[]=[],bands?:{lengthToleranceMm?:number;angleToleranceRad?:number}):ConfiguredProfileAxisWitness{
    return this.#advanced(input,'profile-axis',selection,scope,bands) as ConfiguredProfileAxisWitness
  }
  resolveLinePathSelection(input:AssemblyConfigurationGeometryInput,selection:AssemblyLinePathSelection,scope:readonly string[]=[],bands?:AssemblyPathCurveBands):ConfiguredLinePathWitness{
    return this.#advanced(input,'line-path',selection,scope,bands) as ConfiguredLinePathWitness
  }
  resolveArcPathSelection(input:AssemblyConfigurationGeometryInput,selection:AssemblyArcPathSelection,scope:readonly string[]=[],bands?:AssemblyPathCurveBands):ConfiguredArcPathWitness{
    return this.#advanced(input,'arc-path',selection,scope,bands) as ConfiguredArcPathWitness
  }
  evaluateArcPathSelection(input:AssemblyConfigurationGeometryInput,selection:AssemblyArcPathSelection,coordinate:AssemblyPathCurveCoordinate,scope:readonly string[]=[],bands?:AssemblyPathCurveBands):ConfiguredArcPathEvaluationWitness{
    return this.#advanced(input,'arc-evaluation',selection,scope,bands,coordinate) as ConfiguredArcPathEvaluationWitness
  }
  resolvePathCurveSelection(input:AssemblyConfigurationGeometryInput,selection:AssemblyPathCurveSelection,scope:readonly string[]=[],bands?:AssemblyPathCurveBands):ConfiguredPathCurveWitness{
    return this.#advanced(input,'path-curve',selection,scope,bands) as ConfiguredPathCurveWitness
  }
  evaluatePathCurveSelection(input:AssemblyConfigurationGeometryInput,selection:AssemblyPathCurveSelection,coordinate:AssemblyPathCurveCoordinate,scope:readonly string[]=[],bands?:AssemblyPathCurveBands):ConfiguredPathCurveEvaluationWitness{
    return this.#advanced(input,'path-evaluation',selection,scope,bands,coordinate) as ConfiguredPathCurveEvaluationWitness
  }
  resolvePlaneReference(input:AssemblyConfigurationGeometryInput,reference:AssemblyPlaneReference,scope:readonly string[]=[]):ConfiguredPlaneWitness{
    this.#current(input)
    const parsed=validateAssemblyPlaneReference(reference),scopePath=this.#path(scope)
    const {base,placement}=this.#component(scopePath,parsed.component)
    if(parsed.kind!=='principal-plane'&&placement.definition.kind!=='part')throw Error('Una cara configurada requiere una pieza.')
    const state=parsed.kind==='principal-plane'?undefined:this.#parts.get(assemblyDefinitionKey(placement.definition))
    if(parsed.kind!=='principal-plane'&&!state)throw Error('La pieza configurada no tiene geometría nativa actual.')
    try{
      let localSupport:PlaneSupport
      if(parsed.kind==='principal-plane'){
        const frame=principalPlaneFrame(parsed.plane)
        localSupport={kind:'plane',point:frame.origin,normal:frame.normal,xDirection:frame.xDirection,tolerance:0}
      }else{
        const native=state!.engine.inspectCurrentFaceSupport(parsed.face,parsed.body)
        if(native.kind!=='plane')throw Error('La cara configurada no es un plano nativo.')
        localSupport=native
      }
      const worldSupport:PlaneSupport={...localSupport,point:transformRigidPoint(placement.pose,localSupport.point),normal:transformRigidDirection(placement.pose,localSupport.normal),xDirection:transformRigidDirection(placement.pose,localSupport.xDirection)}
      if(![...worldSupport.point,...worldSupport.normal,...worldSupport.xDirection].every(Number.isFinite))throw Error('El soporte configurado excede las coordenadas finitas.')
      this.#current(input)
      return this.#issue(freeze({...base,kind:'configured-plane',origin:parsed.kind==='principal-plane'?'principal-plane':'native-face',localSupport,worldSupport}))
    }catch(error){return this.#fail(error)}
  }
  resolveVertexReference(input:AssemblyConfigurationGeometryInput,reference:AssemblyVertexReference,scope:readonly string[]=[]):ConfiguredPointWitness{
    this.#current(input)
    const parsed=validateAssemblyVertexReference(reference),scopePath=this.#path(scope)
    const {base,placement}=this.#component(scopePath,parsed.component)
    if(placement.definition.kind!=='part')throw Error('Un vértice configurado requiere una pieza.')
    const state=this.#parts.get(assemblyDefinitionKey(placement.definition))
    if(!state)throw Error('La pieza configurada no tiene geometría nativa actual.')
    try{
      const localSupport=state.engine.inspectCurrentVertexSupport(parsed.vertex,parsed.body),point=transformRigidPoint(placement.pose,localSupport.point)
      if(!point.every(Number.isFinite))throw Error('El punto configurado excede las coordenadas finitas.')
      this.#current(input)
      return this.#issue(freeze({...base,kind:'configured-point',origin:'native-vertex',localSupport,worldSupport:{...localSupport,point}}))
    }catch(error){return this.#fail(error)}
  }
  #relationInventory(input:AssemblyConfigurationGeometryInput):readonly AssemblyConfigurationMateInspection[]{
    this.#current(input)
    const result=inspectAssemblyConfigurationMateReferences(validateAssemblyDocument(this.#evaluation.source),JSON.parse(JSON.stringify(this.#evaluation.catalog)),this.#evaluation.rootConfiguration)
    this.#current(input)
    return result
  }
  #relationGeometry(input:AssemblyConfigurationGeometryInput,reference:AssemblyMateEndpointReference|null,scope:readonly string[],directionOnly=false):AssemblyConfigurationWitness{
    if(reference===null)return this.resolveComponentReference(input,null,scope)
    if('occurrencePath'in reference)return this.resolveComponentReference(input,reference,scope)
    if('axis'in reference||'startVertex'in reference)throw Error('A compound configured role needs its explicit profile or path family.')
    if(reference.kind==='vertex')return this.resolveVertexReference(input,reference,scope)
    if(reference.kind==='face'&&reference.support==='cylinder-surface')return this.resolveCylinderSurfaceReference(input,validateAssemblyCylinderSurfaceReference(reference),scope)
    if(reference.kind==='face'&&reference.support==='sphere-surface')return this.resolveSphereSurfaceReference(input,validateAssemblySphereSurfaceReference(reference),scope)
    const geometry=validateAssemblyGeometryReference(reference)
    return directionOnly?this.resolveDirectionReference(input,geometry,scope):this.resolveReference(input,geometry,scope)
  }
  #relationRole(input:AssemblyConfigurationGeometryInput,mate:AssemblyMate,entry:AssemblyMateEndpointEntry,scope:readonly string[]):AssemblyConfigurationWitness{
    if(mate.type==='hinge'){
      if(entry.side==='axis-0'||entry.side==='axis-1')return this.resolveReference(input,mate.axis[entry.side==='axis-0'?0:1],scope)
      if(entry.side==='axial-0'||entry.side==='axial-1')return this.resolvePlaneReference(input,mate.axial[entry.side==='axial-0'?0:1],scope)
      if((entry.side==='angle-0'||entry.side==='angle-1')&&mate.stops)return this.resolvePlaneReference(input,mate.stops.angular[entry.side==='angle-0'?0:1],scope)
      throw Error('Unknown configured hinge role.')
    }
    if(mate.type==='width'){
      if(entry.side==='width-0'||entry.side==='width-1')return this.resolvePlaneReference(input,mate.width[entry.side==='width-0'?0:1],scope)
      if(entry.side==='tab-0'||entry.side==='tab-1')return this.resolvePlaneReference(input,mate.tab[entry.side==='tab-0'?0:1],scope)
      throw Error('Unknown configured width role.')
    }
    if(mate.type==='symmetry'){
      if(entry.side==='mirror')return this.resolvePlaneReference(input,mate.mirror,scope)
      if(entry.side==='source'||entry.side==='target')return this.#relationGeometry(input,mate[entry.side],scope)
      throw Error('Unknown configured symmetry role.')
    }
    if(mate.type==='profile-center'){
      if(entry.side!=='first'&&entry.side!=='second')throw Error('Unknown configured profile role.')
      const selection=mate[entry.side]
      return selection.axis===null?this.resolveProfileFaceSelection(input,selection.face,scope):this.resolveProfileAxisSelection(input,{...selection.face,...selection.axis},scope)
    }
    if(mate.type==='line-path'||mate.type==='circular-path'){
      if(entry.side==='point')return this.resolveVertexReference(input,mate.point,scope)
      if(entry.side==='path')return mate.type==='line-path'?this.resolveLinePathSelection(input,mate.path,scope):this.resolveArcPathSelection(input,mate.path,scope)
      if(entry.side==='up'&&mate.orientation.roll!=='free')return this.resolveDirectionReference(input,mate.orientation.roll.guide,scope)
      throw Error('Unknown configured material path role.')
    }
    if(entry.side==='carrier'){
      if(mate.type!=='gear')throw Error('Only configured gear has a carrier role.')
      return this.resolveComponentReference(input,mate.carrier??null,scope)
    }
    return this.#relationGeometry(input,entry.reference,scope,mate.type==='limit-angle'||mate.type==='limit-directed-angle')
  }
  #resolveRelation(input:AssemblyConfigurationGeometryInput,inspection:AssemblyConfigurationMateInspection):ConfiguredResolvedMate{
    const mate=validateAssemblyMate(inspection.mate)
    const roles=assemblyMateEndpoints(mate).map(entry=>({side:entry.side,witness:this.#relationRole(input,mate,entry,inspection.scopePath)}))
    const observation=buildConfiguredRelationObservation(inspection,roles)
    this.#current(input)
    for(const role of roles)this.#assertOwnedWitness(role.witness)
    const result=freeze(observation),children=configuredResolvedMateWitnesses(result)
    relationProofs.set(result,{owner:this,children:[...children]})
    return result
  }
  resolveActiveMates(input:AssemblyConfigurationGeometryInput):readonly ConfiguredResolvedMate[]{
    const active=this.#relationInventory(input).filter(inspection=>!inspection.suppressed)
    // All declaration diagnostics precede the first native role query.
    if(active.some(inspection=>inspection.roles.some(role=>role.diagnostics.length)))throw Error('Repair every active configured relation reference before native resolution.')
    try{
      const result=active.map(inspection=>this.#resolveRelation(input,inspection))
      this.#current(input);return freeze(result)
    }catch(error){return this.#fail(error)}
  }
  #inspectPassive(input:AssemblyConfigurationGeometryInput,type:'gear'|'screw'|'rack-pinion',suppressedOnly:boolean):{resolved:readonly ConfiguredResolvedBinaryMate[];unavailable:readonly ConfiguredUnavailableMate[]}{
    this.#current(input)
    if(typeof suppressedOnly!=='boolean')throw Error('suppressedOnly must be a boolean.')
    const inventory=this.#relationInventory(input).filter(inspection=>inspection.mate.type===type&&!inspection.scopeSuppressed&&(!suppressedOnly||inspection.mate.suppressed))
    const unavailable=inventory.filter(inspection=>inspection.roles.some(role=>role.diagnostics.length))
    const available=inventory.filter(inspection=>!inspection.roles.some(role=>role.diagnostics.length))
    try{
      const resolved=available.map(inspection=>{
        const value=this.#resolveRelation(input,inspection)
        if(value.mate.type!==type||!('first'in value)||!('second'in value))throw Error('Wrong configured passive relation family.')
        // This closed path selects only the three binary captured families.
        return value as ConfiguredResolvedBinaryMate
      })
      this.#current(input);return freeze({resolved,unavailable})
    }catch(error){return this.#fail(error)}
  }
  inspectGearState(input:AssemblyConfigurationGeometryInput,suppressedOnly=false):{resolved:readonly ConfiguredResolvedBinaryMate[];unavailable:readonly ConfiguredUnavailableMate[]}{return this.#inspectPassive(input,'gear',suppressedOnly)}
  inspectScrewState(input:AssemblyConfigurationGeometryInput,suppressedOnly=false):{resolved:readonly ConfiguredResolvedBinaryMate[];unavailable:readonly ConfiguredUnavailableMate[]}{return this.#inspectPassive(input,'screw',suppressedOnly)}
  inspectRackPinionState(input:AssemblyConfigurationGeometryInput,suppressedOnly=false):{resolved:readonly ConfiguredResolvedBinaryMate[];unavailable:readonly ConfiguredUnavailableMate[]}{return this.#inspectPassive(input,'rack-pinion',suppressedOnly)}
  resolvePassiveGears(input:AssemblyConfigurationGeometryInput):readonly ConfiguredResolvedBinaryMate[]{return this.inspectGearState(input,true).resolved}
  resolvePassiveScrews(input:AssemblyConfigurationGeometryInput):readonly ConfiguredResolvedBinaryMate[]{return this.inspectScrewState(input,true).resolved}
  resolvePassiveRackPinions(input:AssemblyConfigurationGeometryInput):readonly ConfiguredResolvedBinaryMate[]{return this.inspectRackPinionState(input,true).resolved}
  /** Authenticate only the complete live context. This issues no witness,
   * relation aggregate, solve result or Apply authority. */
  assertCurrent(input:AssemblyConfigurationGeometryInput):void{this.#current(input)}
  assertResolvedMate<T extends ConfiguredResolvedMate>(value:T,input:AssemblyConfigurationGeometryInput):T
  assertResolvedMate(value:unknown,input:AssemblyConfigurationGeometryInput):ConfiguredResolvedMate
  assertResolvedMate(value:unknown,input:AssemblyConfigurationGeometryInput):ConfiguredResolvedMate{
    this.#current(input)
    const proof=value&&typeof value==='object'?relationProofs.get(value):undefined
    if(!proof||proof.owner!==this)throw Error('The configured relation was not issued by this native session.')
    const result=value as ConfiguredResolvedMate,children=configuredResolvedMateWitnesses(result)
    if(children.length!==proof.children.length||children.some((child,index)=>child!==proof.children[index]))throw Error('The configured relation child proofs changed.')
    for(const child of proof.children)this.#assertOwnedWitness(child)
    this.#current(input);return result
  }
  assertWitness<T extends AssemblyConfigurationWitness>(value:T,input:AssemblyConfigurationGeometryInput):T
  assertWitness(value:unknown,input:AssemblyConfigurationGeometryInput):AssemblyConfigurationWitness
  assertWitness(value:unknown,input:AssemblyConfigurationGeometryInput):AssemblyConfigurationWitness{
    this.#current(input)
    return this.#assertOwnedWitness(value)
  }
  /** Only for an atomic internal sequence already bracketed by complete
   * current-input checks. Private, frozen child identities need no recapture. */
  #assertOwnedWitness(value:unknown):AssemblyConfigurationWitness{
    this.#available()
    if(!value||typeof value!=='object'||proofs.get(value)?.owner!==this)throw Error('La referencia no fue emitida por esta sesión configurada.')
    return value as AssemblyConfigurationWitness
  }
  dispose():void{
    if(!this.#alive)return
    this.#alive=false
    const states=[...this.#parts.values()];this.#parts.clear();this.#definitions.clear();this.#scopes.clear();this.#leaves.clear()
    const errors:unknown[]=[]
    for(const state of states.reverse()){try{state.engine.dispose()}catch(error){errors.push(error)}}
    if(errors.length)throw new NativeCleanupError(undefined,errors,'Configured native snapshot release failed.')
  }
}
