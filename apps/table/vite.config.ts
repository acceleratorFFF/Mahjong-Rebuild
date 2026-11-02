import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import {bundledLicenses} from './scripts/bundled-licenses'
export default defineConfig({
  plugins: [vue(),bundledLicenses()], base: process.env.MACHENG_PUBLIC_BASE??'./',
  server: {host:'127.0.0.1', port:4173, strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:4174'},'/socket.io':{target:'http://127.0.0.1:4174',ws:true}}},
  test: {include:['src/p1/**/*.test.ts','src/game/variants/macheng/**/*.test.ts','src/network/**/*.test.ts'], maxWorkers:1, fileParallelism:false},
})
