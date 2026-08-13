(function(){
  'use strict';
  const KEY='baa.billing.v1';
  const PLANS=[
    {id:'free',name:'BAA Free',price:0,currency:'INR',interval:'month',features:['Core learning','AI Tutor allowance','Assessments','XP & Challenges']},
    {id:'student',name:'BAA Student Plus',price:199,currency:'INR',interval:'month',features:['Expanded AI Tutor','Advanced analytics','Premium learning resources','Priority features']},
    {id:'family',name:'BAA Family',price:499,currency:'INR',interval:'month',features:['Up to 5 learners','Parent controls','Family learning dashboard','Shared premium access']},
    {id:'institution',name:'BAA Institution',price:null,currency:'INR',interval:'custom',features:['Institution analytics','School/ERP integration','Teacher tools','Institution licensing']}
  ];
  function getState(){try{const s=JSON.parse(localStorage.getItem(KEY)||'null');return s&&s.schemaVersion===1?s:{schemaVersion:1,planId:'free',status:'active',provider:'sandbox',renewalDate:null};}catch(_){return {schemaVersion:1,planId:'free',status:'active',provider:'sandbox',renewalDate:null};}}
  function save(s){try{localStorage.setItem(KEY,JSON.stringify(s));return {ok:true,state:s};}catch(_){return {ok:false,error:'BILLING_STORAGE_FAILED'};}}
  function plans(){return PLANS.map(p=>({...p,features:[...p.features]}));}
  function getPlan(id){return PLANS.find(p=>p.id===id)||null;}
  function subscribe(planId){const p=getPlan(planId);if(!p)return {ok:false,error:'UNKNOWN_PLAN'};if(p.id==='institution')return {ok:false,error:'INSTITUTION_CONTACT_REQUIRED',message:'Institution licensing requires a real sales/payment provider integration.'};const s={schemaVersion:1,planId:p.id,status:'active',provider:'sandbox',renewalDate:null};return save(s);}
  function cancel(){const s=getState();s.status='cancelled';return save(s);}
  function entitlement(feature){const s=getState();const p=getPlan(s.planId)||PLANS[0];return {ok:true,feature,planId:p.id,allowed:p.id!=='free'||['Core learning','AI Tutor allowance','Assessments','XP & Challenges'].includes(feature),mode:'sandbox',limitation:'This is a local subscription/entitlement foundation. No real payment is processed.'};}
  window.BAABilling={plans,getState,getPlan,subscribe,cancel,entitlement};
})();
