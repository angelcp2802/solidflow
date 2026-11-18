'use strict';
const fsp = require('node:fs/promises');
// Independent reader of the actually granted disk bytes. Literal quarter-sector
// formulas below do not use the production exporter, solver or topology handles.
module.exports = async function circularStep({ page, observe, responseAfter, click, waitFor, check, canonical, digest, ipc, evidence, output, document }) {
  const near = (a,b,t,label) => check(Number.isFinite(a)&&Math.abs(a-b)<=t,label+'; actual='+a+', expected='+b);
  const state = () => page(() => ({ recovery: localStorage.getItem('solidflow.autosave'), undo: document.querySelector('button[aria-label="Deshacer ensamblaje"]')?.disabled, redo: document.querySelector('button[aria-label="Rehacer ensamblaje"]')?.disabled, apply: document.querySelector('button[aria-label="Aplicar ensamblaje"]')?.disabled, cancel: document.querySelector('button[aria-label="Cancelar vista previa del ensamblaje"]')?.disabled }));
  const before = await observe(), beforeState=await state(), count=ipc.length;
  check(beforeState.apply&&beforeState.cancel,'STEP requires committed, reopened native geometry');
  await click('button[aria-label="Exportar STEP plano del ensamblaje"]'); const event=await responseAfter(before.serial,'export-assembly');
  check(event.format==='step'&&!event.hasToken&&canonical(event.document)===canonical(document),'STEP export retains exact committed graph without Apply authority');
  await waitFor('real circular STEP IPC completion',()=>ipc.slice(count).filter(r=>r.channel==='document:export'&&r.completed).length===1);
  await waitFor('STEP UI idle',()=>page(()=>document.querySelector('.assembly-app')?.getAttribute('aria-busy')==='false'));
  const transport=ipc.slice(count).find(r=>r.channel==='document:export').geometry, bytes=await fsp.readFile(output);
  check(transport.format==='step'&&transport.name===document.name&&transport.bytes===bytes.length&&transport.sha256===digest(bytes)&&event.response.value.size===bytes.length,'Actual worker, IPC and disk STEP bytes match');
  check(canonical(beforeState)===canonical(await state()),'STEP preserves history, recovery and preview authority');
  const text=bytes.toString('utf8');check(text.startsWith('ISO-10303-21;')&&/END-ISO-10303-21;\s*$/.test(text)&&/SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/.test(text),'Real STEP exchange and millimetre units');
  check((text.match(/MANIFOLD_SOLID_BREP\s*\(/g)||[]).length===2&&!/NEXT_ASSEMBLY_USAGE_OCCURRENCE\s*\(/.test(text),'Two flat solids, no invented hierarchy');
  const q=8/(3*Math.PI), expected=[
    {name:'fixed original A',min:[3,-2,0],max:[5,0,4],center:[3+q,-2+q,2]},
    {name:'half-arc FollowX UPY B',min:[3+Math.SQRT2,-2,4],max:[3+4*Math.SQRT2,-2+3*Math.SQRT2,6],center:[3+3*Math.SQRT2-q/Math.SQRT2,-2+Math.SQRT2+q/Math.SQRT2,4+q]},
  ];
  const oc=await require('replicad-opencascadejs')({wasmBinary:await fsp.readFile(require.resolve('replicad-opencascadejs/wasm')),print:()=>undefined}), owners=[],errors=[],nativePath='/original-circular-picking.step';let primary,result;
  const own=x=>(owners.push(x),x);
  try {
    own({delete:()=>{if(oc.FS.readdir('/').includes(nativePath.slice(1)))oc.FS.unlink(nativePath)}});oc.FS.writeFile(nativePath,bytes);
    const reader=own(new oc.STEPControl_Reader());check(reader.ReadFile(nativePath)===oc.IFSelect_ReturnStatus.IFSelect_RetDone,'Independent native STEP reader accepted actual disk file');reader.SetSystemLengthUnit(1);near(reader.SystemLengthUnit(),1,0,'Reader target mm');const roots=reader.NbRootsForTransfer();check(roots>0&&reader.TransferRoots()===roots,'All STEP roots transferred');
    const shape=own(reader.OneShape()),valid=own(new oc.BRepCheck_Analyzer(shape,true,false,false));check(!shape.IsNull()&&valid.IsValid(),'Actual STEP aggregate valid BRep');
    const explorer=own(new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_SOLID,oc.TopAbs_ShapeEnum.TopAbs_SHAPE)), solids=[],remaining=[...expected];
    while(explorer.More()) {
      check(solids.length<2,'No extra STEP solid');const solid=own(explorer.Current()),valid=own(new oc.BRepCheck_Analyzer(solid,true,false,false));check(valid.IsValid(),'Each actual STEP solid valid');
      const mass=own(new oc.GProp_GProps()),surface=own(new oc.GProp_GProps()),bounds=own(new oc.Bnd_Box());oc.BRepGProp.VolumeProperties(solid,mass,1e-10,false,false);oc.BRepGProp.SurfaceProperties(solid,surface,false,false);oc.BRepBndLib.AddOptimal(solid,bounds,false,false);
      const min=[bounds.GetXMin(),bounds.GetYMin(),bounds.GetZMin()],max=[bounds.GetXMax(),bounds.GetYMax(),bounds.GetZMax()],center=own(mass.CentreOfMass()),centroid=[center.X(),center.Y(),center.Z()];
      const matches=remaining.filter(e=>e.min.every((n,i)=>Math.abs(n-min[i])<=1e-6)&&e.max.every((n,i)=>Math.abs(n-max[i])<=1e-6));check(matches.length===1,'STEP exact independent quarter-sector placement');const e=matches[0];remaining.splice(remaining.indexOf(e),1);
      near(mass.Mass(),4*Math.PI,1e-5,e.name+' volume');near(surface.Mass(),6*Math.PI+16,1e-5,e.name+' area');e.center.forEach((n,i)=>near(centroid[i],n,1e-6,e.name+' material centroid'));
      solids.push({name:e.name,volume:mass.Mass(),area:surface.Mass(),bounds:{min,max},centroid});explorer.Next();
    }
    check(solids.length===2&&!remaining.length,'Exactly both analytical quarter-sector solids');result={kind:'fresh-native-step-reader',units:'mm',solidCount:2,solids};
  }catch(error){primary=error}finally{for(const owner of owners.reverse())try{owner.delete()}catch(error){errors.push(error)}}
  if(primary||errors.length)throw new AggregateError(primary?[primary,...errors]:errors,'Original circular STEP verification/cleanup failed',{cause:primary??errors[0]});
  evidence.step={serial:event.serial,documentSha256:digest(canonical(document)),bytes:bytes.length,sha256:digest(bytes),transport,geometry:result};
};
