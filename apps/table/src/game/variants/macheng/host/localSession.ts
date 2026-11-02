import { createGame, applyCommand, expireGame, playerView, assertConservation, RuleError, SEATS, type Action, type Seat, type RuleEnvironment, type Game, type Command } from '../core';
import { chooseBotAction, type PlayerView } from '../core/bot';
import {createPublicEvents} from './publicEvents';
import type {ManualSnapshot} from './manualSession';

export interface ActionTicket { gameId: string; version: number; windowId?: string }
export function actionTicket(view: PlayerView): ActionTicket {
  return { gameId: view.gameId, version: view.response?.version ?? view.version, ...(view.response ? { windowId: view.response.id } : {}) };
}
export interface LocalSnapshot extends ManualSnapshot { roundEndPlayers:ReturnType<typeof playerView>['players']|null;round: number; totals: number[]; autoplay: boolean; notice: string; now:number; started:boolean; presentation:ReturnType<ReturnType<typeof createPublicEvents>['snapshot']> }
export interface LocalOptions extends RuleEnvironment { idPrefix: string; dealer?: Seat; botDelay?: number;localSeat?:Seat;initialGame?:Game;waitForReady?:boolean }

export function createLocalSession(options: LocalOptions) {
  const localSeat=options.localSeat??0,wallStart=options.now();let paused=!!options.waitForReady,pauseOffset=0;
  const fixtureOffset=options.initialGame?wallStart-options.initialGame.updatedAt:0;
  let disposedAt:number|undefined;
  const clock=()=> disposedAt??((paused?wallStart:options.now()-pauseOffset)-fixtureOffset);
  const env={random:options.random,now:clock};
  let round = 1;
  let game = options.initialGame?structuredClone(options.initialGame):createGame({ id: `${options.idPrefix}:${round}`, ...(options.dealer !== undefined ? { dealer: options.dealer } : {}) }, env);
  assertConservation(game);
  const events=createPublicEvents(localSeat);events.reset(game);
  let active = true;
  let autoplay = false;
  let serial = 0;
  let inspectedVersion = -1, inspectedAutoplay = false;
  let nextBotAt = clock() + (options.botDelay ?? 450);
  let settledId: string | null = null;
  const totals = [0, 0, 0, 0];
  let notice = '新的一局，祝你手气好。';
  const settle = () => {
    if (game.result && settledId !== game.result.eventId) {
      game.result.deltas.forEach((delta, i) => { totals[i]! += delta; });
      settledId = game.result.eventId;
    }
  };
  const snapshot = (): LocalSnapshot => {
    settle();
    assertConservation(game);
    const tiles=[...game.wall,...game.indicators,...game.players.flatMap(p=>[...p.hand,...p.discards,...p.specialKongs,...p.melds.flatMap(m=>m.tiles)]),...(game.result?.type==='win'&&game.result.claimedTile?[game.result.claimedTile]:[])];
    const presentation=events.snapshot();
    return { view: playerView(game, localSeat),roundEndPlayers:game.phase==='ended'?SEATS.map(seat=>playerView(game,seat).players[seat]):null,localSeat,round,totals:[...totals],autoplay,notice,now:clock(),started:!paused,
      ...presentation,ownDrawnId:game.lastDraw?.seat===localSeat?game.lastDraw.tileId:null,
      conservation:{total:tiles.length,unique:new Set(tiles.map(t=>t.id)).size,valid:true},presentation };
  };
  const commit=(next:Game)=>{assertConservation(next);events.accept(game,next);game=next;settle();};
  const expire=(now:number)=>{const ownExpired=game.phase!=='ended'&&now>=game.deadline&&(game.pending?game.pending.eligible.includes(localSeat)&&!game.pending.responses[localSeat]:game.turn===localSeat);commit(expireGame(game,now));if(ownExpired)autoplay=true;nextBotAt=now+(options.botDelay??450);};
  const send = (seat: Seat, action: Action, ticket: ActionTicket, now: number) => {
    commit(applyCommand(game, { gameId: ticket.gameId, commandId: `${options.idPrefix}:cmd:${++serial}`, actor: seat,
      expectedVersion: ticket.version, ...(ticket.windowId ? { windowId: ticket.windowId } : {}), action }, now));
    nextBotAt = now + (options.botDelay ?? 450);
  };
  return {
    snapshot,
    startReady(){if(paused){pauseOffset=options.now()-wallStart;paused=false;nextBotAt=clock()+(options.botDelay??450);}},
    submitCommand(command:Command):boolean{
      if(!active||paused||autoplay||command.actor!==localSeat)return false;
      try{commit(applyCommand(game,command,clock()));nextBotAt=clock()+(options.botDelay??450);return true;}
      catch(error){if(!(error instanceof RuleError))throw error;return false;}
    },
    submit(action: Action, ticket: ActionTicket): boolean {
      if (!active || autoplay || paused) return false;
      const now = clock();
      if (game.phase !== 'ended' && now >= game.deadline) {
        expire(now); notice = '操作已超时，已按规则处理并开启托管。'; return false;
      }
      try { send(localSeat, action, ticket, now); notice = action.type === 'discard' ? '已出牌，等待其他玩家。' : '已提交操作。'; return true; }
      catch (error) {
        if (!(error instanceof RuleError)) throw error;
        notice = '牌局已更新，请按当前可选操作重新选择。'; return false;
      }
    },
    advance(): boolean {
      if (!active || paused || game.phase === 'ended') return false;
      const now = clock();
      if (now >= game.deadline) {
        expire(now); notice = autoplay?'超时已开启托管，可随时取消。':'超时已自动出牌或放弃响应。'; return true;
      }
      if (now < nextBotAt) return false;
      if (inspectedVersion === game.version && inspectedAutoplay === autoplay) return false;
      inspectedVersion = game.version; inspectedAutoplay = autoplay;
      const seats = game.phase === 'response' ? SEATS : [game.turn];
      for (const seat of seats) {
        if (seat === localSeat && !autoplay) continue;
        const view = playerView(game, seat);
        const action = chooseBotAction(view, seat);
        if (!action) continue;
        send(seat, action, actionTicket(view), now);
        notice = seat === localSeat ? '正在为你托管本局。' : '牌友已行动。';
        return true;
      }
      return false;
    },
    setAutoplay(value: boolean) { if (active) { autoplay = value; notice = value ? '已开启托管，可随时接管。' : '已接管，请选择操作。'; } },
    nextRound(): boolean {
      if (!active || !game.result) return false;
      settle(); const dealer = game.result.nextDealer; round++;
      game = createGame({ id: `${options.idPrefix}:${round}`, dealer }, env);assertConservation(game);events.reset(game);
      autoplay = false; notice = '新的一局，祝你手气好。'; nextBotAt = clock() + (options.botDelay ?? 450);
      return true;
    },
    dispose() { disposedAt=clock();active = false; },
  };
}
