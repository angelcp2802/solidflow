'use strict';
// Original two analytic 4 mm cubes and explicit X/Y origin-plane restraints.
// No external models or prepared material face/LINE relations; B remains free in Z.
module.exports = () => {
  const stamp='2026-10-24T00:00:00.000Z';
  const part={kind:'part',id:'pointer-cube',revision:'r1',document:{version:1,id:'pointer-cube',name:'Original pointer cube',units:'mm',createdAt:stamp,updatedAt:stamp,features:[
    {id:'profile',name:'Original square',type:'sketch',plane:'XY',offset:0,suppressed:false,profile:{kind:'rectangle',center:[0,0],width:4,height:4}},
    {id:'solid',name:'Original cube',type:'extrude',sketchId:'profile',depth:4,symmetric:false,suppressed:false,bodyOperation:{mode:'new',bodyId:'cube-body'}}]}};
  const source={version:2,kind:'assembly',id:'configured-pointer-root',revision:'r1',name:'Original configured pointer authoring',units:'mm',createdAt:stamp,updatedAt:stamp,definitions:[part],
    occurrences:[['A',[-8,0,0],true],['B',[8,0,6],false]].map(([id,translation,fixed])=>({id,name:id,definition:{id:part.id,revision:part.revision},pose:{translation,rotation:[0,0,0,1]},fixed,suppressed:false,visible:true})),mates:[
      ...[['YZ',8],['XZ',0]].map(([plane,distance])=>({id:'original-restraint-'+plane,name:'Original B '+plane+' restraint',type:'distance',suppressed:false,
        first:{kind:'principal-plane',component:{occurrencePath:['B'],definition:{id:part.id,revision:part.revision}},plane},
        second:{kind:'principal-plane',component:null,plane},alignment:'aligned',distance}))]};
  return {version:3,kind:'configured-assembly',source,catalog:[{definition:{id:source.id,revision:source.revision},configurations:[{id:'demo',name:'Demo',occurrences:[],mates:[]}]}],rootConfiguration:'demo'};
};
