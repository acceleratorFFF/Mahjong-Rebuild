import { describe, it, expect } from 'vitest';
import { createDeck, shuffle, seededRandom, nextKind, evaluateWin, calculateScore, createGame, legalActions, applyCommand, expireGame, replay, playerView, assertConservation, SEATS, type TileKind, type Game, type Seat, type Action, type Meld, type Command } from './index';
const kinds = (s: string) => s.split(' ') as TileKind[];
const repeat = (kind: TileKind, n: number) => Array<TileKind>(n).fill(kind);
const meld = (s: string, type: Meld['type'] = 'chi', concealed = false): Meld => ({ type, concealed, from: concealed ? null : 0, tiles: kinds(s).map((kind, i) => ({ kind, id: `test:${i}` })) });
const newGame = (seed = 42) => createGame({ id: `game-${seed}`, dealer: 0 }, { random: seededRandom(seed), now: () => 1000 });
function command(g: Game, actor: Seat, action: Action, id = `c${g.version}`): Command {
  return { gameId: g.id, commandId: id, actor, expectedVersion: g.pending?.version ?? g.version, ...(g.pending ? { windowId: g.pending.id } : {}), action };
}
function act(g: Game, actor: Seat, action: Action): Game { return applyCommand(g, command(g, actor, action), g.updatedAt + 1); }
function discard(g: Game, kind: TileKind) { return act(g, g.turn, { type: 'discard', tileId: g.players[g.turn].hand.find(t => t.kind === kind)!.id }); }
function passes(g: Game): Game {
  const eligible = g.pending?.eligible.slice() ?? [];
  for (const seat of eligible) if (g.phase === 'response' && !g.pending!.responses[seat]) g = act(g, seat, { type: 'pass' });
  return g;
}
// Trusted fixture builder allocates every real tile once, then fills unspecified
// hands; it cannot create a fifth copy or duplicate an entity ID.
function rig(hands: Partial<Record<Seat, TileKind[]>>, melds: Partial<Record<Seat, Meld[]>> = {}, tail: TileKind[] = []): Game {
  const g = newGame(); const pool = createDeck();
  const take = (kind: TileKind) => { const i = pool.findIndex(t => t.kind === kind); if (i < 0) throw new Error(`fifth ${kind}`); return pool.splice(i, 1)[0]!; };
  g.indicators = [take('east')]; g.specials = { pizi: 'east', laizi: 'south' };
  for (const seat of SEATS) { g.players[seat] = { hand: [], melds: [], specialKongs: [], discards: [] }; }
  for (const seat of SEATS) {
    g.players[seat].melds = (melds[seat] ?? []).map(m => ({ ...m, tiles: m.tiles.map(t => take(t.kind)) }));
    g.players[seat].hand = (hands[seat] ?? []).map(take);
  }
  const reserved = tail.map(take);
  for (const seat of SEATS) while (g.players[seat].hand.length < (seat === 0 ? 14 : 13) - g.players[seat].melds.length * 3) g.players[seat].hand.push(pool.pop()!);
  g.wall = [...pool, ...reserved]; g.lastDraw = { seat: 0, tileId: g.players[0].hand.at(-1)!.id, afterKong: false };
  assertConservation(g); return g;
}
const waiting1 = [...repeat('wan-1', 3), ...repeat('wan-2', 3), ...repeat('tong-3', 3), ...repeat('tiao-4', 3), 'tong-5'] as TileKind[];
const waiting2 = [...repeat('wan-4', 3), ...repeat('wan-5', 3), ...repeat('tong-6', 3), ...repeat('tiao-7', 3), 'tong-5'] as TileKind[];

describe('tiles and setup', () => {
  it('deals 14/13/13/13 and preserves all 136 entities including indicators', () => { const g = newGame(); expect(g.players.map(p => p.hand.length)).toEqual([14, 13, 13, 13]); assertConservation(g); expect(newGame()).toEqual(g); });
  it('shuffles deterministically without mutating input; rejects bad entropy', () => { const deck = createDeck(); expect(shuffle(deck, seededRandom(10))).toEqual(shuffle(deck, seededRandom(10))); expect(deck).toEqual(createDeck()); expect(() => shuffle(deck, () => 1)).toThrow('INVALID_RANDOM'); });
  it('rejects duplicate or forged initial tile IDs', () => { const deck = createDeck(); deck[1] = deck[0]!; expect(() => createGame({ id: 'bad', deck }, { random: () => 0, now: () => 0 })).toThrow('INVALID_DECK'); });
  it('skips flipped reds and keeps them in the public indicator zone', () => { const deck = createDeck().filter(t => t.kind !== 'red'); deck.push(...createDeck().filter(t => t.kind === 'red')); const g = createGame({ id: 'reds', dealer: 0, deck }, { random: () => 0, now: () => 0 }); expect(g.indicators.filter(t => t.kind === 'red')).toHaveLength(4); expect(g.indicators).toHaveLength(5); assertConservation(g); });
  it('wraps numeric indicators and skips red in the honor cycle', () => { expect(nextKind('wan-9')).toBe('wan-1'); expect(nextKind('north')).toBe('green'); expect(nextKind('white')).toBe('east'); });
});

