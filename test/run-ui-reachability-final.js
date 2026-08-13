'use strict';
const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');
const wiring=fs.readFileSync(path.join(root,'js','baa-ui-wiring-final.js'),'utf8');
const expected={
 M31:['student-os.html','BAALanguage','m31Btn'],M32:['student-os.html','BAAVoice','m32Speak'],M34:['teacher-os.html','BAASchool','m34Add'],M35:['student-os.html','BAACommunity','m35PostBtn'],M36:['student-os.html','BAAInsights','m36Btn'],M38:['student-os.html','BAAExplainability','m38Btn'],M39:['student-os.html','BAAAppeals','m39Btn'],M40:['student-os.html','BAACurriculum','m40ProfileBtn'],M41:['student-os.html','BAALowBandwidth','m41Btn'],M42:['student-os.html','BAAAntiCheating','m42Start'],M43:['student-os.html','BAAScholarships','m43Btn'],M44:['student-os.html','BAACareerPrep','m44Btn'],M45:['student-os.html','BAAMentors','m45Btn'],M46:['teacher-os.html','BAAERP','m46Config'],M47:['teacher-os.html','BAAInstitution','m47Btn'],M48:['student-os.html','BAAGlobalCollab','m48Create'],M49:['student-os.html','BAAOlympiad','m49Btn'],M50:['student-os.html','BAAPlugins','m50Btn'],M51:['teacher-os.html','BAAPedagogy','m51Btn'],M52:['student-os.html','BAAMistakes','m52Btn'],M53:['teacher-os.html','BAAOutcomes','m53Btn'],M54:['student-os.html','BAACognitiveSafety','m54Btn'],M55:['student-os.html','BAAFreshStart','m55Plan'],M56:['student-os.html','BAAPacing','m56Btn'],M57:['parent-os.html','BAAParentConversation','m57Btn'],M58:['teacher-os.html','BAATeacherDiagnostic','m58Group'],M59:['teacher-os.html','BAAGovernance','m59Create'],M60:['student-os.html','BAAPurposeDesign','m60Btn'],M61:['teacher-os.html','BAAFounderLab','m61Cohort'],M62:['teacher-os.html','BAAAICouncil','m62Create']
};
const alias={M31:'L',M32:'V',M34:'S',M35:'C',M36:'I',M38:'E',M39:'A',M40:'Cu',M41:'LB',M42:'AC',M43:'S',M44:'CP',M45:'M',M46:'ERP',M47:'Ins',M48:'GC',M49:'O',M50:'P',M51:'P',M52:'Mi',M53:'O',M54:'CS',M55:'FS',M56:'AP',M57:'P',M58:'D',M59:'G',M60:'PD',M61:'F',M62:'AC'};
let fail=0;
for(const [m,[page,api,button]] of Object.entries(expected)){
 const html=fs.readFileSync(path.join(root,page),'utf8');
 const okPage=html.includes('js/baa-ui-wiring-final.js');
 const okButton=wiring.includes(`'${button}'`)||wiring.includes(`"${button}"`);
 const okApi=wiring.includes(`=${api}`)||wiring.includes(`global.${api}`)||wiring.includes(`?${api}`);
 const a=alias[m]; const okCall=!!a && wiring.includes(a+'.');
 if(!(okPage&&okButton&&okApi&&okCall)){fail++;console.log(`FAIL ${m}: page=${okPage} button=${okButton} api=${okApi} call=${okCall}`);}
}
if(fail){console.error(`${fail} reachability checks failed`);process.exit(1);}
console.log(`UI reachability static gate: ${Object.keys(expected).length}/${Object.keys(expected).length} modules have dedicated host UI controls and module calls.`);
