import type { Admission, GameCommand, LobbyCommand, LobbyErrorCode, LobbySnapshot } from './lobby.js';
export type NetworkErrorCode = LobbyErrorCode | 'RATE_LIMITED' | 'INVALID_EVENT' | 'INTERNAL_ERROR';
export type Reply<T> = { ok: true; data: T } | { ok: false; error: NetworkErrorCode; snapshot: LobbySnapshot | null };
export interface AdmissionData { token: string; snapshot: LobbySnapshot }
export interface CommandData { commandId: string; appliedVersion: number; duplicate: boolean; snapshot: LobbySnapshot | null }
export interface ClientEvents {
  'game:action': (request: GameCommand, ack: (reply: Reply<CommandData>) => void) => void;
  'lobby:admit': (request: Admission, ack: (reply: Reply<AdmissionData>) => void) => void;
  'lobby:command': (request: LobbyCommand, ack: (reply: Reply<CommandData>) => void) => void;
  'lobby:sync': (request: { protocolVersion: 1 }, ack: (reply: Reply<LobbySnapshot>) => void) => void;
}
export interface ServerEvents {
  'lobby:snapshot': (snapshot: LobbySnapshot) => void;
  'session:replaced': () => void;
  'account:expired':()=>void;
}
