import { describe, it, expect } from 'vitest';
import { parseAdmission, parseLobbyCommand } from '../protocol/index';
const base = { protocolVersion: 1, commandId: 'cmd-1' };
describe('lobby wire validation', () => {
  it('accepts all lobby operations and returns a separate canonical object', () => {
    const create = { ...base, type: 'create', nickname: '玩家一' };
    expect(parseAdmission(create)).toEqual(create);
    expect(parseAdmission(create)).not.toBe(create);
    expect(parseAdmission({ ...base, type: 'join', nickname: '二', roomCode: '123456' }).type).toBe('join');
    expect(parseAdmission({ ...base, type: 'resume', roomId: 'room', token: 'a'.repeat(64) }).type).toBe('resume');
    for (const op of [{ type: 'ready', ready: true }, { type: 'fill-bots' }, { type: 'remove-bots' }, { type: 'leave' }]) {
      expect(parseLobbyCommand({ ...base, roomId: 'room', expectedVersion: 0, ...op }).type).toBe(op.type);
    }
  });
  it('rejects forged identity, unknown fields, malformed names and incompatible versions', () => {
    const create = { ...base, type: 'create', nickname: '玩家' };
    for (const input of [null, [], {}, { ...create, actor: 0 }, { ...create, protocolVersion: 2 },
      { ...create, commandId: '' }, { ...create, nickname: 'a'.repeat(17) },
      { ...create, nickname: ' 玩家' }, { ...create, nickname: 'x\ny' },
      { ...create, nickname: 'x\u202ey' }, { ...create, type: 'start' },
      { ...base, type: 'join', nickname: '玩家', roomCode: 123456 },
      { ...base, type: 'resume', roomId: 'room', token: 'short' }]) {
      expect(() => parseAdmission(input)).toThrow('INVALID_MESSAGE');
    }
  });
  it('rejects invalid command versions and extra game state', () => {
    const ready = { ...base, type: 'ready', roomId: 'room', expectedVersion: 1, ready: true };
    for (const v of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1']) {
      expect(() => parseLobbyCommand({ ...ready, expectedVersion: v })).toThrow('INVALID_MESSAGE');
    }
    for (const extra of [{ token: 'secret' }, { actor: 0 }, { hand: [] }, { ready: 'true' }]) {
      expect(() => parseLobbyCommand({ ...ready, ...extra })).toThrow('INVALID_MESSAGE');
    }
  });
  it('does not evaluate getters or accept inherited envelopes', () => {
    const getter = { get type(): string { throw new Error('getter evaluated'); } };
    expect(() => parseAdmission(getter)).toThrow('INVALID_MESSAGE');
    expect(() => parseAdmission(Object.create({ ...base, type: 'create', nickname: 'A' }))).toThrow('INVALID_MESSAGE');
  });
});
