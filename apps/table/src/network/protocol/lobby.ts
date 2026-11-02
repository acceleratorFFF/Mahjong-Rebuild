import type {MatchSnapshot} from './match'
import { TILE_KINDS, type Action } from '../../game/variants/macheng/core';
import type {PlayerView} from '../../game/variants/macheng/core/bot';
import type {LocalSnapshot} from '../../game/variants/macheng/host/localSession';
// Lobby v1 is independent of the later game-command contract.
export const LOBBY_PROTOCOL_VERSION = 1 as const;
export const LOBBY_MESSAGE_LIMIT = 2048;
export type LobbySeat = 0 | 1 | 2 | 3;
interface Envelope { protocolVersion: 1; commandId: string }
export type Admission = Envelope & (
  | {type:'recover'}
  | { type: 'create'; nickname: string }
  | { type: 'join'; nickname: string; roomCode: string }
  | { type: 'resume'; roomId: string; token: string }
);
export type LobbyCommand = Envelope & { roomId: string; expectedVersion: number } & (
  | { type: 'ready'; ready: boolean }
  | { type: 'fill-bots' }
  | { type: 'remove-bots' }
  | { type: 'leave' }
  | { type: 'start' }
  | { type: 'next-round' }
  | { type: 'autoplay'; enabled:boolean; gameId:string }
  | {type:'configure-match';totalRounds:4|8}
  | {type:'end-request'} | {type:'new-match'}
  | {type:'end-vote';voteId:string;agree:boolean}
);
export interface LobbyPlayer {
  seat: LobbySeat; nickname: string; avatar?:string; bot: boolean; connected: boolean; ready: boolean; autoplay: boolean;
}
export interface LobbySnapshot {
  /** Snapshot generation time; optional for older v1 servers. */
  serverNow?: number; match?:MatchSnapshot|null; totalRounds?:4|8;
  protocolVersion: 1; roomId: string; roomCode: string; version: number;
  phase: 'waiting' | 'playing' | 'settled'; game: { round: number; view: PlayerView; table:LocalSnapshot } | null; hostSeat: LobbySeat; selfSeat: LobbySeat;
  seats: (LobbyPlayer | null)[]; canStart: boolean;
}
export type LobbyErrorCode = 'AUTH_REQUIRED'|'MATCH_FINISHED'|'INVALID_MATCH'|'VOTE_PENDING'|'VOTE_EXPIRED'|'INVALID_MESSAGE' | 'ROOM_EXISTS' | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL' | 'ALREADY_SEATED' | 'INVALID_SESSION' | 'NOT_HOST'
  | 'STALE_VERSION' | 'COMMAND_ID_REUSED' | 'WRONG_PHASE' | 'NOT_READY'
  | 'WRONG_GAME' | 'STALE_WINDOW' | 'ILLEGAL_ACTION' | 'GAME_ENDED' | 'DEADLINE_PASSED';
