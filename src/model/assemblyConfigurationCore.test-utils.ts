import {validateAssemblyDocument,type AssemblyDocument,type EmbeddedPartDefinition,type AssemblyOccurrence} from './assemblyDocument'
import type {AssemblyConfigurationCatalog} from './assemblyConfigurationCore'
import {identityRigidPose} from './rigidPose'

/** Independently authored original millimetre boxes, no imported/private model.
 * A[0,2]×[0,3]×[0,4]: V24/A52. B[0,1]×[0,2]×[0,5]: V10/A34.
 * S.base B starts atX10; compact atX4; single excludes B. */
export function assemblyConfigurationCoreFixture():{document:AssemblyDocument;catalog:AssemblyConfigurationCatalog}{
 const stamp='2026-10-23T00:00:00.000Z'
 const part=(id:string,size:[number,number,number]):EmbeddedPartDefinition=>({kind:'part',id,revision:'r1',document:{
  version:1,id,name:id,units:'mm',createdAt:stamp,updatedAt:stamp,features:[
   {id:'profile',name:'Original rectangle',type:'sketch',plane:'XY',offset:0,suppressed:false,profile:{kind:'rectangle',center:[size[0]/2,size[1]/2],width:size[0],height:size[1]}},
   {id:'solid',name:'Original prism',type:'extrude',sketchId:'profile',depth:size[2],symmetric:false,suppressed:false},
  ]}})
 const a=part('configuration-A',[2,3,4]),b=part('configuration-B',[1,2,5])
 const occurrence=(id:string,definition:{id:string;revision:string},translation:[number,number,number]=[0,0,0]):AssemblyOccurrence=>({id,name:id,definition:{id:definition.id,revision:definition.revision},pose:{...identityRigidPose(),translation},fixed:false,suppressed:false,visible:true})
 const s={kind:'assembly' as const,id:'configuration-S',revision:'s-r1',name:'Original S',createdAt:stamp,updatedAt:stamp,
  occurrences:[occurrence('a',a),occurrence('b',b,[10,0,0])],mates:[]}
 const left=occurrence('left',s),right=occurrence('right',s,[30,0,0]);right.pose.rotation=[0,0,Math.SQRT1_2,Math.SQRT1_2]
 const document=validateAssemblyDocument({version:2,kind:'assembly',id:'configuration-root',revision:'root-r1',name:'Original configuration root',units:'mm',createdAt:stamp,updatedAt:stamp,definitions:[a,b,s],occurrences:[left,right],mates:[]})
 const catalog:AssemblyConfigurationCatalog=[
  {definition:{id:document.id,revision:document.revision},configurations:[
   {id:'mixed',name:'Right compact',occurrences:[{occurrenceId:'right',configuration:'compact'}],mates:[]},
   {id:'single-right',name:'Right single',occurrences:[{occurrenceId:'right',configuration:'single'}],mates:[]},
   {id:'both-compact',name:'Both compact',occurrences:[{occurrenceId:'left',configuration:'compact'},{occurrenceId:'right',configuration:'compact'}],mates:[]},
  ]},
  {definition:{id:s.id,revision:s.revision},configurations:[
   {id:'compact',name:'Compact',occurrences:[{occurrenceId:'b',pose:{translation:[4,0,0],rotation:[0,0,0,1]}}],mates:[]},
   {id:'single',name:'Single A',occurrences:[{occurrenceId:'b',suppressed:true}],mates:[]},
  ]},
 ]
 return {document,catalog}
}
