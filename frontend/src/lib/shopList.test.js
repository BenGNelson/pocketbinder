import { describe, it, expect, beforeEach, vi } from 'vitest'
import { shopAdd, shopRemove, shopToggle, shopClear } from './shopList.js'

// A tiny in-memory localStorage so the browser-only store is testable under the
// node vitest env. Reading the persisted JSON back is how we assert on state.
const store = new Map()
const localStorageMock = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
const read = () => JSON.parse(localStorageMock.getItem('pb-shop-list') || '{}')

const card = (id, name) => ({ id, name, number: id.split('-')[1], setid: id.split('-')[0] })

describe('shopList store', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', localStorageMock)
    store.clear()
    shopClear() // reset the module-level cache between tests
    store.clear()
  })

  it('adds a card, keeps only what a line/row needs, and dedupes', () => {
    shopAdd(card('base1-4', 'Charizard'))
    expect(read()).toEqual({ 'base1-4': { id: 'base1-4', name: 'Charizard', number: '4', setid: 'base1' } })
    shopAdd(card('base1-4', 'Charizard')) // no-op on a card already in the list
    expect(Object.keys(read())).toHaveLength(1)
  })

  it('toggles a card in and back out', () => {
    shopToggle(card('base1-2', 'Blastoise'))
    expect(read()['base1-2']).toBeTruthy()
    shopToggle(card('base1-2', 'Blastoise'))
    expect(read()['base1-2']).toBeUndefined()
  })

  it('removes one card and clears them all', () => {
    shopAdd(card('base1-4', 'Charizard'))
    shopAdd(card('base1-58', 'Pikachu'))
    shopRemove('base1-4')
    expect(Object.keys(read())).toEqual(['base1-58'])
    shopClear()
    expect(read()).toEqual({})
  })

  it('ignores a card with no id', () => {
    shopAdd({ name: 'Nameless' })
    expect(read()).toEqual({})
  })
})
