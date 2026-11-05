import type {LocalTableSkin} from '../../../theme/localTableSkin'
import {defaultTableTheme,type TableTheme} from './tableTheme'

// 独立的表面皮肤覆盖，不扩展玩法主题，不改变牌面、几何或光照配置。
export function surfaceSkinTheme(skin:LocalTableSkin,base:TableTheme=defaultTableTheme):TableTheme{
 const clone={...base,tileGeometry:base.tileGeometry?{...base.tileGeometry}:undefined}
 if(skin==='classic')return clone
 const moon=skin==='moon-navy'
 const sakura=skin==='sakura-plum'
 if(skin==='butterfly-gold')return {...surfaceSkinTheme('sakura-plum',base),
  table:{...surfaceSkinTheme('sakura-plum',base).table,darkJade:{...base.table.darkJade,color:0x513922},gold:{...base.table.gold,color:0xffffff,metalness:0,roughness:.7},goldHighlight:{...base.table.goldHighlight,color:0xc9a764}},
  tableSurfaceTexture:{url:`${import.meta.env.BASE_URL}themes/butterfly-gold/v1/felt.png`,tint:0xffffff},
  tableFrameTexture:{url:`${import.meta.env.BASE_URL}themes/butterfly-gold/v1/wood.png`},
  tile:{...base.tile,faceSide:{...base.tile.faceSide,color:0x9a794d,roughness:.42,clearcoat:.42},bottom:{...base.tile.bottom,color:0x62482e},back:{...base.tile.back,color:0xffffff,roughness:.58,metalness:0,clearcoat:.12}},
  tileBackGradient:['#ad8655','#88633e','#63462b']}
 return {...clone,
  table:{...base.table,
   jade:{...base.table.jade,color:0xffffff,roughness:.93,metalness:0,clearcoat:0,emissive:0x000000},
   darkJade:{...base.table.darkJade,color:sakura?0x271323:moon?0x101e30:0x092a23,roughness:.8,metalness:0,clearcoat:.05},
   gold:{...base.table.gold,color:sakura?0xffffff:moon?0x182c43:0x3d2c24,emissive:0x000000,roughness:.78,metalness:0,clearcoat:.08},
   goldHighlight:{...base.table.goldHighlight,color:sakura?0xc18aa8:moon?0xb5c4ce:0xb99a60,roughness:.58,metalness:.45,clearcoat:.1},
  },
  tableSurfaceTexture:{url:`${import.meta.env.BASE_URL}themes/${skin}/v1/felt.png`,tint:0xffffff},
  tableFrameTexture:sakura?{url:`${import.meta.env.BASE_URL}themes/${skin}/v1/wood.png`}:undefined,
  // faceSide是原亮绿的下层侧边，side是上层象牙白；保留白层对比和原有厚度。
  tile:{...base.tile,
   faceSide:{...base.tile.faceSide,color:sakura?0x68475f:moon?0x536c89:0x377466,roughness:.42,clearcoat:.42},
   bottom:{...base.tile.bottom,color:sakura?0x493243:moon?0x34485f:0x244e44},
   back:{...base.tile.back,color:0xffffff,roughness:.58,metalness:0,clearcoat:.12}},
  tileBackGradient:sakura?['#6a325c','#49203f','#30152d']:moon?['#203e63','#1c3555','#182c43']:['#1f665a','#19554c','#123e38'],
 }
}
