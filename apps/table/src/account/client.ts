import {shallowRef} from 'vue'
import {ACCOUNT_KEY,type PublicAccount,type AccountSession} from './contracts'
import {accountUrl} from '../network/endpoint'
export const currentAccount=shallowRef<PublicAccount|null>(null)
export const accessToken=()=>sessionStorage.getItem(ACCOUNT_KEY)??''
export async function accountRequest(endpoint:string,body?:object){
 const r=await fetch(accountUrl(endpoint),{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:`Bearer ${accessToken()}`},...(body?{body:JSON.stringify(body)}:{})});const v=await r.json();if(!r.ok)throw Error(v.error??'ACCOUNT_UNAVAILABLE');return v
}
export function acceptSession(session:AccountSession){sessionStorage.setItem(ACCOUNT_KEY,session.token);currentAccount.value=session.user}
