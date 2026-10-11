import { sha256Bytes } from '../shared/sha256';

/** Text lineage retains its original UTF-8 byte representation. */
export function namingDigest(text: string): string {
  return sha256Bytes(new TextEncoder().encode(text));
}

export function advanceLineage(previous: string, descriptor: unknown): string {
  return namingDigest(JSON.stringify([previous, descriptor]));
}
