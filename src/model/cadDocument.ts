import {MAX_ASSEMBLY_BYTES,validateCadDocument as validateLegacyCadDocument,type CadDocument as LegacyCadDocument} from './assemblyDocument'
import {validateAssemblyConfiguredDocument,validateConfiguredDocumentJsonData,type AssemblyConfiguredDocument} from './assemblyConfiguredDocument'

export type CadDocument=LegacyCadDocument|AssemblyConfiguredDocument
/** New versioned persistence boundary. Legacy parsers keep their old admission
 * rules; an unsupported version never falls through to a different format. */
export function validateCadDocument(value:unknown):CadDocument {
  validateConfiguredDocumentJsonData(value)
  if(!value || typeof value!=='object' || Array.isArray(value))throw Error('CAD document requires a versioned data record.')
  const version=Object.getOwnPropertyDescriptor(value,'version')
  if(!version || !version.enumerable || !('value'in version))throw Error('CAD document requires an own data version.')
  switch(version.value){
    case 1:case 2:return validateLegacyCadDocument(value)
    case 3:return validateAssemblyConfiguredDocument(value)
    default:throw Error('Unsupported CAD document version.')
  }
}
export function parseCadDocument(json:string):CadDocument {
  if(typeof json!=='string' || new TextEncoder().encode(json).byteLength>MAX_ASSEMBLY_BYTES)throw Error('CAD input exceeds20MiB.')
  let value:unknown
  try{value=JSON.parse(json)}catch{throw Error('CAD input is not valid JSON.')}
  return validateCadDocument(value)
}
export function serializeCadDocument(document:CadDocument):string {
  const json=JSON.stringify(validateCadDocument(document),null,2)
  if(new TextEncoder().encode(json).byteLength>MAX_ASSEMBLY_BYTES)throw Error('Serialized CAD document exceeds20MiB.')
  return json
}
