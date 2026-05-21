# Teacher portal — production architecture

REST-first faculty workspace mirroring school admin patterns: `TeacherLayout`, `/api/v1/teacher-portal/*`, role `TEACHER`, scope via `academic.teacherassignments`.

## API surface

| Method | Path | Phase | Description |
|--------|------|-------|-------------|
| GET | `/dashboard` | 1 | Stats, classes, alerts, licence, notifications |
| GET | `/classes` | 1 | Teaching assignments |
| GET | `/classes/:sectionId` | 1 | Roster + today attendance |
| GET | `/students` | 1 | Search students in assigned sections |
| GET | `/students/:studentId` | 1 | Read-only profile + summaries |
| GET/POST | `/sections/:sectionId/attendance` | 1 | Roll call |
| GET | `/exams` | 1 | Exam mark tasks (schedules) |
| GET/POST | `/exams/:examId/schedules/:scheduleId/marks` | 1 | Draft mark entry |
| POST | `/exams/:examId/schedules/:scheduleId/submit` | 1 | Submit for admin review |
| GET | `/notifications` | 2 | Rejected / pending mark alerts |
| GET | `/me` | 3 | Self profile (no payroll) |
| GET | `/timetable` | 2 | Read-only weekly slots |
| GET | `/sections/:sectionId/roster/export` | 3 | CSV roster download |
| GET | `/sections/:sectionId/report-preview` | 4 | Computed results preview |
| GET | `/sections/:sectionId/guardians` | 4 | Guardian directory (read-only) |

## Frontend routes

| Path | Page |
|------|------|
| `/teachers/dashboard` | Dashboard + quick actions + alerts |
| `/teachers/classes` | Assignments list |
| `/teachers/classes/:sectionId` | Roster, export, results, guardians |
| `/teachers/classes/:sectionId/report` | Class results preview |
| `/teachers/classes/:sectionId/guardians` | Guardian directory |
| `/teachers/exams` | Exams hub |
| `/teachers/exams/section/:sectionId` | Filtered exams |
| `/teachers/exams/:examId/mark/:scheduleId` | Mark entry |
| `/teachers/attendance` | Attendance hub |
| `/teachers/students` | Student search |
| `/teachers/timetable` | Weekly timetable |
| `/teachers/profile` | Profile, leave, CPD |

Legacy GraphQL routes redirect to `/teachers/exams`.

## Mark workflow (teacher)

1. Save draft → `POST .../marks`
2. Submit → `POST .../submit` → `mark_status = submitted`
3. Admin verify / reject → teacher sees notification
4. Rejected → edit draft → resubmit
5. Admin lock → `computed_results` → class report preview

## Test accounts

- `teacher01@demo.local` / `Teacher123!`
- `admin@demoschool.edu` / `DemoAdmin123!`
- Seeded exam: **Demo Midterm 2025** (ACTIVE, all demo classes × Mathematics)

## Module map

- `src/services/teacherPortalService.js` — all portal logic
- `src/routes/teacherPortalRoutes.js`
- `src/controllers/teacherPortalController.js`
- `Student_mangement_system_director_dashbored/src/pages/teacher-portal/*`
- `scripts/seed-demo-academy.mjs` — bulk data + demo exam
