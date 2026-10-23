/** Capture a declared record without writing caller-controlled property names
 * into an object. Nested values remain untrusted until their own validators run.
 * Presence and explicit undefined are intentionally distinct. */
export function captureOwnDataRecord(input:unknown,allowed:readonly string[],required:readonly string[]=allowed,label='Datos declarados'):ReadonlyMap<string,unknown> {
  if(!input || typeof input!=='object' || Array.isArray(input)
    || ![Object.prototype,null].includes(Object.getPrototypeOf(input))) throw Error(label+': se esperaba un registro de datos simple.')
  const result=new Map<string,unknown>()
  for(const key of Reflect.ownKeys(input)) {
    const field=Object.getOwnPropertyDescriptor(input,key)!
    if(typeof key!=='string' || !allowed.includes(key) || !field.enumerable || !('value'in field)) throw Error(label+': campo desconocido, oculto o ejecutable.')
    result.set(key,field.value)
  }
  if(required.some(key=>!result.has(key))) throw Error(label+': faltan campos obligatorios.')
  return result
}
