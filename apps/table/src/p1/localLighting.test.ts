import {it,expect} from 'vitest'
import {initialLocalLighting,localLightingProfile} from '../theme/localLighting'
import {DEFAULT_TABLE_SCENE_PROFILE as base} from '../components/table/three/sceneRenderProfile'
it('local defaults to neutral while production retains its baseline',()=>{
 expect(initialLocalLighting(false,'neutral')).toBe('original')
 expect(initialLocalLighting(true,'neutral')).toBe('neutral')
 expect(initialLocalLighting(true,'invalid')).toBe('neutral')
 expect(initialLocalLighting(true,null)).toBe('neutral')
 expect(initialLocalLighting(true,'original')).toBe('original')
 expect(localLightingProfile(base,'original')).toBe(base)
})
it('neutralizes lights without mutating the baseline camera, shadows, strength or exposure',()=>{
 const before=JSON.stringify(base),neutral=localLightingProfile(base,'neutral')
 expect(neutral.hemisphere.skyColor).toBe(0xffffff)
 expect(neutral.keyLight.color).toBe(0xffffff)
 expect(neutral.keyLight.intensity).toBe(base.keyLight.intensity)
 expect(neutral.keyLight.position).toBe(base.keyLight.position)
 expect(neutral.hemisphere.intensity).toBe(base.hemisphere.intensity)
 expect(neutral.camera).toBe(base.camera)
 expect(neutral.shadows).toBe(base.shadows)
 expect(neutral.exposure).toBe(base.exposure)
 expect(neutral.toneMapping).toBe(base.toneMapping)
 expect(JSON.stringify(base)).toBe(before)
})