describe('winning shapes', () => {
  const open = [meld('wan-1 wan-2 wan-3')];
  const small = kinds('tong-1 tong-2 tong-3 tiao-4 tiao-5 tiao-6 wan-7 wan-8 wan-9 tong-2 tong-2');
  it('requires open small hand and 258 eyes', () => { expect(evaluateWin(small, open, 'south')).toEqual({ hard: true, pattern: 'small' }); expect(evaluateWin([...small, ...kinds('wan-1 wan-2 wan-3')], [], 'south')).toBeNull(); expect(evaluateWin(kinds('tong-1 tong-2 tong-3 tiao-4 tiao-5 tiao-6 wan-7 wan-8 wan-9 tong-1 tong-1'), open, 'south')).toBeNull(); });
  it('distinguishes hard native wildcard from soft substitution', () => { expect(evaluateWin(small, open, 'tong-3')?.hard).toBe(true); const soft = small.map(k => k === 'tong-3' ? 'south' : k); expect(evaluateWin(soft, open, 'south')).toEqual({ hard: false, pattern: 'small' }); });
  it('finds wildcard sequence starts before the first natural tile', () => { expect(evaluateWin(kinds('south wan-8 wan-9 tong-1 tong-2 tong-3 tiao-4 tiao-5 tiao-6 tong-2 tong-2'), open, 'south')?.hard).toBe(false); });
  it('allows pure-suit without open or 258 eyes, but excludes mixed suits', () => { expect(evaluateWin(kinds('wan-1 wan-2 wan-3 wan-2 wan-3 wan-4 wan-4 wan-5 wan-6 wan-7 wan-8 wan-9 wan-1 wan-1'), [], 'south')).toEqual({ hard: true, pattern: 'pure-suit' }); });
  it('allows all triplets and rejects seven pairs as a separate win type', () => { expect(evaluateWin([...waiting1, 'tong-5'], [], 'south')).toEqual({ hard: true, pattern: 'all-triplets' }); expect(evaluateWin(kinds('wan-1 wan-1 wan-4 wan-4 wan-7 wan-7 tong-2 tong-2 tong-5 tong-5 tiao-3 tiao-3 tiao-8 tiao-8'), [], 'south')).toBeNull(); });
  it('ordinary kong occupies one meld, not four concealed cards', () => { expect(evaluateWin(small, [meld('wan-1 wan-1 wan-1 wan-1', 'kong')], 'south')).toEqual({ hard: true, pattern: 'small' }); expect(evaluateWin([...small, 'wan-1'], open, 'south')).toBeNull(); });
});

describe('score contract', () => {
  it.each([
    [false, 'small', 0, null, 'none', 1, [3, -1, -1, -1]],
    [true, 'small', 1, null, 'none', 4, [12, -4, -4, -4]],
    [true, 'all-triplets', 2, 1, 'none', 32, [32, -32, 0, 0]],
    [true, 'small', 0, 1, 'rob-kong', 4, [4, -4, 0, 0]],
    [false, 'pure-suit', 4, null, 'after-kong', 32, [96, -32, -32, -32]],
  ] as const)('matches fixed payment sample %#', (hard, pattern, kongs, from, special, payment, deltas) => {
    const score = calculateScore({ hard, pattern }, kongs, 0, from, special);
    expect(score.payment).toBe(payment); expect(score.deltas).toEqual(deltas); expect(score.deltas.reduce((a, b) => a + b, 0)).toBe(0);
  });
  it('caps after multiplication and rejects invalid payers', () => { expect(calculateScore({ hard: false, pattern: 'pure-suit' }, 4, 0, null, 'after-kong').uncapped).toBe(128); expect(() => calculateScore({ hard: true, pattern: 'small' }, 0, 0, 0)).toThrow('INVALID_PAYER'); });
});

