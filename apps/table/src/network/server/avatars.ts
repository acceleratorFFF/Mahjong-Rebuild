import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {inflateSync} from 'node:zlib'
import {AVATAR_IDS,type AvatarOption} from '../../account/contracts'
export class AvatarError extends Error {}
const bad=():never=>{throw new AvatarError('INVALID_IMAGE')}
const names=['荷花','乐乐','十三','小少爷']
const validId=(id:unknown):id is string=>typeof id==='string'&&/^avatar-[a-f0-9-]{36}$/.test(id)
function crc(b:Buffer){let n=0xffffffff;for(const byte of b){n^=byte;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0)}return(n^0xffffffff)>>>0}
export function inspectImage(b:Buffer){
 if(!b.length||b.length>2*1024*1024)bad();let width=0,height=0,ext='',mime=''
 if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
  ext='png';mime='image/png';let at=8,first=true,ended=false;const data:Buffer[]=[]
  while(at+12<=b.length){const len=b.readUInt32BE(at);if(len>b.length-at-12)bad();const type=b.toString('ascii',at+4,at+8);if(crc(b.subarray(at+4,at+8+len))!==b.readUInt32BE(at+8+len))bad();
   if(first){if(type!=='IHDR'||len!==13)bad();width=b.readUInt32BE(at+8);height=b.readUInt32BE(at+12);first=false}
   if(type==='acTL')bad();if(type==='IDAT')data.push(b.subarray(at+8,at+8+len));at+=len+12;if(type==='IEND'){if(len!==0||at!==b.length)bad();ended=true;break}}
  if(!ended||!data.length)bad();try{if(!inflateSync(Buffer.concat(data),{maxOutputLength:16*1024*1024}).length)bad()}catch{bad()}
 }else if(b.length>10&&b[0]===255&&b[1]===216&&b[b.length-2]===255&&b[b.length-1]===217){
  ext='jpg';mime='image/jpeg';let at=2
  while(at+4<b.length){if(b[at++]!==255)bad();while(b[at]===255)at++;const marker=b[at++];if(marker===0xda||marker===0xd9)break;if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;const len=b.readUInt16BE(at);if(len<2||at+len>b.length)bad();if([0xc0,0xc1,0xc2].includes(marker)){if(len<8)bad();height=b.readUInt16BE(at+3);width=b.readUInt16BE(at+5);break}at+=len}
 }else if(b.length>=30&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'&&b.readUInt32LE(4)+8===b.length){
  ext='webp';mime='image/webp';const type=b.toString('ascii',12,16),len=b.readUInt32LE(16);if(len>b.length-20)bad();
  if(type==='VP8X'){if(len!==10||(b[20]&2))bad();width=b.readUIntLE(24,3)+1;height=b.readUIntLE(27,3)+1}
  else if(type==='VP8 '&&b[23]===157&&b[24]===1&&b[25]===42){width=b.readUInt16LE(26)&0x3fff;height=b.readUInt16LE(28)&0x3fff}
  else if(type==='VP8L'&&b[20]===47){const bits=b.readUInt32LE(21);width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1}
  else bad()
 }else bad()
 if(width<16||height<16||width>1024||height>1024||width!==height)bad()
 return{width,height,ext,mime}
}
interface Stored extends AvatarOption {mime?:string;ext?:string}
export class Avatars {
 private records:Stored[]=AVATAR_IDS.map((id,i)=>({id,name:names[i],source:'现有素材，授权记录见项目素材清单',enabled:true,order:i,builtin:true}));private bytes=new Map<string,Buffer>()
 constructor(private directory?:string){if(directory&&fs.existsSync(path.join(directory,'catalog.json'))){const v=JSON.parse(fs.readFileSync(path.join(directory,'catalog.json'),'utf8'));if(!Array.isArray(v)||v.some(r=>!AVATAR_IDS.includes(r.id)&&(!validId(r.id)||!['png','jpg','webp'].includes(r.ext))))throw Error('Avatar catalog invalid');this.records=v}}
 private save(records:Stored[]){if(this.directory){fs.mkdirSync(this.directory,{recursive:true});const file=path.join(this.directory,'catalog.json'),tmp=`${file}.${randomUUID()}.tmp`;try{fs.writeFileSync(tmp,JSON.stringify(records),{flag:'wx'});fs.renameSync(tmp,file)}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}}this.records=records}
 list(all=false):AvatarOption[]{return this.records.filter(r=>all||r.enabled).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)).map(({mime,ext,...r})=>({...r}))}
 selectable(id:unknown){return typeof id==='string'&&this.records.some(r=>r.id===id&&r.enabled)}
 known(id:unknown){return typeof id==='string'&&this.records.some(r=>r.id===id)}
 upload(v:unknown){const b=v as any;if(!b||typeof b!=='object'||Object.keys(b).sort().join()!=='data,name,source'||typeof b.name!=='string'||!b.name.trim()||b.name.length>32||typeof b.source!=='string'||!b.source.trim()||b.source.length>200||typeof b.data!=='string'||!b.data.length||b.data.length>2796204||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.data))bad();const bytes=Buffer.from(b.data,'base64');if(bytes.toString('base64')!==b.data)bad();const image=inspectImage(bytes),id=`avatar-${randomUUID()}`,record:Stored={id,name:b.name.trim(),source:b.source.trim(),enabled:true,order:this.records.length,builtin:false,ext:image.ext,mime:image.mime};let file:string|undefined;
 try{if(this.directory){fs.mkdirSync(this.directory,{recursive:true});file=path.join(this.directory,`${id}.${image.ext}`);fs.writeFileSync(file,bytes,{flag:'wx'})}else this.bytes.set(id,bytes);this.save([...this.records,record]);return this.list(true).find(r=>r.id===id)!}catch(e){if(file&&fs.existsSync(file))fs.unlinkSync(file);this.bytes.delete(id);throw e}}
 update(v:unknown){const b=v as any;if(!b||Object.keys(b).sort().join()!=='enabled,id,order'||typeof b.enabled!=='boolean'||!Number.isSafeInteger(b.order)||b.order<0||b.order>10000)bad();const r=this.records.find(r=>r.id===b.id);if(!r)bad();this.save(this.records.map(r=>r.id===b.id?{...r,enabled:b.enabled,order:b.order}:r));return this.list(true)}
 read(id:string){if(!validId(id))return null;const r=this.records.find(r=>r.id===id);if(!r)return null;const data=this.directory?fs.readFileSync(path.join(this.directory,`${r.id}.${r.ext}`)):this.bytes.get(id);return data?{data,mime:r.mime!}:null}
}
