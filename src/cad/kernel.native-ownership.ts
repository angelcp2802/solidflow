export interface NativeOwner { delete(): void }

/** Fatal native release failure; an evaluator must not recover it as a feature geometry error. */
export class NativeCleanupError extends AggregateError {
  constructor(primary: { error: unknown } | undefined, cleanup: readonly unknown[], context: string) {
    const errors = primary ? [primary.error, ...cleanup] : [...cleanup];
    super(errors, context, { cause: primary ? primary.error : cleanup[0] });
    this.name = 'NativeCleanupError';
  }
}

/** Aggregate releases from earlier kernel components also require fatal propagation. */
export function isNativeCleanupFailure(error: unknown): error is AggregateError {
  return error instanceof AggregateError;
}

/** Own only wrappers actually received; native allocations lost before return remain upstream responsibilities. */
export class NativeOwners {
  private readonly records = new Map<NativeOwner, { attempted: boolean; release: () => void }>();
  private readonly released = new WeakSet<NativeOwner>();
  private readonly failures: unknown[] = [];
  own<T extends NativeOwner>(value: T): T {
    if (this.released.has(value)) throw new Error('Cannot own an already released native wrapper.');
    if (!this.records.has(value)) {
      const record = { attempted: false, release: value.delete.bind(value) };
      try { this.records.set(value, record); }
      catch (error) {
        // Even a failed/partially-published registration must not lose the
        // freshly received wrapper. A partially inserted record is marked too.
        record.attempted = true;
        this.released.add(value);
        try { record.release(); } catch (cleanup) { this.failures.push(cleanup); }
        throw error;
      }
    }
    return value;
  }
  /** Native array getters transfer all returned wrappers, even if one registration fails. */
  ownAll<T extends NativeOwner>(values: readonly T[]): readonly T[] {
    const errors: unknown[] = [], seen = new Set<NativeOwner>();
    for (const value of values) {
      if (seen.has(value)) continue;
      seen.add(value);
      try { this.own(value); } catch (error) { errors.push(error); }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, 'Native owner registration failed.', { cause: errors[0] });
    return values;
  }
  owns(value: NativeOwner): boolean { return !this.released.has(value) && this.records.get(value)?.attempted === false; }
  release(value: NativeOwner): void {
    const record = this.records.get(value);
    if (!record || record.attempted || this.released.has(value)) return;
    record.attempted = true;
    this.released.add(value);
    try { record.release(); } catch (error) { this.failures.push(error); }
  }
  releaseExcept(keep: ReadonlySet<NativeOwner>): void {
    for (const value of [...this.records.keys()].reverse()) if (!keep.has(value)) this.release(value);
  }
  transfer(value: NativeOwner): void { this.records.delete(value); }
  cleanupErrors(): readonly unknown[] { return [...this.failures]; }
}

/**
 * Keep results owned until all other cleanup succeeds. On failure, attempt every
 * received owner once, including a result that could otherwise be lost in finally.
 */
export function withNativeOwners<T>(operation: (owners: NativeOwners) => T,
  resultOwners: (result: T) => readonly NativeOwner[] = () => [], context = 'Native operation or release failed.'): T {
  const owners = new NativeOwners();
  let result!: T, primary: { error: unknown } | undefined;
  let keep = new Set<NativeOwner>();
  try {
    result = operation(owners);
    keep = new Set(resultOwners(result));
    for (const value of keep) if (!owners.owns(value)) throw new Error('Cannot transfer an unowned native result.');
  } catch (error) { primary = { error }; keep.clear(); }
  owners.releaseExcept(keep);
  if (primary || owners.cleanupErrors().length) {
    owners.releaseExcept(new Set());
    const cleanup = owners.cleanupErrors();
    if (cleanup.length) throw new NativeCleanupError(primary, cleanup, context);
    throw primary!.error;
  }
  for (const value of keep) owners.transfer(value);
  return result;
}
