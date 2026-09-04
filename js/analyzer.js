import {mean,median,quantile,std,trimOutliers,clamp,percent} from './utilities.js';
function scoreInverse(v,bad,good){return clamp(100*(good-v)/(good-bad),0,100)}
function ci95(arr){const clean=trimOutliers(arr);const m=mean(clean),s=std(clean);return {mean:m,half:clean.length?1.96*s/Math.sqrt(clean.length):0,n:clean.length}}
export function analyzeRun(run){
 const t=run.telemetry.filter(x=>x.kind==='acquisition'||x.kind==='tracking'||x.kind==='sample');
 const ac=t.filter(x=>x.kind==='acquisition');const tr=t.filter(x=>x.kind==='tracking');
 const errors=ac.map(x=>Math.abs(x.finalError??x.error??0));const firstErrors=ac.map(x=>Math.abs(x.firstError??x.error??0));
 const over=ac.filter(x=>(x.overshoot??0)>0).length;const under=ac.filter(x=>(x.undershoot??0)>0).length;
 const correction=ac.map(x=>x.correctionEfficiency??0);const travel=ac.map(x=>x.movementEfficiency??1);const reaction=ac.map(x=>x.reaction??0);const acqu=ac.map(x=>x.acquisition??0);const jitter=tr.map(x=>x.jitter??0);const trackErr=tr.map(x=>x.trackError??0);
 const fps=run.frame?.avg||60, frameVar=run.frame?.variance||0; const sector={}; for(const x of ac){const s=x.sector??'other';sector[s]=(sector[s]||[]);sector[s].push(x.score??0)}
 const distance={}; for(const x of ac){const d=x.distanceBucket??'0-30';distance[d]=(distance[d]||[]);distance[d].push(x.score??0)}
 const precision=scoreInverse(median(errors),18,2); const flick=scoreInverse(median(acqu),900,180); const stopping=scoreInverse(percent(over,Math.max(1,ac.length)),40,7); const micro=scoreInverse(median(firstErrors),20,2); const track=scoreInverse(median(trackErr),16,2); const react=scoreInverse(median(reaction),550,150); const eff=clamp(mean(travel)*100,0,100); const consistency=scoreInverse(std(ac.map(x=>x.score??0)),28,5); const h=run.axis?.x||precision; const v=run.axis?.y||precision;
 const metrics={precision,flickSpeed:flick,microControl:micro,stoppingControl:stopping,tracking:track,reaction:react,movementEfficiency:eff,consistency,horizontalControl:h,verticalControl:v};
 const weaknesses=[]; if(percent(over,Math.max(1,ac.length))>16)weaknesses.push({id:'overshoot',name:'Overshooting',severity:percent(over,Math.max(1,ac.length))>25?'High':'Medium',confidence:clamp(percent(over,Math.max(1,ac.length))*2,0,100),evidence:`${percent(over,Math.max(1,ac.length)).toFixed(1)}% of acquisitions crossed the target before stabilizing.`});
 if(percent(under,Math.max(1,ac.length))>18)weaknesses.push({id:'undershoot',name:'Undershooting',severity:percent(under,Math.max(1,ac.length))>30?'High':'Medium',confidence:clamp(percent(under,Math.max(1,ac.length))*2,0,100),evidence:`${percent(under,Math.max(1,ac.length)).toFixed(1)}% of first movements stopped short of the target.`});
 if(median(correction)>0.42)weaknesses.push({id:'correction',name:'Excessive micro-corrections',severity:'Medium',confidence:72,evidence:`Median correction burden was ${(median(correction)*100).toFixed(1)}% of total movement.`});
 if(v<h-10)weaknesses.push({id:'vertical',name:'Vertical instability',severity:'High',confidence:clamp((h-v)*4,0,100),evidence:`Vertical control scored ${v.toFixed(0)} versus ${h.toFixed(0)} horizontally.`});
 if(stopping<58)weaknesses.push({id:'stopping',name:'Inconsistent stopping',severity:'High',confidence:74,evidence:`Stopping-control score was ${stopping.toFixed(0)} with ${mean(ac.map(x=>x.correctionCount||0)).toFixed(1)} corrections per acquisition.`});
 if(track<65)weaknesses.push({id:'tracking',name:'Tracking error',severity:'Medium',confidence:68,evidence:`Median moving-target error was ${median(trackErr).toFixed(1)}°.`});
 if(flick<62)weaknesses.push({id:'speed',name:'Slow target acquisition',severity:'Medium',confidence:70,evidence:`Median acquisition time was ${median(acqu).toFixed(0)} ms.`});
 const fatigue=run.fatigueTrend||0; if(fatigue<-10)weaknesses.push({id:'fatigue',name:'Fatigue degradation',severity:'Medium',confidence:78,evidence:`Late-session score fell ${Math.abs(fatigue).toFixed(1)} points versus the opening segment.`});
 const primary=weaknesses.sort((a,b)=>({High:3,Medium:2,Low:1}[b.severity]-({High:3,Medium:2,Low:1}[a.severity])))[0];
 const dataQuality=clamp((t.length/Math.max(250,run.expectedSamples||1000))*100,0,100)*.75+clamp(fps/240*100,0,100)*.2+clamp(1-frameVar/500,0,1)*5;
 return {metrics,weaknesses,primary,sector:mapAverages(sector),distance:mapAverages(distance),confidenceIntervals:{error:ci95(errors),reaction:ci95(reaction),overshoot:ci95(ac.map(x=>x.overshoot||0))},quality:clamp(dataQuality,0,100),counts:{telemetry:t.length,acquisitions:ac.length,tracking:tr.length},frame:run.frame};
}
function mapAverages(obj){const out={};for(const [k,v] of Object.entries(obj))out[k]=mean(v);return out}
export function aggregateAnalyses(analyses){if(!analyses.length)return null;const keys=Object.keys(analyses[0].metrics),metrics={};for(const k of keys)metrics[k]=mean(analyses.map(a=>a.metrics[k]));const weaknesses=[];for(const a of analyses)weaknesses.push(...a.weaknesses);return {metrics,weaknesses,confidence:mean(analyses.map(a=>a.quality)),runs:analyses.length};}
