import {it,expect} from 'vitest'
import {tablePixelRatio} from '../components/table/three/renderResolution'
it('supersamples compact DPR1 while respecting explicit and native caps',()=>{expect(tablePixelRatio(844,390,1,3)).toBe(2);expect(tablePixelRatio(844,390,1,1)).toBe(1);expect(tablePixelRatio(844,390,3,2.5)).toBe(2.5);expect(tablePixelRatio(1440,900,1,3)).toBe(1)})
it('bounds extra resolution to a small viewport pixel budget',()=>{const r=tablePixelRatio(844,633,1,3);expect(r).toBeGreaterThan(1);expect(844*633*r*r).toBeLessThanOrEqual(1500001);expect(tablePixelRatio(0,0,1,3)).toBe(2)})
