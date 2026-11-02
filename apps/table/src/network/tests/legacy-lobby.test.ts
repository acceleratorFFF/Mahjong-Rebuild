import { describe, it, expect } from 'vitest';
import { LobbyService } from '../server/lobby';
import type { LobbyCommand } from '../protocol';
function fixture() {
  let now = 1000;
  let id = 0;
  const lobby = new LobbyService(() => now);
  const admission = (type: 'create' | 'join', nickname: string, roomCode?: string) => ({
    protocolVersion: 1, commandId: `admit-${++id}`, type, nickname, ...(roomCode ? { roomCode } : {}),
  });
  const request = admission('create', '甲');
  const first = lobby.admit('a', request);
  const join = (connection: string) => lobby.admit(connection, admission('join', connection, first.snapshot.roomCode));
  const command = (connection: string, op: { type: 'ready'; ready: boolean } | { type: 'fill-bots' } | { type: 'remove-bots' } | { type: 'leave' }): LobbyCommand => ({
    protocolVersion: 1, commandId: `cmd-${++id}`, roomId: first.snapshot.roomId,
    expectedVersion: lobby.snapshot(connection).version, ...op,
  });
  const resume = (token = first.token) => ({ protocolVersion: 1, commandId: `resume-${++id}`,
    type: 'resume', roomId: first.snapshot.roomId, token });
  return { lobby, first, request, admission, join, command, resume, advance: (ms: number) => { now += ms; } };
}
describe('single waiting room authority', () => {
  it('admits exactly four humans and rejects a fifth and a second room', () => {
    const f = fixture();
    for (const connection of ['b', 'c', 'd']) f.join(connection);
    expect(f.lobby.snapshot('a').seats.filter(Boolean)).toHaveLength(4);
    expect(() => f.join('e')).toThrow('ROOM_FULL');
    expect(() => f.lobby.admit('e', f.admission('create', '额外'))).toThrow('ROOM_EXISTS');
    expect(() => f.lobby.admit('e', f.admission('join', '额外', '000000'))).toThrow('ROOM_NOT_FOUND');
  });
  it('retries admission without allocating another seat or disclosing a token to another connection', () => {
    const f = fixture();
    expect(f.lobby.admit('a', f.request)).toEqual(f.first);
    expect(() => f.lobby.admit('b', f.request)).toThrow('ROOM_EXISTS');
    expect(() => f.join('a')).toThrow('ALREADY_SEATED');
  });
  it('derives the actor from the connection and requires host authority', () => {
    const f = fixture(); f.join('b');
    expect(() => f.lobby.command('b', f.command('b', { type: 'fill-bots' }))).toThrow('NOT_HOST');
    const cmd = f.command('a', { type: 'ready', ready: true });
    expect(() => f.lobby.command('unknown', cmd)).toThrow('INVALID_SESSION');
    expect(() => f.lobby.command('b', { ...cmd, actor: 0 })).toThrow('INVALID_MESSAGE');
    f.lobby.command('b', cmd);
    expect(f.lobby.snapshot('a').seats[0]?.ready).toBe(false);
    expect(f.lobby.snapshot('a').seats[1]?.ready).toBe(true);
  });
  it('requires two humans and four ready connected seats for start eligibility', () => {
    const f = fixture(); f.join('b');
    f.lobby.command('a', f.command('a', { type: 'ready', ready: true }));
    f.lobby.command('b', f.command('b', { type: 'ready', ready: true }));
    expect(f.lobby.snapshot('a').canStart).toBe(false);
    f.lobby.command('a', f.command('a', { type: 'fill-bots' }));
    expect(f.lobby.snapshot('a').canStart).toBe(true);
    expect(() => f.join('c')).toThrow('ROOM_FULL');
    f.lobby.disconnect('b');
    expect(f.lobby.snapshot('a').canStart).toBe(false);
    const one = fixture();
    one.lobby.command('a', one.command('a', { type: 'fill-bots' }));
    one.lobby.command('a', one.command('a', { type: 'ready', ready: true }));
    expect(one.lobby.snapshot('a').canStart).toBe(false);
  });
  it('allows the host to remove bots to invite humans without evicting a player', () => {
    const f = fixture(); f.join('b');
    f.lobby.command('a', f.command('a', { type: 'fill-bots' }));
    expect(() => f.lobby.command('b', f.command('b', { type: 'remove-bots' }))).toThrow('NOT_HOST');
    f.lobby.command('a', f.command('a', { type: 'remove-bots' }));
    expect(f.lobby.snapshot('b').selfSeat).toBe(1);
    expect(f.join('c').snapshot.selfSeat).toBe(2);
    expect(f.lobby.snapshot('a').canStart).toBe(false);
  });
  it('rejects stale commands and mismatched rooms without mutating state', () => {
    const f = fixture();
    const cmd = f.command('a', { type: 'ready', ready: true });
    f.join('b');
    const before = f.lobby.snapshot('a');
    expect(() => f.lobby.command('a', cmd)).toThrow('STALE_VERSION');
    expect(() => f.lobby.command('a', { ...cmd, roomId: 'other' })).toThrow('ROOM_NOT_FOUND');
    expect(f.lobby.snapshot('a')).toEqual(before);
  });
  it('acknowledges duplicates before version checks and rejects command ID reuse', () => {
    const f = fixture();
    const cmd = f.command('a', { type: 'ready', ready: true });
    const ack = f.lobby.command('a', cmd);
    f.join('b');
    const before = f.lobby.snapshot('a');
    const retry = f.lobby.command('a', cmd);
    expect(retry.duplicate).toBe(true);
    expect(retry.appliedVersion).toBe(ack.appliedVersion);
    expect(retry.snapshot).toEqual(before);
    expect(() => f.lobby.command('a', { ...cmd, ready: false })).toThrow('COMMAND_ID_REUSED');
    expect(f.lobby.snapshot('a')).toEqual(before);
  });
  it('resumes the same seat, invalidates old connection, and preserves command receipts', () => {
    const f = fixture(); f.join('b');
    const cmd = f.command('a', { type: 'ready', ready: true });
    f.lobby.command('a', cmd);
    const resume = f.resume();
    const reply = f.lobby.admit('new-a', resume);
    expect(reply.replacedConnection).toBe('a');
    expect(reply.snapshot.selfSeat).toBe(0);
    expect(() => f.lobby.snapshot('a')).toThrow('INVALID_SESSION');
    expect(() => f.lobby.command('a', cmd)).toThrow('INVALID_SESSION');
    f.lobby.disconnect('a');
    expect(f.lobby.snapshot('new-a').seats[0]?.connected).toBe(true);
    expect(f.lobby.command('new-a', cmd).duplicate).toBe(true);
    expect(f.lobby.admit('new-a', resume).snapshot.version).toBe(reply.snapshot.version);
    expect(() => f.lobby.admit('attacker', f.resume('0'.repeat(64)))).toThrow('INVALID_SESSION');
  });
  it('reserves disconnected seats until the grace deadline, then revokes their token', () => {
    const f = fixture(); f.join('b'); f.join('c'); f.join('d');
    f.lobby.disconnect('a');
    f.advance(59_999);
    expect(() => f.join('e')).toThrow('ROOM_FULL');
    f.advance(1);
    expect(() => f.lobby.admit('new-a', f.resume())).toThrow('INVALID_SESSION');
    expect(f.join('e').snapshot.selfSeat).toBe(0);
    expect(f.lobby.snapshot('b').hostSeat).toBe(1);
  });
  it('reconnects within the grace period with readiness reset', () => {
    const f = fixture(); f.join('b');
    f.lobby.command('a', f.command('a', { type: 'ready', ready: true }));
    f.lobby.disconnect('a'); f.advance(59_999);
    const snap = f.lobby.admit('new-a', f.resume()).snapshot;
    expect(snap.selfSeat).toBe(0);
    expect(snap.seats[0]?.ready).toBe(false);
    expect(snap.hostSeat).toBe(1);
  });
  it('releases seats on leave, transfers host, and removes a room with no humans', () => {
    const f = fixture(); f.join('b');
    f.lobby.command('a', f.command('a', { type: 'fill-bots' }));
    const leave = f.command('a', { type: 'leave' });
    expect(f.lobby.command('a', leave).snapshot).toBeNull();
    expect(() => f.lobby.command('a', leave)).toThrow('INVALID_SESSION');
    expect(f.lobby.snapshot('b').hostSeat).toBe(1);
    f.lobby.command('b', f.command('b', { type: 'leave' }));
    expect(f.lobby.admit('new', f.admission('create', '新')).snapshot.version).toBe(1);
    expect(() => f.lobby.admit('a', f.resume())).toThrow('INVALID_SESSION');
  });
  it('cleans an abandoned room using the injected clock', () => {
    const f = fixture(); f.lobby.disconnect('a'); f.advance(60_000); f.lobby.sweep();
    expect(f.lobby.admit('new', f.admission('create', '新')).snapshot.roomId).not.toBe(f.first.snapshot.roomId);
  });
  it('returns detached public snapshots without credentials or internal connection IDs', () => {
    const f = fixture(); const other = f.join('b');
    const snap = f.lobby.snapshot('a');
    const json = JSON.stringify(snap);
    for (const secret of [f.first.token, other.token, 'receipts', 'admission', 'disconnectedAt']) expect(json).not.toContain(secret);
    snap.seats[0]!.nickname = '篡改'; snap.seats.length = 0;
    expect(f.lobby.snapshot('a').seats[0]?.nickname).toBe('甲');
    expect(f.lobby.snapshot('a').seats).toHaveLength(4);
  });
  it('old commands remain stale after bounded receipt eviction', () => {
    const f = fixture();
    const first = f.command('a', { type: 'ready', ready: true }); f.lobby.command('a', first);
    for (let i = 0; i < 129; i++) f.lobby.command('a', f.command('a', { type: 'ready', ready: i % 2 === 0 }));
    expect(() => f.lobby.command('a', first)).toThrow('STALE_VERSION');
  });
});

