export const RULE_SET_ID = 'macheng-hongzhong-pizigang-v3' as const;
export const RULE_STATUS = 'frozen-project-v3' as const;
export type Seat = 0 | 1 | 2 | 3;
export const SEATS: readonly Seat[] = [0, 1, 2, 3];
export type Suit = 'wan' | 'tong' | 'tiao';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type Honor = 'east' | 'south' | 'west' | 'north' | 'red' | 'green' | 'white';
export type TileKind = `${Suit}-${Rank}` | Honor;
export interface Tile { readonly id: string; readonly kind: TileKind }
export interface RuleEnvironment { readonly random: () => number; readonly now: () => number }
export interface Specials { pizi: TileKind; laizi: TileKind }
export interface Meld { type: 'chi' | 'peng' | 'kong'; tiles: Tile[]; concealed: boolean; from: Seat | null }
export interface Player { hand: Tile[]; melds: Meld[]; specialKongs: Tile[]; discards: Tile[] }
export interface Win { hard: boolean; pattern: 'small' | 'all-triplets' | 'pure-suit' | 'all-258' }
export interface Score { base: number; hardMultiplier: number; kongCount: number; specialMultiplier: number; uncapped: number; payment: number; deltas: [number, number, number, number] }
export type ResponseAction = { type: 'pass' } | { type: 'hu' } | { type: 'chi'; tileIds: [string, string] } | { type: 'peng' } | { type: 'exposed-kong' };
export type Action = ResponseAction | { type: 'discard'; tileId: string } | { type: 'special-kong'; tileId: string } | { type: 'concealed-kong'; kind: TileKind } | { type: 'add-kong'; meldIndex: number; tileId: string };
export interface Command { commandId: string; gameId: string; actor: Seat; expectedVersion: number; windowId?: string; action: Action }
export interface Window { id: string; version: number; source: 'discard' | 'add-kong'; from: Seat; tile: Tile; meldIndex: number | null; eligible: Seat[]; responses: Partial<Record<Seat, ResponseAction>>; deadline: number }
export type Result = { type: 'draw'; eventId: string; nextDealer: Seat; deltas: [number, number, number, number] } | { type: 'win'; eventId: string; nextDealer: Seat; winner: Seat; from: Seat | null; method: 'self' | 'discard' | 'rob-kong'; win: Win; score: Score; claimedTile: Tile | null; deltas: [number, number, number, number] };
export interface Game {
  ruleSetId: typeof RULE_SET_ID; id: string; version: number; dealer: Seat; turn: Seat;
  players: [Player, Player, Player, Player]; wall: Tile[]; indicators: Tile[]; specials: Specials;
  phase: 'action' | 'response' | 'ended'; pending: Window | null;
  lastDraw: { seat: Seat; tileId: string; afterKong: boolean } | null;
  deadline: number; updatedAt: number; result: Result | null;
  log: { command: Command; at: number }[];
}
export class RuleError extends Error { constructor(public readonly code: string) { super(code); this.name = 'RuleError'; } }
export function requireRule(ok: unknown, code: string): asserts ok { if (!ok) throw new RuleError(code); }
