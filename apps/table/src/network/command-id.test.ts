import {it,expect} from 'vitest'
import {commandId} from './command-id'
it('uses native UUID when present',()=>{expect(commandId({randomUUID:()=> '12345678-1234-4234-9234-123456789abc',getRandomValues(){throw Error('unused')}} as any)).toBe('12345678-1234-4234-9234-123456789abc')})
it('HTTP fallback uses secure random bytes and UUID v4/variant fields',()=>{let called=0;const value=commandId({getRandomValues(a:any){called++;a.fill(255);return a}});expect(value).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');expect(called).toBe(1)})
it('fallback commands remain distinct across real CSPRNG calls',()=>{const source={getRandomValues:crypto.getRandomValues.bind(crypto)};expect(new Set(Array.from({length:32},()=>commandId(source))).size).toBe(32)})
