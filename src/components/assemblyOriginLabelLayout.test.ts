import { expect, it } from 'vitest'
import { layoutAssemblyOriginLabels, type AssemblyOriginLabelAnchor } from './assemblyOriginLabelLayout'

// Original presentation fixtures; literal pixels, no geometry or native result oracle.
const anchor = (key: string, x = 200, y = 150): AssemblyOriginLabelAnchor => ({ key, binding: `binding:${key}`, label: `Datum ${key}`, x, y })
function checkBoxes(layout: ReturnType<typeof layoutAssemblyOriginLabels>, width: number, height: number) {
  for (const box of layout.labels) {
    expect(box.left).toBeGreaterThanOrEqual(4); expect(box.top).toBeGreaterThanOrEqual(4)
    expect(box.left + box.width).toBeLessThanOrEqual(width - 4)
    expect(box.top + box.height).toBeLessThanOrEqual(height - 4)
    expect(box.height).toBe(22)
  }
  for (let a = 0; a < layout.labels.length; a++) for (let b = a + 1; b < layout.labels.length; b++) {
    const first = layout.labels[a], second = layout.labels[b]
    // Independent separation predicate, including the promised four-pixel gap.
    expect(first.left + first.width + 4 <= second.left || second.left + second.width + 4 <= first.left
      || first.top + first.height + 4 <= second.top || second.top + second.height + 4 <= first.top).toBe(true)
  }
}

it('separates coincident root/component references without changing witnesses or identity', () => {
  const entries = [anchor('root'), anchor('component')]
  const result = layoutAssemblyOriginLabels(entries, { width: 500, height: 300 })
  expect(result.overflow).toEqual([]); expect(result.labels).toHaveLength(2)
  expect(result.labels.map(({ key, binding, label, x, y }) => ({ key, binding, label, x, y }))).toEqual([entries[1], entries[0]])
  expect(result.labels.map(({ left, top }) => [left, top])).toEqual([[115, 128], [115, 102]])
  checkBoxes(result, 500, 300)
})

it('retains twelve coincident identities with non-overlapping boxes in a compact viewport', () => {
  const entries = Array.from({ length: 12 }, (_, i) => anchor(String(i), 180, 100))
  const result = layoutAssemblyOriginLabels(entries, { width: 360, height: 180 })
  expect(result.overflow).toEqual([]); expect(result.labels).toHaveLength(12)
  checkBoxes(result, 360, 180)
  expect(layoutAssemblyOriginLabels([...entries].reverse(), { width: 360, height: 180 })).toEqual(result)
})

it('keeps full fixed rectangles inside all edges without moving their original anchors', () => {
  const entries = [anchor('a', 0, 0), anchor('b', 400, 0), anchor('c', 0, 200), anchor('d', 400, 200)]
  const result = layoutAssemblyOriginLabels(entries, { width: 400, height: 200 })
  checkBoxes(result, 400, 200)
  expect(result.labels.map(({ x, y }) => [x, y])).toEqual([[0, 0], [400, 0], [0, 200], [400, 200]])
})

it('caps a narrow box to the viewport and leaves long names available in full', () => {
  const entry = { ...anchor('a', 50, 30), label: 'A long original owner label '.repeat(12) }
  const result = layoutAssemblyOriginLabels([entry], { width: 100, height: 60 })
  expect(result.labels[0].width).toBe(92); expect(result.labels[0].label).toBe(entry.label)
  checkBoxes(result, 100, 60)
})

it('uses one explicit list with every identity when boxes cannot fit, including tiny viewports', () => {
  const entries = Array.from({ length: 12 }, (_, i) => anchor(String(i), 5, 5))
  for (const size of [{ width: 180, height: 100 }, { width: 10, height: 10 }]) {
    const result = layoutAssemblyOriginLabels(entries, size)
    expect(result.labels).toEqual([]); expect(result.overflow).toHaveLength(12)
    expect(new Set(result.overflow.map(row => row.key))).toEqual(new Set(entries.map(row => row.key)))
    expect(result.overflow.every(row => entries.includes(row))).toBe(true)
  }
})

it('bounds dense layout work and retains inputs beyond the geometry display limit in the list', () => {
  const entries = Array.from({ length: 97 }, (_, i) => anchor(String(i)))
  const result = layoutAssemblyOriginLabels(entries, { width: 2000, height: 2000 })
  expect(result.labels).toEqual([]); expect(result.overflow).toHaveLength(97)
})

