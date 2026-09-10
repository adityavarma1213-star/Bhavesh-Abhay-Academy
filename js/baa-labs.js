/* BAA M33 — Interactive Virtual Labs.
   Safe, deterministic browser simulations only. No arbitrary code execution,
   device access, or unsafe physical/chemical procedure generation. */
(function(global){
'use strict';
const LABS=[
 {id:'projectile',name:'Projectile Motion',subject:'Physics',
  run(input){const v=Number(input.velocity),angle=Number(input.angle),g=9.81;
   if(!Number.isFinite(v)||v<0||v>100||!Number.isFinite(angle)||angle<=0||angle>=90)
     return {ok:false,error:'INVALID_PROJECTILE_INPUT'};
   const rad=angle*Math.PI/180,time=2*v*Math.sin(rad)/g,range=v*v*Math.sin(2*rad)/g,height=v*v*Math.sin(rad)**2/(2*g);
   return {ok:true,error:null,result:{timeSeconds:Number(time.toFixed(3)),rangeMeters:Number(range.toFixed(3)),maxHeightMeters:Number(height.toFixed(3))}};}},
 {id:'ohm',name:'Ohm’s Law',subject:'Physics',
  run(input){const v=Number(input.voltage),r=Number(input.resistance);
   if(!Number.isFinite(v)||!Number.isFinite(r)||v<0||r<=0||r>1000000)return {ok:false,error:'INVALID_OHM_INPUT'};
   return {ok:true,error:null,result:{currentAmps:Number((v/r).toFixed(6)),powerWatts:Number((v*v/r).toFixed(6))}};}},
 {id:'quadratic',name:'Quadratic Explorer',subject:'Mathematics',
  run(input){const a=Number(input.a),b=Number(input.b),c=Number(input.c),d=b*b-4*a*c;
   if(![a,b,c].every(Number.isFinite)||a===0)return {ok:false,error:'INVALID_QUADRATIC_INPUT'};
   if(d<0)return {ok:true,error:null,result:{discriminant:d,roots:[],type:'complex'}};
   const s=Math.sqrt(d);return {ok:true,error:null,result:{discriminant:d,roots:[(-b+s)/(2*a),(-b-s)/(2*a)],type:d===0?'repeated':'real'}};}}
];
function list(){return LABS.map(x=>({id:x.id,name:x.name,subject:x.subject}));}
function run(id,input){
 const lab=LABS.find(x=>x.id===id); if(!lab)return {ok:false,error:'UNKNOWN_LAB'};
 if(!input||typeof input!=='object')return {ok:false,error:'INVALID_LAB_INPUT'};
 return lab.run(input);
}
global.BAALabs={list,run};
})(window);
