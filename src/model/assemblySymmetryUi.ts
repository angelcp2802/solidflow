import {validateAssemblySymmetryReferenceSet,type AssemblySymmetryReferenceSet} from './assemblySymmetryReferences'
import type {AssemblyDocument,AssemblySymmetryMate,EmbeddedAssemblyDefinition} from './assemblyDocument'
import type {NewAssemblyMate} from './assemblyEditing'
import type {AssemblySymmetrySupportReport} from '../cad/kernel.assembly-symmetry'
export type SymmetryUiFamily=AssemblySymmetryReferenceSet['entityKind']
export type SymmetryUiReference=AssemblySymmetryReferenceSet['source']|AssemblySymmetryReferenceSet['mirror']
export type SymmetryUiReferences=[SymmetryUiReference|null,SymmetryUiReference|null,SymmetryUiReference|null]
export const SYMMETRY_ROLE_LABELS=['Origen de simetría','Destino de simetría','Plano de simetría'] as const
export function assemblySymmetryUiProposal(references:SymmetryUiReferences,family:SymmetryUiFamily,alignment:'aligned'|'opposed'|'',name:string):Extract<NewAssemblyMate,{type:'symmetry'}> {
  if(typeof name!=='string'||!name.trim())throw Error('Escribe un nombre para la simetría.')
  if(!Array.isArray(references)||Object.getPrototypeOf(references)!==Array.prototype||references.length!==3||Reflect.ownKeys(references).length!==4)throw Error('Selecciona origen, destino y plano de simetría.')
  const selected=[0,1,2].map(i=>{const field=Object.getOwnPropertyDescriptor(references,String(i));if(!field?.enumerable||!('value' in field)||!field.value)throw Error('Selecciona las tres referencias propias.');return field.value})
  const refs=validateAssemblySymmetryReferenceSet({entityKind:family,source:selected[0],target:selected[1],mirror:selected[2],alignment:family==='point'||family==='sphere'?null:alignment})
  return {type:'symmetry',name:name.trim(),suppressed:false,...refs}
}
/** Display consistency only; authenticated preview/Apply authority stays outside. */
export function assemblySymmetryUiReports(document:AssemblyDocument,reports:readonly AssemblySymmetrySupportReport[]):AssemblySymmetrySupportReport[]{
  const result:AssemblySymmetrySupportReport[]=[],seen=new Set<string>()
  for(const report of reports){
    if(!report||!Array.isArray(report.scopePath)||!report.scopePath.every(p=>typeof p==='string')||typeof report.mateId!=='string')return[]
    let scope:AssemblyDocument|EmbeddedAssemblyDefinition=document
    for(const id of report.scopePath){
      const o=scope.occurrences.find(o=>o.id===id),d=o&&!o.suppressed&&document.definitions.find(d=>d.id===o.definition.id&&d.revision===o.definition.revision)
      if(!d||d.kind!=='assembly')return[];scope=d
    }
    const mate=scope.mates.find((m):m is AssemblySymmetryMate=>m.id===report.mateId&&m.type==='symmetry'&&!m.suppressed),key=JSON.stringify([report.scopePath,report.mateId])
    if(!mate||seen.has(key)||report.status!=='ok'||report.kind!=='symmetry'||report.supportOnly!==true||report.satisfied!==true||report.entityKind!==mate.entityKind||report.alignment!==mate.alignment)return[]
    const directed=mate.entityKind!=='point'&&mate.entityKind!=='sphere',radial=mate.entityKind==='sphere'||mate.entityKind==='cylinder'
    const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)
    const u=report.uncertainty
    if(!u||!finite(report.lengthTolerance)||report.lengthTolerance<=0||!finite(report.angleTolerance)||report.angleTolerance<=0||report.angleTolerance>=Math.PI
      ||!finite(report.positionErrorMm)||report.positionErrorMm<0||report.positionErrorMm>report.lengthTolerance
      ||!finite(u.positionMm)||u.positionMm<0||u.positionMm>report.lengthTolerance)return[]
    if(directed?(!finite(report.angleRadians)||report.angleRadians<0||report.angleRadians>report.angleTolerance||!finite(u.angleRad)||u.angleRad<0||u.angleRad>report.angleTolerance):(report.angleRadians!==null||u.angleRad!==null))return[]
    if(radial?(!finite(report.radiusDifferenceMm)||Math.abs(report.radiusDifferenceMm)>report.lengthTolerance||!finite(u.radiusMm)||u.radiusMm<0||u.radiusMm>report.lengthTolerance):(report.radiusDifferenceMm!==null||u.radiusMm!==null))return[]
    for(const role of ['source','target','mirror'] as const){
      const ref=mate[role],expected=ref.component?[...report.scopePath,...ref.component.occurrencePath]:report.scopePath
      if(JSON.stringify(report.componentPaths?.[role])!==JSON.stringify(expected))return[]
    }
    seen.add(key);result.push(structuredClone(report))
  }
  return result
}
