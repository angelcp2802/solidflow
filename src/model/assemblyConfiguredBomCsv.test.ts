import {expect,it} from 'vitest'
import {assemblyConfigurationCoreFixture} from './assemblyConfigurationCore.test-utils'
import {createAssemblyConfiguredDocument} from './assemblyConfiguredDocument'
import {serializeConfiguredAssemblyBomCsv,encodeConfiguredAssemblyBomCsv,MAX_CONFIGURED_ASSEMBLY_BOM_CSV_BYTES} from './assemblyConfiguredBomCsv'
import {identityRigidPose} from './rigidPose'
import type {EmbeddedAssemblyDefinition} from './assemblyDocument'
function fixture(root:string|null='mixed'){const f=assemblyConfigurationCoreFixture();return createAssemblyConfiguredDocument(f.document,f.catalog,root)}
// Independently authored quoted CSV reader; expected fields below are literal
// occurrence/state identities, never obtained through the BOM builder.
function records(csv:string):string[][] {
 expect(csv[0]).toBe('\ufeff');let i=1;const rows:string[][]=[]
 while(i<csv.length){const row:string[]=[]
  while(true){expect(csv[i++]).toBe('"');let value=''
   while(i<csv.length){const c=csv[i++];if(c!=='"')value+=c;else if(csv[i]==='"'){value+='"';i++}else break}
   row.push(value);if(csv[i]===','){i++;continue}expect(csv.slice(i,i+2)).toBe('\r\n');i+=2;break
  }rows.push(row)
 }return rows
}
const headers=['Item','Type','Name','Definition ID','Revision','Configuration','Quantity per parent','Total quantity','Occurrence paths','Configuration ancestry','Root configuration','Scope path','Source link name','Source link SHA-256']
it('encodes exact selected root and absolute member ancestry with unchanged literal-text and quantity policies',()=>{
 const doc=fixture(),before=JSON.stringify(doc),csv=serializeConfiguredAssemblyBomCsv(doc),rows=records(csv)
 expect(rows[0]).toEqual(headers);expect(rows).toHaveLength(3)
 expect(rows[1].slice(0,9)).toEqual(["'1","'part","'configuration-A","'configuration-A","'r1","'null",'', '2',"'[[\"left\",\"a\"],[\"right\",\"a\"]]"])
 expect(rows[2][8]).toBe("'[[\"left\",\"b\"],[\"right\",\"b\"]]")
 expect(rows[1][9]).toBe("'"+JSON.stringify([
  [{path:[],definition:{id:'configuration-root',revision:'root-r1'},configuration:'mixed'},{path:['left'],definition:{id:'configuration-S',revision:'s-r1'},configuration:null}],
  [{path:[],definition:{id:'configuration-root',revision:'root-r1'},configuration:'mixed'},{path:['right'],definition:{id:'configuration-S',revision:'s-r1'},configuration:'compact'}],
 ]))
 expect(rows[1].slice(10)).toEqual(["'\"mixed\"","'[]","'","'"])
 expect(encodeConfiguredAssemblyBomCsv(doc)).toEqual(new TextEncoder().encode(csv));expect(JSON.stringify(doc)).toBe(before)
})
it('preserves configured assembly row distinctions and scoped full paths rather than exporting the source Base',()=>{
 const mixed=records(serializeConfiguredAssemblyBomCsv(fixture(),{mode:'top-level'}))
 expect(mixed.slice(1).map(r=>[r[5],r[6],r[7]])).toEqual([["'null",'1','1'],["'\"compact\"",'1','1']])
 const shared=records(serializeConfiguredAssemblyBomCsv(fixture('both-compact'),{mode:'indented'}))
 expect(shared.slice(1).map(r=>[r[0],r[5],r[6],r[7]])).toEqual([["'1","'\"compact\"",'2','2'],["'1.1","'null",'1','2'],["'1.2","'null",'1','2']])
 const scoped=records(serializeConfiguredAssemblyBomCsv(fixture(),{scopePath:['right']}))
 expect(scoped.slice(1).map(r=>[r[8],r[11]])).toEqual([["'[[\"right\",\"a\"]]","'[\"right\"]"],["'[[\"right\",\"b\"]]","'[\"right\"]"]])
 const base=fixture(null);base.catalog[0].configurations.push({id:'Base',name:'Named Base',occurrences:[],mates:[]})
 expect(records(serializeConfiguredAssemblyBomCsv(base))[1][10]).toBe("'null")
 base.rootConfiguration='Base';expect(records(serializeConfiguredAssemblyBomCsv(base))[1][10]).toBe("'\"Base\"")
})
it('neutralizes every text cell without rewriting hostile-looking labels or accepted source metadata',()=>{
 const doc=fixture(),part=doc.source.definitions[0];if(part.kind!=='part')throw Error('Original part')
 part.document.name='=SUM(1,2)\r\nΩ "quoted"';part.sourceLink={kind:'local-file',displayName:'=original.solidflow',contentSha256:'f'.repeat(64)}
 const rows=records(serializeConfiguredAssemblyBomCsv(doc));expect(rows[1][2]).toBe("'=SUM(1,2)\r\nΩ \"quoted\"")
 expect(rows[1][12]).toBe("'=original.solidflow");expect(rows[1][13]).toBe("'"+'f'.repeat(64))
 for(const row of rows.slice(1))for(let i=0;i<row.length;i++)if(i!==6 && i!==7)expect(row[i].startsWith("'")).toBe(true)
 part.document.name="'already text";expect(records(serializeConfiguredAssemblyBomCsv(doc))[1][2]).toBe("''already text")
})
it.each(['\u0000','\ud800','\udfff'])('rejects invalid raw Unicode before JSON escaping could conceal it: %j',bad=>{
 const doc=fixture(),part=doc.source.definitions[0];if(part.kind!=='part')throw Error('Original part')
 part.document.name='Original '+bad
 expect(()=>serializeConfiguredAssemblyBomCsv(doc)).toThrow()
})
it('returns a header-only CSV for an empty effective selection and rejects report-shaped inputs',()=>{
 const doc=fixture();doc.source.occurrences.forEach(o=>o.suppressed=true)
 expect(records(serializeConfiguredAssemblyBomCsv(doc))).toEqual([headers])
 expect(()=>serializeConfiguredAssemblyBomCsv({kind:'configured-assembly-bom',rows:[]} as never)).toThrow()
})
it('enforces the complete encoded20MiB boundary including expanded absolute state ancestry',()=>{
 // Original declaration-only hierarchy; no geometry is generated. The input is
 // small and graph-bounded, while repeated long ROOT ancestry exceeds CSV cap.
 const doc=fixture(null),part=doc.source.definitions[0],stamp=doc.source.createdAt
 doc.catalog=[];doc.source.definitions=[part]
 let child={id:part.id,revision:part.revision}
 for(let depth=15;depth>=0;depth--){
  const id=('original-owner-'+depth+'-').padEnd(128,'o'),name=('use-'+depth+'-').padEnd(128,'u')
  const count=depth===15?1024:1
  const node:EmbeddedAssemblyDefinition={kind:'assembly',id,revision:'r1',name:'Original hierarchy',createdAt:stamp,updatedAt:stamp,mates:[],occurrences:Array.from({length:count},(_,i)=>({id:depth===15?('part-'+i+'-').padEnd(128,'p'):name,name:'Original unit',definition:{...child},pose:identityRigidPose(),fixed:false,suppressed:false,visible:true}))}
  doc.source.definitions.push(node);child={id:node.id,revision:node.revision}
 }
 doc.source.occurrences=[{id:'root-use'.padEnd(128,'r'),name:'Original root use',definition:child,pose:identityRigidPose(),fixed:false,suppressed:false,visible:true}]
 expect(new TextEncoder().encode(JSON.stringify(doc)).byteLength).toBeLessThan(MAX_CONFIGURED_ASSEMBLY_BOM_CSV_BYTES)
 expect(()=>serializeConfiguredAssemblyBomCsv(doc)).toThrow(/supera20MiB/)
})
