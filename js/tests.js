import {seeded,randomNormal,clamp} from './utilities.js';
export const TESTS=[
{id:'micro',name:'Micro Precision',short:'Micro',desc:'Small static targets. Measures first-shot error, correction burden, and stable precision.',duration:35,type:'static',targets:28},
{id:'largeFlick',name:'Large Flick',short:'Large Flick',desc:'Fast, unpredictable angle changes. Measures acquisition speed and overshoot.',duration:32,type:'flick',targets:24},
{id:'smallFlick',name:'Small Flick',short:'Small Flick',desc:'Medium-to-large angular switches with small targets. Measures stopping control.',duration:32,type:'flickSmall',targets:24},
{id:'horizontal',name:'Horizontal Tracking',short:'H Track',desc:'Constant and variable horizontal target motion. Measures smooth pursuit and jitter.',duration:30,type:'trackX',targets:1},
{id:'vertical',name:'Vertical Tracking',short:'V Track',desc:'Vertical movement isolates Y-axis control.',duration:30,type:'trackY',targets:1},
{id:'switching',name:'Reactive Target Switching',short:'Switching',desc:'Sequential target swaps measure transition time and path efficiency.',duration:30,type:'switch',targets:30},
{id:'random',name:'Random Angle Flick',short:'Angle Flick',desc:'Targets span all major direction sectors plus seeded random angles.',duration:35,type:'random',targets:30},
{id:'close',name:'Close Range Speed',short:'Close Speed',desc:'Large nearby targets with fast changes. Measures high-speed acquisition.',duration:28,type:'close',targets:30},
{id:'long',name:'Long Range Precision',short:'Long Precision',desc:'Small distant targets emphasize controlled micro-adjustment.',duration:35,type:'long',targets:26},
{id:'fatigue',name:'Fatigue / Consistency',short:'Fatigue',desc:'A longer mixed drill reveals performance drift and late-session instability.',duration:55,type:'fatigue',targets:44}
];
export function makeScenario(test,settings,seed=1){const r=seeded(seed);const targets=[];let yaw=0,pitch=0;const angular=[0,15,30,45,60,90,120,135,150,180];for(let i=0;i<(test.targets||1);i++){
 let a,p,rad,vel;
 if(test.type==='trackX'||test.type==='trackY'){a=test.type==='trackX'?0:(r()>.5?90:-90);p=(r()-.5)*8;rad=22;vel=35+40*r()}
 else{a=(angular[i%angular.length]+(r()-.5)*10)%360;p=(r()-.5)*70;rad=(test.type==='long'||test.type==='micro'||test.type==='flickSmall'?8: test.type==='close'?30:18);if(test.type==='largeFlick')rad=22;if(test.type==='fatigue')rad=clamp(34-(i/test.targets)*22,9,34);vel=0}
 const dist=1; yaw+=Math.cos(a*Math.PI/180)*dist;pitch+=Math.sin(a*Math.PI/180)*dist;targets.push({id:i,spawnTime:i*900+300,spawnYaw:((a+360)%360),spawnPitch:clamp(p,-72,72),radius:rad,velocity:vel,direction:a,type:test.type==='trackX'||test.type==='trackY'?'moving':'static'});
 }return targets}
