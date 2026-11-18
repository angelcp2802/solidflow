import type { Face, Shape3D } from 'replicad';
import { copyBodyShape, copyBodyWithFaces, NativeBodyTransaction } from './kernel.bodies';
import { createFaceCatalog } from './kernel.faces';
import { countNativeFaceOccurrences } from './kernel.native-face-membership';
import { withNativeOwners, type NativeOwner } from './kernel.native-ownership';
import type { BodyReference, FaceReference } from './kernel.types';

export type NativeRecipeFaceLease = NativeOwner;
interface FaceProof {
  epoch: object;
  owner: Readonly<BodyReference>;
  lineage: string;
  shape: Shape3D;
  faces: ReadonlyMap<string, Face>;
}
const proofs = new WeakMap<NativeRecipeFaceLease, FaceProof>();

/** Source keys locate candidates only within the exact staged owner. The copy builder
 * and native membership checks establish which oriented occurrences survive the copy.
 */
export function captureRecipeOwnerFaces(transaction: NativeBodyTransaction, epoch: object, ref: BodyReference,
  keys: ReadonlySet<string>): { shape: Shape3D; lease: NativeRecipeFaceLease } {
  if (!epoch || typeof epoch !== 'object') throw Error('La captura requiere una reconstrucción activa.');
  const entry = NativeBodyTransaction.requireOutput(transaction, ref);
  if (!keys.size || keys.size > 256) throw Error('La captura de caras requiere de 1 a 256 referencias.');
  return withNativeOwners(owners => {
    const catalog = createFaceCatalog(entry.shape, entry.ref.sourceFeatureId, entry.lineage);
    owners.own({ delete: () => catalog.dispose() });
    const matches = new Map<string, Face | null>();
    for (const candidate of catalog.entries) {
      const key = candidate.ref.key;
      if (keys.has(key)) matches.set(key, matches.has(key) ? null : candidate.face);
    }
    // Missing or ambiguous selections remain unavailable to their own consumer.
    const unique = [...matches].filter((item): item is [string, Face] => item[1] !== null);
    const copy = unique.length ? copyBodyWithFaces(entry.shape, unique.map(item => item[1]))
      : { shape: copyBodyShape(entry.shape), faces: [] };
    owners.ownAll([copy.shape, ...copy.faces]);
    const faces = new Map(unique.map(([key], index) => [key, copy.faces[index]]));
    const lease: NativeRecipeFaceLease = Object.freeze({
      delete() {
        if (!proofs.delete(lease)) return;
        withNativeOwners(cleanup => { cleanup.ownAll(copy.faces); }, undefined, 'Historical face image release failed.');
      },
    });
    proofs.set(lease, { epoch, owner: entry.ref, lineage: entry.lineage, shape: copy.shape, faces });
    return { shape: copy.shape, lease };
  }, value => [value.shape, ...proofs.get(value.lease)!.faces.values()], 'Historical face capture or release failed.');
}

/** Borrowed only until the build retires the lease. No face key or geometry can issue a proof. */
export function readHistoricalRecipeFace(lease: NativeRecipeFaceLease | undefined, epoch: object | undefined,
  owner: Readonly<BodyReference>, lineage: string, shape: Shape3D, reference: FaceReference): Face {
  const proof = lease && proofs.get(lease);
  if (!proof || proof.epoch !== epoch || proof.shape !== shape || proof.lineage !== lineage ||
      proof.owner.bodyId !== owner.bodyId || proof.owner.sourceFeatureId !== owner.sourceFeatureId ||
      reference.sourceFeatureId !== owner.sourceFeatureId) throw Error('La cara histórica requiere su captura exacta del cuerpo y de la reconstrucción actual.');
  const face = proof.faces.get(reference.key);
  if (!face || countNativeFaceOccurrences(shape.wrapped, face.wrapped, true) !== 1) {
    throw Error('La cara histórica ya no es una ocurrencia única del cuerpo seleccionado. Recupera su referencia.');
  }
  return face;
}
