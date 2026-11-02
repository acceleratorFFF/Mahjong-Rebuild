import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import {
  LobbyError, parseAdmission, parseLobbyCommand, parseGameCommand,
  type LobbySeat, type LobbySnapshot, type LobbyCommand,
} from '../protocol';

import { AuthoritativeRound, type RoundOptions } from './round.js';
import {Match,MatchError} from './match';
import type {PublicAccount,AvatarId} from '../../account/contracts';

interface Receipt { fingerprint: string; version: number }
interface Human {
  userId:string;avatar:AvatarId;
  nickname: string; token: string; connection: string | null; ready: boolean;
  disconnectedAt: number | null; takenOver: boolean; autoplay:boolean; admission: string; receipts: Map<string, Receipt>;
}
interface Bot { bot: true }
type Occupant = Human | Bot;
interface Room { id: string; code: string; version: number; host: LobbySeat; seats: (Occupant | null)[]; game: AuthoritativeRound | null; round: number; dealer: LobbySeat; settled: boolean;totals:number[];match:Match|null;totalRounds:4|8 }
export interface AdmissionReply { token: string; snapshot: LobbySnapshot; replacedConnection: string | null }
export interface CommandReply { commandId: string; appliedVersion: number; duplicate: boolean; snapshot: LobbySnapshot | null }
const GRACE_MS = 60_000;
const RECEIPT_LIMIT = 128;
function human(value: Occupant | null | undefined): value is Human { return !!value && !('bot' in value); }
function fail(code: ConstructorParameters<typeof LobbyError>[0]): never { throw new LobbyError(code); }

/** Synchronous, transport-independent room and game owner. Never trust a client seat/actor. */
export class LobbyService {
  private room: Room | null = null;
  constructor(private readonly now: () => number = Date.now, private readonly roundOptions: RoundOptions = {}) {}

  admit(connection: string, input: unknown,identity?:PublicAccount): AdmissionReply {
    const request = parseAdmission(input);
    this.sweep();
    const fingerprint = JSON.stringify(request);
    const existing = this.findConnection(connection);
    if (existing && existing.player.admission === fingerprint) {
      return { token: existing.player.token, snapshot: this.snapshot(connection), replacedConnection: null };
    }
    if (existing) return fail('ALREADY_SEATED');
    const accountSeat=identity&&this.room?.seats.find(p=>human(p)&&p.userId===identity.id);
    if(request.type==='recover'&&!accountSeat)return fail('ROOM_NOT_FOUND');
    if (request.type === 'resume'||accountSeat) {
      const room = this.room;
      if (!room || (request.type==='resume'&&room.id!==request.roomId)) return fail('INVALID_SESSION');
      const player = request.type==='resume'?room.seats.find(p => human(p) && p.token === request.token):accountSeat;
      if (!human(player)||(identity&&player.userId!==identity.id)) return fail('INVALID_SESSION');
      const replacedConnection = player.connection;
      player.connection = connection;
      player.disconnectedAt = null;
      player.takenOver = false;
      if(identity){player.nickname=identity.nickname;player.avatar=identity.avatar;room.match?.updateProfile(identity.id,identity.nickname,identity.avatar);}
      player.admission = fingerprint;
      room.version++;
      this.reassignHost(room);
      return { token: player.token, snapshot: this.snapshot(connection), replacedConnection };
    }
    if (request.type === 'create') {
      if (this.room) return fail('ROOM_EXISTS');
      this.room = { id: randomUUID(), code: String(randomInt(100000, 1000000)), version: 0,
        host: 0, seats: [null, null, null, null], game: null, round: 0, dealer: this.roundOptions.firstDealer??randomInt(4) as LobbySeat, settled: false,totals:[0,0,0,0],match:null,totalRounds:8 };
    }
    const room = this.room;
    if (!room || (request.type === 'join' && request.roomCode !== room.code)) return fail('ROOM_NOT_FOUND');
    if (room.game||room.match) return fail('WRONG_PHASE');
    const seat = room.seats.findIndex(p => p === null);
    if (seat < 0) return fail('ROOM_FULL');
    const token = randomBytes(32).toString('hex');
    room.totals=[0,0,0,0];
    room.seats[seat] = { userId:identity?.id??randomUUID(),avatar:identity?.avatar??'lotus',nickname: identity?.nickname??('nickname'in request?request.nickname:'玩家'), token, connection, ready: false,
      disconnectedAt: null, takenOver: false,autoplay:false, admission: fingerprint, receipts: new Map() };
    room.version++;
    this.reassignHost(room);
    return { token, snapshot: this.snapshot(connection), replacedConnection: null };
  }

