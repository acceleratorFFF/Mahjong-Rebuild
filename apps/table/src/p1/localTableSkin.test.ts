import {it,expect} from 'vitest'
import {initialLocalSkin,resolveLocalSkin,localSkinBackUrl} from '../theme/localTableSkin'
import {surfaceSkinTheme} from '../components/table/three/localSurfaceSkin'
import {defaultTableTheme} from '../components/table/three/tableTheme'
it('user sakura assets remain local and preserve faces and geometry',()=>{
 const base=JSON.stringify(defaultTableTheme),theme=surfaceSkinTheme('sakura-plum')
 expect(initialLocalSkin(false,'sakura-plum')).toBe('classic')
 expect(resolveLocalSkin('sakura-plum')).toBe('sakura-plum')
 expect(theme.tableFrameTexture?.url).toContain('/sakura-plum/v1/wood.png')
 expect(localSkinBackUrl('sakura-plum')).toContain('/sakura-plum/v1/tile-back.png')
 expect(theme.tile.face).toEqual(defaultTableTheme.tile.face)
 expect(theme.tileGeometry).toEqual(defaultTableTheme.tileGeometry)
 expect(JSON.stringify(defaultTableTheme)).toBe(base)
})
it('preview is opt-in for production and tolerates invalid values or unavailable storage',()=>{
 const storage={getItem:()=> 'bamboo-jade'}
 expect(initialLocalSkin(false,'bamboo-jade',storage)).toBe('classic')
 expect(initialLocalSkin(true,null,storage)).toBe('bamboo-jade')
 expect(initialLocalSkin(true,'classic',storage)).toBe('classic')
 expect(initialLocalSkin(true,'../../file',storage)).toBe('classic')
 expect(initialLocalSkin(true,null,{getItem:()=>{throw Error('disabled')}})).toBe('classic')
 expect(resolveLocalSkin('llmAnime')).toBe('classic')
 expect(localSkinBackUrl('classic')).toBeUndefined()
})
it('skin changes surfaces and back only, preserving geometry, faces, machine and baseline config',()=>{
 const before=JSON.stringify(defaultTableTheme),skin=surfaceSkinTheme('bamboo-jade')
 expect(skin.tileGeometry).toEqual(defaultTableTheme.tileGeometry)
 expect(skin.tile.face).toBe(defaultTableTheme.tile.face)
 expect(skin.tile.faceSide.color).toBe(0x377466)
 expect(skin.table.machine).toBe(defaultTableTheme.table.machine)
 expect(skin.tableSurfaceTexture?.url).toContain('themes/bamboo-jade/v1/felt.png')
 expect(skin.tile.back).not.toEqual(defaultTableTheme.tile.back)
 expect(JSON.stringify(defaultTableTheme)).toBe(before)
 expect(surfaceSkinTheme('classic')).toEqual(defaultTableTheme)
})

it('moon skin uses its own resources and palette while preserving baseline geometry and face material',()=>{
 const theme=surfaceSkinTheme('moon-navy')
 expect(resolveLocalSkin('moon-navy')).toBe('moon-navy')
 expect(initialLocalSkin(false,'moon-navy')).toBe('classic')
 expect(initialLocalSkin(true,null,{getItem:()=>'moon-navy'})).toBe('moon-navy')
 expect(localSkinBackUrl('moon-navy')).toContain('themes/moon-navy/v1/tile-back.png')
 expect(theme.tableSurfaceTexture?.url).toContain('themes/moon-navy/v1/felt.png')
 expect(theme.table.gold.color).toBe(0x182c43)
 expect(theme.tile.face).toBe(defaultTableTheme.tile.face)
 expect(theme.tileGeometry).toEqual(defaultTableTheme.tileGeometry)
 expect(surfaceSkinTheme('bamboo-jade').table.gold.color).toBe(0x3d2c24)
})

it('keeps ivory sides and face artwork while replacing the colored lower layer',()=>{for(const skin of ['bamboo-jade','moon-navy','sakura-plum'] as const){const theme=surfaceSkinTheme(skin);expect(theme.tile.side).toBe(defaultTableTheme.tile.side);expect(theme.tile.face).toBe(defaultTableTheme.tile.face);expect(theme.tile.faceSide.color).not.toBe(defaultTableTheme.tile.faceSide.color);expect(theme.tile.bottom.color).not.toBe(defaultTableTheme.tile.bottom.color)}})

