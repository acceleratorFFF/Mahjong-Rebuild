import {accountUrl} from '../network/endpoint'
export const AVATAR_IDS=['lotus','ah-lok','shisan','young-master'] as const
export type AvatarId=string
export interface AvatarOption {id:string;name:string;source:string;enabled:boolean;order:number;builtin:boolean}
export interface PublicAccount {id:string;username:string;nickname:string;avatar:AvatarId;admin?:boolean}
export interface AccountSession {token:string;user:PublicAccount}
export const ACCOUNT_KEY='macheng-account-v1'
export function avatarUrl(id:string){return /^avatar-[a-f0-9-]{36}$/.test(id)?accountUrl(`avatar/${id}`):`${import.meta.env.BASE_URL}avatars/${AVATAR_IDS.includes(id as never)?id:'lotus'}.svg`}