  command(connection: string, input: unknown): CommandReply {
    const command = parseLobbyCommand(input);
    this.sweep();
    const binding = this.findConnection(connection);
    if (!binding || !this.room) return fail('INVALID_SESSION');
    const room = this.room;
    if (command.roomId !== room.id) return fail('ROOM_NOT_FOUND');
    const fingerprint = JSON.stringify(command);
    const receipt = binding.player.receipts.get(command.commandId);
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) return fail('COMMAND_ID_REUSED');
      return { commandId: command.commandId, appliedVersion: receipt.version, duplicate: true,
        snapshot: this.snapshot(connection) };
    }
    if (command.expectedVersion !== room.version) return fail('STALE_VERSION');
    this.apply(room, binding.seat, binding.player, command);
    const version = ++room.version;
    binding.player.receipts.set(command.commandId, { fingerprint, version });
    if (binding.player.receipts.size > RECEIPT_LIMIT) {
      binding.player.receipts.delete(binding.player.receipts.keys().next().value!);
    }
    return { commandId: command.commandId, appliedVersion: version, duplicate: false,
      snapshot: command.type === 'leave' ? null : this.snapshot(connection) };
  }

  private apply(room: Room, seat: LobbySeat, player: Human, command: LobbyCommand): void {
    if(command.type==='configure-match'){
      if(room.host!==seat)return fail('NOT_HOST');if(room.match||room.game)return fail('WRONG_PHASE');
      room.totalRounds=command.totalRounds;for(const p of room.seats)if(human(p))p.ready=false;return;
    }
    if(command.type==='new-match'){
      if(room.host!==seat)return fail('NOT_HOST');if(!room.match?.finished)return fail('WRONG_PHASE');
      room.match=null;room.game=null;room.round=0;room.settled=false;room.totals=[0,0,0,0];room.dealer=this.roundOptions.firstDealer??randomInt(4) as LobbySeat;
      for(const p of room.seats)if(human(p)){p.ready=false;p.autoplay=false;}return;
    }
    if(command.type==='end-request'||command.type==='end-vote'){
      if(!room.match||(room.game&&!room.game.ended))return fail('WRONG_PHASE');
      try{if(command.type==='end-request')room.match.requestEnd(seat,this.online(room),this.now());else room.match.castVote(seat,command.voteId,command.agree,this.online(room),this.now());}
      catch(e){if(e instanceof MatchError)throw new LobbyError(e.message as ConstructorParameters<typeof LobbyError>[0]);throw e;}return;
    }
    if(command.type==='leave'&&room.match&&!room.match.finished){this.temporaryAway(player.connection!);return;}
    if(command.type==='autoplay'){
      if(!room.game||room.game.ended)return fail('WRONG_PHASE');
      if(command.gameId!==room.game.view(seat).gameId)return fail('WRONG_GAME');
      player.autoplay=command.enabled;return;
    }
    if (command.type === 'start') {
      if (room.host !== seat) return fail('NOT_HOST');
      if (room.game) return fail('WRONG_PHASE');
      if (!this.snapshot(player.connection!).canStart) return fail('NOT_READY');
      for(const p of room.seats)if(human(p)){p.autoplay=false;p.takenOver=false;}
      if(!room.match)room.match=new Match(room.totalRounds,seat,room.seats.map((p,i)=>({seat:i,id:human(p)?p.userId:`bot:${i}`,nickname:human(p)?p.nickname:`机器人${i+1}`,avatar:human(p)?p.avatar:'lotus',bot:!human(p)})));
      room.game = new AuthoritativeRound(room.dealer, this.now, this.roundOptions);
      room.round++; room.settled = false;
      return;
    }
    if (command.type === 'next-round') {
      if (room.host !== seat) return fail('NOT_HOST');
      if(room.match?.finished)return fail('MATCH_FINISHED');
      if (!room.game?.ended) return fail('WRONG_PHASE');
      if(room.match?.snapshot().vote)return fail('NOT_READY');
      room.dealer = room.game.nextDealer;
      for(const occupant of room.seats)if(human(occupant)){
        occupant.ready=false;occupant.takenOver=false;occupant.autoplay=occupant.connection===null;
      }
      room.game = new AuthoritativeRound(room.dealer,this.now,this.roundOptions);
      room.round++;room.settled=false;
      return;
    }
    if (room.game && (command.type !== 'leave' || !room.game.ended)) return fail('WRONG_PHASE');
    if (command.type === 'ready') { player.ready = command.ready; return; }
    if (command.type === 'fill-bots' || command.type === 'remove-bots') {
      if (room.host !== seat) return fail('NOT_HOST');
      if(room.match){
        const changes=room.seats.some(p=>command.type==='fill-bots'?p===null:p!==null&&!human(p));
        if(changes)return fail('WRONG_PHASE');return;
      }
      let changed=false;
      for (let i = 0; i < 4; i++) {
        const occupant = room.seats[i];
        if (command.type === 'fill-bots' && occupant === null) {room.seats[i] = { bot: true };changed=true;}
        if (command.type === 'remove-bots' && occupant && !human(occupant)) {room.seats[i] = null;changed=true;}
      }
      if(changed)room.totals=[0,0,0,0];
      return;
    }
    room.seats[seat] = null;
    if(!room.match)room.totals=[0,0,0,0];
    this.reassignHost(room);
  }

  disconnect(connection: string): void {
    const binding = this.findConnection(connection);
    if (!binding || !this.room) return;
    binding.player.connection = null;
    binding.player.takenOver = false;
    binding.player.ready = false;
    binding.player.disconnectedAt = this.now();
    this.room.version++;
    this.reassignHost(this.room);
  }

  gameCommand(connection: string, input: unknown): CommandReply {
    const request = parseGameCommand(input);
    this.sweep();
    const binding = this.findConnection(connection);
    if (!binding || !this.room) return fail('INVALID_SESSION');
    const room = this.room;
    if (request.roomId !== room.id) return fail('ROOM_NOT_FOUND');
    if (!room.game) return fail('WRONG_PHASE');
    const ack = room.game.submit(binding.seat, request,!binding.player.autoplay&&!binding.player.takenOver);
    if (!ack.duplicate) room.version++;
    this.finishRound(room);
    return { commandId: request.commandId, ...ack, snapshot: this.snapshot(connection) };
  }

  /** One automatic operation per tick; all game mutations stay synchronous. */
  advance(): void {
    this.sweep();
    const room = this.room;
    if (!room?.game || room.game.ended) return;
    const controlled = room.seats.flatMap((p, i) => p && (!human(p) || p.takenOver||p.autoplay) ? [i as LobbySeat] : []);
    if (room.game.advance(controlled)) room.version++;
    this.adoptTimeouts(room);
    this.finishRound(room);
  }

  private finishRound(room: Room): void {
    if (!room.game?.ended || room.settled) return;
    room.settled = true; room.version++;
    const result=room.game.view(0).result!;
    if(room.match){room.match.record({eventId:result.eventId,gameId:room.game.view(0).gameId,deltas:[...result.deltas],draw:result.type==='draw'});room.totals=room.match.snapshot().totals;}
    else result.deltas.forEach((delta,i)=>{room.totals[i]+=delta});
    for (let i = 0; i < 4; i++) {
      const player = room.seats[i];
      if (!human(player)) continue;
      player.ready = false;
      player.autoplay=false;
      if (player.connection === null) player.disconnectedAt=this.now();
    }
    this.reassignHost(room);
  }

  /** Transport must call periodically; methods also sweep before accepting commands. */
  private adoptTimeouts(room:Room){for(const seat of room.game?.takeTimedOut()??[]){const p=room.seats[seat];if(human(p)&&!p.autoplay){p.autoplay=true;room.version++;}}}
  private online(room:Room){return room.seats.flatMap((p,i)=>human(p)&&p.connection!==null?[i]:[]);}
  temporaryAway(connection:string){const b=this.findConnection(connection);if(b&&this.room?.match&&!this.room.match.finished)b.player.autoplay=true;this.disconnect(connection);}
  accountStatus(id:string){this.sweep();const room=this.room;if(!room||!room.seats.some(p=>human(p)&&p.userId===id))return null;return {roomCode:room.code,active:!!room.match&&!room.match.finished,inMatch:!!room.match&&!room.match.finished};}
  awayAccount(id:string){const p=this.room?.seats.find(p=>human(p)&&p.userId===id);if(human(p)){p.autoplay=!!this.room?.match&&!this.room.match.finished;if(p.connection)this.temporaryAway(p.connection);}}
  updateProfile(user:PublicAccount){const room=this.room;if(!room)return;const p=room.seats.find(p=>human(p)&&p.userId===user.id);if(human(p)&&(p.nickname!==user.nickname||p.avatar!==user.avatar)){p.nickname=user.nickname;p.avatar=user.avatar;room.match?.updateProfile(user.id,user.nickname,user.avatar);room.version++;}}
  sweep(): void {
    const room = this.room;
    if (!room) return;
    const now = this.now();
    if(room.match?.sweep(this.online(room),now))room.version++;
    if (room.game && !room.game.ended) {
      const humans = room.seats.filter(human);
      if (!room.match && humans.length && humans.every(p => p.connection === null)
        && now - Math.max(...humans.map(p => p.disconnectedAt!)) >= 300_000) {
        this.room = null; return;
      }
      for (const player of humans) {
        if (player.disconnectedAt !== null && !player.takenOver && now - player.disconnectedAt >= GRACE_MS) {
          player.takenOver = true; room.version++;
        }
      }
      if (room.game.expire()) room.version++;
      this.adoptTimeouts(room);
      this.finishRound(room);
      return;
    }
    let changed = false;
    for (let i = 0; i < 4; i++) {
      const p = room.seats[i];
      if (!room.match&&human(p) && p.disconnectedAt !== null && now - p.disconnectedAt >= GRACE_MS) {
        room.seats[i] = null; changed = true;
      }
    }
    if (changed) { room.version++; this.reassignHost(room); }
  }

  snapshot(connection: string): LobbySnapshot {
    this.sweep();
    const binding = this.findConnection(connection);
    if (!binding || !this.room) return fail('INVALID_SESSION');
    const room = this.room;
    return {
      protocolVersion: 1, roomId: room.id, roomCode: room.code, version: room.version, serverNow: this.now(),
      match:room.match?.snapshot()??null,totalRounds:room.totalRounds,
      phase: room.game ? (room.game.ended ? 'settled' : 'playing') : 'waiting',
      game: room.game ? { round: room.round, view: room.game.view(binding.seat),table:room.game.display(binding.seat,room.round,room.totals,binding.player.autoplay||binding.player.takenOver) } : null,
      hostSeat: room.host, selfSeat: binding.seat,
      seats: room.seats.map((p, i) => p === null ? null : {
          seat: i as LobbySeat, nickname: human(p) ? p.nickname : `机器人${i + 1}`,avatar:human(p)?p.avatar:'lotus',
        bot: !human(p), connected: human(p) ? p.connection !== null : true,
        ready: human(p) ? p.ready : true, autoplay: !human(p) || p.takenOver||p.autoplay,
      }),
      canStart: !room.game && !room.match?.finished && !room.match?.snapshot().vote && room.seats.filter(human).length >= 2
        && room.seats.every((p,i) => p !== null && (!human(p) || (p.connection !== null && (i === room.host || p.ready)))),
    };
  }

  private findConnection(connection: string): { seat: LobbySeat; player: Human } | null {
    const index = this.room?.seats.findIndex(p => human(p) && p.connection === connection) ?? -1;
    const player = this.room?.seats[index];
    return index >= 0 && human(player) ? { seat: index as LobbySeat, player } : null;
  }

  private reassignHost(room: Room): void {
    const humans = room.seats.flatMap((p, i) => human(p) ? [{ seat: i as LobbySeat, player: p }] : []);
    if (!humans.length) { this.room = null; return; }
    const current = room.seats[room.host];
    if (human(current) && current.connection !== null) return;
    room.host = (humans.find(p => p.player.connection !== null) ?? humans[0]!).seat;
  }
}