export class LobbyError extends Error {
  constructor(public readonly code: LobbyErrorCode) { super(code); this.name = 'LobbyError'; }
}
function invalid(): never { throw new LobbyError('INVALID_MESSAGE'); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const entries = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length > 8 || Object.values(entries).some(d => !('value' in d))) return invalid();
  return value as Record<string, unknown>;
}
function exact(v: Record<string, unknown>, keys: string[]): void {
  if (Reflect.ownKeys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) invalid();
}
function id(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}
function envelope(v: Record<string, unknown>): void {
  if (v.protocolVersion !== LOBBY_PROTOCOL_VERSION || !id(v.commandId)) invalid();
}
function nickname(value: unknown): string {
  if (typeof value !== 'string' || value !== value.trim() || value.length < 1 || value.length > 16
      || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)) return invalid();
  return value;
}
export function parseAdmission(value: unknown): Admission {
  const v = object(value); envelope(v);
  const base = { protocolVersion: LOBBY_PROTOCOL_VERSION, commandId: v.commandId as string };
  if(v.type==='recover'){exact(v,['protocolVersion','commandId','type']);return {...base,type:'recover'}}
  if (v.type === 'create') {
    exact(v, ['protocolVersion', 'commandId', 'type', 'nickname']);
    return { ...base, type: 'create', nickname: nickname(v.nickname) };
  }
  if (v.type === 'join') {
    exact(v, ['protocolVersion', 'commandId', 'type', 'nickname', 'roomCode']);
    if (typeof v.roomCode !== 'string' || !/^[0-9]{6}$/.test(v.roomCode)) return invalid();
    return { ...base, type: 'join', nickname: nickname(v.nickname), roomCode: v.roomCode };
  }
  if (v.type === 'resume') {
    exact(v, ['protocolVersion', 'commandId', 'type', 'roomId', 'token']);
    if (!id(v.roomId) || typeof v.token !== 'string' || !/^[a-f0-9]{64}$/.test(v.token)) return invalid();
    return { ...base, type: 'resume', roomId: v.roomId, token: v.token };
  }
  return invalid();
}
export function parseLobbyCommand(value: unknown): LobbyCommand {
  const v = object(value); envelope(v);
  if (!id(v.roomId) || !Number.isSafeInteger(v.expectedVersion) || (v.expectedVersion as number) < 0) return invalid();
  const keys = ['protocolVersion', 'commandId', 'roomId', 'expectedVersion', 'type'];
  const base = { protocolVersion: LOBBY_PROTOCOL_VERSION, commandId: v.commandId as string,
    roomId: v.roomId, expectedVersion: v.expectedVersion as number };
  if(v.type==='configure-match'){exact(v,[...keys,'totalRounds']);if(v.totalRounds!==4&&v.totalRounds!==8)return invalid();return {...base,type:v.type,totalRounds:v.totalRounds}}
  if(v.type==='end-vote'){exact(v,[...keys,'voteId','agree']);if(!id(v.voteId)||typeof v.agree!=='boolean')return invalid();return {...base,type:v.type,voteId:v.voteId,agree:v.agree}}
  if (v.type === 'ready') {
    exact(v, [...keys, 'ready']);
    if (typeof v.ready !== 'boolean') return invalid();
    return { ...base, type: 'ready', ready: v.ready };
  }
  if(v.type==='autoplay'){
    exact(v,[...keys,'enabled','gameId']);if(typeof v.enabled!=='boolean'||!id(v.gameId))return invalid();
    return {...base,type:'autoplay',enabled:v.enabled,gameId:v.gameId};
  }
  if (v.type === 'end-request' || v.type === 'new-match' || v.type === 'fill-bots' || v.type === 'remove-bots' || v.type === 'leave' || v.type === 'start' || v.type === 'next-round') {
    exact(v, keys); return { ...base, type: v.type };
  }
  return invalid();
}

export interface GameCommand {
  protocolVersion: 1; commandId: string; roomId: string; gameId: string;
  expectedVersion: number; windowId?: string; action: Action;
}
function tileId(value: unknown): value is string {
  return typeof value === 'string' && /^(?:(?:wan|tong|tiao)-[1-9]|east|south|west|north|red|green|white):[0-3]$/.test(value);
}
export function parseGameCommand(value: unknown): GameCommand {
  const v = object(value); envelope(v);
  const keys = ['protocolVersion', 'commandId', 'roomId', 'gameId', 'expectedVersion', 'action'];
  if (Object.hasOwn(v, 'windowId')) keys.push('windowId');
  exact(v, keys);
  if (!id(v.roomId) || !id(v.gameId) || !Number.isSafeInteger(v.expectedVersion) || (v.expectedVersion as number) < 0
    || (Object.hasOwn(v, 'windowId') && (typeof v.windowId !== 'string' || !/^[a-zA-Z0-9_:-]{1,160}$/.test(v.windowId)))) return invalid();
  const a = object(v.action);
  let action: Action;
  switch (a.type) {
    case 'pass': case 'hu': case 'peng': case 'exposed-kong':
      exact(a, ['type']); action = { type: a.type }; break;
    case 'discard': case 'special-kong':
      exact(a, ['type', 'tileId']); if (!tileId(a.tileId)) return invalid();
      action = { type: a.type, tileId: a.tileId }; break;
    case 'chi':
      exact(a, ['type', 'tileIds']);
      if (!Array.isArray(a.tileIds) || a.tileIds.length !== 2 || !a.tileIds.every(tileId) || a.tileIds[0] === a.tileIds[1]) return invalid();
      action = { type: 'chi', tileIds: [a.tileIds[0]!, a.tileIds[1]!] }; break;
    case 'concealed-kong':
      exact(a, ['type', 'kind']); if (!TILE_KINDS.includes(a.kind as never)) return invalid();
      action = { type: 'concealed-kong', kind: a.kind as Extract<Action, { type: 'concealed-kong' }>['kind'] }; break;
    case 'add-kong':
      exact(a, ['type', 'meldIndex', 'tileId']);
      if (!tileId(a.tileId) || !Number.isInteger(a.meldIndex) || (a.meldIndex as number) < 0 || (a.meldIndex as number) > 3) return invalid();
      action = { type: 'add-kong', meldIndex: a.meldIndex as number, tileId: a.tileId }; break;
    default: return invalid();
  }
  return { protocolVersion: 1, commandId: v.commandId as string, roomId: v.roomId, gameId: v.gameId,
    expectedVersion: v.expectedVersion as number, ...(typeof v.windowId === 'string' ? { windowId: v.windowId } : {}), action };
}

