import {validateDocument} from '../model/document'
import {validateRigidPose} from '../model/rigidPose'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import {setOC,measureShapeVolumeProperties,measureShapeSurfaceProperties} from 'replicad'
import {beforeAll,expect,it} from 'vitest'
import {assemblyConfigurationCoreFixture} from '../model/assemblyConfigurationCore.test-utils'
import {evaluateAssemblyConfiguration} from '../model/assemblyConfigurationCore'
import {serializeAssemblyDocument} from '../model/assemblyDocument'
import {CadEngine} from './kernel.engine'
import {placeAssemblyShape,validateAssemblyShape} from './kernel.assembly-placements'
import {withNativeOwners} from './kernel.native-ownership'

beforeAll(async()=>setOC(await initOpenCascade({wasmBinary:await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),print:()=>undefined})),60_000)
type ExpectedBox={path:string[];min:number[];max:number[];volume:number;area:number}
const A=(owner:string,min:number[],max:number[]):ExpectedBox=>({path:[owner,'a'],min,max,volume:24,area:52})
const B=(owner:string,min:number[],max:number[]):ExpectedBox=>({path:[owner,'b'],min,max,volume:10,area:34})
// Expected boxes are literal original quarter-turn geometry, never obtained
// from the declaration evaluator or a production pose-composition helper.
const mixed=[A('left',[0,0,0],[2,3,4]),B('left',[10,0,0],[11,2,5]),A('right',[27,0,0],[30,2,4]),B('right',[28,4,0],[30,5,5])]
function checkGeometry(evaluation:ReturnType<typeof evaluateAssemblyConfiguration>,expected:ExpectedBox[],volume:number,area:number){
 expect(evaluation.status).toBe('ready');expect(evaluation.diagnostics).toEqual([])
 const active=evaluation.parts.filter(part=>!part.suppressed)
 expect(active).toHaveLength(expected.length)
 const paths=active.map(part=>JSON.stringify(part.path)),expectedPaths=expected.map(box=>JSON.stringify(box.path))
 expect(new Set(paths).size).toBe(active.length)
 expect([...paths].sort()).toEqual([...expectedPaths].sort())
 withNativeOwners(owners=>{
  let totalVolume=0,totalArea=0
  for(const part of active){
   const boxes=expected.filter(box=>JSON.stringify(box.path)===JSON.stringify(part.path));expect(boxes).toHaveLength(1)
   const box=boxes[0],engine=new CadEngine();owners.own({delete:()=>engine.dispose()})
   // Real current prototypes are built directly from the evaluated source
   // declaration. No synthetic saved document or snapshot proof is invented.
   const result=engine.build(validateDocument(part.definition.document).features);expect(result.featureErrors).toEqual([])
   const local=owners.own(engine.copyCurrentBodyShape(null)),placed=owners.own(placeAssemblyShape(local,validateRigidPose(part.worldPose)))
   expect(validateAssemblyShape(placed)).toBe(1)
   const mass=owners.own(measureShapeVolumeProperties(placed)).volume,surface=owners.own(measureShapeSurfaceProperties(placed)).area
   expect(Math.abs(mass-box.volume)).toBeLessThanOrEqual(1e-5);expect(Math.abs(surface-box.area)).toBeLessThanOrEqual(1e-5)
   const bounds=owners.own(placed.boundingBox).bounds
   for(let i=0;i<3;i++){
    expect(Math.abs(bounds[0][i]-box.min[i])).toBeLessThanOrEqual(1e-6)
    expect(Math.abs(bounds[1][i]-box.max[i])).toBeLessThanOrEqual(1e-6)
   }
   totalVolume+=mass;totalArea+=surface
  }
  expect(Math.abs(totalVolume-volume)).toBeLessThanOrEqual(1e-5)
  expect(Math.abs(totalArea-area)).toBeLessThanOrEqual(1e-5)
 })
}

it('places base-left and compact-right native bodies independently without rewriting the source base',()=>{
 const {document,catalog}=assemblyConfigurationCoreFixture(),saved=serializeAssemblyDocument(document),variants=JSON.stringify(catalog)
 const evaluation=evaluateAssemblyConfiguration(document,catalog,'mixed')
 checkGeometry(evaluation,mixed,68,172)
 expect(evaluation.parts.find(part=>JSON.stringify(part.path)==='["left","b"]')?.worldPose.translation).toEqual([10,0,0])
 expect(evaluation.parts.find(part=>JSON.stringify(part.path)==='["right","b"]')?.configurationAncestry.some(scope=>scope.configuration==='compact')).toBe(true)
 expect(Object.isFrozen(evaluation)).toBe(true);expect(Object.isFrozen(evaluation.parts[0].worldPose.translation)).toBe(true)
 expect(serializeAssemblyDocument(document)).toBe(saved);expect(JSON.stringify(catalog)).toBe(variants)
})

it('excludes only the configured right B while retaining the suppressed declaration and left base geometry',()=>{
 const {document,catalog}=assemblyConfigurationCoreFixture(),saved=serializeAssemblyDocument(document)
 const evaluation=evaluateAssemblyConfiguration(document,catalog,'single-right')
 checkGeometry(evaluation,mixed.slice(0,3),58,138)
 expect(evaluation.parts).toHaveLength(4)
 expect(evaluation.parts.find(part=>JSON.stringify(part.path)==='["right","b"]')?.suppressed).toBe(true)
 expect(evaluation.parts.find(part=>JSON.stringify(part.path)==='["left","b"]')?.suppressed).toBe(false)
 expect(serializeAssemblyDocument(document)).toBe(saved)
})

it('reuses the same compact variant at both placements while the base remains independently evaluable',()=>{
 const {document,catalog}=assemblyConfigurationCoreFixture()
 const both=[mixed[0],B('left',[4,0,0],[5,2,5]),mixed[2],mixed[3]]
 const evaluation=evaluateAssemblyConfiguration(document,catalog,'both-compact')
 checkGeometry(evaluation,both,68,172)
 const uses=evaluation.scopes.filter(scope=>scope.configuration==='compact')
 expect(uses.map(scope=>scope.path)).toEqual([['left'],['right']])
 expect(uses[0]).not.toBe(uses[1]);expect(uses[0].worldPose).not.toEqual(uses[1].worldPose)
 checkGeometry(evaluateAssemblyConfiguration(document,catalog),[mixed[0],mixed[1],mixed[2],B('right',[28,10,0],[30,11,5])],68,172)
})

it('retains the configured geometry under a common proper three-dimensional rigid gauge',()=>{
 const {document,catalog}=assemblyConfigurationCoreFixture()
 // Common Rx90 + (7,-11,13). Literal Rx90*Rz90 quaternion is
 // (.5,-.5,.5,.5); only the declarations receive these chosen poses.
 document.occurrences[0].pose={translation:[7,-11,13],rotation:[Math.SQRT1_2,0,0,Math.SQRT1_2]}
 document.occurrences[1].pose={translation:[37,-11,13],rotation:[.5,-.5,.5,.5]}
 const expected=mixed.map(box=>({...box,min:[box.min[0]+7,-box.max[2]-11,box.min[1]+13],max:[box.max[0]+7,-box.min[2]-11,box.max[1]+13]}))
 const saved=serializeAssemblyDocument(document)
 checkGeometry(evaluateAssemblyConfiguration(document,catalog,'mixed'),expected,68,172)
 expect(serializeAssemblyDocument(document)).toBe(saved)
})
