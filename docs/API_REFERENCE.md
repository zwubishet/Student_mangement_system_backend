# REST API Reference

Base URL: `/api/v1`

## Response format

**Success**

```json
{ "success": true, "data": { } }
```

**Error**

```json
{ "success": false, "code": "NOT_FOUND", "message": "Human-readable message" }
```

**Auth header** (protected routes)

```http
Authorization: Bearer <jwt>
```

---

## Public

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/session` | Login `{ email, password }` → JWT + roles |
| POST | `/auth/logout` | Blacklist token |
| GET | `/health` | *(app root, not under v1)* Liveness |
| GET | `/meta` | Deploy module manifest |

---

## Student portal — role `STUDENT`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/student-portal/dashboard` | Home summary |
| GET | `/student-portal/profile` | Profile + `section_id` |
| POST | `/student-portal/change-password` | Password change |
| GET | `/student-portal/timetable` | Weekly slots |
| GET | `/student-portal/attendance?days=60` | Attendance history |
| GET | `/student-portal/exams?term_id=` | Grade report |
| GET | `/student-portal/report-card?term_id=` | PDF download |
| GET | `/student-portal/fees` | Invoices (read-only) |
| GET | `/student-portal/announcements` | Notices |

See [STUDENT_MOBILE_APP.md](./STUDENT_MOBILE_APP.md).

---

## Parent portal — role `PARENT`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/parent-portal/dashboard` | Children summary |
| GET | `/parent-portal/profile` | Parent profile |
| GET | `/parent-portal/children/:studentId` | Child detail |
| GET | `/parent-portal/children/:studentId/grades` | Grade report |
| GET | `/parent-portal/children/:studentId/report-card` | PDF |
| GET | `/parent-portal/fees` | Family fees |
| POST | `/parent-portal/invoices/:id/pay-chapa` | Start Chapa checkout |
| POST | `/parent-portal/change-password` | Password change |

---

## Teacher portal — role `TEACHER`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/teacher-portal/dashboard` | Tasks & alerts |
| GET | `/teacher-portal/classes` | Assignments |
| GET | `/teacher-portal/exams` | Mark entry tasks |
| GET/POST | `/teacher-portal/exams/:examId/schedules/:scheduleId/marks` | Save marks |
| POST | `/teacher-portal/exams/.../submit` | Submit for review |
| GET/POST | `/teacher-portal/sections/:sectionId/attendance` | Roll call |

See [TEACHER_PORTAL.md](./TEACHER_PORTAL.md).

---

## Admin / staff (selection)

| Prefix | Role(s) | Purpose |
|--------|---------|---------|
| `/catalog` | Admin | Academic structure |
| `/students`, `/teachers` | Admin | Roster |
| `/exams` | Admin, Teacher | Exam CRUD |
| `/grading` | Admin | Mark review, term compute |
| `/finance` | Admin, Finance | Billing, payroll |
| `/settings` | Admin | School settings |
| `/resources` | Admin, Teacher, Student, Parent | Library |
| `/attendance` | Admin, Teacher | Attendance admin |
| `/super-admin`, `/platform` | SUPER_ADMIN | Platform control |

Full route definitions: `src/routes/*.js`

---

## Grading (admin)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/grading/mark-review/exam/:examId/schedules/:scheduleId/submit` | Teacher submit |
| POST | `/grading/mark-review/exam/:examId/schedules/:scheduleId/verify` | Admin verify |
| POST | `/grading/mark-review/exam/:examId/lock-all` | Lock + compute |
| POST | `/grading/terms/:termId/compute` | Term weighted grades |
| GET | `/grading/report-card/student/:studentId` | Admin PDF |

---

## GraphQL

Hasura endpoint (when deployed): `/v1/graphql` with same JWT.

Actions documented in main [README](../README.md).

---

## OpenAPI

Machine-readable OpenAPI 3 spec: planned (`docs/openapi.yaml`). For now use this index + portal-specific guides.
