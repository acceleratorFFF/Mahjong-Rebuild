import { type TileKind, type Meld, type Win } from './types.js';
import { TILE_KINDS, is258 } from './tiles.js';

// Search real tiles and wildcard assignments together. Sequences may begin before
// the first remaining real tile (e.g. wild + 8 + 9), so greedy left-to-right fails.
function shape(counts: number[], wild: number, groups: number, eye: boolean, allowed: (i: number) => boolean, eyes258: boolean, triplets: boolean, memo = new Map<string, boolean>()): boolean {
  if (counts.reduce((a, b) => a + b, 0) + wild !== groups * 3 + (eye ? 2 : 0)) return false;
  const key = `${counts.join(',')}|${wild}|${groups}|${eye}`;
  if (memo.has(key)) return memo.get(key)!;
  const first = counts.findIndex(n => n > 0);
  if (first < 0) return wild === groups * 3 + (eye ? 2 : 0);
  if (!allowed(first)) return false;
  const consume = (indices: number[], nextGroups: number, nextEye: boolean): boolean => {
    const next = counts.slice(); let needed = 0;
    for (const i of indices) { if (!allowed(i)) return false; if (next[i]! > 0) next[i]!--; else needed++; }
    return needed <= wild && shape(next, wild - needed, nextGroups, nextEye, allowed, eyes258, triplets, memo);
  };
  let result = false;
  if (eye) {
    // Try every natural or all-wild eye, not only the first tile.
    for (let i = 0; i < 34 && !result; i++) if (allowed(i) && (!eyes258 || is258(TILE_KINDS[i]!))) result = consume([i, i], groups, false);
  }
  if (!result && groups > 0) {
    result = consume([first, first, first], groups - 1, eye);
    if (!triplets && first < 27) for (let start = Math.max(Math.floor(first / 9) * 9, first - 2); start <= first && !result; start++) {
      if (start % 9 <= 6) result = consume([start, start + 1, start + 2], groups - 1, eye);
    }
  }
  memo.set(key, result); return result;
}
export function evaluateWin(hand: readonly TileKind[], melds: readonly Meld[], laizi: TileKind): Win | null {
  if (melds.length > 4 || hand.length !== 14 - 3 * melds.length) return null;
  const opened = melds.some(m => !m.concealed);
  const publicKinds = melds.flatMap(m => m.tiles.map(t => t.kind));
  const patterns: { pattern: Win['pattern']; allowed: (i: number) => boolean; triplets: boolean; eyes: boolean; compatible: boolean }[] = [
    { pattern: 'all-258', allowed: (i: number) => is258(TILE_KINDS[i]!), triplets: true, eyes: false, compatible: melds.every(m => m.type !== 'chi') },
    { pattern: 'all-triplets', allowed: () => true, triplets: true, eyes: false, compatible: melds.every(m => m.type !== 'chi') },
    ...[0, 1, 2].map(suit => ({ pattern: 'pure-suit' as const, allowed: (i: number) => i >= suit * 9 && i < suit * 9 + 9, triplets: false, eyes: false, compatible: true })),
    { pattern: 'small', allowed: () => true, triplets: false, eyes: true, compatible: opened },
  ];
  for (const hard of [true, false]) {
    const counts = Array<number>(34).fill(0); let wild = 0;
    for (const kind of hand) { const i = TILE_KINDS.indexOf(kind); if (i < 0) return null; if (!hard && kind === laizi) wild++; else counts[i]!++; }
    if (!hard && wild === 0) continue;
    for (const p of patterns) {
      if (!p.compatible || publicKinds.some(k => !p.allowed(TILE_KINDS.indexOf(k)))) continue;
      if (shape(counts, wild, 4 - melds.length, true, p.allowed, p.eyes, p.triplets)) return { hard, pattern: p.pattern };
    }
  }
  return null;
}
