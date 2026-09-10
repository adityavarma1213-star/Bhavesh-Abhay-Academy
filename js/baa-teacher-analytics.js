/* ============================================================
   js/baa-teacher-analytics.js
   BAA OS — Module 17: Teacher Analytics.
   Provides evidence-derived concept analytics and a reusable class
   aggregation adapter. The current private-testing build contains
   one student's local store, so it never fabricates a class heatmap.
   ============================================================ */
(function(global){
  'use strict';

  function summarizeSnapshot(snapshot){
    const evidence=Array.isArray(snapshot?.evidence)?snapshot.evidence:[];
    const grouped={};
    evidence.forEach(e=>{
      if(!e?.concept)return;
      const g=(grouped[e.concept] ||= {concept:e.concept,subject:e.subject||null,total:0,correct:0});
      g.total++;
      if(e.correctness==='correct')g.correct++;
    });
    return Object.values(grouped).map(g=>({
      ...g,
      accuracy:g.total?Math.round((g.correct/g.total)*100):null
    }));
  }

  function aggregateStudentSnapshots(snapshots){
    if(!Array.isArray(snapshots))return {students:0,concepts:[]};
    const map={};
    snapshots.forEach((snapshot,index)=>{
      summarizeSnapshot(snapshot).forEach(row=>{
        const key=row.concept;
        const g=(map[key] ||= {concept:key,subject:row.subject,totalStudents:0,totalEvidence:0,totalCorrect:0});
        g.totalStudents++;
        g.totalEvidence+=row.total;
        g.totalCorrect+=row.correct;
      });
    });
    return {
      students:snapshots.length,
      concepts:Object.values(map).map(g=>({
        ...g,
        accuracy:g.totalEvidence?Math.round(g.totalCorrect/g.totalEvidence*100):null
      }))
    };
  }

  function getCurrentTeacherAnalytics(){
    // M17 is server-authoritative. This browser helper intentionally refuses
    // to fabricate a class size from one local learner's store. Teacher OS
    // loads /api/v1/class-analytics for authenticated class-wide analytics.
    return {students:0,concepts:[],scope:'server_class_analytics_required'};
  }

  global.BAATeacherAnalytics={summarizeSnapshot,aggregateStudentSnapshots,getCurrentTeacherAnalytics};
})(window);
