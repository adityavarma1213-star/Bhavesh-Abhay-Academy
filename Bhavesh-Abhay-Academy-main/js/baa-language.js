/* BAA Module 31 — Multilingual Learning Ecosystem.
   Student-controlled response language; backend re-validates it.
   This does not claim professional translation or dialect certification. */
(function(global){
'use strict';
const LANGUAGES=[
 {code:'en',label:'English',locale:'en-IN'},{code:'hi',label:'हिन्दी',locale:'hi-IN'},
 {code:'mr',label:'मराठी',locale:'mr-IN'},{code:'gu',label:'ગુજરાતી',locale:'gu-IN'},
 {code:'bn',label:'বাংলা',locale:'bn-IN'},{code:'ta',label:'தமிழ்',locale:'ta-IN'},
 {code:'te',label:'తెలుగు',locale:'te-IN'},{code:'kn',label:'ಕನ್ನಡ',locale:'kn-IN'}
];
global.BAALanguage={listLanguages:()=>LANGUAGES.map(x=>({...x})),isSupported:c=>LANGUAGES.some(x=>x.code===c)};
})(window);
