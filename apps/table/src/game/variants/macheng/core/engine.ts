import { RULE_SET_ID, SEATS, type Seat, type Game, type Player, type Tile, type Command, type Action, type ResponseAction, type RuleEnvironment, type Window, type TileKind, type Meld, type Specials, requireRule } from './types.js';
import { createDeck, shuffle, validateDeck, nextKind, isSpecial, isSequence } from './tiles.js';
import { evaluateWin } from './win.js';
import { calculateScore } from './score.js';

const nextSeat = (seat: Seat): Seat => ((seat + 1) % 4) as Seat;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const player = (): Player => ({ hand: [], melds: [], specialKongs: [], discards: [] });
function clock(at: number, previous = -Infinity) { requireRule(Number.isFinite(at) && at >= previous, 'INVALID_TIME'); }
export function createGame(options: { id: string; dealer?: Seat; deck?: readonly Tile[] }, env: RuleEnvironment): Game {
  requireRule(options.id.length > 0, 'INVALID_GAME_ID');
  const now = env.now(); clock(now);
  let dealer = options.dealer;
  if (dealer === undefined) { const r = env.random(); requireRule(Number.isFinite(r) && r >= 0 && r < 1, 'INVALID_RANDOM'); dealer = Math.floor(r * 4) as Seat; }
  requireRule(SEATS.includes(dealer), 'INVALID_SEAT');
  const wall = options.deck ? copy([...options.deck]) : shuffle(createDeck(), env.random);
  validateDeck(wall);
  const players: Game['players'] = [player(), player(), player(), player()];
  for (let i = 0; i < 13; i++) for (let offset = 0; offset < 4; offset++) players[(dealer + offset) % 4]!.hand.push(wall.shift()!);
  const extra = wall.shift()!; players[dealer].hand.push(extra);
  const indicators: Tile[] = []; let indicator: Tile;
  do { indicator = wall.pop()!; indicators.push(indicator); } while (indicator.kind === 'red');
  return { ruleSetId: RULE_SET_ID, id: options.id, version: 0, dealer, turn: dealer, players, wall, indicators,
    specials: { pizi: indicator.kind, laizi: nextKind(indicator.kind) }, phase: 'action', pending: null,
    lastDraw: { seat: dealer, tileId: extra.id, afterKong: false }, deadline: now + 30_000, updatedAt: now, result: null, log: [] };
}
export function evaluateMachengWin(hand:readonly TileKind[],melds:readonly Meld[],specials:Specials){
  // Both the flipped kind and every red dragon are pizi; neither may remain in a win.
  const structure=[...hand,...melds.flatMap(m=>m.tiles.map(t=>t.kind))];
  if(structure.includes(specials.pizi)||structure.includes('red'))return null;
  return evaluateWin(hand,melds,specials.laizi);
}
function winFor(game: Game, seat: Seat, extra?: Tile) {
  const p = game.players[seat];
  return evaluateMachengWin([...p.hand.map(t => t.kind), ...(extra ? [extra.kind] : [])],p.melds,game.specials);
}
function responseChoices(game: Game, seat: Seat, window: Window): ResponseAction[] {
  if (seat === window.from || isSpecial(window.tile.kind, game.specials)) return [];
  const actions: ResponseAction[] = [];
  if (winFor(game, seat, window.tile)) actions.push({ type: 'hu' });
  if (window.source === 'discard' && game.wall.length > 0) {
    const hand = game.players[seat].hand;
    const matching = hand.filter(t => t.kind === window.tile.kind);
    if (matching.length >= 2) actions.push({ type: 'peng' });
    if (matching.length >= 3) actions.push({ type: 'exposed-kong' });
    if (seat === nextSeat(window.from)) for (let i = 0; i < hand.length; i++) for (let j = i + 1; j < hand.length; j++) {
      const a = hand[i]!; const b = hand[j]!;
      if (!isSpecial(a.kind, game.specials) && !isSpecial(b.kind, game.specials) && isSequence([a.kind, b.kind, window.tile.kind])) actions.push({ type: 'chi', tileIds: [a.id, b.id].sort() as [string, string] });
    }
  }
  return actions.length ? [{ type: 'pass' }, ...actions] : [];
}
export function legalActions(game: Game, seat: Seat): Action[] {
  requireRule(SEATS.includes(seat), 'INVALID_SEAT');
  if (game.phase === 'ended') return [];
  if (game.phase === 'response') {
    const w = game.pending!;
    return w.eligible.includes(seat) && !w.responses[seat] ? responseChoices(game, seat, w) : [];
  }
  if (game.turn !== seat) return [];
  const p = game.players[seat];
  // A special tile's discard intent means a single kong, never a river discard.
  // Without a replacement tile that intent is unavailable, including for laizi.
  const actions: Action[] = p.hand.filter(t => game.wall.length>0||!isSpecial(t.kind,game.specials)).map(t => ({ type: 'discard', tileId: t.id }));
  if (winFor(game, seat)) actions.push({ type: 'hu' });
  if (game.wall.length > 0) {
    for (const tile of p.hand) if (isSpecial(tile.kind, game.specials)) actions.push({ type: 'special-kong', tileId: tile.id });
    for (const kind of new Set(p.hand.map(t => t.kind))) if (!isSpecial(kind, game.specials) && p.hand.filter(t => t.kind === kind).length === 4) actions.push({ type: 'concealed-kong', kind });
    p.melds.forEach((meld, meldIndex) => {
      if (meld.type !== 'peng') return;
      const tile = p.hand.find(t => t.kind === meld.tiles[0]!.kind);
      if (tile && !isSpecial(tile.kind, game.specials)) actions.push({ type: 'add-kong', meldIndex, tileId: tile.id });
    });
  }
  return actions;
}
function removeTile(p: Player, id: string): Tile { const index = p.hand.findIndex(t => t.id === id); requireRule(index >= 0, 'TILE_NOT_OWNED'); return p.hand.splice(index, 1)[0]!; }
function finishDraw(game: Game) {
  game.phase = 'ended'; game.pending = null; game.lastDraw = null;
  game.result = { type: 'draw', eventId: `${game.id}:settlement`, nextDealer: game.dealer, deltas: [0, 0, 0, 0] };
}
function take(game: Game, seat: Seat, now: number, afterKong: boolean) {
  game.pending = null; game.turn = seat;
  if (game.wall.length === 0) { finishDraw(game); return; }
  const tile = afterKong ? game.wall.pop()! : game.wall.shift()!;
  game.players[seat].hand.push(tile); game.phase = 'action';
  game.lastDraw = { seat, tileId: tile.id, afterKong }; game.deadline = now + 30_000;
  // No replacement and no discardable tile: the round cannot continue.
  if (!game.wall.length && legalActions(game,seat).length===0) finishDraw(game);
}
function claimDiscard(game: Game, w: Window): Tile {
  const discards = game.players[w.from].discards;
  const tile = discards.pop(); requireRule(tile?.id === w.tile.id, 'CORRUPT_DISCARD'); return tile;
}
function finishWin(game: Game, winner: Seat, from: Seat | null, method: 'self' | 'discard' | 'rob-kong', extra: Tile | null) {
  const win = winFor(game, winner, extra ?? undefined); requireRule(win, 'INVALID_WIN');
  const p = game.players[winner];
  const special = method === 'rob-kong' ? 'rob-kong' : method === 'self' && game.lastDraw?.afterKong && game.lastDraw.seat === winner ? 'after-kong' : 'none';
  const score = calculateScore(win, p.specialKongs.length + p.melds.filter(m => m.type === 'kong').length, winner, from, special);
  game.result = { type: 'win', eventId: `${game.id}:settlement`, winner, from, method, win, score, deltas: score.deltas,
    claimedTile: extra, nextDealer: winner === game.dealer ? game.dealer : nextSeat(game.dealer) };
  game.phase = 'ended'; game.pending = null;
}
function settleWindow(game: Game, now: number) {
  const w = game.pending!;
  const priority = (a: ResponseAction) => a.type === 'hu' ? 3 : a.type === 'peng' || a.type === 'exposed-kong' ? 2 : a.type === 'chi' ? 1 : 0;
  const selected = w.eligible.filter(s => w.responses[s] && w.responses[s]!.type !== 'pass').sort((a, b) => priority(w.responses[b]!) - priority(w.responses[a]!) || (a - w.from + 4) % 4 - (b - w.from + 4) % 4)[0];
  if (selected === undefined) {
    if (w.source === 'add-kong') {
      const p = game.players[w.from]; const tile = removeTile(p, w.tile.id); const meld = p.melds[w.meldIndex!]!;
      meld.tiles.push(tile); meld.type = 'kong'; take(game, w.from, now, true);
    } else take(game, nextSeat(w.from), now, false);
    return;
  }
  const action = w.responses[selected]!;
  if (action.type === 'hu') {
    const tile = w.source === 'discard' ? claimDiscard(game, w) : removeTile(game.players[w.from], w.tile.id);
    finishWin(game, selected, w.from, w.source === 'discard' ? 'discard' : 'rob-kong', tile); return;
  }
  const p = game.players[selected]; const taken = claimDiscard(game, w);
  const own = action.type === 'chi' ? action.tileIds.map(id => removeTile(p, id)) : p.hand.filter(t => t.kind === taken.kind).slice(0, action.type === 'peng' ? 2 : 3).map(t => removeTile(p, t.id));
  p.melds.push({ type: action.type === 'chi' ? 'chi' : action.type === 'peng' ? 'peng' : 'kong', tiles: [...own, taken], concealed: false, from: w.from });
  game.pending = null; game.turn = selected; game.lastDraw = null;
  if (action.type === 'exposed-kong') take(game, selected, now, true);
  else { game.phase = 'action'; game.deadline = now + 30_000; }
}
function openWindow(game: Game, from: Seat, tile: Tile, source: Window['source'], now: number, meldIndex: number | null = null) {
  const w: Window = { id: `${game.id}:window:${game.version}`, version: game.version, from, tile, source, meldIndex, eligible: [], responses: {}, deadline: now + 10_000 };
  w.eligible = SEATS.filter(seat => responseChoices(game, seat, w).length > 0);
  game.pending = w; game.phase = 'response'; game.deadline = w.deadline;
  if (w.eligible.length === 0) settleWindow(game, now);
}
function actionKey(action: Action): string {
  switch (action.type) {
    case 'discard': case 'special-kong': return JSON.stringify([action.type, action.tileId]);
    case 'concealed-kong': return JSON.stringify([action.type, action.kind]);
    case 'add-kong': return JSON.stringify([action.type, action.meldIndex, action.tileId]);
    case 'chi': return JSON.stringify([action.type, [...action.tileIds].sort()]);
    case 'hu': case 'pass': case 'peng': case 'exposed-kong': return action.type;
  }
}
function signature(command: Command) {
  return JSON.stringify([command.gameId, command.actor, command.expectedVersion, command.windowId ?? null, actionKey(command.action)]);
}
function apply(game: Game, command: Command, now: number, timeout = false): Game {
  requireRule(command.gameId === game.id, 'WRONG_GAME'); requireRule(command.commandId.length > 0, 'INVALID_COMMAND_ID'); requireRule(SEATS.includes(command.actor), 'INVALID_SEAT');
  const previous = game.log.find(entry => entry.command.commandId === command.commandId);
  if (previous) { requireRule(signature(previous.command) === signature(command), 'COMMAND_ID_REUSED'); return game; }
  clock(now, game.updatedAt); requireRule(game.phase !== 'ended', 'GAME_ENDED');
  requireRule(timeout || now < game.deadline, 'DEADLINE_PASSED');
  if (game.phase === 'response') requireRule(command.windowId === game.pending!.id && command.expectedVersion === game.pending!.version, 'STALE_WINDOW');
  else requireRule(command.expectedVersion === game.version && command.windowId === undefined, 'STALE_VERSION');
  const actions=legalActions(game, command.actor);
  const timeoutDraw=timeout&&game.phase==='action'&&command.action.type==='pass'&&!actions.some(a=>a.type==='discard'||a.type==='special-kong');
  requireRule(timeoutDraw||actions.some(a => actionKey(a) === actionKey(command.action)), 'ILLEGAL_ACTION');
  const next = copy(game); next.version++; next.updatedAt = now;
  const action = command.action; const p = next.players[command.actor];
  if (next.phase === 'response') {
    next.pending!.responses[command.actor] = action as ResponseAction;
    if (next.pending!.eligible.every(seat => next.pending!.responses[seat])) settleWindow(next, now);
  } else switch (action.type) {
    case 'discard': { const tile = removeTile(p, action.tileId);
      if(isSpecial(tile.kind,next.specials)){p.specialKongs.push(tile);take(next,command.actor,now,true);}
      else {p.discards.push(tile);next.lastDraw = null;openWindow(next, command.actor, tile, 'discard', now);}break; }
    case 'pass': finishDraw(next);break; // Trusted timeout only when no discard/kong is possible.
    case 'hu': finishWin(next, command.actor, null, 'self', null); break;
    case 'special-kong': p.specialKongs.push(removeTile(p, action.tileId)); take(next, command.actor, now, true); break;
    case 'concealed-kong': { const tiles = p.hand.filter(t => t.kind === action.kind).map(t => removeTile(p, t.id)); p.melds.push({ type: 'kong', tiles, concealed: true, from: null }); take(next, command.actor, now, true); break; }
    case 'add-kong': openWindow(next, command.actor, p.hand.find(t => t.id === action.tileId)!, 'add-kong', now, action.meldIndex); break;
  }
  next.log.push({ command: copy(command), at: now }); return next;
}
export function applyCommand(game: Game, command: Command, now: number): Game { requireRule(!command.commandId.startsWith('timeout:'), 'RESERVED_COMMAND_ID'); return apply(game, command, now); }
/** Trusted host clock entry point, not a player command. */
export function expireGame(game: Game, now: number): Game {
  clock(now, game.updatedAt); if (game.phase === 'ended' || now < game.deadline) return game;
  let next = game;
  if (game.phase === 'response') {
    const window = game.pending!;
    for (const actor of window.eligible) if (!window.responses[actor]) next = apply(next, { gameId: game.id, commandId: `timeout:${window.id}:${actor}`, actor, expectedVersion: window.version, windowId: window.id, action: { type: 'pass' } }, now, true);
  } else {
    const actions=legalActions(game,game.turn);
    const hand = game.players[game.turn].hand.filter(t => actions.some(a=>a.type==='discard'&&a.tileId===t.id));
    const tile = hand.find(t => t.id === game.lastDraw?.tileId) ?? [...hand].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)[0];
    const action:Action = tile ? {type:'discard',tileId:tile.id} : {type:'pass'};
    next = apply(game, { gameId: game.id, commandId: `timeout:${game.version}`, actor: game.turn, expectedVersion: game.version, action }, now, true);
  }
  return next;
}
export function replay(initial: Game, log: Game['log']): Game {
  let game = copy(initial);
  for (const entry of log) game = apply(game, entry.command, entry.at, entry.command.commandId.startsWith('timeout:'));
  return game;
}
export function playerView(game: Game, seat: Seat) {
  requireRule(SEATS.includes(seat), 'INVALID_SEAT');
  return copy({ ruleSetId: game.ruleSetId, gameId: game.id, version: game.version, dealer: game.dealer, turn: game.turn, phase: game.phase,
    specials: game.specials, indicators: game.indicators, remaining: game.wall.length, deadline: game.deadline,
    players: game.players.map((p, index) => ({ handCount: p.hand.length, hand: index === seat ? p.hand : [],
      melds: p.melds.map(m => m.concealed && index !== seat ? { type: m.type, concealed: true, count: m.tiles.length, tiles: [] } : { ...m, count: m.tiles.length }),
      specialKongs: p.specialKongs, discards: p.discards })),
    response: game.pending ? { id: game.pending.id, version: game.pending.version, from: game.pending.from, source: game.pending.source, tile: game.pending.tile, submitted: !!game.pending.responses[seat] } : null,
    actions: legalActions(game, seat), result: game.result });
}
export function assertConservation(game: Game) {
  const all = [...game.wall, ...game.indicators, ...game.players.flatMap(p => [...p.hand, ...p.discards, ...p.specialKongs, ...p.melds.flatMap(m => m.tiles)]), ...(game.result?.type === 'win' && game.result.claimedTile ? [game.result.claimedTile] : [])];
  validateDeck(all);
  if (game.result) requireRule(game.result.deltas.reduce((a, b) => a + b, 0) === 0, 'SCORE_NOT_ZERO_SUM');
}