describe('commands and response competition', () => {
  it('rejects illegal, stale and wrong-game commands without changing input', () => { const g = newGame(); const before = JSON.stringify(g); const action = legalActions(g, 0)[0]!; expect(() => applyCommand(g, { ...command(g, 0, action), expectedVersion: 9 }, 1001)).toThrow('STALE_VERSION'); expect(() => act(g, 1, { type: 'discard', tileId: g.players[0].hand[0]!.id })).toThrow('ILLEGAL_ACTION'); expect(() => applyCommand(g, { ...command(g, 0, action), gameId: 'other' }, 1001)).toThrow('WRONG_GAME'); expect(JSON.stringify(g)).toBe(before); });
  it('deduplicates identical commands and rejects ID reuse', () => { const g = newGame(); const c = command(g, 0, legalActions(g, 0)[0]!); const next = applyCommand(g, c, 1001); expect(applyCommand(next, c, 999999)).toBe(next); expect(() => applyCommand(next, { ...c, action: { type: 'hu' } }, 1002)).toThrow('COMMAND_ID_REUSED'); });
  it('waits for all responses; nearest winner wins regardless of arrival order', () => {
    let g = rig({ 0: ['tong-5'], 1: waiting1, 2: waiting2 }); g = discard(g, 'tong-5'); const window = g.pending!;
    expect(window.eligible).toContain(1); expect(window.eligible).toContain(2);
    g = act(g, 2, { type: 'hu' }); expect(g.phase).toBe('response');
    expect(g.pending!.version).toBe(window.version); g = act(g, 1, { type: 'hu' }); g = passes(g);
    expect(g.result).toMatchObject({ type: 'win', winner: 1, from: 0, nextDealer: 1 }); assertConservation(g);
  });
  it('prioritizes peng over chi and consumes discarded entity only once', () => {
    let g = rig({ 0: ['wan-3'], 1: ['wan-1', 'wan-2'], 2: ['wan-3', 'wan-3'] }); g = discard(g, 'wan-3');
    const chi = legalActions(g, 1).find(a => a.type === 'chi')!; expect(chi).toBeDefined();
    g = act(g, 1, chi); g = act(g, 2, { type: 'peng' }); g = passes(g);
    expect(g.turn).toBe(2); expect(g.players[2].melds[0]?.type).toBe('peng'); expect(g.players[0].discards).toHaveLength(0); assertConservation(g);
  });
  it('only permits next-seat chi; chi does not draw and leaves correct hand size', () => {
    let g = rig({ 0: ['wan-3'], 1: ['wan-1', 'wan-2'], 2: ['wan-1', 'wan-2'] }); g = discard(g, 'wan-3'); const before = g.wall.length;
    expect(legalActions(g, 2).some(a => a.type === 'chi')).toBe(false);
    g = act(g, 1, legalActions(g, 1).find(a => a.type === 'chi')!); g = passes(g);
    expect(g.wall).toHaveLength(before); expect(g.players[1].hand).toHaveLength(11); expect(g.lastDraw).toBeNull(); assertConservation(g);
  });
  it('special discards are not claimable', () => { let g = rig({ 0: ['red'], 1: ['red', 'red'] }); g = discard(g, 'red'); expect(g.pending).toBeNull(); expect(g.turn).toBe(0); expect(g.players[0].specialKongs[0]!.kind).toBe('red'); expect(g.players[0].discards).toEqual([]); assertConservation(g); });
  it('response timeout preserves an already submitted win', () => { let g = rig({ 0: ['tong-5'], 1: waiting1, 2: waiting2 }); g = discard(g, 'tong-5'); g = act(g, 1, { type: 'hu' }); const deadline = g.deadline; g = expireGame(g, deadline); expect(g.result).toMatchObject({ type: 'win', winner: 1 }); assertConservation(g); });
});

