'use strict';
// Original public recipes are retained byte-equivalent as embedded part data.
// This new original assembly supplies only occurrences and state declarations;
// it contains no external assets, topology keys, mates or captured authority.
// Rectangle6×4×3: V72/A108; circleR2×3: V12pi/A20pi;
// LINEprism4×6×4: V96/A128; R2quarter-sector×4: V4pi/A(6pi+16).
module.exports=function createOriginalConfiguredCompound(family='profile-center',profileKind='rectangle'){
 if(!['profile-center','line-path','circular-path'].includes(family)||!['rectangle','circle'].includes(profileKind))throw Error('Fixed original compound family required.');
 const originals={
  'profile-center':require('../src/cad/fixtures/assembly-profile-center-original.json'),
  'line-path':require('../src/cad/fixtures/assembly-line-path-original.json'),
  'circular-path':require('../src/cad/fixtures/assembly-material-arc-original.json'),
 };
 const selected=family==='profile-center'?'original-profile-'+profileKind:family==='line-path'?'original-line-prism':'original-quarter-sector';
 const part=structuredClone(originals[family].definitions.find(d=>d.id===selected));
 if(!part||part.kind!=='part')throw Error('Tracked original compound part missing.');
 const stamp='2026-10-23T00:00:00.000Z',pose=(translation=[0,0,0])=>({translation,rotation:[0,0,0,1]});
 const initial=family==='profile-center'?[8,4,5]:family==='line-path'?[12,4,2]:[9,4,2];
 const compact=family==='profile-center'?[6,2,4]:family==='line-path'?[10,4,2]:[7,3,1];
 const occurrence=(id,definition,p,fixed)=>({id,name:id,definition:{id:definition.id,revision:definition.revision},pose:p,fixed,suppressed:false,visible:true});
 const s={kind:'assembly',id:'compound-S',revision:'s-r1',name:'Original compound reference scope',createdAt:stamp,updatedAt:stamp,
  occurrences:[occurrence('a',part,pose(),true),occurrence('b',part,pose(initial),false)],mates:[]};
 const left=occurrence('left',s,pose(),true),right=occurrence('right',s,pose([30,0,0]),true);right.pose.rotation=[0,0,Math.SQRT1_2,Math.SQRT1_2];
 const source={version:2,kind:'assembly',id:'compound-root-'+family,revision:'root-r1',name:'Original configured '+family,units:'mm',createdAt:stamp,updatedAt:stamp,definitions:[part,s],occurrences:[left,right],mates:[]};
 const catalog=[{definition:{id:source.id,revision:source.revision},configurations:[
  {id:'both-compact',name:'Both compact',occurrences:[{occurrenceId:'left',configuration:'compact'},{occurrenceId:'right',configuration:'compact'}],mates:[]},
  {id:'mixed',name:'Right compact',occurrences:[{occurrenceId:'right',configuration:'compact'}],mates:[]}]},
 {definition:{id:s.id,revision:s.revision},configurations:[
  {id:'compact',name:'Compact',occurrences:[{occurrenceId:'b',pose:pose(compact)}],mates:[]},
  {id:'dormant',name:'Dormant original',occurrences:[{occurrenceId:'b',pose:pose([15,5,3])}],mates:[]}]}];
 return {version:3,kind:'configured-assembly',source,catalog,rootConfiguration:'both-compact'};
};
