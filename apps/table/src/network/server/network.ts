import { Server, type Socket } from 'socket.io';
import {
  LobbyError, LOBBY_MESSAGE_LIMIT, type LobbySnapshot, type NetworkErrorCode,
  type ClientEvents, type ServerEvents,
} from '../protocol';
import type { RoundOptions } from './round.js';
import { LobbyService } from './lobby.js';
import { createAppServer } from './server.js';
import { RateLimit } from './rate-limit.js';
import {Accounts,AccountError} from './accounts';
import {accountApi} from './account-api';

interface SocketState { userId?:string; expires: number; admitted: boolean; sent: string }
type GameSocket = Socket<ClientEvents, ServerEvents, Record<string, never>, SocketState>;
export interface NetworkOptions {
  accounts?:Accounts;
  /** Only trusted regression harnesses may bypass login. Never set by the production entry. */
  allowGuestForTests?:boolean;
  origins: readonly string[];
  now?: () => number;
  roundOptions?: RoundOptions;
  // Injectable for deterministic tests; production uses the defaults below.
  limits?: Partial<{ connections: number; handshakePerMinute: number; admissionPerMinute: number;
    eventsPerSecond: number; idleMs: number; sweepMs: number }>;
}
export function allowedOrigins(raw: string | undefined, production: boolean): string[] {
  const values = raw === undefined
    ? (production ? [] : ['http://127.0.0.1:5173', 'http://localhost:5173'])
    : raw.split(',').map(value => value.trim());
  if (!values.length || values.some(value => {
    try { const url = new URL(value); return !['http:', 'https:'].includes(url.protocol) || url.origin !== value; }
    catch { return true; }
  })) throw new Error('ALLOWED_ORIGINS must contain exact HTTP(S) origins without paths');
  return [...new Set(values)];
}
export function createNetworkServer(options: NetworkOptions) {
  const origins = allowedOrigins(options.origins.join(','), true);
  const now = options.now ?? Date.now;
  const limits = { connections: 8, handshakePerMinute: 30, admissionPerMinute: 20,
    eventsPerSecond: 20, idleMs: 15_000, sweepMs: 1000, ...options.limits };
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid network limit');
  }
  const lobby = new LobbyService(now, options.roundOptions);
  const accounts=options.accounts??new Accounts();
  const http = createAppServer({ origins, gameReady: true,handler:accountApi(accounts,token=>{for(const socket of io.sockets.sockets.values())if(socket.handshake.auth.token===token){lobby.temporaryAway(socket.id);socket.emit('account:expired');socket.disconnect(true);}}, {room:id=>lobby.accountStatus(id),away:id=>{lobby.awayAccount(id);for(const socket of io.sockets.sockets.values())if(socket.data.userId===id){socket.emit('session:replaced');socket.disconnect(true);}},revoke:id=>{for(const socket of io.sockets.sockets.values())if(socket.data.userId===id){lobby.temporaryAway(socket.id);socket.emit('account:expired');socket.disconnect(true);}}}) });
  const handshake = new RateLimit(limits.handshakePerMinute, 60_000, now);
  const admission = new RateLimit(limits.admissionPerMinute, 60_000, now);
  const io = new Server<ClientEvents, ServerEvents, Record<string, never>, SocketState>(http, {
    serveClient: false, maxHttpBufferSize: LOBBY_MESSAGE_LIMIT,
    cors: { origin: origins, methods: ['GET', 'POST'] },
    connectTimeout: 10_000, pingInterval: 10_000, pingTimeout: 10_000,
    // CORS alone does not restrict WebSocket; validate Origin at the handshake too.
    allowRequest: (request, done) => {
      const origin = request.headers.origin;
      const address = request.socket.remoteAddress ?? 'unknown';
      // Forwarded headers are deliberately not trusted (including behind local Nginx).
      const allowed = typeof origin === 'string' && origins.includes(origin)
        && handshake.take(address) && io.engine.clientsCount < limits.connections;
      done(null, allowed);
    },
  });
  let closing = false;
  function snapshot(socket: GameSocket): LobbySnapshot | null {
    try { return lobby.snapshot(socket.id); }
    catch (error) {
      if (error instanceof LobbyError && error.code === 'INVALID_SESSION') return null;
      throw error;
    }
  }
  function publish(): void {
    for (const socket of io.sockets.sockets.values()) {
      if(!options.allowGuestForTests){try{lobby.updateProfile(accounts.authenticate(socket.handshake.auth.token));}catch{lobby.temporaryAway(socket.id);socket.emit('account:expired');socket.disconnect(true);continue;}}
      const view = snapshot(socket);
      if (!view) continue;
      const version = `${view.roomId}:${view.version}`;
      if (socket.data.sent !== version) {
        socket.data.sent = version;
        socket.emit('lobby:snapshot', view);
      }
    }
  }
  io.use((_socket, next) => {
    if (closing || io.sockets.sockets.size >= limits.connections) return next(new Error('CONNECTION_LIMIT'));
    next();
  });
  io.on('connection', socket => {
    socket.data = { expires: now() + limits.idleMs, admitted: false, sent: '' };
    try{socket.data.userId=accounts.authenticate(socket.handshake.auth.token).id}catch{/* anonymous test/denial socket */}
    const events = new RateLimit(limits.eventsPerSecond, 1000, now, 1);
    socket.use((packet, next) => {
      const ack = packet[packet.length - 1] as unknown;
      const respond = (error: NetworkErrorCode) => {
        if (typeof ack === 'function') ack({ ok: false, error, snapshot: snapshot(socket) });
      };
      if (!events.take('socket')) { respond('RATE_LIMITED'); return; }
      if (!['lobby:admit', 'lobby:command', 'lobby:sync', 'game:action'].includes(packet[0])) {
        respond('INVALID_EVENT'); return;
      }
      if (packet.length !== 3 || typeof ack !== 'function') {
        respond('INVALID_MESSAGE'); return;
      }
      next();
    });
    function run<T>(action: () => T, ack: (reply: { ok: true; data: T } | {
      ok: false; error: NetworkErrorCode; snapshot: LobbySnapshot | null;
    }) => void): void {
      try { if(!options.allowGuestForTests)accounts.authenticate(socket.handshake.auth.token);ack({ ok: true, data: action() }); }
      catch (error) {
        // Never send stack traces, exception text, request contents or tokens.
        ack({ ok: false, error: error instanceof LobbyError ? error.code : error instanceof AccountError?'AUTH_REQUIRED':'INTERNAL_ERROR', snapshot: snapshot(socket) });
      }
      publish();
    }
    socket.on('lobby:admit', (input, ack) => {
      if (!admission.take(socket.handshake.address)) {
        ack({ ok: false, error: 'RATE_LIMITED', snapshot: snapshot(socket) }); return;
      }
      run(() => {
        const reply = lobby.admit(socket.id, input,options.allowGuestForTests?undefined:accounts.authenticate(socket.handshake.auth.token));
        socket.data.admitted = true;
        if (reply.replacedConnection) {
          const old = io.sockets.sockets.get(reply.replacedConnection);
          old?.emit('session:replaced');
          old?.disconnect(true);
        }
        // replacedConnection is internal metadata, not part of the wire response.
        return { token: reply.token, snapshot: reply.snapshot };
      }, ack);
    });
    socket.on('lobby:command', (input, ack) => run(() => {
      const reply = lobby.command(socket.id, input);
      if (!reply.snapshot) {
        socket.data.admitted = false;
        socket.data.sent = '';
        socket.data.expires = now() + limits.idleMs;
      }
      return reply;
    }, ack));
    socket.on('game:action', (input, ack) => run(() => lobby.gameCommand(socket.id, input), ack));
    socket.on('lobby:sync', (input, ack) => run(() => {
      if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).length !== 1 || input.protocolVersion !== 1) throw new LobbyError('INVALID_MESSAGE');
      return lobby.snapshot(socket.id);
    }, ack));
    socket.on('disconnect', () => {
      lobby.disconnect(socket.id);
      if (!closing) publish();
    });
  });
  const timer = setInterval(() => {
    lobby.advance(); handshake.sweep(); admission.sweep();
    for (const socket of io.sockets.sockets.values()) {
      if (!socket.data.admitted && now() >= socket.data.expires) socket.disconnect(true);
    }
    publish();
  }, limits.sweepMs);
  timer.unref();
  let closePromise: Promise<void> | undefined;
  return { http, close(): Promise<void> {
    if (!closePromise) {
      closing = true; clearInterval(timer);
      closePromise = new Promise((resolve, reject) => io.close(error => {
        if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
        else resolve();
      }));
    }
    return closePromise;
  } };
}
