import {defineConfig} from 'vite'
export default defineConfig({build:{ssr:'src/network/server/index.ts',outDir:'dist-server',emptyOutDir:true,copyPublicDir:false,target:'node22'}})
