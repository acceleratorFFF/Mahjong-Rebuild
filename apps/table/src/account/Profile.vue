<script setup lang="ts">
import {LOCAL_SKIN_OPTIONS,skinPreviewEnabled,selectedTableSkin,setLocalTableSkin} from '../theme/localTableSkin'
import {ref,onMounted} from 'vue'
import {currentAccount,accountRequest} from './client'
import {AVATAR_IDS,ACCOUNT_KEY,avatarUrl,type AvatarOption} from './contracts'
const open=ref(false),nickname=ref(''),avatar=ref('lotus'),busy=ref(false),message=ref('')
const options=ref<AvatarOption[]>(AVATAR_IDS.map((id,i)=>({id,name:id,order:i,enabled:true,source:'',builtin:true})))
async function edit(){nickname.value=currentAccount.value?.nickname??'';avatar.value=currentAccount.value?.avatar??'lotus';message.value='';open.value=!open.value;if(open.value)try{const result=await accountRequest('avatars');options.value=result.avatars.filter((a:AvatarOption)=>a.enabled||a.id===avatar.value);if(result.currentAvatar&&!options.value.some(a=>a.id===avatar.value))options.value.push(result.currentAvatar)}catch{message.value='暂时无法读取头像库，请稍后重试。'}}
async function save(){busy.value=true;try{currentAccount.value=(await accountRequest('profile',{nickname:nickname.value,avatar:avatar.value})).user;open.value=false}catch{message.value='保存失败，头像可能已停用，请重新打开资料后选择。'}finally{busy.value=false}}
function manage(){location.href='?scene=admin'}
async function logout(){try{await accountRequest('logout',{})}finally{sessionStorage.removeItem(ACCOUNT_KEY);location.reload()}}
</script>
<template><div class="profile-control"><button @click="edit">个人资料</button><button v-if="currentAccount?.admin" @click="manage">管理账号</button><button @click="logout">退出登录</button><label v-if="skinPreviewEnabled" class="local-skin-setting">牌桌主题<select aria-label="设置牌桌主题" :value="selectedTableSkin" @change="setLocalTableSkin(($event.target as HTMLSelectElement).value)"><option v-for="option in LOCAL_SKIN_OPTIONS" :key="option.value" :value="option.value">{{option.label}}</option></select></label><form v-if="open" @submit.prevent="save"><label>显示名称<input v-model="nickname" aria-label="修改显示名称" maxlength="16" required /></label><div class="profile-avatars"><button v-for="item in options" :key="item.id" type="button" :aria-label="`资料头像 ${item.id}`" :aria-pressed="avatar===item.id" @click="avatar=item.id"><img :src="avatarUrl(item.id)" :alt="item.name" /></button></div><p role="status">{{message}}</p><button :disabled="busy">保存资料</button><button type="button" @click="open=false">取消</button></form></div></template>
<style scoped>
button{padding:8px;margin:4px;border:1px solid #b99b53;border-radius:6px;background:#aa8234;color:white;cursor:pointer}form{padding:12px;border:1px solid #7f9479;border-radius:8px;margin:12px 0}input{padding:8px;background:#0b2019;color:white;border:1px solid #7f9479;max-width:100%}.profile-avatars{display:flex;flex-wrap:wrap;gap:4px}.profile-avatars button{background:#0b2019;padding:3px}.profile-avatars img{width:56px;height:56px;object-fit:cover}.profile-avatars [aria-pressed=true]{outline:3px solid #dfbd68}
</style>

<style scoped>
.profile-avatars{max-height:144px;overflow-y:auto;overscroll-behavior:contain}.profile-control button{min-height:44px}.profile-control input{min-height:44px;font-size:16px}
@media(max-height:540px) and (min-width:601px){form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px 16px;padding:10px;margin:8px 0}form label{margin:0}form .profile-avatars{grid-column:2;grid-row:1 / span 2;max-height:110px;align-content:start}form .profile-avatars button{padding:2px;margin:0}form .profile-avatars img{width:44px;height:44px}form>p{grid-column:1;min-height:0;margin:0;font-size:12px}form>button{margin:0}form>button:last-child{grid-column:2;grid-row:3}.profile-control>button{margin:0 8px 0 0}}
</style>

<style scoped>
.local-skin-setting{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 4px}.local-skin-setting select{font-size:16px;min-height:40px;max-width:100%;background:#102e25;color:#f8efd5;border:1px solid #b99a60;border-radius:5px;padding:5px}
</style>

