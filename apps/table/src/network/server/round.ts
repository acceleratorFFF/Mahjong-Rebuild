import { randomUUID, randomInt } from 'node:crypto';
import { createGame, applyCommand, expireGame, playerView, assertConservation, RuleError, SEATS,
  type Game, type Seat, type Tile } from '../../game/variants/macheng/core';
import {chooseBotAction} from '../../game/variants/macheng/core/bot';
import { LobbyError, type GameCommand } from '../protocol';
import {createPublicEvents} from '../../game/variants/macheng/host/publicEvents';
import type {LocalSnapshot} from '../../game/variants/macheng/host/localSession';
export interface RoundOptions { random?: () => number; botDelay?: number; deck?: readonly Tile[];firstDealer?:Seat }
/** Owns all hidden state. Public callers receive only playerView projections. */
export class AuthoritativeRound {
  private game: Game;
  private nextBotAt: number;
  private serial = 0;
  private timedOut:Seat[]=[];
  private readonly botDelay: number;
  private readonly events=SEATS.map(seat=>createPublicEvents(seat));
  constructor(dealer: Seat, private readonly now: () => number, options: RoundOptions = {}) {
    this.botDelay = options.botDelay ?? 450;
    this.game = createGame({ id: randomUUID(), dealer, ...(options.deck ? { deck: options.deck } : {}) }, { now, random: options.random ?? (() => randomInt(0x100000000) / 0x100000000) });
    this.nextBotAt = now() + this.botDelay;
    assertConservation(this.game);this.events.forEach(e=>e.reset(this.game));
  }
  get ended(): boolean { return this.game.phase === 'ended'; }
  get version(): number { return this.game.version; }
  get nextDealer(): Seat { return this.game.result?.nextDealer ?? this.game.dealer; }
  view(seat: Seat) { return playerView(this.game, seat); }
  private commit(next:Game){assertConservation(next);this.events.forEach(e=>e.accept(this.game,next));this.game=next;}
  display(seat:Seat,round:number,totals:number[],autoplay=false):LocalSnapshot{
    const g=this.game,p=this.events[seat].snapshot();
    return {view:this.view(seat),localSeat:seat,round,totals:[...totals],autoplay,notice:autoplay?'已开启托管，可随时取消。':'',now:this.now(),started:true,
      ...p,presentation:p,ownDrawnId:g.lastDraw?.seat===seat?g.lastDraw.tileId:null,
      roundEndPlayers:g.phase==='ended'?SEATS.map(s=>playerView(g,s).players[s]):null,
      conservation:{total:136,unique:136,valid:true}};
  }
  expire(): boolean {
    const previous = this.game;
    const expired=this.game.phase==='ended'||this.now()<this.game.deadline?[]:this.game.pending?this.game.pending.eligible.filter(s=>!this.game.pending!.responses[s]):[this.game.turn];
    this.commit(expireGame(this.game, this.now()));
    if(this.game!==previous)this.timedOut.push(...expired);
    if (this.game !== previous) this.nextBotAt = this.now() + this.botDelay;
    return this.game !== previous;
  }
  takeTimedOut():Seat[]{const seats=[...new Set(this.timedOut)];this.timedOut=[];return seats;}
  submit(seat: Seat, request: GameCommand,manualAllowed=true) {
    const before = this.game;
    const commandId = `human:${seat}:${request.commandId}`;
    if(!manualAllowed&&!this.game.log.some(e=>e.command.commandId===commandId))throw new LobbyError('ILLEGAL_ACTION');
    try {
      this.commit(applyCommand(this.game, { commandId, gameId: request.gameId, actor: seat,
        expectedVersion: request.expectedVersion, ...(request.windowId ? { windowId: request.windowId } : {}), action: request.action }, this.now()));
    } catch (error) {
      if (!(error instanceof RuleError)) throw error;
      const codes = ['WRONG_GAME', 'STALE_VERSION', 'STALE_WINDOW', 'ILLEGAL_ACTION', 'GAME_ENDED', 'DEADLINE_PASSED', 'COMMAND_ID_REUSED'] as const;
      throw new LobbyError(codes.find(code => code === error.code) ?? 'ILLEGAL_ACTION');
    }
    const duplicate = before === this.game;
    if (!duplicate) this.nextBotAt = this.now() + this.botDelay;
    // Every logged rule command advances exactly one version, including timeouts.
    return { duplicate, appliedVersion: this.game.log.findIndex(entry => entry.command.commandId === commandId) + 1 };
  }
  advance(controlled: readonly Seat[]): boolean {
    if (this.ended) return false;
    if (this.expire()) return true;
    if (this.now() < this.nextBotAt) return false;
    for (const seat of this.game.phase === 'response' ? SEATS : [this.game.turn]) {
      if (!controlled.includes(seat)) continue;
      const view = this.view(seat);
      const action = chooseBotAction(view, seat);
      if (!action) continue;
      this.commit(applyCommand(this.game, { gameId: this.game.id, commandId: `bot:${++this.serial}`, actor: seat,
        expectedVersion: view.response?.version ?? view.version,
        ...(view.response ? { windowId: view.response.id } : {}), action }, this.now()));
      this.nextBotAt = this.now() + this.botDelay;
      return true;
    }
    return false;
  }
}
