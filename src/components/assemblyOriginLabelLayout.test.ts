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
