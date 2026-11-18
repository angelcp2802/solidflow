import {expect,it} from 'vitest'
import {createDocument} from './document'
import {assemblyConfigurationCoreFixture} from './assemblyConfigurationCore.test-utils'
import {createAssemblyConfiguredDocument} from './assemblyConfiguredDocument'
import {validateCadDocument,parseCadDocument,serializeCadDocument} from './cadDocument'
import {validateCadDocument as validateLegacyCadDocument,serializeCadDocument as serializeLegacyCadDocument} from './assemblyDocument'

// Original persistence-only A/B recipes; no native geometry or saved authority.
it('dispatches all three explicit formats and preserves legacy serialization exactly',()=>{
 const {document,catalog}=assemblyConfigurationCoreFixture(),part=createDocument('Original part'),configured=createAssemblyConfiguredDocument(document,catalog,'mixed')
 for(const source of [part,document,configured])expect(parseCadDocument(serializeCadDocument(source))).toEqual(validateCadDocument(source))
 for(const source of [part,document])expect(serializeCadDocument(source)).toBe(serializeLegacyCadDocument(source))
 expect(()=>validateLegacyCadDocument(configured)).toThrow()
})
it.each([undefined,null,0,-1,4,'3',NaN])('rejects unsupported version %s explicitly rather than falling back',version=>{
 expect(()=>validateCadDocument({version})).toThrow()
})
it('inspects own descriptors before dispatch, including executable fields outside the version',()=>{
 let reads=0
 for(const input of [{get version(){reads++;return 3}},Object.create({version:3}),{version:99,get source(){reads++;return {}}}])expect(()=>validateCadDocument(input)).toThrow()
 expect(reads).toBe(0)
})
