import { describe, it, expect } from 'vitest';
import { seededRandom, createGame, playerView, type Action } from '../core';
import { createLocalSession, actionTicket } from './localSession';
import { chooseBotAction } from '../core/bot';

function setup(seed = 7) {
  let now = 0;
  const session = createLocalSession({ idPrefix: `test-${seed}`, random: seededRandom(seed), now: () => now, dealer: 0 });
  return { session, step: (ms = 500) => { now += ms; return session.advance(); }, setTime: (value: number) => { now = value; } };
}
describe('single-player host', () => {
  it.each([1, 7, 42, 99, 2026])('autoplay completes a round with three bots and zero-sum totals, seed %i', seed => {
    const { session, step } = setup(seed); session.setAutoplay(true);
    let steps = 0;
    while (session.snapshot().view.phase !== 'ended' && steps++ < 600) {
      step(); const snapshot = session.snapshot();
      expect(snapshot.view.players.slice(1).every(p => p.hand.length === 0)).toBe(true);
      expect(snapshot.view).not.toHaveProperty('wall'); expect(snapshot.view).not.toHaveProperty('log');
    }
    const ended = session.snapshot(); expect(ended.view.phase).toBe('ended'); expect(steps).toBeLessThan(600);
    expect(ended.totals.reduce((a, b) => a + b, 0)).toBe(0); expect(ended.totals).toEqual(ended.view.result!.deltas);
    step(60_000); expect(session.snapshot().totals).toEqual(ended.totals);
    expect(session.nextRound()).toBe(true); const next = session.snapshot();
    expect(next.round).toBe(2); expect(next.view.gameId).not.toBe(ended.view.gameId);
    expect(next.view.dealer).toBe(ended.view.result!.nextDealer); expect(next.autoplay).toBe(false); expect(next.totals).toEqual(ended.totals);
  });
  it('accepts a human discard and rejects a duplicate stale click', () => {
    const { session } = setup(); const initial = session.snapshot();
    const action = initial.view.actions.find(a => a.type === 'discard')!;
    const ticket = actionTicket(initial.view); expect(session.submit(action, ticket)).toBe(true);
    const version = session.snapshot().view.version;
    expect(session.submit(action, ticket)).toBe(false); expect(session.snapshot().view.version).toBe(version);
  });
  it('does not play the human hand before the deadline; expires it at 30 seconds', () => {
    const { session, step, setTime } = setup(); const initial = session.snapshot();
    expect(step(500)).toBe(false); expect(session.snapshot().view.version).toBe(0);
    setTime(30_000); expect(session.submit(initial.view.actions[0]!, actionTicket(initial.view))).toBe(false);
    expect(session.snapshot().view.version).toBeGreaterThan(0); expect(session.snapshot().notice).toContain('超时');
  });
  it('does not restart an unfinished round and releases control on disposal', () => {
    const { session, step } = setup(); expect(session.nextRound()).toBe(false);
    session.setAutoplay(true); session.dispose(); const initial = session.snapshot();
    expect(step(60_000)).toBe(false); expect(session.snapshot()).toEqual(initial);
    expect(session.submit(initial.view.actions[0]!, actionTicket(initial.view))).toBe(false);
  });
  it('autoplay can be cancelled and returned snapshots cannot mutate the host', () => {
    const { session } = setup(); session.setAutoplay(true);
    const initial = session.snapshot(); expect(session.submit(initial.view.actions[0]!, actionTicket(initial.view))).toBe(false);
    session.setAutoplay(false); const next = session.snapshot(); next.view.players[0]!.hand.pop(); next.totals[0] = 999;
    expect(session.snapshot().view.players[0]!.hand).toHaveLength(14); expect(session.snapshot().totals[0]).toBe(0);
    const fresh = session.snapshot(); expect(session.submit(fresh.view.actions[0]!, actionTicket(fresh.view))).toBe(true);
  });
  it('bot chooses an advertised legal action using only its private projection', () => {
    const g = createGame({ id: 'bot', dealer: 1 }, { random: seededRandom(9), now: () => 0 });
    const view = playerView(g, 1); const before = JSON.stringify(view); const action = chooseBotAction(view, 1);
    expect(view.actions).toContainEqual(action); expect(JSON.stringify(view)).toBe(before);
    expect(chooseBotAction({ ...view, actions: [{ type: 'pass' }, { type: 'hu' }] as Action[] }, 1)).toEqual({ type: 'hu' });
  });
});
