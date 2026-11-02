<script setup lang="ts">
import {ref,onMounted,type Component} from 'vue'
import '../menu/menu.css'
import {ACCOUNT_KEY} from './contracts'
import {currentAccount,accessToken,accountRequest,acceptSession} from './client'
defineProps<{page:Component}>()
const loading=ref(true),busy=ref(false),username=ref(''),password=ref(''),error=ref('')
const messages:Record<string,string>={INVALID_ACCOUNT:'请检查用户名和密码格式。',LOGIN_FAILED:'用户名或密码不正确。',RATE_LIMITED:'请求较多，请稍后重试。',AUTH_REQUIRED:'登录已失效，请重新登录。'}
onMounted(async()=>{try{if(accessToken())currentAccount.value=(await accountRequest('me')).user}catch{sessionStorage.removeItem(ACCOUNT_KEY);currentAccount.value=null}finally{loading.value=false}})
async function submit(){if(busy.value)return;busy.value=true;error.value='';try{acceptSession(await accountRequest('login',{username:username.value,password:password.value}));password.value=''}catch(e){error.value=messages[(e as Error).message]??'账号服务不可用，请先启动本地服务端。'}finally{busy.value=false}}
</script>
<template>
 <component :is="page" v-if="currentAccount&&!loading" />
 <main v-else class="account-gate menu-surface"><section class="menu-panel"><div class="login-brand"><img class="menu-title-small" src="/menu/title.png" alt="红中痞子杠"/><h1>红中痞子杠 · 登录</h1></div><p v-if="loading">正在检查登录状态…</p><form v-else @submit.prevent="submit">
 <label>用户名<input v-model="username" aria-label="用户名" autocomplete="username" maxlength="24" required /></label>
 <label>密码<input v-model="password" aria-label="密码" type="password" autocomplete="current-password" minlength="8" maxlength="72" required /></label>
 <p v-if="error" role="alert">{{error}}</p><button :disabled="busy" type="submit">{{busy?'处理中…':'登录'}}</button>
 
 </form></section></main>
</template>
<style scoped>
.account-gate{min-height:100dvh;color:#f8f3df;display:grid;place-items:center;padding:20px;box-sizing:border-box}.account-gate section{width:min(100%,500px);padding:24px;border:1px solid #b99b53;border-radius:12px;background:#123126;box-sizing:border-box}h1{font-size:24px}label{display:block;margin:12px 0}input{display:block;width:100%;box-sizing:border-box;padding:10px;margin-top:6px;background:#0b2019;color:#fff;border:1px solid #7f9479;border-radius:6px}button{padding:10px;margin:5px;border-radius:8px;border:1px solid #b99b53;background:#aa8234;color:white}p{line-height:1.6;font-size:13px}
</style>

<style scoped>
.account-gate .menu-title-small{max-width:100%}.account-gate h1{font-size:24px}.account-gate button{width:100%;margin:6px 0 0}.account-gate label{margin:12px 0}.account-gate input{font-size:16px}.account-gate p[role=alert]{margin:6px 0}
@media(max-height:540px) and (min-width:601px){.account-gate{padding:16px}.account-gate section{width:min(100%,760px);display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:30px;padding:22px 28px}.login-brand{text-align:center}.account-gate .menu-title-small{width:100%;margin:0 auto 16px}.account-gate h1{font-size:22px;margin:0}.account-gate form{min-width:0}.account-gate label{margin:8px 0}.account-gate input{min-height:44px;padding:9px;margin-top:4px}.account-gate p[role=alert]{font-size:12px}.account-gate button{min-height:44px}}
@media(max-width:600px){.account-gate section{padding:20px}.account-gate .menu-title-small{width:min(100%,330px);margin-bottom:14px}.account-gate h1{font-size:22px}}
</style>
