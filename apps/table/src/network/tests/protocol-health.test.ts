import { it, expect } from 'vitest';
import { isHealthResponse } from '../protocol/index';
it('rejects incompatible or incomplete health payloads', () => {
    for (const value of [null, {}, { status: 'ok' }, { status: 'ok', service: 'mahjong-server', protocolVersion: 2, gameReady: false }]) expect(isHealthResponse(value)).toBe(false);
  });
