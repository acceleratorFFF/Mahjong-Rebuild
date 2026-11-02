export const PROTOCOL_VERSION = 1 as const;
export interface HealthResponse {
  readonly status: 'ok';
  readonly service: 'mahjong-server';
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly gameReady: boolean;
}
export function isHealthResponse(value: unknown): value is HealthResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.status === 'ok' && v.service === 'mahjong-server'
    && v.protocolVersion === PROTOCOL_VERSION && typeof v.gameReady === 'boolean';
}
export * from './lobby.js';
// Room and authoritative game contracts share the same versioned transport.

export * from './transport.js';