it('timestamps each snapshot using the injected server clock without changing room version', () => {
  const f = fixture();
  const first = f.lobby.snapshot('a');
  expect(first.serverNow).toBe(1000);
  f.advance(500);
  const next = f.lobby.snapshot('a');
  expect(next.serverNow).toBe(1500);
  expect(next.version).toBe(first.version);
});

it('host never needs ready; four occupied connected seats and three guest confirmations allow only explicit host start',()=>{
 const f=fixture();f.join('b');f.join('c');
 const start=()=>{const c=f.command('a',{type:'ready',ready:false});return {protocolVersion:1,commandId:c.commandId,roomId:c.roomId,expectedVersion:c.expectedVersion,type:'start'}};
 for(const s of ['b','c'])f.lobby.command(s,f.command(s,{type:'ready',ready:true}));
 expect(f.lobby.snapshot('a').canStart).toBe(false);expect(()=>f.lobby.command('a',start())).toThrow('NOT_READY');
 f.join('d');expect(()=>f.lobby.command('a',start())).toThrow('NOT_READY');
 f.lobby.command('d',f.command('d',{type:'ready',ready:true}));const before=f.lobby.snapshot('a');
 expect(before.seats[0]!.ready).toBe(false);expect(before.canStart).toBe(true);expect(before.phase).toBe('waiting');expect(before.game).toBeNull();
 expect(()=>f.lobby.command('b',{...start(),commandId:'guest-start'})).toThrow('NOT_HOST');
 f.lobby.command('a',start());expect(f.lobby.snapshot('a').phase).toBe('playing');
});
it('host transfer exempts the new host but the former host must prepare as a guest after reconnect',()=>{
 const f=fixture();f.join('b');f.join('c');f.join('d');
 for(const s of ['c','d'])f.lobby.command(s,f.command(s,{type:'ready',ready:true}));
 f.lobby.disconnect('a');expect(f.lobby.snapshot('b').hostSeat).toBe(1);expect(f.lobby.snapshot('b').canStart).toBe(false);
 f.lobby.admit('again',f.resume());expect(f.lobby.snapshot('again').canStart).toBe(false);
 f.lobby.command('again',f.command('again',{type:'ready',ready:true}));expect(f.lobby.snapshot('b').canStart).toBe(true);expect(f.lobby.snapshot('b').seats[1]!.ready).toBe(false);
});
