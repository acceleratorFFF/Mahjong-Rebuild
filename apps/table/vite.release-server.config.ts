import {defineConfig} from 'vite'
import {bundledLicenses} from './scripts/bundled-licenses'
// 只供本地产物生成：后端与依赖合并，发布包不携带开发目录或 node_modules。
export default defineConfig({plugins:[bundledLicenses()],ssr:{noExternal:true},build:{ssr:'src/network/server/index.ts',outDir:process.env.MACHENG_SERVER_OUT??'dist-release-server',emptyOutDir:true,copyPublicDir:false,target:'node22'}})
