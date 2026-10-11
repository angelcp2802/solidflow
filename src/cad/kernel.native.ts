import { cast, type AnyShape, type Shape3D } from 'replicad';

/** Replicad cast downcasts to a second wrapper; it does not consume the supplied raw handle. */
export function castOwnedNativeShape(raw: Parameters<typeof cast>[0]): AnyShape {
  try { return cast(raw); } finally { raw.delete(); }
}

/** Takes ownership of a returned native handle, including null/error results. */
export function castOwnedNativeSolid(raw: Parameters<typeof cast>[0], message: string): Shape3D {
  if (raw.IsNull()) { raw.delete(); throw new Error(message); }
  const shape = castOwnedNativeShape(raw);
  try { return shape.asShape3D(); }
  catch { shape.delete(); throw new Error(message); }
}
