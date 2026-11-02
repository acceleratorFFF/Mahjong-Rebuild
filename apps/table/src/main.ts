import Gate from './account/Gate.vue'
import {createApp,defineAsyncComponent,h} from 'vue'
import App from './p1/App.vue'
import './style.css'
import './account/formControls.css'
const scene=new URLSearchParams(location.search).get('scene')
const page=scene==='menu'||!scene?defineAsyncComponent(()=>import('./menu/App.vue')):scene==='admin'?defineAsyncComponent(()=>import('./account/Manage.vue')):scene==='online'?defineAsyncComponent(()=>import('./network/App.vue')):scene==='play'?defineAsyncComponent(()=>import('./play/App.vue')):scene==='p2'
  ? defineAsyncComponent(()=>import('./p2/App.vue')) : App
createApp(!scene||['menu','admin','online','play'].includes(scene)?{render:()=>h(Gate,{page})}:page).mount('#app')
