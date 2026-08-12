# BAA OS — Mastery Gate / Parent Bypass / Exam Forecast Addendum

## Blueprint requirement

BAA must not treat assessment as an isolated score. Assessment findings feed a progression gate: unresolved findings remain red, corrective reassessment turns them green, and the next configured chapter/subject is not opened until the previous chapter is fully green.

## Student experience

- AI Mode / Custom Mode may create learning steps, but assessment entry remains subject to the progression gate.
- Results show red findings and green cleared findings.
- The Student OS shows the current gate and exam forecast.
- The forecast warns about upcoming assessments when evidence indicates elevated risk.

## Parent experience

- Parent OS lists the linked learners.
- Parent selects a learner and chapter.
- Parent re-enters the parent account password.
- Parent provides a reason.
- Server records an audited bypass.
- The bypass does not delete findings.

## Data model

`learning_progression_gates` stores current gate state.

`learning_gate_findings` stores each red/green evidence-backed finding.

`learning_gate_bypasses` stores the parent authorization event and reason.

`assessment_results.finding_details` stores the evaluator findings used to update the gate.

## Roadmap dependency

Assessment content → attempts → evidence → mastery findings → progression gate → corrective reassessment → next chapter/subject.

Forecast dependency:

Assessment history + Learning Evidence + linked upcoming assessment → bounded forecast → student/parent warning.

## Acceptance criteria

1. Real assessment findings render red.
2. Correct reassessment can turn the finding green.
3. Previous chapter red findings block the next configured chapter.
4. Parent bypass requires parent role, learner relationship, password and reason.
5. Bypass is audited and does not delete findings.
6. Forecast is evidence-based and returns insufficient evidence when appropriate.
7. Student and Parent OS expose the feature.
8. Automated tests pass.
