/** Presentation only: x/y remain the projected geometric witness, never a pick target. */
export interface AssemblyOriginLabelAnchor { key: string; binding: string; label: string; x: number; y: number }
export interface AssemblyOriginLabelPlacement extends AssemblyOriginLabelAnchor { left: number; top: number; width: number; height: number }
export interface AssemblyOriginLabelLayout {
  labels: AssemblyOriginLabelPlacement[]
  overflow: AssemblyOriginLabelAnchor[]
  width: number
  height: number
  usable: boolean
}
const margin = 4, gap = 4, buttonWidth = 170, buttonHeight = 22, limit = 96
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const intersects = (a: AssemblyOriginLabelPlacement, b: AssemblyOriginLabelPlacement) =>
  a.left < b.left + b.width + gap && a.left + a.width + gap > b.left && a.top < b.top + b.height + gap && a.top + a.height + gap > b.top

/** Fixed CSS-pixel boxes, stable key order and a bounded search. If packing fails,
 * retain every label in an explicit scroll list instead of covering or dropping it. */
export function layoutAssemblyOriginLabels(anchors: readonly AssemblyOriginLabelAnchor[], size: { width: number; height: number }): AssemblyOriginLabelLayout {
  const ordered = [...anchors].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  const validSize = Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0
  const width = validSize ? Math.min(buttonWidth, Math.max(1, size.width - margin * 2)) : buttonWidth
  const usable = validSize && anchors.every(a => Number.isFinite(a.x) && Number.isFinite(a.y) && a.x >= 0 && a.y >= 0 && a.x <= size.width && a.y <= size.height) && new Set(anchors.map(a => a.key)).size === anchors.length
  const result: AssemblyOriginLabelLayout = { labels: [], overflow: [], width, height: buttonHeight, usable }
  const overflow = () => ({ ...result, labels: [], overflow: ordered })
  if (!anchors.length) return result
  if (!usable || anchors.length > limit || size.width < margin * 2 + 1 || size.height < margin * 2 + buttonHeight) return overflow()
  const columns = Math.min(limit, Math.floor((size.width - margin * 2 + gap) / (width + gap)))
  const rows = Math.min(limit, Math.floor((size.height - margin * 2 + gap) / (buttonHeight + gap)))
  if (columns * rows < anchors.length) return overflow()
  const box = (a: AssemblyOriginLabelAnchor, left: number, top: number): AssemblyOriginLabelPlacement => ({ ...a, left, top, width, height: buttonHeight })
  // Prefer the original anchor; separate colliding references vertically first.
  for (const anchor of ordered) {
    const left = clamp(anchor.x - width / 2, margin, size.width - margin - width)
    const top = clamp(anchor.y - buttonHeight, margin, size.height - margin - buttonHeight)
    let placed = false
    for (let offset = 0; offset < limit && !placed; offset++) {
      for (const direction of offset ? [-1, 1] : [1]) {
        const candidate = box(anchor, left, clamp(top + direction * offset * (buttonHeight + gap), margin, size.height - margin - buttonHeight))
        if (!result.labels.some(other => intersects(candidate, other))) { result.labels.push(candidate); placed = true; break }
      }
    }
    if (!placed) break
  }
  if (result.labels.length === anchors.length) return result
  // Fragmented preferred positions can waste space. A disjoint grid guarantees
  // capacity, with each key taking the free cell nearest its unchanged anchor.
  result.labels = []
  const occupied = new Set<number>()
  for (const anchor of ordered) {
    let best = -1, distance = Infinity
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const index = row * columns + column
      if (occupied.has(index)) continue
      const dx = margin + column * (width + gap) + width / 2 - anchor.x
      const dy = margin + row * (buttonHeight + gap) + buttonHeight - anchor.y
      const squared = dx * dx + dy * dy
      if (squared < distance) { best = index; distance = squared }
    }
    if (best < 0) return overflow()
    occupied.add(best)
    result.labels.push(box(anchor, margin + best % columns * (width + gap), margin + Math.floor(best / columns) * (buttonHeight + gap)))
  }
  return result
}
