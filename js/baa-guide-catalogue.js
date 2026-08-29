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
    {id:'ai-mode',title:'AI Mode',icon:'🤖',roles:['student'],description:'Use server-authoritative learning evidence to support academic AI interactions.',route:'student-os.html'},
    {id:'custom-mode',title:'Custom Mode',icon:'🧩',roles:['student'],description:'Create and persist a learner-customized academic mode through the authenticated server path.',route:'student-os.html'},
    {id:'hybrid-mode',title:'Hybrid Mode',icon:'🔄',roles:['student'],description:'Use the hybrid learning mode with authenticated learner context and server synchronization.',route:'student-os.html'},
    {id:'mastery-gate',title:'Mastery Gate',icon:'🚦',roles:['student','parent'],description:'Check evidence-backed progression findings and use the authenticated parent bypass workflow where permitted.',route:'assessment.html'},
    {id:'learning-memory',title:'Learning Memory',icon:'🧠',roles:['student'],description:'Review authenticated learner-scoped academic evidence and concept states from server-backed Learning Memory.',route:'student-os.html'},
    {id:'confidence',title:'Learning Confidence',icon:'📈',roles:['student'],description:'View evidence-based academic confidence signals without psychological inference.',route:'student-os.html'},
    {id:'adaptive-pacing',title:'Adaptive Pacing',icon:'⏱️',roles:['student'],description:'Adjust planned learning scope or intensity using explicit available time, planned time and self-reported energy.',route:'student-os.html'},
    {id:'planner',title:'AI Planner',icon:'🗓️',roles:['student'],description:'Generate evidence-based study recommendations within the active parent-approved planning policy and daily minute cap.',route:'student-os.html'},
    {id:'academic-forecast',title:'Academic Forecast',icon:'🔭',roles:['student','parent'],description:'View evidence-based forecasts for supported upcoming assessments, including insufficient-evidence states.',route:'student-os.html'},
    {id:'guardian',title:'AI Guardian',icon:'🛡️',roles:['student','parent'],description:'Use the server-backed academic guardian surface grounded in learner evidence.',route:'student-os.html'},
    {id:'school-calendar',title:'School Calendar',icon:'📅',roles:['student'],description:'Manage learner school-calendar events through the authenticated server-backed calendar path.',route:'student-os.html'},
    {id:'practice-prioritization',title:'Practice Prioritization',icon:'🎯',roles:['student'],description:'Prioritize practice from stored learning evidence without exposing answer keys or inventing scores.',route:'student-os.html'},
    {id:'learning-paths',title:'Learning Paths',icon:'🛤️',roles:['student'],description:'Build an evidence-priority learning path from current learner evidence without claiming an inferred canonical syllabus graph.',route:'student-os.html'},
    {id:'learning-resources',title:'Learning Resources',icon:'📚',roles:['student'],description:'Browse authenticated server-backed learning resources.',route:'student-os.html'},
    {id:'rewards',title:'Rewards',icon:'🏆',roles:['student'],description:'View the server-backed rewards surface for learner progress.',route:'student-os.html'},
    {id:'teacher-analytics',title:'Teacher Analytics',icon:'📊',roles:['teacher','admin'],description:'Review class and learner academic analytics, including concept-level evidence patterns.',route:'teacher-os.html'},
    {id:'career',title:'Career Guidance',icon:'🧭',roles:['student'],description:'Explore academic career alignment grounded in stored learner evidence.',route:'student-os.html'},
    {id:'goals',title:'Goals',icon:'🎯',roles:['student'],description:'Set and track learner academic goals through the authenticated goal workflow.',route:'student-os.html'},
    {id:'teacher-notes',title:'Teacher AI Notes',icon:'📝',roles:['teacher','admin'],description:'Generate bounded evidence-based teacher notes within the teacher/admin workflow.',route:'teacher-os.html'},
    {id:'virtual-labs',title:'Virtual Labs',icon:'🧪',roles:['student'],description:'Run safe deterministic Physics/Mathematics simulations with user-entered inputs.',route:'student-os.html'},
    {id:'community',title:'Community',icon:'👥',roles:['student','teacher','admin'],description:'Use the authenticated community post and moderation workflow with safety boundaries.',route:'student-os.html'},
    {id:'insights',title:'Insights',icon:'💡',roles:['student','parent','teacher','admin'],description:'Review supported academic insight surfaces built from server-backed evidence.',route:'student-os.html'},
    {id:'explainability',title:'Explainability',icon:'🔎',roles:['student','parent','teacher','admin'],description:'See bounded explanations of stored academic evidence without exposing hidden model reasoning.',route:'student-os.html'},
    {id:'low-bandwidth',title:'Low-Bandwidth Learning',icon:'📶',roles:['student'],description:'Persist explicit learner low-bandwidth preferences through the authenticated server path.',route:'student-os.html'},
    {id:'anti-cheating',title:'Assessment Integrity',icon:'🛡️',roles:['student','teacher','admin'],description:'Record assessment-integrity events without automatically failing the learner.',route:'assessment.html'},
    {id:'scholarships',title:'Scholarship Finder',icon:'🎓',roles:['student'],description:'Browse the configured scholarship catalogue through an authenticated fresh-data path.',route:'student-os.html'},
    {id:'mentor-marketplace',title:'Mentor Marketplace',icon:'🤝',roles:['student','parent','teacher','admin'],description:'Use the safeguarded mentor-request workflow with verification and parent-policy controls where applicable.',route:'student-os.html'},
    {id:'erp',title:'ERP Connection',icon:'🔗',roles:['teacher','admin'],description:'Use the vendor-neutral ERP connection boundary; live synchronization remains unavailable until a real provider is configured.',route:'teacher-portal.html'},
    {id:'mistake-archeology',title:'Mistake Archeology',icon:'🧩',roles:['student','teacher'],description:'Review recurring academic mistake patterns derived from stored evidence and assessment findings.',route:'assessment.html'},
    {id:'cognitive-safety',title:'Cognitive Safety',icon:'🧠',roles:['student'],description:'Use student-only cognitive-safety check-ins and server-computed recommendations.',route:'student-os.html'},
    {id:'teacher-diagnostic',title:'Teacher Diagnostic',icon:'🩺',roles:['teacher','admin'],description:'Review evidence-derived instructional diagnostics; this is not a psychological diagnosis.',route:'teacher-os.html'},
    {id:'humane-ui',title:'Humane UI',icon:'❤️',roles:['student','parent','teacher','admin'],description:'Apply actionable interface-safety rules against manipulative, shaming or emotion-inference patterns.',route:'student-os.html'},
    {id:'trust',title:'Trust & Privacy',icon:'🔐',roles:['student','parent','teacher','admin'],description:'Review BAA trust, privacy and data-handling information.',route:'trust-privacy.html'},
    {id:'user-guide',title:'User Guide',icon:'📖',roles:['student','parent','teacher','admin'],description:'Read the written guide to the major BAA OS features.',route:'user-guide.html'},
    {id:'demo',title:'BAA Demo',icon:'▶️',roles:['student','parent','teacher','admin'],description:'Open the product demonstration experience.',route:'demo.html'}
  ];
  function clone(){return FEATURES.map(function(f){return Object.assign({},f,{roles:f.roles.slice()});});}
  global.BAAGuideCatalogue={version:'m63.20',features:FEATURES.slice(),getFeatures:clone,getFeature:function(id){return FEATURES.find(function(f){return f.id===id;})||null;}};

  function loadScript(src,attribute){
    if(document.querySelector('script['+attribute+']')) return;
    const script=document.createElement('script');script.src=src;script.async=false;script.setAttribute(attribute,'1');script.onerror=function(){};document.head.appendChild(script);
  }
  function loadStyle(href,attribute){
    if(document.querySelector('link['+attribute+']')) return;
    const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.setAttribute(attribute,'1');document.head.appendChild(link);
  }
  function startBridges(){
    loadStyle('css/baa-guide-robot.css','data-baa-m63-style');loadScript('js/baa-guide-robot.js','data-baa-m63-robot');
    loadScript('js/baa-m02-custom-mode-server-sync.js','data-baa-m02-server-sync');
    loadScript('js/baa-m03-hybrid-mode-server-sync.js','data-baa-m03-server-sync');
    loadScript('js/baa-m06-mastery-gate.js','data-baa-m06-mastery-gate');loadScript('js/baa-m06-assessment-fresh-sync.js','data-baa-m06-fresh-sync');
    loadScript('js/baa-m09-learning-memory-server-ui.js','data-baa-m09-server-ui');
    loadScript('js/baa-m10-confidence-integration.js','data-baa-m10-integration');loadScript('js/baa-m10-confidence-ui.js','data-baa-m10-ui');
    loadScript('js/baa-m11-planner-integration.js','data-baa-m11-integration');loadScript('js/baa-planner-server-recommendations.js','data-baa-m11-server-recommendations');loadScript('js/baa-m11-planner-server-ui.js','data-baa-m11-server-ui');
    loadScript('js/baa-m13-prediction-integration.js','data-baa-m13-integration');loadScript('js/baa-m12-guardian-ui.js','data-baa-m12-ui');loadScript('js/baa-m12-guardian-server-ui.js','data-baa-m12-server-ui');
    loadScript('js/baa-m18-school-calendar-server.js','data-baa-m18-calendar-server');loadScript('js/baa-m21-23-server.js','data-baa-m21-23-server');
    loadScript('js/baa-m27-learning-resources-server.js','data-baa-m27-server');loadScript('js/baa-m27-learning-resources-ui.js','data-baa-m27-ui');loadScript('js/baa-m29-learning-paths-server.js','data-baa-m29-server');loadScript('js/baa-m29-learning-paths-ui.js','data-baa-m29-ui');
    loadScript('js/baa-m30-rewards-server-ui.js','data-baa-m30-rewards-ui');loadScript('js/baa-m36-insights-server-ui.js','data-baa-m36-insights-server-ui');loadScript('js/baa-m43-scholarship-server-ui.js','data-baa-m43-scholarship-server-ui');loadScript('js/baa-m48-collaboration-server.js','data-baa-m48-server');
    loadScript('js/baa-m04-ai-tutor-server.js','data-baa-m04-tutor-server');loadScript('js/baa-m52-mistake-server-ui.js','data-baa-m52-mistake-server-ui');loadScript('js/baa-server-learner-view.js','data-baa-server-learner-view');loadScript('js/baa-teacher-server-dashboard.js','data-baa-teacher-server-dashboard');
    loadScript('js/baa-m58-teacher-diagnostic-ui.js','data-baa-m58-teacher-diagnostic-ui');loadScript('js/baa-m51-pedagogy-server-ui.js','data-baa-m51-pedagogy-server-ui');loadScript('js/baa-m26-notes-server-ui.js','data-baa-m26-notes-server-ui');
    loadScript('js/baa-m56-adaptive-pacing-server.js','data-baa-m56-adaptive-pacing-server');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startBridges);else startBridges();
})(window);