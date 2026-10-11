import { describe, expect, it, vi } from 'vitest';
import { createDocument, serializeDocument } from './document';
import { decodeStepSource } from './stepSource';
import { MAX_STEP_BYTES } from './stepSource';
import { importStepPart, prepareStepDocument, type StepFile } from './stepImport';
import type { CadResult, Feature, ImportedSolidFeature } from '../cad/kernel.types';

// These are transaction/ownership tests. Geometry is validated by the separate
// real-reader CAD suite; this controlled response does not establish STEP support.
const solid = (): CadResult => ({
  vertices: [0, 0, 0], normals: [], triangles: [], edgeLines: [], edges: [],
  volume: 240, bounds: { min: [0, 0, 0], max: [10, 6, 4] }, warnings: [], featureErrors: [],
});
const file = (): StepFile => ({ name: 'part.step', data: new TextEncoder().encode('ISO-10303-21;\ncontrolled payload') });

function transaction() {
  let context = { document: createDocument('Existing part'), editing: null as Feature | null };
  const original = serializeDocument(context.document);
  const actions = {
    current: () => context,
    read: vi.fn(async (): Promise<StepFile | null> => file()),
    build: vi.fn(async (_features: Feature[]) => solid()),
    confirm: vi.fn(async () => true),
    commit: vi.fn(),
  };
  return { actions, original, get context() { return context; }, change: (next: typeof context) => { context = next; } };
}

describe('owned STEP import transaction', () => {
  it('owns exact bytes and only a basename before asynchronous construction', async () => {
    const input = file(), expected = [...input.data];
    input.name = 'folder/subfolder/Example.STP';
    const building = prepareStepDocument(input, async features => {
      input.data.fill(0);
      expect([...decodeStepSource((features[0] as ImportedSolidFeature).source)]).toEqual(expected);
      return solid();
    });
    const document = await building;
    expect(document.name).toBe('Example');
    expect(document.units).toBe('mm');
    expect(document.features).toHaveLength(1);
    expect(document.features[0].type).toBe('importedSolid');
    expect(serializeDocument(document)).not.toContain('subfolder');
  });

  it('validates the whole proposal before asking to replace or committing once', async () => {
    const t = transaction(), order: string[] = [];
    t.actions.build.mockImplementation(async () => { order.push('build'); return solid(); });
    t.actions.confirm.mockImplementation(async () => { order.push('confirm'); return true; });
    t.actions.commit.mockImplementation(() => { order.push('commit'); });
    expect(await importStepPart(t.actions)).toBe('imported');
    expect(order).toEqual(['build', 'confirm', 'commit']);
    expect(t.actions.commit).toHaveBeenCalledTimes(1);
    expect(serializeDocument(t.context.document)).toBe(t.original);
  });

  it('cancelled file selection performs no construction or replacement decision', async () => {
    const t = transaction(); t.actions.read.mockResolvedValue(null);
    expect(await importStepPart(t.actions)).toBe('cancelled');
    expect(t.actions.build).not.toHaveBeenCalled();
    expect(t.actions.confirm).not.toHaveBeenCalled();
    expect(t.actions.commit).not.toHaveBeenCalled();
  });

  it('a rejected replacement decision retains the current part', async () => {
    const t = transaction(); t.actions.confirm.mockResolvedValue(false);
    expect(await importStepPart(t.actions)).toBe('cancelled');
    expect(t.actions.commit).not.toHaveBeenCalled();
    expect(serializeDocument(t.context.document)).toBe(t.original);
  });

  it('reader failures are surfaced without asking to discard the current part', async () => {
    const t = transaction(); t.actions.build.mockRejectedValue(new Error('Unsupported units'));
    await expect(importStepPart(t.actions)).rejects.toThrow('Unsupported units');
    expect(t.actions.confirm).not.toHaveBeenCalled();
    expect(t.actions.commit).not.toHaveBeenCalled();
    expect(serializeDocument(t.context.document)).toBe(t.original);
  });

  it('a feature-error result cannot become the imported document', async () => {
    const t = transaction(); t.actions.build.mockResolvedValue({ ...solid(), featureErrors: [{ id: 'import', message: 'Open shell' }] });
    await expect(importStepPart(t.actions)).rejects.toThrow('Open shell');
    expect(t.actions.confirm).not.toHaveBeenCalled();
    expect(t.actions.commit).not.toHaveBeenCalled();
  });

  it('a result with no rendered solid cannot replace the part', async () => {
    const t = transaction(); t.actions.build.mockResolvedValue({ ...solid(), vertices: [] });
    await expect(importStepPart(t.actions)).rejects.toThrow('sólido cerrado válido');
    expect(t.actions.confirm).not.toHaveBeenCalled();
    expect(t.actions.commit).not.toHaveBeenCalled();
  });

  it.each([0, NaN, Infinity])('rejects an empty or non-finite volume %s', async volume => {
    const t = transaction(); t.actions.build.mockResolvedValue({ ...solid(), volume });
    await expect(importStepPart(t.actions)).rejects.toThrow('sólido cerrado válido');
    expect(t.actions.commit).not.toHaveBeenCalled();
  });

  it('does not build a selection returned to a newer document', async () => {
    const t = transaction();
    t.actions.read.mockImplementation(async () => { t.change({ document: createDocument('Newer'), editing: null }); return file(); });
    expect(await importStepPart(t.actions)).toBe('stale');
    expect(t.actions.build).not.toHaveBeenCalled();
    expect(t.actions.commit).not.toHaveBeenCalled();
  });

  it('ignores a valid build returned after a document change', async () => {
    const t = transaction();
    t.actions.build.mockImplementation(async () => { t.change({ document: createDocument('Newer'), editing: null }); return solid(); });
    expect(await importStepPart(t.actions)).toBe('stale');
    expect(t.actions.confirm).not.toHaveBeenCalled();
    expect(t.actions.commit).not.toHaveBeenCalled();
  });

  it('rechecks the edit context after a replacement decision', async () => {
    const t = transaction();
    t.actions.confirm.mockImplementation(async () => {
      t.change({ ...t.context, editing: { id: 'draft', name: 'New draft', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [0, 0], radius: 1 } } });
      return true;
    });
    expect(await importStepPart(t.actions)).toBe('stale');
    expect(t.actions.commit).not.toHaveBeenCalled();
  });

  it('an active edit cannot be discarded by starting an import', async () => {
    const t = transaction();
    t.change({ ...t.context, editing: { id: 'draft', name: 'Draft', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [0, 0], radius: 1 } } });
    await expect(importStepPart(t.actions)).rejects.toThrow('Acepta o cancela');
    expect(t.actions.read).not.toHaveBeenCalled();
  });

  it('rejects non-STEP extensions before invoking the worker', async () => {
    const build = vi.fn(async () => solid());
    await expect(prepareStepDocument({ ...file(), name: 'model.exe' }, build)).rejects.toThrow('.step o .stp');
    expect(build).not.toHaveBeenCalled();
  });

  it.each([new Uint8Array(), new Uint8Array(MAX_STEP_BYTES + 1)])('rejects an invalid byte count before discarding anything', async data => {
    const t = transaction(); t.actions.read.mockResolvedValue({ name: 'part.step', data });
    await expect(importStepPart(t.actions)).rejects.toThrow('8 MiB');
    expect(t.actions.build).not.toHaveBeenCalled();
    expect(t.actions.confirm).not.toHaveBeenCalled();
    expect(t.actions.commit).not.toHaveBeenCalled();
    expect(serializeDocument(t.context.document)).toBe(t.original);
  });
});
