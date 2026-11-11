import { getOC, type Shape3D } from 'replicad';
import { withNativeOwners } from './kernel.native-ownership';

type Analyzer = InstanceType<ReturnType<typeof getOC>['BRepCheck_Analyzer']>;
type Phase = 'active' | 'busy' | 'rejected' | 'poisoned' | 'closed';

/** Internal synchronous borrower. The first check must be the seed itself. */
export interface NativeValidationContext {
  check(shape: Shape3D): boolean;
}

/** A native/protocol fault must escape the engine's ordinary feature fallback. */
export class NativeValidationContextError extends AggregateError {
  constructor(errors: readonly unknown[]) {
    super(errors, 'Native validation context failed.', { cause: errors[0] });
    this.name = 'NativeValidationContextError';
  }
}

const CONTEXT = 'Native validation context or analyzer release failed.';
const invalidSeed = () => new Error('El cuerpo no es un BRep válido.');

/**
 * All inputs are borrowed and must outlive this entire callback. No global pool,
 * async work, ownership transfer, validity memoization or native handles escape.
 * Lazy construction preserves a caller's metadata/null checks before its first
 * native query. A false first seed is retired and rejected as ordinary geometry;
 * only an independently observed true seed can be a later reset checkpoint.
 */
export function withNativeValidationContext<T>(seed: Shape3D,
  operation: (context: NativeValidationContext) => T): T {
  const oc = getOC(), seedRaw = seed.wrapped;
  const state: { phase: Phase; fatal?: NativeValidationContextError } = { phase: 'active' };
  return withNativeOwners(owners => {
    let analyzer: Analyzer | undefined, seedVerified = false;
    const poison = (...errors: unknown[]): NativeValidationContextError => {
      if (state.fatal && !errors.includes(state.fatal)) errors.unshift(state.fatal);
      state.phase = 'poisoned';
      return state.fatal = new NativeValidationContextError(errors);
    };
    const identity = (): void => {
      if (getOC() !== oc || seed.wrapped !== seedRaw) throw new Error('Native validation owner/context changed.');
    };
    const flags = (value: Analyzer): void => {
      if (value.IsParallel() !== false || value.IsExactMethod() !== false) {
        throw new Error('Native validation flags differ from the explicit serial/inexact policy.');
      }
    };
    const check = (shape: Shape3D): boolean => {
      if (state.phase === 'closed') throw new NativeValidationContextError([new Error('Native validation context is closed.')]);
      if (state.phase === 'rejected') throw invalidSeed();
      if (state.phase !== 'active') throw poison(new Error('Native validation context is busy or poisoned.'));
      let target: Shape3D['wrapped'];
      try {
        identity(); target = shape.wrapped;
        if (!seedVerified && target !== seedRaw) throw new Error('The first native validation target must be its seed.');
      } catch (error) { throw poison(error); }
      state.phase = 'busy';
      let value = false, rejected = false;
      let primary: { error: unknown } | undefined, reset: { error: unknown } | undefined;
      try {
        analyzer ??= owners.own(new oc.BRepCheck_Analyzer(seedRaw, true, false, false));
        flags(analyzer); analyzer.Init(target, true); flags(analyzer); identity();
        if (state.fatal) throw state.fatal;
        value = analyzer.IsValid(); flags(analyzer); identity();
        if (state.fatal) throw state.fatal;
        if (typeof value !== 'boolean') throw new Error('Native validation did not return a boolean.');
        if (!seedVerified && !value) {
          // Malformed first input is not a reset failure. It never becomes a
          // reusable checkpoint, even if the callback catches its rejection.
          rejected = true; state.phase = 'rejected';
          owners.release(analyzer); analyzer = undefined;
          if (owners.cleanupErrors().length) throw poison(...owners.cleanupErrors());
        } else seedVerified = true;
      } catch (error) { primary = { error }; }
      finally {
        if (analyzer) {
          try {
            // Retarget the captured native instance, including after a primary
            // fault. Its seed and attempted target remain externally owned.
            flags(analyzer); analyzer.Init(seedRaw, true); flags(analyzer);
            const seedValid = analyzer.IsValid(); flags(analyzer);
            if (typeof seedValid !== 'boolean' || (seedVerified && !seedValid)) {
              throw new Error('Native validation reset did not restore its verified seed.');
            }
          } catch (error) {
            reset = { error };
            owners.release(analyzer); analyzer = undefined;
          }
        }
      }
      if (primary || reset) {
        throw poison(...(primary ? [primary.error] : []), ...(reset ? [reset.error] : []));
      }
      // A reset hook may change the active OC/seed even after its last native
      // query. Detect that before a caller starts volume/topology work.
      try { identity(); } catch (error) { throw poison(error); }
      if (state.fatal) throw state.fatal;
      if (rejected) return false;
      state.phase = 'active';
      return value;
    };
    const context: NativeValidationContext = Object.freeze({ check });
    const assertReturnable = (): void => {
      try { identity(); } catch (error) { throw poison(error); }
      if (state.fatal) throw state.fatal;
      if (state.phase === 'rejected') throw invalidSeed();
    };
    try {
      const result = operation(context);
      assertReturnable();
      if (result !== null && (typeof result === 'object' || typeof result === 'function')
        && typeof (result as { then?: unknown }).then === 'function') {
        throw poison(new Error('Native validation callbacks must be synchronous.'));
      }
      // Reading then may execute an accessor which catches a guard failure.
      // No candidate can pass after such a late poison/rejection/owner change.
      assertReturnable();
      return result;
    } catch (error) {
      // A callback cannot downgrade a caught protocol/native fault to an
      // ordinary feature error by throwing a different (even falsy) value.
      try { identity(); } catch (identityError) { poison(identityError); }
      if (state.fatal && error !== state.fatal) {
        throw new NativeValidationContextError([error, state.fatal]);
      }
      throw error;
    } finally {
      // Close before NativeOwners invokes the captured delete. An escaped or
      // reentrant checker cannot acquire native work during final retirement.
      state.phase = 'closed';
    }
  }, undefined, CONTEXT);
}
