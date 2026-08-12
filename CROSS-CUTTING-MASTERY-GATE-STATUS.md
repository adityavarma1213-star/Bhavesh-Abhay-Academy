# BAA OS — Cross-Cutting Mastery Gate, Parent Bypass & Exam Forecast

## Purpose

BAA now has a cross-cutting progression control that connects assessment findings to chapter/module progression without inventing mastery.

### Student rule

1. A student studies through **AI Mode, Custom Mode, or another BAA learning path**.
2. When an assessment/exam is submitted, BAA records evidence-backed findings.
3. Findings appear **🔴 red** when unresolved.
4. A later assessment can clear the same finding; the finding becomes **🟢 green**.
5. The next chapter/subject in the configured assessment progression is blocked while the previous chapter has unresolved red findings.
6. A chapter with no findings remains open; BAA does not manufacture errors where no assessment evidence exists.

### Parent bypass

A linked parent can authorize a specific chapter bypass from Parent OS by:

- selecting the learner;
- selecting the chapter;
- re-entering the parent account password;
- entering a reason (minimum 10 characters).

The authorization is server-side, learner-scoped, audited, and does not erase the student's findings. The next assessment in that chapter re-checks the gate.

### Exam forecast

For upcoming assessments linked to a real BAA assessment, BAA provides a bounded evidence-based percentage estimate and warning level. Forecasts use real assessment attempts and learning evidence. If evidence is insufficient, BAA says so instead of inventing a percentage.

Warning levels:

- **Urgent:** predicted result below 60%.
- **Caution:** 60–74%.
- **Exam-close caution:** below 75% with 14 days or less remaining.
- **Monitor:** 75% or higher.

These are learning-support signals, not guarantees, grades, medical predictions, or psychological predictions.

## Architecture

- `db/migrations/007_mastery_gates_and_forecast.sql`
- `api/v1/progression-gate.js`
- `api/v1/academic-forecast.js`
- `js/baa-progression-gate.js`
- `assessment.html`
- `student-os.html`
- `parent-os.html`
- `api/v1/assessment.js`
- `api/evaluate.js`

## Security

Parent bypass requires an authenticated parent session, an active `parent_learner` relationship, and password re-authentication. The bypass does not delete or rewrite learning evidence.

## Limitation

The progression sequence currently follows the assessment catalog's server-known subject/chapter order. Future curriculum-specific sequencing should replace this generic ordering with an institution/curriculum-defined progression graph.
