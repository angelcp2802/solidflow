'use strict';
// Original dimensioned rectangular prisms; no external model or captured data.
// Anchor 2*3*4=24 mm3, area52. Incoming 1*2*5=10 mm3, area34.
module.exports = function originals() {
  const stamp='2026-10-23T00:00:00.000Z';
  const pose=(x=0,y=0,z=0)=>({translation:[x,y,z],rotation:[0,0,0,1]});
  const ref=d=>({id:d.id,revision:d.revision});
  const part=(id,a,b,c)=>({kind:'part',id,revision:'r1',document:{version:1,id,name:id,units:'mm',createdAt:stamp,updatedAt:stamp,features:[
    {id:'profile',name:'Original rectangle',type:'sketch',plane:'XY',offset:0,suppressed:false,profile:{kind:'rectangle',center:[a/2,b/2],width:a,height:b}},
    {id:'solid',name:'Original prism',type:'extrude',sketchId:'profile',depth:c,symmetric:false,suppressed:false}]}});
  const occurrence=(id,d,x=0)=>({id,name:id,definition:ref(d),pose:pose(x),fixed:true,suppressed:false,visible:true});
  const anchor=part('authoring-anchor',2,3,4), pin=part('authoring-pin',1,2,5);
  const sub={kind:'assembly',id:'authoring-shared',revision:'r1',name:'Original shared frame',createdAt:stamp,updatedAt:stamp,occurrences:[occurrence('anchor',anchor)],mates:[]};
  const source={version:2,kind:'assembly',id:'authoring-root',revision:'r1',name:'Original component authoring',units:'mm',createdAt:stamp,updatedAt:stamp,definitions:[anchor,sub],occurrences:[occurrence('left',sub),occurrence('right',sub,20)],mates:[]};
  const catalog=[{definition:ref(source),configurations:['demo','other'].map((id,i)=>({id,name:id,occurrences:['left','right'].map(occurrenceId=>({occurrenceId,configuration:i?'B':'A'})),mates:[]}))},
    {definition:ref(sub),configurations:['A','B'].map(id=>({id,name:id,occurrences:[],mates:[]}))}];
  const incomingSource={version:2,kind:'assembly',id:'authoring-incoming',revision:'r1',name:'Original imported state',units:'mm',createdAt:stamp,updatedAt:stamp,definitions:[pin],occurrences:[occurrence('pin',pin)],mates:[]};
  return {input:{version:3,kind:'configured-assembly',source,catalog,rootConfiguration:'demo'},incoming:{version:3,kind:'configured-assembly',source:incomingSource,
    catalog:[{definition:ref(incomingSource),configurations:[{id:'shifted',name:'Shifted three mm',occurrences:[{occurrenceId:'pin',pose:pose(3)}],mates:[]}]}],rootConfiguration:'shifted'}};
};