describe('kongs and wall boundaries', () => {
  it('single special kong draws from tail, does not create meld or change structural count', () => { let g = rig({ 0: ['red'] }); const tail = g.wall.at(-1)!; g = act(g, 0, { type: 'special-kong', tileId: g.players[0].hand.find(t => t.kind === 'red')!.id }); expect(g.players[0].hand).toHaveLength(14); expect(g.players[0].melds).toHaveLength(0); expect(g.players[0].specialKongs).toHaveLength(1); expect(g.lastDraw).toEqual({ seat: 0, tileId: tail.id, afterKong: true }); assertConservation(g); });
  it('concealed kong draws a replacement and stays private to opponents', () => { let g = rig({ 0: repeat('wan-6', 4) }); g = act(g, 0, { type: 'concealed-kong', kind: 'wan-6' }); expect(g.players[0].hand).toHaveLength(11); expect(playerView(g, 1).players[0]!.melds[0]!.tiles).toHaveLength(0); expect(playerView(g, 0).players[0]!.melds[0]!.tiles).toHaveLength(4); assertConservation(g); });
  it('exposed kong takes three owned tiles and a tail replacement', () => { let g = rig({ 0: ['tong-7'], 1: repeat('tong-7', 3) }); g = discard(g, 'tong-7'); g = act(g, 1, { type: 'exposed-kong' }); g = passes(g); expect(g.players[1].melds[0]!.tiles).toHaveLength(4); expect(g.players[1].hand).toHaveLength(11); expect(g.lastDraw?.afterKong).toBe(true); assertConservation(g); });
  it('unopposed added kong upgrades the original peng exactly once', () => { let g = rig({ 0: ['tong-7'] }, { 0: [meld('tong-7 tong-7 tong-7', 'peng')] }); const action = legalActions(g, 0).find(a => a.type === 'add-kong')!; g = act(g, 0, action); g = passes(g); expect(g.players[0].melds[0]!.type).toBe('kong'); expect(g.players[0].melds).toHaveLength(1); expect(g.players[0].hand).toHaveLength(11); assertConservation(g); });
  it('robbed added kong keeps original peng and does not take a replacement', () => {
    const waiting = kinds('tong-5 tong-6 tiao-4 tiao-5 tiao-6 wan-7 wan-8 wan-9 tong-2 tong-2');
    let g = rig({ 0: ['tong-7'], 1: waiting }, { 0: [meld('tong-7 tong-7 tong-7', 'peng')], 1: [meld('wan-1 wan-2 wan-3')] });
    const before = g.wall.length;
    const action = legalActions(g, 0).find(a => a.type === 'add-kong')!; g = act(g, 0, action);
    expect(legalActions(g, 1).some(a => a.type === 'hu')).toBe(true);
    g = act(g, 1, { type: 'hu' }); g = passes(g);
    expect(g.result).toMatchObject({ type: 'win', method: 'rob-kong', winner: 1 }); expect(g.wall).toHaveLength(before); expect(g.players[0].melds[0]!.type).toBe('peng'); assertConservation(g);
  });
  it('empty wall forbids all kongs; last discard can still win', () => { let g = rig({ 0: ['tong-5'], 1: waiting1 }); g.players[3].discards.push(...g.wall); g.wall = []; expect(legalActions(g, 0).some(a => a.type.includes('kong'))).toBe(false); g = discard(g, 'tong-5'); expect(legalActions(g, 1).map(a => a.type)).toEqual(['pass', 'hu']); g = act(g, 1, { type: 'hu' }); g = passes(g); expect(g.result?.type).toBe('win'); assertConservation(g); });
  it('last unclaimed ordinary discard exhausts the wall with zero score', () => { let g = rig({ 0: ['green'] }); g.players[3].discards.push(...g.wall); g.wall = []; g = passes(discard(g, 'green')); expect(g.result).toMatchObject({ type: 'draw', deltas: [0, 0, 0, 0], nextDealer: 0 }); assertConservation(g); });
});

describe('replay and privacy', () => {
  it('does not expose other hands, wall, seed, history or response choices', () => { const g = newGame(); const view = playerView(g, 0); expect(view.players[1]!.hand).toHaveLength(0); expect(view.players[0]!.hand).toHaveLength(14); expect(view).not.toHaveProperty('wall'); expect(view).not.toHaveProperty('log'); view.players[0]!.hand.pop(); expect(g.players[0].hand).toHaveLength(14); });
  it('timeout rejects late commands and chooses the last drawn tile', () => { const g = newGame(); expect(expireGame(g, g.deadline - 1)).toBe(g); expect(() => applyCommand(g, command(g, 0, legalActions(g, 0)[0]!), g.deadline)).toThrow('DEADLINE_PASSED'); const next = expireGame(g, g.deadline); expect(next.players[0].discards.at(-1)?.id).toBe(g.lastDraw?.tileId); assertConservation(next); });
  it.each([1, 2, 3, 4, 5, 37, 99, 2026])('plays a complete deterministic round with invariants and replay, seed %i', seed => {
    const initial = newGame(seed); let g = initial; let steps = 0;
    while (g.phase !== 'ended' && steps++ < 500) {
      if (g.phase === 'response') g = expireGame(g, g.deadline);
      else { const actions = legalActions(g, g.turn); const win = actions.find(a => a.type === 'hu'); const kong = actions.find(a => a.type === 'special-kong' || a.type === 'concealed-kong'); g = win || kong ? act(g, g.turn, (win ?? kong)!) : expireGame(g, g.deadline); }
      assertConservation(g);
      for (const seat of SEATS) expect(g.players[seat].hand.length).toBe((g.phase === 'action' && g.turn === seat || g.phase === 'ended' && g.result?.type === 'win' && g.result.method === 'self' && g.result.winner === seat ? 14 : 13) - g.players[seat].melds.length * 3);
    }
    expect(g.phase).toBe('ended'); expect(steps).toBeLessThan(500); expect(replay(initial, g.log)).toEqual(g);
  });
});

