/** Original raw-boundary and finite-arithmetic regressions for recipe math. */
import { expect, it, vi } from 'vitest';
import {
  recipeTransform, RecipeClosureError, transformedExtrusionFrame, type RecipeInstanceTransform,
} from './featureRecipes';
import type { PlaneFrame } from '../cad/kernel.types';

it('rejects a raw transform accessor before invoking it if the helper remains a raw boundary', () => {
  const getter = vi.fn(() => [20, 0, 0]);
  const raw = { key: '1,0' } as RecipeInstanceTransform;
  Object.defineProperty(raw, 'translation', { enumerable: true, get: getter });
  expect(() => recipeTransform(raw)).toThrow(RecipeClosureError);
  expect(getter).not.toHaveBeenCalled();
});

it('rejects a raw frame accessor before invoking it if the frame helper remains a raw boundary', () => {
  const getter = vi.fn(() => [0, 0, 0]);
  const raw = { xDirection: [1, 0, 0], normal: [0, 0, 1] } as PlaneFrame;
  Object.defineProperty(raw, 'origin', { enumerable: true, get: getter });
  expect(() => transformedExtrusionFrame(raw, 4, { key: '1,0', translation: [20, 0, 0] })).toThrow(RecipeClosureError);
  expect(getter).not.toHaveBeenCalled();
});

it('rejects a transformed point whose finite operands overflow during addition', () => {
  const mapping = recipeTransform({ key: '1,0', translation: [Number.MAX_VALUE, 0, 0] });
  expect(() => mapping.point([Number.MAX_VALUE, 0, 0])).toThrow(RecipeClosureError);
});