it('marks invalid sizes, witnesses and ambiguous keys unusable without inventing finite positions', () => {
  const a = anchor('a', 10, 10)
  for (const size of [{ width: 0, height: 100 }, { width: NaN, height: 100 }, { width: 100, height: Infinity }]) {
    const result = layoutAssemblyOriginLabels([a], size)
    expect(result.usable).toBe(false); expect(result.labels).toEqual([]); expect(result.overflow).toEqual([a])
  }
  for (const entries of [[{ ...a, x: NaN }], [{ ...a, y: -1 }], [a, { ...a }]]) {
    const result = layoutAssemblyOriginLabels(entries, { width: 400, height: 200 })
    expect(result.usable).toBe(false); expect(result.labels).toEqual([]); expect(result.overflow).toHaveLength(entries.length)
  }
})


it('reserves the toolbar band without changing a top-center witness or default placement', () => {
  const entry = anchor('top', 200, 12), size = { width: 400, height: 200 }
  const original = layoutAssemblyOriginLabels([entry], size)
  expect(original.labels[0]).toMatchObject({ left: 115, top: 4, width: 170, height: 22 })
  // Literal toolbar rectangle x=140..260/y=9..41: the old box crosses it.
  expect(original.labels[0].left < 260 && original.labels[0].left + 170 > 140
    && original.labels[0].top < 41 && original.labels[0].top + 22 > 9).toBe(true)
  const reserved = layoutAssemblyOriginLabels([entry], size, { topInset: 44 })
  expect(reserved.labels[0]).toEqual({ ...entry, left: 115, top: 48, width: 170, height: 22 })
  expect(reserved.overflow).toEqual([]); expect(reserved.usable).toBe(true)
  expect(layoutAssemblyOriginLabels([entry], size, { topInset: 0 })).toEqual(original)
})

it('packs dense labels below the reserved band with stable identities and separated boxes', () => {
  const entries = Array.from({ length: 10 }, (_, i) => anchor(String(i), 180, 12))
  const size = { width: 360, height: 180 }, result = layoutAssemblyOriginLabels(entries, size, { topInset: 44 })
  expect(result.labels).toHaveLength(10); expect(result.overflow).toEqual([])
  checkBoxes(result, size.width, size.height)
  expect(result.labels.every(row => row.top >= 48)).toBe(true)
  expect(result.labels.map(({ key, binding, label, x, y }) => ({ key, binding, label, x, y }))).toEqual(entries)
  expect(layoutAssemblyOriginLabels([...entries].reverse(), size, { topInset: 44 })).toEqual(result)
})

it('uses the complete overflow list when the toolbar reservation removes packing capacity', () => {
  const entries = Array.from({ length: 12 }, (_, i) => anchor(String(i), 180, 12))
  expect(layoutAssemblyOriginLabels(entries, { width: 360, height: 180 }).labels).toHaveLength(12)
  const result = layoutAssemblyOriginLabels(entries, { width: 360, height: 180 }, { topInset: 44 })
  expect(result.labels).toEqual([]); expect(result.overflow).toHaveLength(12)
  expect(new Set(result.overflow.map(row => row.key))).toEqual(new Set(entries.map(row => row.key)))
  expect(result.overflow.every(row => entries.includes(row))).toBe(true)
  expect(result.usable).toBe(true)
})

it('rejects invalid presentation insets without granting usable label targets', () => {
  const entry = anchor('one', 20, 20)
  for (const topInset of [-1, NaN, Infinity]) {
    const result = layoutAssemblyOriginLabels([entry], { width: 400, height: 200 }, { topInset })
    expect(result.usable).toBe(false); expect(result.labels).toEqual([]); expect(result.overflow).toEqual([entry])
  }
})

it('confines narrow labels below the toolbar and falls back at the exact vertical capacity boundary', () => {
  const entries = [anchor('a', 50, 0), anchor('b', 50, 0)]
  const result = layoutAssemblyOriginLabels(entries, { width: 100, height: 100 }, { topInset: 44 })
  expect(result.labels.map(({ left, top, width, height }) => [left, top, width, height])).toEqual([[4, 48, 92, 22], [4, 74, 92, 22]])
  expect(result.labels.map(({ x, y }) => [x, y])).toEqual([[50, 0], [50, 0]])
  checkBoxes(result, 100, 100)
  expect(result.overflow).toEqual([])
  const confined = layoutAssemblyOriginLabels(entries, { width: 100, height: 99 }, { topInset: 44 })
  expect(confined.labels).toEqual([]); expect(confined.overflow).toEqual(entries)
  expect(confined.usable).toBe(true)
})