describe('additional settlement and deadline boundaries', () => {
  it('settles a dealer self draw once with three payers', () => {
    let g = rig({ 0: [...waiting1, 'tong-5'] }); const initial = g; const c = command(g, 0, { type: 'hu' });
    g = applyCommand(g, c, 1001); expect(g.result).toMatchObject({ type: 'win', winner: 0, from: null, method: 'self', nextDealer: 0, deltas: [24, -8, -8, -8] });
    expect(applyCommand(g, c, 1002)).toBe(g); expect(() => act(g, 0, { type: 'hu' })).toThrow('GAME_ENDED'); assertConservation(g); expect(replay(initial, g.log)).toEqual(g);
  });
  it('applies kong-after-draw multiplier only to the replacement self draw', () => {
    let g = rig({ 0: [...waiting1, 'red'] });
    const i = g.wall.findIndex(t => t.kind === 'tong-5'); const tile = g.wall.splice(i, 1)[0]!; g.wall.push(tile);
    g = act(g, 0, { type: 'special-kong', tileId: g.players[0].hand.find(t => t.kind === 'red')!.id });
    g = act(g, 0, { type: 'hu' }); expect(g.result).toMatchObject({ type: 'win', score: { kongCount: 1, specialMultiplier: 2, payment: 32 } }); assertConservation(g);
  });
  it('can perform consecutive special replacements including the last wall tile', () => {
    let g = rig({ 0: ['red'] }, {}, ['east']); const j = g.wall.findIndex(t => t.kind === 'east'); const tile = g.wall.splice(j, 1)[0]!;
    g.players[3].discards.push(...g.wall.slice(0, -1)); g.wall = [g.wall.at(-1)!, tile];
    g = act(g, 0, { type: 'special-kong', tileId: g.players[0].hand.find(t => t.kind === 'red')!.id });
    g = act(g, 0, { type: 'special-kong', tileId: tile.id }); expect(g.wall).toHaveLength(0);
    expect(g.players[0].hand).toHaveLength(14); expect(g.players[0].specialKongs).toHaveLength(2); expect(legalActions(g, 0).some(a => a.type.includes('kong'))).toBe(false); assertConservation(g);
  });
  it('rejects re-voting in a live response window and stale window IDs', () => {
    let g = rig({ 0: ['tong-5'], 1: waiting1, 2: waiting2 }); g = discard(g, 'tong-5');
    const c = command(g, 1, { type: 'hu' }); expect(() => applyCommand(g, { ...c, windowId: 'old' }, g.updatedAt + 1)).toThrow('STALE_WINDOW');
    g = applyCommand(g, c, g.updatedAt + 1); expect(() => act(g, 1, { type: 'pass' })).toThrow('ILLEGAL_ACTION');
  });
  it('reserves host timeout command IDs against player collisions', () => {
    const g = newGame(); expect(() => applyCommand(g, command(g, 0, legalActions(g, 0)[0]!, 'timeout:1'), 1001)).toThrow('RESERVED_COMMAND_ID');
  });
  it('rejects backward clock without modifying the state', () => { const g = newGame(); expect(() => expireGame(g, 999)).toThrow('INVALID_TIME'); expect(() => act({ ...g, updatedAt: Infinity }, 0, legalActions(g, 0)[0]!)).toThrow('INVALID_TIME'); });
  it('recognizes all-258 as a big hand with one base multiplier', () => {
    expect(evaluateWin(kinds('wan-2 wan-2 wan-2 tong-5 tong-5 tong-5 tiao-8 tiao-8 tiao-8 wan-5 wan-5 wan-5 tong-2 tong-2'), [], 'south')).toEqual({ hard: true, pattern: 'all-258' });
  });
});

it('accepts equivalent action object field order and deduplicates it', () => {
  const g = newGame(); const id = g.players[0].hand[0]!.id;
  const c = command(g, 0, { tileId: id, type: 'discard' });
  const next = applyCommand(g, c, 1001);
  expect(applyCommand(next, { ...c, action: { type: 'discard', tileId: id } }, 1002)).toBe(next);
});
