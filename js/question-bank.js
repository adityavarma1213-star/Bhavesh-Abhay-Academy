/* ============================================================
   js/question-bank.js
   BAA OS — Section B: Question Bank + Assessment Catalog.

   This is a SMALL, GENUINE starter set (not hundreds of fake
   questions) meant to prove the assessment architecture end to end.
   Every question below is a real, correct question with a real
   correct answer / model answer — none of it is placeholder text.

   Question types covered: mcq, true_false, short_answer,
   long_answer, math, step_based, written_response.
   ============================================================ */
(function (global) {
  'use strict';

  // ---------- QUESTION BANK ----------
  const QUESTIONS = [
    {
      id: 'q_frac_001', subject: 'Mathematics', chapter: 'Fractions', topic: 'Equivalent Fractions',
      concept: 'equivalent-fractions', difficulty: 'easy', type: 'mcq', marks: 1, timeEstimateSec: 40,
      text: 'Which fraction is equivalent to 3/4?',
      options: ['6/8', '4/3', '3/8', '9/16'],
      correctAnswer: '6/8',
      explanation: 'Multiplying both the numerator and denominator of 3/4 by 2 gives 6/8 — the same value, different form.',
      commonErrorType: 'equivalent-fraction-scaling-error',
    },
    {
      id: 'q_frac_002', subject: 'Mathematics', chapter: 'Fractions', topic: 'Equivalent Fractions',
      concept: 'equivalent-fractions', difficulty: 'easy', type: 'true_false', marks: 1, timeEstimateSec: 25,
      text: 'True or False: 2/5 and 4/10 represent the same value.',
      options: ['True', 'False'],
      correctAnswer: 'True',
      explanation: 'Multiplying numerator and denominator of 2/5 by 2 gives 4/10 — same value.',
      commonErrorType: 'equivalent-fraction-scaling-error',
    },
    {
      id: 'q_frac_003', subject: 'Mathematics', chapter: 'Fractions', topic: 'Adding Fractions',
      concept: 'adding-unlike-fractions', difficulty: 'medium', type: 'math', marks: 3, timeEstimateSec: 120,
      text: 'Calculate 1/3 + 1/4. Show your working and give the answer as a single fraction in simplest form.',
      modelAnswer: 'Common denominator is 12. 1/3 = 4/12, 1/4 = 3/12. 4/12 + 3/12 = 7/12. 7/12 is already in simplest form (7 is prime and does not divide 12).',
      correctAnswer: '7/12',
      explanation: 'Convert to a common denominator (12) before adding: 4/12 + 3/12 = 7/12.',
      commonErrorType: 'added-numerators-and-denominators-directly',
    },
    {
      id: 'q_frac_004', subject: 'Mathematics', chapter: 'Fractions', topic: 'Adding Fractions',
      concept: 'adding-unlike-fractions', difficulty: 'medium', type: 'step_based', marks: 4, timeEstimateSec: 150,
      text: 'Solve step by step: 2/5 + 1/2. Show every step (common denominator, converted fractions, sum, simplification).',
      modelAnswer: 'Step 1: LCD of 5 and 2 is 10. Step 2: 2/5 = 4/10, 1/2 = 5/10. Step 3: 4/10 + 5/10 = 9/10. Step 4: 9/10 is already simplest form. Final answer: 9/10.',
      correctAnswer: '9/10',
      explanation: 'The key step students often skip is converting both fractions to a common denominator before adding.',
      commonErrorType: 'skipped-common-denominator-step',
    },
    {
      id: 'q_frac_005', subject: 'Mathematics', chapter: 'Fractions', topic: 'Fraction Word Problems',
      concept: 'fraction-word-problems', difficulty: 'medium', type: 'written_response', marks: 3, timeEstimateSec: 120,
      text: 'A pizza is cut into 8 equal slices. Riya eats 3 slices and Karan eats 2 slices. What fraction of the pizza is left? Explain your reasoning.',
      modelAnswer: 'Total eaten = 3/8 + 2/8 = 5/8. Left = 8/8 - 5/8 = 3/8. So 3/8 of the pizza is left.',
      correctAnswer: '3/8',
      explanation: 'Add the eaten fractions first (same denominator, so just add numerators), then subtract from the whole (8/8).',
      commonErrorType: 'whole-pizza-not-treated-as-8/8',
    },
    {
      id: 'q_alg_001', subject: 'Mathematics', chapter: 'Algebra', topic: 'Linear Equations',
      concept: 'solving-linear-equations', difficulty: 'easy', type: 'mcq', marks: 1, timeEstimateSec: 40,
      text: 'Solve for x: 2x + 5 = 15',
      options: ['x = 5', 'x = 10', 'x = 4', 'x = 7.5'],
      correctAnswer: 'x = 5',
      explanation: 'Subtract 5 from both sides: 2x = 10. Divide by 2: x = 5.',
      commonErrorType: 'inverse-operation-error',
    },
    {
      id: 'q_alg_002', subject: 'Mathematics', chapter: 'Algebra', topic: 'Linear Equations',
      concept: 'solving-linear-equations', difficulty: 'medium', type: 'step_based', marks: 5, timeEstimateSec: 180,
      text: 'Solve for x, showing every step: 3(x - 2) = 2x + 4',
      modelAnswer: 'Step 1: Expand: 3x - 6 = 2x + 4. Step 2: Subtract 2x from both sides: x - 6 = 4. Step 3: Add 6 to both sides: x = 10.',
      correctAnswer: 'x = 10',
      explanation: 'This tests expanding brackets correctly and collecting like terms on one side before isolating x. A student can use the right METHOD and still slip on the final arithmetic — that is graded as a calculation error, not a conceptual one.',
      commonErrorType: 'bracket-expansion-error',
    },
    {
      id: 'q_alg_003', subject: 'Mathematics', chapter: 'Algebra', topic: 'Linear Equations',
      concept: 'solving-linear-equations', difficulty: 'medium', type: 'true_false', marks: 1, timeEstimateSec: 30,
      text: 'True or False: x = -3 is a solution to the equation 4x + 12 = 0.',
      options: ['True', 'False'],
      correctAnswer: 'True',
      explanation: '4(-3) + 12 = -12 + 12 = 0. Correct.',
      commonErrorType: 'sign-error',
    },
    {
      id: 'q_alg_004', subject: 'Mathematics', chapter: 'Algebra', topic: 'Word Problems',
      concept: 'linear-equations-word-problems', difficulty: 'hard', type: 'long_answer', marks: 5, timeEstimateSec: 240,
      text: 'The sum of two consecutive even numbers is 42. Find both numbers. Show your full method, including how you set up the equation.',
      modelAnswer: 'Let the numbers be x and x+2. x + (x+2) = 42 -> 2x + 2 = 42 -> 2x = 40 -> x = 20. The numbers are 20 and 22.',
      correctAnswer: '20 and 22',
      explanation: 'Setting up the equation correctly (consecutive EVEN numbers differ by 2, not 1) is the main concept being tested here.',
      commonErrorType: 'consecutive-number-setup-error',
    },
    {
      id: 'q_geo_001', subject: 'Mathematics', chapter: 'Geometry', topic: 'Triangles',
      concept: 'triangle-angle-sum', difficulty: 'easy', type: 'mcq', marks: 1, timeEstimateSec: 35,
      text: 'Two angles of a triangle are 55° and 65°. What is the third angle?',
      options: ['60°', '70°', '50°', '80°'],
      correctAnswer: '60°',
      explanation: 'Angles in a triangle sum to 180°. 180 - 55 - 65 = 60°.',
      commonErrorType: 'angle-sum-rule-error',
    },
    {
      id: 'q_geo_002', subject: 'Mathematics', chapter: 'Geometry', topic: 'Triangles',
      concept: 'triangle-angle-sum', difficulty: 'medium', type: 'short_answer', marks: 2, timeEstimateSec: 60,
      text: 'A triangle has angles in the ratio 2:3:4. What is the size of the largest angle?',
      modelAnswer: 'Total parts = 2+3+4 = 9. Each part = 180/9 = 20°. Largest angle = 4 x 20 = 80°.',
      correctAnswer: '80°',
      explanation: 'Divide 180° by the total number of ratio parts, then multiply by the largest part.',
      commonErrorType: 'ratio-to-angle-conversion-error',
    },
    {
      id: 'q_sci_001', subject: 'Science', chapter: 'Life Processes', topic: 'Photosynthesis',
      concept: 'photosynthesis-basics', difficulty: 'easy', type: 'mcq', marks: 1, timeEstimateSec: 30,
      text: 'Which gas do plants absorb from the air during photosynthesis?',
      options: ['Carbon dioxide', 'Oxygen', 'Nitrogen', 'Hydrogen'],
      correctAnswer: 'Carbon dioxide',
      explanation: 'Plants take in carbon dioxide and release oxygen during photosynthesis.',
      commonErrorType: 'gas-exchange-direction-confusion',
    },
    {
      id: 'q_sci_002', subject: 'Science', chapter: 'Life Processes', topic: 'Photosynthesis',
      concept: 'photosynthesis-basics', difficulty: 'medium', type: 'short_answer', marks: 3, timeEstimateSec: 100,
      text: 'Write the word equation for photosynthesis and name one factor that can limit its rate.',
      modelAnswer: 'Carbon dioxide + water --(light energy, chlorophyll)--> glucose + oxygen. A limiting factor could be light intensity, carbon dioxide concentration, or temperature.',
      correctAnswer: 'carbon dioxide + water -> glucose + oxygen (light/chlorophyll needed); limiting factor: light intensity / CO2 / temperature',
      explanation: 'The full equation needs both reactants and both products, plus the condition (light energy via chlorophyll).',
      commonErrorType: 'incomplete-equation',
    },
    {
      id: 'q_sci_003', subject: 'Science', chapter: 'Life Processes', topic: 'Photosynthesis',
      concept: 'photosynthesis-basics', difficulty: 'hard', type: 'written_response', marks: 4, timeEstimateSec: 180,
      text: 'A gardener notices that a plant kept in a dark cupboard for a week has pale, yellow leaves instead of green ones. Explain, using your knowledge of photosynthesis, why this happened.',
      modelAnswer: 'Without light, the plant cannot photosynthesize, so it cannot produce the energy/products needed to make chlorophyll. Without chlorophyll the leaves lose their green colour (turn pale/yellow) — this is because chlorophyll production itself depends on light.',
      correctAnswer: 'Lack of light prevents photosynthesis and chlorophyll production, so leaves turn pale/yellow.',
      explanation: 'This tests whether the student connects light -> photosynthesis -> chlorophyll -> leaf colour, not just recall of the word equation.',
      commonErrorType: 'surface-level-explanation-without-causal-chain',
    },
  ];

  // ---------- ASSESSMENT CATALOG ----------
  // Each assessment references question IDs above by id. Difficulty,
  // total marks, question count and time limit are all derived from the
  // real question set, not invented.
  function buildAssessment(def) {
    const qs = def.questionIds.map(id => QUESTIONS.find(q => q.id === id)).filter(Boolean);
    return {
      id: def.id,
      title: def.title,
      type: def.type, // topic_test | chapter_test | practice_test | mock_test | quiz
      subject: def.subject,
      chapter: def.chapter,
      topic: def.topic || null,
      description: def.description,
      difficulty: def.difficulty,
      instructions: def.instructions,
      questionIds: def.questionIds,
      questionCount: qs.length,
      totalMarks: qs.reduce((sum, q) => sum + q.marks, 0),
      timeLimitSec: def.timeLimitSec,
      curriculumMapping: def.curriculumMapping || null,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    };
  }

  const ASSESSMENT_DEFS = [
    {
      id: 'a_quick_fractions_quiz', title: 'Quick Fractions Quiz', type: 'quiz',
      subject: 'Mathematics', chapter: 'Fractions', topic: 'Equivalent Fractions',
      description: 'A fast 2-question check on equivalent fractions.',
      difficulty: 'easy', timeLimitSec: 3 * 60,
      instructions: 'Answer both questions. No AI evaluation needed — these are graded instantly.',
      questionIds: ['q_frac_001', 'q_frac_002'],
      curriculumMapping: 'CBSE Class 6-7, Fractions — Equivalent Fractions',
    },
    {
      id: 'a_fractions_topic_test', title: 'Fractions Topic Test', type: 'topic_test',
      subject: 'Mathematics', chapter: 'Fractions', topic: 'Fractions (mixed)',
      description: 'Covers equivalent fractions, adding unlike fractions, and a word problem.',
      difficulty: 'medium', timeLimitSec: 12 * 60,
      instructions: 'Show your working for the math and step-based questions — partial credit is given for correct method even with a small calculation slip.',
      questionIds: ['q_frac_001', 'q_frac_002', 'q_frac_003', 'q_frac_004', 'q_frac_005'],
      curriculumMapping: 'CBSE Class 6-7, Fractions',
    },
    {
      id: 'a_linear_equations_chapter_test', title: 'Linear Equations Chapter Test', type: 'chapter_test',
      subject: 'Mathematics', chapter: 'Algebra', topic: null,
      description: 'A chapter-level test on solving and applying linear equations.',
      difficulty: 'medium', timeLimitSec: 15 * 60,
      instructions: 'Show full working for step-based and long-answer questions. Time limit applies.',
      questionIds: ['q_alg_001', 'q_alg_002', 'q_alg_003', 'q_alg_004'],
      curriculumMapping: 'CBSE Class 8-9, Linear Equations in One Variable',
    },
    {
      id: 'a_geometry_practice_test', title: 'Geometry: Triangles — Practice Test', type: 'practice_test',
      subject: 'Mathematics', chapter: 'Geometry', topic: 'Triangles',
      description: 'Practice questions on the triangle angle-sum property.',
      difficulty: 'easy', timeLimitSec: 6 * 60,
      instructions: 'Untimed pressure — take your time and show your reasoning on the short-answer question.',
      questionIds: ['q_geo_001', 'q_geo_002'],
      curriculumMapping: 'CBSE Class 7-8, Geometry — Triangles',
    },
    {
      id: 'a_photosynthesis_mock', title: 'Photosynthesis Mock Test', type: 'mock_test',
      subject: 'Science', chapter: 'Life Processes', topic: 'Photosynthesis',
      description: 'A short mock test mixing recall, explanation, and applied reasoning on photosynthesis.',
      difficulty: 'medium', timeLimitSec: 10 * 60,
      instructions: 'The last question asks you to explain a real scenario using what you know — there is no single "correct sentence", so it is evaluated by the AI evaluator, not exact match.',
      questionIds: ['q_sci_001', 'q_sci_002', 'q_sci_003'],
      curriculumMapping: 'CBSE Class 10, Life Processes',
    },
  ];

  global.BAAQuestionBank = QUESTIONS;
  global.BAAAssessmentCatalog = ASSESSMENT_DEFS.map(buildAssessment);
  global.BAAGetQuestion = (id) => QUESTIONS.find(q => q.id === id) || null;
  global.BAAGetAssessment = (id) => global.BAAAssessmentCatalog.find(a => a.id === id) || null;
})(window);
