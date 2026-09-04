import {clamp} from './utilities.js';
export class CameraEngine{
  constructor(settings){this.setSettings(settings);this.yaw=0;this.pitch=0;this.last={x:0,y:0}}
  setSettings(s){this.x=s.x;this.y=s.y;this.ads=s.ads;this.scope=s.scope;this.fov=s.fov||90}
  sensitivityFor(mode='look'){if(mode==='ads')return this.ads;if(mode==='scope')return this.scope;return 1}
  deltaToAngle(dx,dy,mode='look'){const ref=90/6.4;const fovScale=(this.fov/90);const sensX=this.x*ref*fovScale;const sensY=this.y*ref*fovScale;const mult=this.sensitivityFor(mode);return {yaw:dx*sensX*.01*mult,pitch:dy*sensY*.01*mult}}
  move(dx,dy,mode='look'){const d=this.deltaToAngle(dx,dy,mode);this.yaw+=d.yaw;this.pitch=clamp(this.pitch+d.pitch,-89,89);return d}
  reset(){this.yaw=0;this.pitch=0}
}
export function angularDistance(a,b){let d=(a-b+180)%360-180;return Math.abs(d)}
export function screenToAim(px,py,w,h,fov){const aspect=w/h;const nx=(px/w-.5)*2;const ny=(py/h-.5)*2;return {yaw:nx*(fov*.5),pitch:-ny*(fov*.5/aspect)}}
export function aimToScreen(yaw,pitch,w,h,fov){const aspect=w/h;const nx=yaw/(fov*.5);const ny=-pitch/(fov*.5/aspect);return {x:w*.5+nx*w*.5,y:h*.5+ny*h*.5}}
