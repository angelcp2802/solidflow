'use strict';
// Original millimetre prisms, independently authored from their dimensions.
// A: 2*3*4=24 mm3, 2*(6+8+12)=52 mm2. B: 10 mm3, 34 mm2.
// The reused S variants and root quarter-turn have literal renderer oracles.
module.exports = function createOriginalDocument() {
  const stamp='2026-10-23T00:00:00.000Z', identity=()=>({translation:[0,0,0],rotation:[0,0,0,1]});
  const part=(id,size)=>({kind:'part',id,revision:'r1',document:{version:1,id,name:id,units:'mm',createdAt:stamp,updatedAt:stamp,features:[
    {id:'profile',name:'Original rectangle',type:'sketch',plane:'XY',offset:0,suppressed:false,profile:{kind:'rectangle',center:[size[0]/2,size[1]/2],width:size[0],height:size[1]}},
    {id:'solid',name:'Original prism',type:'extrude',sketchId:'profile',depth:size[2],symmetric:false,suppressed:false}]}});
  const a=part('configuration-A',[2,3,4]), b=part('configuration-B',[1,2,5]);
  const occurrence=(id,definition,x=0)=>({id,name:id,definition:{id:definition.id,revision:definition.revision},pose:{...identity(),translation:[x,0,0]},fixed:false,suppressed:false,visible:true});
  const s={kind:'assembly',id:'configuration-S',revision:'s-r1',name:'Original S',createdAt:stamp,updatedAt:stamp,
    occurrences:[occurrence('a',a),occurrence('b',b,10)],mates:[{id:'original-X-distance',name:'Original signed X distance',type:'distance',suppressed:false,
      first:{kind:'principal-plane',component:{occurrencePath:['b'],definition:{id:b.id,revision:b.revision}},plane:'YZ'},
      second:{kind:'principal-plane',component:null,plane:'YZ'},alignment:'aligned',distance:10}]};
  s.occurrences[0].fixed=true;
  const left=occurrence('left',s),right=occurrence('right',s,30);left.fixed=true;
  right.pose.rotation=[0,0,Math.SQRT1_2,Math.SQRT1_2];right.fixed=true;
  const source={version:2,kind:'assembly',id:'configuration-root',revision:'root-r1',name:'Original configured prisms',units:'mm',createdAt:stamp,updatedAt:stamp,definitions:[a,b,s],occurrences:[left,right],mates:[]};
  const catalog=[{definition:{id:source.id,revision:source.revision},configurations:[
    {id:'mixed',name:'Right compact',occurrences:[{occurrenceId:'right',configuration:'compact'}],mates:[]},
    {id:'both-compact',name:'Both compact',occurrences:[{occurrenceId:'left',configuration:'compact'},{occurrenceId:'right',configuration:'compact'}],mates:[]},
    {id:'single-right',name:'Right single',occurrences:[{occurrenceId:'right',configuration:'single'}],mates:[]}]},
    {definition:{id:s.id,revision:s.revision},configurations:[
      {id:'compact',name:'Compact',occurrences:[{occurrenceId:'b',pose:{...identity(),translation:[4,0,0]}}],mates:[]},
      {id:'single',name:'Single A',occurrences:[{occurrenceId:'b',suppressed:true}],mates:[]}]}];
  return {version:3,kind:'configured-assembly',source,catalog,rootConfiguration:'mixed'};
};
