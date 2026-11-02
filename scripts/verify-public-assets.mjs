import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {reviewAssets} from './release-asset-review.mjs'
const root='apps/table/public'
function walk(p){return fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())throw Error('Symlink refused');return e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]})}
const files=walk(root).map(f=>({file:path.relative(root,f).replaceAll('\\','/'),sha256:createHash('sha256').update(fs.readFileSync(f)).digest('hex')}))
const result=reviewAssets(files,JSON.parse(fs.readFileSync('deploy/asset-inclusion-approval.json')))
if(!result.publicationCleared)throw Error('Static inventory changed; review required')
console.log('Verified approved static files: '+files.length)
