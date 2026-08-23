/* BAA M63 — verified Guide Robot feature catalogue.
 * Static and deterministic by design: the robot explains only features
 * that are explicitly registered here and never invents capabilities.
 */
(function(global){
  'use strict';
  const FEATURES=[
    {id:'getting-started',title:'Getting Started',icon:'🚀',roles:['student','parent','teacher','admin'],description:'Start BAA, sign in, choose your workspace, and learn where the main controls are.',route:'index.html'},
    {id:'student-os',title:'Student OS',icon:'🎓',roles:['student'],description:'The student learning workspace for lessons, practice, progress, rewards, planning, labs and career exploration.',route:'student-os.html'},
    {id:'learning',title:'Learning & Knowledge',icon:'📚',roles:['student'],description:'Explore subjects and topics, study concepts, and build evidence of learning.',route:'knowledge-universe.html'},
    {id:'assessment',title:'Assessments',icon:'📝',roles:['student','teacher'],description:'Take assessments, review results, and use teacher review workflows where available.',route:'assessment.html'},
    {id:'homework',title:'Homework Scanner',icon:'📷',roles:['student','teacher'],description:'Use the homework workflow to submit work and receive the supported evaluation/explanation experience.',route:'homework-scanner.html'},
    {id:'math-world',title:'Mathematics World',icon:'➗',roles:['student'],description:'Open the mathematics learning world for structured topic exploration and practice.',route:'mathematics-world.html'},
    {id:'parent-os',title:'Parent OS',icon:'👨‍👩‍👧',roles:['parent'],description:'Parent-facing learning evidence, progress and family controls.',route:'parent-os.html'},
    {id:'teacher-os',title:'Teacher OS',icon:'👩‍🏫',roles:['teacher','admin'],description:'Teacher workspace for academic management, review and class-oriented workflows.',route:'teacher-os.html'},
    {id:'teacher-portal',title:'Teacher Portal',icon:'🧑‍🏫',roles:['teacher','admin'],description:'Teacher and academic management portal protected by the server-side role gate.',route:'teacher-portal.html'},
    {id:'themes',title:'Theme Engine',icon:'🎨',roles:['student','parent','teacher','admin'],description:'Choose Aurora, Galaxy, Academic, NeoGlass, Calm or Duology, with Light, Dark or System display mode.',route:'student-os.html'},
    {id:'feature-map',title:'Feature Map',icon:'🗺️',roles:['student','parent','teacher','admin'],description:'See the BAA feature map and understand how the major product areas connect.',route:'feature-map.html'},
    {id:'trust',title:'Trust & Privacy',icon:'🔐',roles:['student','parent','teacher','admin'],description:'Review BAA trust, privacy and data-handling information.',route:'trust-privacy.html'},
    {id:'user-guide',title:'User Guide',icon:'📖',roles:['student','parent','teacher','admin'],description:'Read the written guide to the major BAA OS features.',route:'user-guide.html'},
    {id:'demo',title:'BAA Demo',icon:'▶️',roles:['student','parent','teacher','admin'],description:'Open the product demonstration experience.',route:'demo.html'}
  ];
  function clone(){return FEATURES.map(function(f){return Object.assign({},f,{roles:f.roles.slice()});});}
  global.BAAGuideCatalogue={version:'m63.1',features:FEATURES.slice(),getFeatures:clone,getFeature:function(id){return FEATURES.find(function(f){return f.id===id;})||null;}};
})(window);
