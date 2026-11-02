import { type Win, type Seat, type Score, requireRule, SEATS } from './types.js';
export function calculateScore(win: Win, kongCount: number, winner: Seat, from: Seat | null, special: 'none' | 'after-kong' | 'rob-kong' = 'none'): Score {
  requireRule(SEATS.includes(winner) && (from === null || SEATS.includes(from) && from !== winner), 'INVALID_PAYER');
  requireRule(Number.isInteger(kongCount) && kongCount >= 0 && kongCount <= 16, 'INVALID_KONG_COUNT');
  requireRule(special !== 'after-kong' || from === null, 'INVALID_WIN_METHOD');
  requireRule(special !== 'rob-kong' || from !== null, 'INVALID_WIN_METHOD');
  const base = win.pattern === 'small' ? 1 : 4;
  const hardMultiplier = win.hard ? 2 : 1; const specialMultiplier = special === 'none' ? 1 : 2;
  const uncapped = base * hardMultiplier * 2 ** kongCount * specialMultiplier;
  const payment = Math.min(32, uncapped); const deltas: Score['deltas'] = [0, 0, 0, 0];
  for (const seat of SEATS) if (seat !== winner && (from === null || seat === from)) { deltas[seat] -= payment; deltas[winner] += payment; }
  return { base, hardMultiplier, kongCount, specialMultiplier, uncapped, payment, deltas };
}
