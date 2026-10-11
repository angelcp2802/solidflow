import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { namingDigest } from './kernel.naming';

describe('structural lineage digest', () => {
  it.each(['', 'abc', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(1000), 'Croquis y revolución · pieza azul 🧊'])('matches standard SHA-256 for input of length %s', (input) => {
    expect(namingDigest(input)).toBe(createHash('sha256').update(input).digest('hex'));
  });
});
