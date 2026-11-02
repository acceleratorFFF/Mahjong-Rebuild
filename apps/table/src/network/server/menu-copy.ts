import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {DEFAULT_MENU_LINES} from '../../menu/copy'
export class MenuCopyError extends Error {}
function validate(value:unknown):string[]{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!Object.hasOwn(value,'lines'))throw new MenuCopyError('INVALID_MENU_COPY')
 const lines=(value as {lines:unknown}).lines
 if(!Array.isArray(lines)||lines.length<1||lines.length>20||lines.some(s=>typeof s!=='string'||!s.trim()||s!==s.trim()||[...s].length>64||/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(s)))throw new MenuCopyError('INVALID_MENU_COPY')
 return [...lines]
}
export class MenuCopy {
 private lines=[...DEFAULT_MENU_LINES]
 constructor(private file?:string){if(file&&fs.existsSync(file))this.lines=validate(JSON.parse(fs.readFileSync(file,'utf8')))}
 list(){return [...this.lines]}
 update(value:unknown){const lines=validate(value);if(this.file){fs.mkdirSync(path.dirname(this.file),{recursive:true});const tmp=this.file+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify({lines}),{flag:'wx'});fs.renameSync(tmp,this.file)}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}}this.lines=lines;return this.list()}
}
