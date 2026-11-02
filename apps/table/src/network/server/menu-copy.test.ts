import {describe,it,expect} from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {MenuCopy} from './menu-copy'
import {pickMenuLine,DEFAULT_MENU_LINES} from '../../menu/copy'
describe('configurable menu lines',()=>{
 it('draws one line per visit including both endpoints',()=>{expect(pickMenuLine(['甲','乙'],()=>0)).toBe('甲');expect(pickMenuLine(['甲','乙'],()=>0.999)).toBe('乙');expect(DEFAULT_MENU_LINES).toContain(pickMenuLine([]))})
 it('stores plain strings and defensive copies',()=>{const m=new MenuCopy(),input={lines:['<img src=x onerror=alert(1)>','健康娱乐']};m.update(input);input.lines[0]='变更';const list=m.list();list.pop();expect(m.list()).toEqual(['<img src=x onerror=alert(1)>','健康娱乐'])})
 it('persists valid settings without touching account records',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mahjong-copy-'));try{const file=path.join(dir,'copy.json');new MenuCopy(file).update({lines:['红中开杠','好友相逢']});expect(new MenuCopy(file).list()).toEqual(['红中开杠','好友相逢'])}finally{fs.rmSync(dir,{recursive:true,force:true})}})
 it.each([{},null,{lines:[]},{lines:['']},{lines:[' 空格']},{lines:['换\n行']},{lines:['a'.repeat(65)]},{lines:Array(21).fill('多行')},{lines:['正常'],extra:true}])('rejects invalid input %# without changing published lines',value=>{const m=new MenuCopy();expect(()=>m.update(value)).toThrow('INVALID_MENU_COPY');expect(m.list()).toEqual(DEFAULT_MENU_LINES)})
})
