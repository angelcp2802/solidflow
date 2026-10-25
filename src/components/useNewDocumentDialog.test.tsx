import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NewDocumentDialog, newDocumentChoice, requestNewDocument } from './useNewDocumentDialog'

describe('new document replacement boundaries', () => {
  it('keeps one pending owner, cancels on disposal and permits a later request', async () => {
    const choice = newDocumentChoice(), first = choice.choose()
    expect(choice.pending).toBe(true)
    expect(await choice.choose()).toBeNull()
    choice.finish(null)
    expect(await first).toBeNull()
    expect(choice.pending).toBe(false)
    const next = choice.choose(); choice.finish('assembly'); choice.finish('part')
    expect(await next).toBe('assembly')
  })
  it.each(['part', 'assembly'] as const)('creates %s only after choice and confirmed current source', async kind => {
    const choice = newDocumentChoice(), confirm = vi.fn(async () => true), create = vi.fn()
    const result = requestNewDocument({ choose: () => choice.choose(), current: () => true, confirm, create })
    expect(confirm).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled()
    choice.finish(kind); expect(await result).toBe(true)
    expect(confirm).toHaveBeenCalledOnce(); expect(create).toHaveBeenCalledExactlyOnceWith(kind)
  })
  it('cancelled choice neither asks for discard nor commits', async () => {
    const confirm = vi.fn(), create = vi.fn()
    expect(await requestNewDocument({choose: async () => null, current: () => true, confirm, create})).toBe(false)
    expect(confirm).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled()
  })
  it('rejects a replaced document/session before showing discard', async () => {
    const choice = newDocumentChoice(), confirm = vi.fn(), create = vi.fn(); let current = true
    const result = requestNewDocument({choose: () => choice.choose(), current: () => current, confirm, create})
    current = false; choice.finish('part')
    expect(await result).toBe(false); expect(confirm).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled()
  })
  it.each([false, true])('does not commit after rejected discard or changed source (answer %s)', async allowed => {
    let current = true, answer!: (value: boolean) => void
    const create = vi.fn(), confirm = vi.fn(() => new Promise<boolean>(resolve => {answer = resolve}))
    const result = requestNewDocument({choose: async () => 'assembly', current: () => current, confirm, create})
    await Promise.resolve(); expect(confirm).toHaveBeenCalledOnce()
    if (allowed) current = false
    answer(allowed); expect(await result).toBe(false); expect(create).not.toHaveBeenCalled()
  })
  it('exposes one labelled modal with native choice and cancel buttons', () => {
    const html = renderToStaticMarkup(<NewDocumentDialog onChoose={() => {}} />)
    expect(html).toContain('role="dialog" aria-modal="true" aria-labelledby="new-document-title"')
    expect(html).toContain('<h2 id="new-document-title">Nuevo documento</h2>')
    expect(html).toContain('data-new-document-kind="part"')
    expect(html).toContain('data-new-document-kind="assembly"')
    expect(html).toContain('<strong>Pieza</strong>'); expect(html).toContain('<strong>Ensamblaje</strong>')
    expect(html).toContain('>Cancelar</button>')
    expect(html.match(/<button /g)).toHaveLength(3)
  })
})
