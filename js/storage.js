const KEY='aimfoundry.v1';
const base={settings:{x:6.4,y:6.4,ads:32.5,scope:32.5,dpi:800,windows:6,fov:90,resolution:'1920x1080',aspect:'16:9',polling:1000,accel:false,fps:240,preset:'custom',targetSize:26,duration:35,difficulty:'adaptive',audio:true,reducedMotion:false,crosshair:'cross',optimizerBounds:{xPct:40,yPct:40,adsPct:30}},history:[],model:{sessions:0,overshoot:[],undershoot:[],tracking:[],reaction:[],precision:[],preferred:{x:6.4,y:6.4,ads:32.5}}};
export function load(){try{return {...base,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return structuredClone(base)}}
export function save(state){localStorage.setItem(KEY,JSON.stringify(state));}
export function reset(){localStorage.removeItem(KEY);return structuredClone(base)}
