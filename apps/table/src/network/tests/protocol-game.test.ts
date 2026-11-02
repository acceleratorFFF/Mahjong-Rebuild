import { it, expect } from 'vitest';
import { parseGameCommand } from '../protocol/index';
const base = { protocolVersion: 1, commandId: 'command', roomId: 'room', gameId: 'game', expectedVersion: 1 };
it('validates every rule action without accepting client state or actor', () => {
  for (const action of [{ type: 'pass' }, { type: 'hu' }, { type: 'peng' }, { type: 'exposed-kong' },
    { type: 'discard', tileId: 'wan-1:0' }, { type: 'special-kong', tileId: 'red:0' },
    { type: 'chi', tileIds: ['wan-1:0', 'wan-2:0'] }, { type: 'concealed-kong', kind: 'east' },
    { type: 'add-kong', meldIndex: 0, tileId: 'tong-9:3' }]) {
    expect(parseGameCommand({ ...base, action }).action).toEqual(action);
  }
  for (const action of [{ type: 'discard', tileId: 'wan-1:4' }, { type: 'hu', result: 'win' },
    { type: 'chi', tileIds: ['wan-1:0', 'wan-1:0'] }, { type: 'concealed-kong', kind: 'unknown' },
    { type: 'add-kong', meldIndex: 4, tileId: 'red:0' }]) {
    expect(() => parseGameCommand({ ...base, action })).toThrow('INVALID_MESSAGE');
  }
  for (const extra of [{ actor: 0 }, { wall: [] }, { expectedVersion: -1 }, { windowId: '' }, { protocolVersion: 2 }]) {
    expect(() => parseGameCommand({ ...base, action: { type: 'hu' }, ...extra })).toThrow('INVALID_MESSAGE');
  }
});
