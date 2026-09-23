export interface GameViewport {width:number;height:number;scale:number;left:number;top:number}
/** Keep the puzzle in the safe area, while the 3D scenery fills the whole viewport. */
export function gameViewport(width:number,height:number,safe={left:0,right:0,top:0,bottom:0}):GameViewport{
  const w=Math.max(1,width),h=Math.max(1,height);
  const availableW=Math.max(1,w-safe.left-safe.right),availableH=Math.max(1,h-safe.top-safe.bottom);
  const scale=Math.min(availableW/592,availableH/1280);
  return{width:w,height:h,scale,left:safe.left+(availableW-592*scale)/2,top:safe.top+(availableH-1280*scale)/2};
}
