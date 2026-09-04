import {clamp,mean,seeded} from './utilities.js';
function objective(base, c, w){
 const xFactor=clamp(c.x/base.x,.6,1.5),yFactor=clamp(c.y/base.y,.6,1.5),adsFactor=clamp(c.ads/base.ads,.7,1.3);
 const overPenalty=Math.max(0,(xFactor-1))*w.overshoot*38; const underPenalty=Math.max(0,(1-xFactor))*w.speed*24;
 const precision=base.precision + (1-xFactor)*20 - Math.abs(xFactor-1)*7;
 const flick=base.flickSpeed + (xFactor-1)*25 - Math.max(0,(xFactor-1.2))*14;
 const tracking=base.tracking - Math.abs(xFactor-1)*8;
 const stopping=base.stoppingControl + (1-xFactor)*22 - Math.max(0,(xFactor-.85))*9;
 const vPenalty=(1-yFactor)*w.vertical*10; const yCtrl=base.verticalControl+(1-yFactor)*12-Math.abs(yFactor-1)*7;
 const ads=base.precision + (1-adsFactor)*10 - Math.abs(adsFactor-1)*8;
 return precision*w.precision+flick*w.flick+tracking*w.tracking+stopping*w.stopping+yCtrl*.1+ads*w.ads-overPenalty-underPenalty-vPenalty+base.consistency*w.consistency;
}
function weights(analysis){let w={precision:.23,flick:.18,tracking:.14,stopping:.15,ads:.08,consistency:.12,overshoot:.3,speed:.2,vertical:.2};const m=analysis.metrics; if(m.stoppingControl<65)w.stopping+=.10;if(m.flickSpeed<65)w.flick+=.08;if(m.precision<65)w.precision+=.07;if(m.tracking>80)w.tracking-=.04;if(m.verticalControl<m.horizontalControl-8)w.vertical+=.10;if(analysis.primary?.id==='overshoot')w.overshoot+=.25;return w}
function search(base,analysis,range,step,seed=3){const w=weights(analysis),r=seeded(seed);let best=null;for(let x=base.x*(1-range.x);x<=base.x*(1+range.x)+1e-8;x+=step.x)for(let y=base.y*(1-range.y);y<=base.y*(1+range.y)+1e-8;y+=step.y)for(let ads=base.ads*(1-range.ads);ads<=base.ads*(1+range.ads)+1e-8;ads+=step.ads){const c={x:Number(x.toFixed(3)),y:Number(y.toFixed(3)),ads:Number(ads.toFixed(2))};const jitter=(r()-.5)*.012;const s=objective(base.metrics||base,c,w)+jitter;if(!best||s>best.score)best={...c,score:s}}
 return best}
export function optimize(settings,analysis){const base={x:settings.x,y:settings.y,ads:settings.ads,metrics:analysis.metrics};const coarse=search(base,analysis,{x:.40,y:.40,ads:.30},{x:.12,y:.12,ads:2.5},9);const region=search({...coarse,metrics:analysis.metrics},analysis,{x:.16,y:.16,ads:.14},{x:.025,y:.025,ads:.6},17);const fine=search({...region,metrics:analysis.metrics},analysis,{x:.035,y:.035,ads:.04},{x:.01,y:.01,ads:.2},29);
 const candidates=[];for(let x=-.03;x<=.03;x+=.01)for(let y=-.03;y<=.03;y+=.01){candidates.push({x:Math.max(.01,fine.x*(1+x)),y:Math.max(.01,fine.y*(1+y)),ads:fine.ads})}
 const scores=candidates.map(c=>({...c,score:objective(base.metrics,c,weights(analysis))})).sort((a,b)=>b.score-a.score);const top=scores.slice(0,Math.max(8,Math.floor(scores.length*.12)));const rec={x:mean(top.map(x=>x.x)),y:mean(top.map(x=>x.y)),ads:mean(top.map(x=>x.ads))};const peak=fine.score;const spread=top.length?Math.max(...top.map(x=>x.score))-Math.min(...top.map(x=>x.score)):0;const maxScore=Math.max(peak,1);const stability=clamp(100-(spread/maxScore)*260,35,99);const change=(Math.abs(rec.x-settings.x)/settings.x+Math.abs(rec.y-settings.y)/settings.y+Math.abs(rec.ads-settings.ads)/settings.ads)/3;const confidence=clamp(analysis.confidence*.55+stability*.3+(analysis.counts.acquisitions>70?15:5),30,97);
 return {recommended:{x:Number(rec.x.toFixed(2)),y:Number(rec.y.toFixed(2)),ads:Number(rec.ads.toFixed(1)),scope:Number(rec.ads.toFixed(1))},current:{x:settings.x,y:settings.y,ads:settings.ads,scope:settings.scope},confidence:Number(confidence.toFixed(0)),stability:Number(stability.toFixed(0)),estimatedChange:change,landscape:scores,weights:weights(analysis),iterations:3};
}
