import fs from 'node:fs'
import path from 'node:path'
import type {Plugin} from 'vite'
// 记录真正参与打包的依赖及原许可文本，不把 node_modules 或本机路径放进发布包。
export function bundledLicenses():Plugin{return {name:'bundled-license-inventory',generateBundle(){
 const seen=new Map<string,{name:string;version:string;license:unknown;notices:string[]}>()
 for(const id of this.getModuleIds()){
  if(!id.includes('node_modules')||!fs.existsSync(id.split('?')[0]))continue
  let dir=path.dirname(id.split('?')[0]),pkg:any
  // 子目录可只有 type:module 的 package.json，继续向上找带名称／版本的真正包根。
  while(dir!==path.dirname(dir)){const p=path.join(dir,'package.json');if(fs.existsSync(p)){const candidate=JSON.parse(fs.readFileSync(p,'utf8'));if(candidate.name&&candidate.version){pkg=candidate;break}}dir=path.dirname(dir)}
  if(!pkg)throw Error('Bundled dependency package metadata missing')
  // 某些 ESM 子目录重复名称／版本但没有许可，继续取同名包的最外层完整元数据。
  let parent=path.dirname(dir);while(parent!==path.dirname(parent)&&parent.includes('node_modules')){const p=path.join(parent,'package.json');if(fs.existsSync(p)){const outer=JSON.parse(fs.readFileSync(p,'utf8'));if(outer.name===pkg.name&&outer.version===pkg.version){dir=parent;pkg=outer}}parent=path.dirname(parent)}
  const key=`${pkg.name}@${pkg.version}`;if(seen.has(key))continue
  const notices:string[]=[];for(const f of fs.readdirSync(dir).filter(n=>/^(license|licence|copying|notice)(\.|$)/i.test(n))){if(!fs.statSync(path.join(dir,f)).isFile())continue;const name=`third-party/${key.replace(/[^a-zA-Z0-9@._-]/g,'_')}/${f}`;this.emitFile({type:'asset',fileName:name,source:fs.readFileSync(path.join(dir,f))});notices.push(name)}
  seen.set(key,{name:pkg.name,version:pkg.version,license:pkg.license??'UNSPECIFIED',notices})
 }
 this.emitFile({type:'asset',fileName:'BUNDLED_LICENSES.json',source:JSON.stringify([...seen.values()].sort((a,b)=>a.name.localeCompare(b.name)),null,2)})
}}}
