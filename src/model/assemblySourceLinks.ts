import {validateAssemblySourceLink,type AssemblySourceLink} from './assemblySourceLink'
import {assemblyDefinitionKey,serializeAssemblyDocument,validateAssemblyDocument,type AssemblyDocument,type AssemblyDefinitionReference} from './assemblyDocument'
export {validateAssemblySourceLink,type AssemblySourceLink} from './assemblySourceLink'
/** Metadata-only change to one exact cached definition, including dormant and
 * reused definitions. This grants no filesystem access or geometry association. */
export function setAssemblySourceLink(input:AssemblyDocument,reference:AssemblyDefinitionReference,link:AssemblySourceLink|null):AssemblyDocument {
 const document=validateAssemblyDocument(input)
 if(!reference||typeof reference!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(reference))||Reflect.ownKeys(reference).length!==2)throw Error('Source link needs an exact definition reference.')
 const values:Record<string,string>={}
 for(const key of Reflect.ownKeys(reference)){const field=Object.getOwnPropertyDescriptor(reference,key)!;if(typeof key!=='string'||!['id','revision'].includes(key)||!field.enumerable||!('value'in field)||typeof field.value!=='string'||!field.value.trim()||field.value.length>128||/[\p{Cc}]/u.test(field.value))throw Error('Source link definition reference must be own identifier data.');values[key]=field.value}
 const definition=document.definitions.find(value=>assemblyDefinitionKey(value)===assemblyDefinitionKey({id:values.id,revision:values.revision}))
 if(!definition)throw Error('Source link must identify an existing embedded definition, never the root.')
 if(link===null)delete definition.sourceLink
 else definition.sourceLink=validateAssemblySourceLink(link)
 serializeAssemblyDocument(document)
 return document
}
