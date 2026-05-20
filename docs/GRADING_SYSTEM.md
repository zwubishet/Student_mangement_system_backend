# Grading system architecture

Aligned with existing SMS conventions: **`school_id`** (not `tenant_id`), grade rows in **`operations.examresults`**, REST under **`/api/v1`**, validation via **Joi**.

## Migrations

| Migration | Purpose |
|-----------|---------|
| `1780400000000_operations_exams_high_scale` | Exams, schedules, enriched examresults |
| `1780500000000_grading_system_foundation` | Exam types, term weights, scale profiles, mark workflow, computation, alerts, overrides, report_cards, analytics |

Apply: `./scripts/sms-dev.sh migrate` or `migrate-psql`

## API map

### Exams (existing)
`/api/v1/exams` — CRUD, schedules, mark entry, results, term calculate

### Grading (new)
`/api/v1/grading/grading-scales/active` — active profile + bands  
`/api/v1/grading/grading-scales` — create versioned profile (POST)  
`/api/v1/grading/grading-scales/:id/activate` — switch active scale  
`/api/v1/grading/grading-scales/preview?score=75` — preview letter/GPA  
`/api/v1/grading/exam-types` — per-school exam types  
`/api/v1/grading/terms/:termId/assessment-weights` — GET/PUT (must sum 100%)  
`/api/v1/grading/exam-schedules/conflicts` — conflict check before schedule  
`/api/v1/grading/mark-review/exam/:examId` — review overview  
`/api/v1/grading/mark-review/exam/:examId/lock-all` — lock + enqueue computation  
`/api/v1/grading/computation-runs/process` — process pending jobs (admin)  

## Modules

| File | Role |
|------|------|
| `src/services/grading/gradeEngine.js` | Pure formulas (score→grade, weighted avg, ranks) |
| `src/services/grading/gradeStateMachine.js` | draft → submitted → verified → locked |
| `src/services/grading/gradingScaleService.js` | Versioned scale profiles + bands |
| `src/services/grading/examTypeService.js` | Exam types + term weight budgets |
| `src/services/grading/scheduleConflictService.js` | Room/class/invigilator conflicts |
| `src/services/grading/markReviewService.js` | Submit, verify, reject, lock |
| `src/services/grading/computationService.js` | Exam/term computation + job queue |

Worker: `node scripts/computation-worker.mjs`

## Workflow

1. Configure exam types + term weights (sum 100%).
2. Create exam (DRAFT) → add schedules (conflict check).
3. Teachers save marks (draft) via `/exams/:id/schedules/:sid/marks`.
4. Teachers submit → `/grading/mark-review/.../submit`.
5. Admin verify → reject optional → **lock-all** → computation run.
6. Results in `operations.computed_results` + legacy `academic.term_summaries`.

## Phases still to build (frontend + polish)

- Phases 4–5 UI: submit/verify/reject on ExamDetailPage
- Phase 3: bulk schedule, publish + SMS
- Phase 7: results export (XLSX), mark alerts cron
- Phase 8–9: overrides, appeals, Puppeteer report cards
- Phase 10: analytics dashboards from `analytics_snapshots`
- Unify `academic.grade_scales` (Settings) with `operations.grading_scale_profiles`

## Edge cases implemented

- Exam edit blocked after any mark exists
- Closed term blocks new exam changes
- Scale change versions via profiles; marks store `scale_profile_id`
- Absent → 0% or exclude via `subject_grade_configs.absent_policy`
- Ethiopian default bands seeded (A 90–100, B 80–89, …)
