import type {AvatarId} from '../../account/contracts'
export interface MatchMember {seat:number;id:string;nickname:string;avatar:AvatarId;bot:boolean}
export interface MatchEntry {eventId:string;gameId:string;deltas:number[];draw:boolean}
export interface EndVote {id:string;eligible:number[];agreed:number[];expiresAt:number;requestedBy:number}
export interface MatchSnapshot {id:string;totalRounds:4|8;completed:number;state:'active'|'completed'|'early';ownerSeat:number;totals:number[];members:MatchMember[];entries:MatchEntry[];vote:EndVote|null;ranking:{seat:number;rank:number;score:number}[]}
