import { describe, it, expect } from 'vitest'
import {
  cardImageUrl,
  setHref,
  cardsSearchHref,
  completionPct,
  formatUsd,
  massEntryLine,
  MASSENTRY_URL,
} from './cards.js'

describe('cards helpers', () => {
  it('builds a same-origin card image url with size + encoded id', () => {
    expect(cardImageUrl('base1-4')).toBe('/api/cards/image?id=base1-4&size=small')
    expect(cardImageUrl('base1-4', 'large')).toBe('/api/cards/image?id=base1-4&size=large')
    // A promo id with characters that need encoding stays safe.
    expect(cardImageUrl('swshp-SWSH001')).toContain('id=swshp-SWSH001')
  })

  it('builds set + search hrefs', () => {
    expect(setHref('swsh1')).toBe('/sets/swsh1')
    expect(cardsSearchHref('')).toBe('/search')
    expect(cardsSearchHref('pikachu')).toBe('/search?q=pikachu')
    expect(cardsSearchHref('a b')).toBe('/search?q=a%20b')
    // owned scope, with and without a query
    expect(cardsSearchHref('', { owned: true })).toBe('/search?owned=1')
    expect(cardsSearchHref('pikachu', { owned: true })).toBe('/search?q=pikachu&owned=1')
    // sort rides along, but the default ('name') is left off the URL
    expect(cardsSearchHref('', { owned: true, sort: 'name' })).toBe('/search?owned=1')
    expect(cardsSearchHref('', { owned: true, sort: 'value' })).toBe('/search?owned=1&sort=value')
    expect(cardsSearchHref('', { sort: 'recent' })).toBe('/search?sort=recent')
  })

  it('computes completion percentage, guarding a zero denominator', () => {
    expect(completionPct(0, 0)).toBe(0)
    expect(completionPct(1, 4)).toBe(25)
    expect(completionPct(3, 3)).toBe(100)
  })

  it('points the buy-helper at TCGplayer Mass Entry', () => {
    expect(MASSENTRY_URL).toBe('https://www.tcgplayer.com/massentry')
  })

  it('builds a name-only TCGplayer mass-entry line: "<qty> <name>"', () => {
    expect(massEntryLine('Dragonite', 'FO', '4')).toBe('1 Dragonite')
    expect(massEntryLine('Mew', 'PR', 'SM01', 3)).toBe('3 Mew')
    expect(massEntryLine('Pikachu', null, '58')).toBe('1 Pikachu')
    expect(massEntryLine('  Snorlax  ', ' JU ', ' 11 ')).toBe('1 Snorlax')
  })

  it('formats USD, returning null when there is nothing to show', () => {
    expect(formatUsd(null)).toBe(null)
    expect(formatUsd(undefined)).toBe(null)
    expect(formatUsd(0)).toBe('$0.00')
    expect(formatUsd(1234.5)).toBe('$1,234.50')
  })
})
