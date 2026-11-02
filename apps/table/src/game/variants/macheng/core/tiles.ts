import { type TileKind, type Tile, type Specials, requireRule } from './types.js';
export const TILE_KINDS: readonly TileKind[] = Object.freeze([
  ...(['wan', 'tong', 'tiao'] as const).flatMap(suit => Array.from({ length: 9 }, (_, i) => `${suit}-${i + 1}` as TileKind)),
  'east', 'south', 'west', 'north', 'red', 'green', 'white',
]);
export function createDeck(): Tile[] { return TILE_KINDS.flatMap(kind => Array.from({ length: 4 }, (_, i) => ({ id: `${kind}:${i}`, kind }))); }
export function validateDeck(deck: readonly Tile[]) {
  const canonical = new Map(createDeck().map(tile => [tile.id, tile.kind]));
  requireRule(deck.length === 136 && new Set(deck.map(t => t.id)).size === 136 && deck.every(t => canonical.get(t.id) === t.kind), 'INVALID_DECK');
}
export function shuffle(deck: readonly Tile[], random: () => number): Tile[] {
  const result = deck.map(t => ({ ...t }));
  for (let i = result.length - 1; i > 0; i--) {
    const r = random(); requireRule(Number.isFinite(r) && r >= 0 && r < 1, 'INVALID_RANDOM');
    const j = Math.floor(r * (i + 1)); [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
export function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => { value += 0x6D2B79F5; let t = Math.imul(value ^ value >>> 15, 1 | value); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function nextKind(pizi: TileKind): TileKind {
  const i = TILE_KINDS.indexOf(pizi); requireRule(i >= 0 && pizi !== 'red', 'INVALID_INDICATOR');
  if (i < 27) return TILE_KINDS[Math.floor(i / 9) * 9 + (i + 1) % 9]!;
  const honors: TileKind[] = ['east', 'south', 'west', 'north', 'green', 'white'];
  return honors[(honors.indexOf(pizi) + 1) % honors.length]!;
}
export function isSpecial(kind: TileKind, specials: Specials) { return kind === 'red' || kind === specials.pizi || kind === specials.laizi; }
export function is258(kind: TileKind) { return /^(wan|tong|tiao)-(2|5|8)$/.test(kind); }
export function isSequence(kinds: readonly TileKind[]) {
  const indexes = kinds.map(k => TILE_KINDS.indexOf(k)).sort((a, b) => a - b);
  return indexes.length === 3 && indexes[0]! >= 0 && indexes[2]! < 27 && Math.floor(indexes[0]! / 9) === Math.floor(indexes[2]! / 9) && indexes[1] === indexes[0]! + 1 && indexes[2] === indexes[0]! + 2;
}
