import { expect, it, vi } from 'vitest';
import { isNativeCleanupFailure, NativeCleanupError, withNativeOwners } from './kernel.native-ownership';

// Original causal wrappers; no SDK/native mocks or global patches are needed.
it('transfers the owned result only after all other release succeeds', () => {
  const events: string[] = [], result = { delete: vi.fn(() => { events.push('result'); }) };
  const returned = withNativeOwners(owners => {
    owners.own({ delete: () => { events.push('temporary'); } });
    return owners.own(result);
  }, value => [value]);
  expect(returned).toBe(result); expect(events).toEqual(['temporary']); expect(result.delete).not.toHaveBeenCalled();
  returned.delete(); expect(events).toEqual(['temporary', 'result']);
});
it('preserves an original operation failure and attempts every received owner in reverse order', () => {
  const primary = new Error('Original operation failed'), events: number[] = [];
  let caught: unknown;
  try { withNativeOwners(owners => {
    owners.own({ delete: () => { events.push(1); } }); owners.own({ delete: () => { events.push(2); } }); throw primary;
  }); } catch (error) { caught = error; }
  expect(caught).toBe(primary);
  expect(events).toEqual([2, 1]);
});
it('retains a result until cleanup succeeds and releases it once when a sibling release fails', () => {
  const cleanup = new Error('Original cleanup failed'), first = { delete: vi.fn() },
    failed = { delete: vi.fn(() => { throw cleanup; }) }, result = { delete: vi.fn() };
  let caught: unknown;
  try { withNativeOwners(owners => { owners.own(first); owners.own(failed); return owners.own(result); }, value => [value]); }
  catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(NativeCleanupError); expect((caught as NativeCleanupError).cause).toBe(cleanup);
  expect((caught as NativeCleanupError).errors).toEqual([cleanup]);
  for (const owner of [first, failed, result]) expect(owner.delete).toHaveBeenCalledTimes(1);
});
it('retains primary identity and all cleanup errors without stopping at the first failed release', () => {
  const primary = new Error('Original primary'), a = new Error('Original cleanup A'), b = new Error('Original cleanup B');
  const first = { delete: vi.fn(() => { throw a; }) }, second = { delete: vi.fn(() => { throw b; }) };
  let caught: unknown;
  try { withNativeOwners(owners => { owners.own(first); owners.own(second); throw primary; }); } catch (error) { caught = error; }
  expect((caught as NativeCleanupError).cause).toBe(primary);
  expect((caught as NativeCleanupError).errors).toEqual([primary, b, a]);
  expect(first.delete).toHaveBeenCalledTimes(1); expect(second.delete).toHaveBeenCalledTimes(1);
  expect(isNativeCleanupFailure(caught)).toBe(true); expect(isNativeCleanupFailure(primary)).toBe(false);
});
it('owns an earlier acquisition before a later factory throws', () => {
  const primary = new Error('Original second factory'), first = { delete: vi.fn() };
  const second = () => { throw primary; };
  let caught: unknown;
  try { withNativeOwners(owners => { owners.own(first); owners.own(second()); }); } catch (error) { caught = error; }
  expect(caught).toBe(primary);
  expect(first.delete).toHaveBeenCalledTimes(1);
});
it('does not retry an explicit failed release and still releases a later replacement', () => {
  const cleanup = new Error('Original early release'), old = { delete: vi.fn(() => { throw cleanup; }) }, replacement = { delete: vi.fn() };
  expect(() => withNativeOwners(owners => {
    owners.own(old); const next = owners.own(replacement); owners.release(old); return next;
  }, result => [result])).toThrow(NativeCleanupError);
  expect(old.delete).toHaveBeenCalledTimes(1); expect(replacement.delete).toHaveBeenCalledTimes(1);
});
it('rejects transferring an unowned or already released wrapper without deleting borrowed input', () => {
  const borrowed = { delete: vi.fn() }, released = { delete: vi.fn() };
  expect(() => withNativeOwners(() => borrowed, result => [result])).toThrow('Cannot transfer an unowned native result.');
  expect(borrowed.delete).not.toHaveBeenCalled();
  expect(() => withNativeOwners(owners => { owners.own(released); owners.release(released); return released; }, result => [result]))
    .toThrow('Cannot transfer an unowned native result.');
  expect(released.delete).toHaveBeenCalledTimes(1);
});
it('preserves a nested fatal cleanup and treats duplicate received handles as one owner', () => {
  const primary = new Error('Original inner release'), same = { delete: vi.fn(() => { throw primary; }) }, outer = { delete: vi.fn() };
  let inner: unknown, caught: unknown;
  try { withNativeOwners(owners => {
    owners.own(outer);
    try { withNativeOwners(nested => { nested.ownAll([same, same]); }); } catch (error) { inner = error; throw error; }
  }); } catch (error) { caught = error; }
  expect(caught).toBe(inner); expect(caught).toBeInstanceOf(NativeCleanupError);
  expect(same.delete).toHaveBeenCalledTimes(1); expect(outer.delete).toHaveBeenCalledTimes(1);
});
it('releases a fresh wrapper exactly once even when its ownership registration throws after insertion', () => {
  const primary = new Error('Original partial registration'), cleanup = new Error('Original fresh release'),
    earlier = { delete: vi.fn() }, fresh = { delete: vi.fn(() => { throw cleanup; }) };
  let caught: unknown;
  try { withNativeOwners(owners => {
    owners.own(earlier);
    // Fault only this scope's private Map instance, after its real set. This
    // is a causal registration fault, not a global/prototype/SDK patch.
    const records = (owners as unknown as { records: Map<unknown, unknown> }).records, realSet = records.set.bind(records);
    Object.defineProperty(records, 'set', { configurable: true, value: (key: unknown, value: unknown) => {
      realSet(key, value); if (key === fresh) throw primary; return records;
    } });
    owners.own(fresh);
  }); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(NativeCleanupError); expect((caught as NativeCleanupError).cause).toBe(primary);
  expect((caught as NativeCleanupError).errors).toEqual([primary, cleanup]);
  expect(fresh.delete).toHaveBeenCalledTimes(1); expect(earlier.delete).toHaveBeenCalledTimes(1);
});
it('does not reacquire or release a duplicate when its first registration fails before insertion', () => {
  const primary = new Error('Original pre-insertion registration'), fresh = { delete: vi.fn() }, later = { delete: vi.fn() };
  let caught: unknown, registrations = 0;
  try { withNativeOwners(owners => {
    const records = (owners as unknown as { records: Map<unknown, unknown> }).records, realSet = records.set.bind(records);
    Object.defineProperty(records, 'set', { configurable: true, value: (key: unknown, value: unknown) => {
      if (key === fresh && ++registrations === 1) throw primary;
      return realSet(key, value);
    } });
    try { owners.ownAll([fresh, fresh, later]); }
    catch (error) {
      expect(() => owners.own(fresh)).toThrow('already released');
      throw error;
    }
  }); } catch (error) { caught = error; }
  expect(caught).toBe(primary); expect(registrations).toBe(1);
  expect(fresh.delete).toHaveBeenCalledTimes(1); expect(later.delete).toHaveBeenCalledTimes(1);
});
