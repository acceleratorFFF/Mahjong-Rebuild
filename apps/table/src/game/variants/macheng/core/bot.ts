import { TILE_KINDS } from './tiles.js';
import type { Action, Seat } from './types.js';
import type { playerView } from './engine.js';
export type PlayerView = ReturnType<typeof playerView>;

/** Basic bot: receives only its own projection, never the authoritative game. */
export function chooseBotAction(view: PlayerView, seat: Seat): Action | null {
  const actions = view.actions;
  const win = actions.find(a => a.type === 'hu');
  if (win) return win;
  const hand = view.players[seat]!.hand;
  const kong = actions.find(a => a.type === 'special-kong' && hand.find(t => t.id === a.tileId)?.kind !== view.specials.laizi)
    ?? actions.find(a => a.type === 'concealed-kong' || a.type === 'add-kong' || a.type === 'exposed-kong');
  if (kong) return kong;
  const claim = actions.find(a => a.type === 'peng') ?? actions.find(a => a.type === 'chi');
  if (claim) return claim;
  const discard = actions.filter((a): a is Extract<Action, { type: 'discard' }> => a.type === 'discard');
  const keepValue = (id: string) => {
    const tile = hand.find(t => t.id === id)!;
    if (tile.kind === view.specials.laizi) return 100;
    const index = TILE_KINDS.indexOf(tile.kind);
    let value = 0;
    for (const other of hand) {
      if (other.id === id) continue;
      if (other.kind === tile.kind) value += 5;
      const otherIndex = TILE_KINDS.indexOf(other.kind);
      if (index < 27 && otherIndex < 27 && Math.floor(index / 9) === Math.floor(otherIndex / 9)) {
        const distance = Math.abs(index - otherIndex);
        if (distance === 1) value += 2;
        if (distance === 2) value += 1;
      }
    }
    return value;
  };
  discard.sort((a, b) => keepValue(a.tileId) - keepValue(b.tileId) || a.tileId.localeCompare(b.tileId));
  return discard[0] ?? actions.find(a => a.type === 'pass') ?? null;
}
