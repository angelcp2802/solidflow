/** Persisted provenance metadata only. No disk path, read permission or native authority. */
export interface AssemblySourceLink { kind:'local-file'; displayName:string; contentSha256:string }
export function validateAssemblySourceLink(value:unknown):AssemblySourceLink {
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==3)throw Error('Source link requires exact plain metadata.')
 const data:Record<string,unknown>={}
 for(const key of Reflect.ownKeys(value)){const field=Object.getOwnPropertyDescriptor(value,key)!;if(typeof key!=='string'||!['kind','displayName','contentSha256'].includes(key)||!field.enumerable||!('value'in field))throw Error('Source link requires own data fields.');data[key]=field.value}
 if(data.kind!=='local-file'||typeof data.displayName!=='string'||data.displayName.length>255||data.displayName!==data.displayName.trim()||!/^.+\.solidflow$/i.test(data.displayName)||/[<>:"/\\|?*\p{Cc}\p{Cf}]/u.test(data.displayName)||typeof data.contentSha256!=='string'||data.contentSha256.length!==64||!/^[a-f0-9]{64}$/.test(data.contentSha256))throw Error('Invalid source link basename or SHA-256 metadata.')
 return {kind:'local-file',displayName:data.displayName,contentSha256:data.contentSha256}
}
