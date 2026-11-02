import { it, expect } from 'vitest';
import { RateLimit } from '../server/rate-limit';
it('bounds key storage and only restores budgets at the deadline', () => {
  let now = 0;
  const limit = new RateLimit(2, 1000, () => now, 1);
  expect(limit.take('a')).toBe(true);
  expect(limit.take('a')).toBe(true);
  expect(limit.take('a')).toBe(false);
  expect(limit.take('b')).toBe(false);
  now = 999; expect(limit.take('a')).toBe(false);
  now = 1000; expect(limit.take('b')).toBe(true);
});
