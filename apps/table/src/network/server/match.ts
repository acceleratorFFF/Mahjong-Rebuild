import type {MatchMember,MatchEntry,EndVote,MatchSnapshot} from '../protocol/match'
export type {MatchMember,MatchEntry,EndVote,MatchSnapshot} from '../protocol/match'
import {randomUUID} from 'node:crypto'
import type {AvatarId} from '../../account/contracts'
export class MatchError extends Error {}
export class Match {
 readonly id=randomUUID();private entries:MatchEntry[]=[];private totals=[0,0,0,0];private state:MatchSnapshot['state']='active';private vote:EndVote|null=null
 constructor(readonly totalRounds:4|8,readonly ownerSeat:number,private members:MatchMember[]){if(![4,8].includes(totalRounds)||members.length!==4||new Set(members.map(m=>m.id)).size!==4||members.some((m,i)=>m.seat!==i))throw new MatchError('INVALID_MATCH')}
 updateProfile(id:string,nickname:string,avatar:AvatarId){this.members=this.members.map(m=>m.id===id?{...m,nickname,avatar}:m)}
 get finished(){return this.state!=='active'}
 record(entry:MatchEntry){const prior=this.entries.find(e=>e.eventId===entry.eventId||e.gameId===entry.gameId);if(prior){if(JSON.stringify(prior)!==JSON.stringify(entry))throw new MatchError('COMMAND_ID_REUSED');return false}if(this.finished)throw new MatchError('MATCH_FINISHED');if(entry.deltas.length!==4||entry.deltas.some(n=>!Number.isSafeInteger(n))||entry.deltas.reduce((a,b)=>a+b,0)!==0)throw new MatchError('INVALID_MATCH');this.entries.push(structuredClone(entry));entry.deltas.forEach((n,i)=>this.totals[i]+=n);if(this.entries.length===this.totalRounds)this.state='completed';return true}
 private end(){this.state='early';this.vote=null}
 requestEnd(seat:number,online:number[],now:number){if(this.finished)throw new MatchError('MATCH_FINISHED');if(!online.includes(seat))throw new MatchError('INVALID_SESSION');if(seat===this.ownerSeat){this.end();return}if(online.includes(this.ownerSeat))throw new MatchError('NOT_HOST');if(this.vote)throw new MatchError('VOTE_PENDING');this.vote={id:randomUUID(),eligible:[...online],agreed:[seat],expiresAt:now+30000,requestedBy:seat};if(online.length===1)this.end()}
 castVote(seat:number,id:string,agree:boolean,online:number[],now:number){if(this.finished)throw new MatchError('MATCH_FINISHED');if(this.sweep(online,now)||!this.vote)throw new MatchError('VOTE_EXPIRED');if(this.vote.id!==id||!this.vote.eligible.includes(seat)||this.vote.agreed.includes(seat))throw new MatchError('ILLEGAL_ACTION');if(!agree){this.vote=null;return}this.vote.agreed.push(seat);if(this.vote.eligible.every(i=>this.vote!.agreed.includes(i)))this.end()}
 sweep(online:number[],now:number){if(this.vote&&(now>=this.vote.expiresAt||this.vote.eligible.join(',')!==online.join(','))){this.vote=null;return true}return false}
 snapshot():MatchSnapshot{return structuredClone({id:this.id,totalRounds:this.totalRounds,completed:this.entries.length,state:this.state,ownerSeat:this.ownerSeat,totals:this.totals,members:this.members,entries:this.entries,vote:this.vote,ranking:this.totals.map((score,seat)=>({seat,score,rank:1+this.totals.filter(n=>n>score).length})).sort((a,b)=>b.score-a.score||a.seat-b.seat)})}
}
