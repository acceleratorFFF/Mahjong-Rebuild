/** Small DPR=1 viewports need more than one raster sample per CSS pixel for distant tiles.
 * Bound only the extra supersampling budget; retain existing native DPR/cap on real devices. */
export function tablePixelRatio(width:number,height:number,deviceRatio:number,cap:number){
 const area=Math.max(1,width)*Math.max(1,height),compact=width<=960&&height<=740
 const floor=compact?Math.max(1,Math.min(2,Math.sqrt(1500000/area))):1
 return Math.min(Math.max(deviceRatio,floor),cap)
}
