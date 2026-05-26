# Student Mobile App — Developer Specification & Build Plan

This document is the handoff guide for building a **native or cross-platform student mobile app** (React Native, Flutter, Kotlin, Swift, etc.) against the existing School Management System (SMS) backend.

The web student portal (`/student/`* in the dashboard) is the reference UX. The mobile app should consume the **same REST APIs** documented here.

---

## Table of contents

1. [Product scope](#1-product-scope)
2. [Architecture overview](#2-architecture-overview)
3. [Authentication & session](#3-authentication--session)
4. [API conventions](#4-api-conventions)
5. [Screen map & API wiring](#5-screen-map--api-wiring)
6. [API reference (student portal)](#6-api-reference-student-portal)
7. [Supplementary APIs (resources)](#7-supplementary-apis-resources)
8. [Grades & report cards](#8-grades--report-cards)
9. [Data models & field notes](#9-data-models--field-notes)
10. [Error handling & edge cases](#10-error-handling--edge-cases)
11. [Mobile UX recommendations](#11-mobile-ux-recommendations)
12. [Implementation plan (phases)](#12-implementation-plan-phases)
13. [Test accounts & seed data](#13-test-accounts--seed-data)
14. [Out of scope / future APIs](#14-out-of-scope--future-apis)
15. [Backend source map](#15-backend-source-map)

---

## 1. Product scope

### What the student app should do (v1)


| Feature           | Description                                                       | Priority |
| ----------------- | ----------------------------------------------------------------- | -------- |
| Login / logout    | Email + password; JWT stored securely on device                   | P0       |
| Home dashboard    | Attendance, grades, fees, announcements summary + today's classes | P0       |
| Timetable         | Weekly class schedule for enrolled section                        | P0       |
| Attendance        | Summary + recent daily records                                    | P0       |
| Grades / exams    | Published marks, by exam, by subject, term filter                 | P0       |
| Report card PDF   | Download official PDF for a term                                  | P1       |
| Fee invoices      | Read-only list of invoices and balances                           | P1       |
| Announcements     | School notices targeted to students                               | P1       |
| Class resources   | Materials shared with student's section                           | P1       |
| Account / profile | View profile, change password                                     | P1       |


### What students cannot do (by design)

- Enter or edit marks (teacher/admin only)
- Pay fees in-app (parent portal has Chapa payment; student portal is **read-only** for fees)
- Switch schools (tenant is embedded in JWT)
- Access other students' data

---

## 2. Architecture overview

```
┌─────────────────┐     HTTPS JSON      ┌──────────────────────────────┐
│  Student Mobile │ ◄──────────────────► │  Express API                 │
│  App            │   Bearer JWT         │  /api/v1/*                   │
└─────────────────┘                      └──────────────┬───────────────┘
                                                        │
                        ┌───────────────────────────────┼───────────────────────────────┐
                        │                               │                               │
                 student-portal/*              resources/*                    auth/session
                 (role: STUDENT)                 (role: STUDENT)                 (public)
```

- **Base path:** `/api/v1`
- **Default local URL:** `http://localhost:3003/api/v1` (production URL provided per deployment)
- **Auth:** JWT Bearer token from `POST /auth/session`
- **Tenant isolation:** `school_id` is inside the token; student APIs resolve the logged-in student from `user_id` — **never pass `student_id` in URLs** for portal routes
- **Role gate:** All `/student-portal/`* routes require JWT role `STUDENT`

Reference web implementation:

- API client: `Student_mangement_system_director_dashbored/src/api/services.js` → `studentPortalApi`
- Pages: `Student_mangement_system_director_dashbored/src/pages/student/*`

---

## 3. Authentication & session

### Login

**Request**

```http
POST /api/v1/auth/session
Content-Type: application/json

{
  "email": "demo-g9a-001@demo.local",
  "password": "Student123!"
}
```

**Success response (200)**

```json
{
  "success": true,
  "data": {
    "id": "774231c6-a3de-4a95-8663-dbf259650696",
    "token": "<JWT>",
    "email": "demo-g9a-001@demo.local",
    "first_name": "Dereje",
    "last_name": "Kassa",
    "school_id": "ab715d1d-d8d6-4e58-8fa1-d98acbf2c996",
    "roles": ["STUDENT"]
  }
}
```

**Mobile implementation notes**

1. Reject login if `roles` does not include `STUDENT` (show “This app is for students only”).
2. Store `token` in secure storage (Keychain / Keystore / EncryptedSharedPreferences).
3. Optionally cache `first_name`, `last_name`, `email`, `school_id` for offline header display.
4. Token expiry: **24 hours** (`ACCESS_TOKEN_SECRET`, `expiresIn: '1d'`).
5. Attach token to every authenticated request:

```http
Authorization: Bearer <token>
```

### Logout

```http
POST /api/v1/auth/logout
Authorization: Bearer <token>
```

Response:

```json
{ "message": "Logged out successfully" }
```

The token is blacklisted in Redis for 24h. Clear local storage after a successful logout.

### Session refresh

There is **no refresh-token endpoint** today. When the API returns `401` with code `TOKEN_EXPIRED`, navigate to login and clear stored credentials.

### Role verification after login

Only users with role `STUDENT` should use student portal endpoints. A user with multiple roles still receives one JWT with all roles in Hasura claims; the default role is used for authorization.

---

## 4. API conventions

### Success envelope

Almost all JSON endpoints return:

```json
{
  "success": true,
  "data": { ... }
}
```

Paginated endpoints (resources list) may include:

```json
{
  "success": true,
  "data": [ ... ],
  "meta": { "total": 100, "page": 1, "limit": 24, "totalPages": 5 }
}
```

### Error envelope

```json
{
  "success": false,
  "code": "INVALID_CREDENTIALS",
  "message": "Incorrect email or password"
}
```

Common HTTP status codes:


| Status | Meaning                                            |
| ------ | -------------------------------------------------- |
| 400    | Validation error                                   |
| 401    | Not logged in / bad password / expired token       |
| 403    | Wrong role (not STUDENT) or resource access denied |
| 404    | Student profile not found                          |
| 500    | Server error                                       |


Common `code` values: `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`.

### Binary responses

`GET /student-portal/report-card` returns `**application/pdf**` bytes (not JSON). Handle as file download / in-app PDF viewer.

### Date & time

- Timestamps: ISO 8601 UTC strings, e.g. `"2026-05-25T00:00:00.000Z"`
- Timetable times: `"08:00:00"` (24h, treat as local wall-clock for display)
- `day_of_week`: **1 = Monday … 7 = Sunday** (not JavaScript's 0-based Sunday)

### Amounts

Fee fields are decimal strings from Postgres, e.g. `"19000.00"`. Parse with `Number()` or a decimal library; display as ETB currency.

---

## 5. Screen map & API wiring

Recommended navigation structure and which API each screen calls.

```
Login
  └─ POST /auth/session

Main tabs
├─ Home (Dashboard)     → GET /student-portal/dashboard
├─ Timetable            → GET /student-portal/timetable
├─ Grades               → GET /student-portal/exams
│    └─ Report PDF      → GET /student-portal/report-card?term_id=
├─ More
│    ├─ Attendance      → GET /student-portal/attendance?days=60
│    ├─ Fees            → GET /student-portal/fees
│    ├─ Announcements   → GET /student-portal/announcements
│    ├─ Resources       → GET /student-portal/profile (section_id)
│    │                    GET /resources/section/:sectionId
│    │                    GET /resources/:id/access
│    └─ Account         → GET /student-portal/profile
│                         POST /student-portal/change-password
```

### Screen-by-screen behavior

#### 5.1 Login screen

- Fields: email, password
- Call `POST /auth/session`
- On success: verify `STUDENT` role → store token → go to Home
- On failure: show `message` from error body

#### 5.2 Home / Dashboard

- **API:** `GET /student-portal/dashboard`
- **Show:**
  - Student name, admission number, grade, section, academic year
  - Attendance rate (30 days) → tap opens Attendance
  - Published grades count + average % → tap opens Grades
  - Fee balance + open invoice count → tap opens Fees
  - Announcements count → tap opens Announcements
  - Today's timetable list → tap opens Timetable
- **Refresh:** pull-to-refresh; cache last response for offline banner (optional)

#### 5.3 Timetable

- **API:** `GET /student-portal/timetable`
- **Show:** section header + weekly grid or day tabs
- Group `slots` by `day_of_week`; sort by `period_number`
- Display subject, teacher, start/end time

#### 5.4 Attendance

- **API:** `GET /student-portal/attendance?days=60` (allowed range: 7–180)
- **Show:**
  - Summary card: total days, present count, rate %
  - Breakdown by status (`present`, `absent`, `late`, etc.)
  - Recent list (last 40 records): date, status, notes

#### 5.5 Grades

- **API:** `GET /student-portal/exams` or `?term_id=<uuid>`
- **Show:** mirror web `GradeReportView`:
  - Summary stats: total marks, average %, pass/fail counts
  - Term picker from `terms[]`
  - Views: **By exam** (`by_exam`), **By subject** (`by_subject`)
  - Term results from `term_results` / `computed_results` (weighted term grades)
- **Important copy for users:** only **published** exams with **verified/locked** marks appear. Draft or pending marks are hidden.

#### 5.6 Report card PDF

- **API:** `GET /student-portal/report-card?term_id=<optional>`
- Save/open PDF (Share sheet on mobile)
- Show loading state; handle empty grades gracefully

#### 5.7 Fees

- **API:** `GET /student-portal/fees`
- **Show:** total balance + invoice list
- Each invoice: academic year, term, amount, paid, balance, status, due date, line items
- **Read-only** — no payment flow for students in current API

#### 5.8 Announcements

- **API:** `GET /student-portal/announcements`
- List up to 40 items; sort urgent first
- Show title, content, priority, author, created date, expiry if any

#### 5.9 Class resources

Two-step flow (same as web):

1. `GET /student-portal/profile` → read `section_id`
2. `GET /resources/section/{sectionId}?search=&limit=40`

On item tap:

1. `GET /resources/{resourceId}/access?action=view` → open returned `url` in WebView or external browser

Optional: `?action=download` for download analytics.

#### 5.10 Account

- **Profile:** `GET /student-portal/profile`
- **Change password:** `POST /student-portal/change-password`

```json
{
  "current_password": "Student123!",
  "new_password": "NewPass456!"
}
```

New password minimum length: **6 characters**.

---

## 6. API reference (student portal)

All routes require `Authorization: Bearer <token>` and role `STUDENT`.

Base: `/api/v1/student-portal`

### GET `/dashboard`

Aggregated home data for the logged-in student.

**Response `data` shape:**

```json
{
  "student": {
    "id": "uuid",
    "first_name": "Dereje",
    "last_name": "Kassa",
    "admission_number": "DEMO-G9A-001",
    "grade_name": "Grade 9",
    "section_name": "A",
    "academic_year": "2025/2026",
    "enrollment_status": "active"
  },
  "attendance_summary": {
    "total": 18,
    "present": 16,
    "rate": 89
  },
  "fees_summary": {
    "open_invoices": 1,
    "balance": 19000
  },
  "academics_summary": {
    "published_results": 3,
    "average_percent": 62.3,
    "computed_results": 4
  },
  "announcements_count": 2,
  "today_timetable": [
    {
      "period_number": 1,
      "subject_name": "Mathematics",
      "start_time": "08:00:00",
      "end_time": "08:45:00",
      "teacher_name": "Abebe Tesfaye"
    }
  ]
}
```

**How to use:** single call for home screen; avoids 4–5 parallel requests on launch.

---

### GET `/profile`

Full student context for profile and to obtain `section_id` for resources.

**Response `data` fields:**


| Field                        | Type          | Description                    |
| ---------------------------- | ------------- | ------------------------------ |
| `id`                         | uuid          | Student record ID              |
| `first_name`, `last_name`    | string        | Legal/roster name              |
| `admission_number`           | string        | School ID on reports           |
| `gender`                     | string        | e.g. `male`, `female`          |
| `date_of_birth`              | ISO date      |                                |
| `login_email`                | string        | Login email                    |
| `phone`                      | string | null |                                |
| `enrollment_id`              | uuid          | Active enrollment              |
| `section_id`                 | uuid          | **Required for resources API** |
| `academic_year_id`           | uuid          |                                |
| `section_name`, `grade_name` | string        | Display labels                 |
| `grade_id`                   | uuid          |                                |
| `academic_year`              | string        | e.g. `2025/2026`               |
| `year_is_current`            | boolean       |                                |
| `enrollment_status`          | string        | e.g. `active`                  |
| `display_name`               | string        | `"First Last"`                 |


---

### GET `/timetable`

**Response `data`:**

```json
{
  "section": {
    "name": "A",
    "grade_name": "Grade 9",
    "academic_year": "2025/2026"
  },
  "slots": [
    {
      "id": "uuid",
      "day_of_week": 1,
      "period_number": 1,
      "start_time": "08:00:00",
      "end_time": "08:45:00",
      "subject_name": "Mathematics",
      "teacher_name": "Abebe Tesfaye"
    }
  ]
}
```

If student has no active enrollment: `{ "slots": [], "section": null }`.

---

### GET `/attendance`

**Query parameters**


| Param  | Default | Range | Description                |
| ------ | ------- | ----- | -------------------------- |
| `days` | 60      | 7–180 | Rolling window for summary |


**Response `data`:**

```json
{
  "days": 60,
  "summary": { "total": 42, "present": 38, "rate": 90 },
  "by_status": [
    { "status": "present", "count": 38 },
    { "status": "absent", "count": 3 },
    { "status": "late", "count": 1 }
  ],
  "recent": [
    { "date": "2026-05-20", "status": "present", "notes": null }
  ]
}
```

Attendance status values come from school configuration; common values: `present`, `absent`, `late`, `excused`.

---

### GET `/exams`

Full grade report for the logged-in student.

**Query parameters**


| Param     | Description                        |
| --------- | ---------------------------------- |
| `term_id` | Optional UUID — filter to one term |


**Response `data`:**

```json
{
  "summary": {
    "total_marks": 3,
    "absent_count": 0,
    "passed_count": 1,
    "failed_count": 2,
    "average_percent": "62.3"
  },
  "terms": [
    {
      "id": "40359a1b-d5b4-49fa-a65f-a31daf0e6858",
      "name": "Semester 1",
      "academic_year": "2025/2026"
    }
  ],
  "exam_marks": [ /* flat list — see below */ ],
  "by_exam": [
    {
      "exam_id": "uuid",
      "exam_name": "Demo Midterm 2025",
      "exam_type": "midterm",
      "exam_date": "2026-03-15T00:00:00.000Z",
      "term_name": "Semester 1",
      "term_id": "uuid",
      "subjects": [ /* mark objects for this exam */ ]
    }
  ],
  "by_subject": [
    {
      "subject_id": "uuid",
      "subject_name": "Mathematics",
      "marks": [ /* mark objects */ ],
      "avg_percent": 52.0
    }
  ],
  "computed_results": [ /* all computed rows for published exams */ ],
  "term_results": [ /* subject_term + term_total scopes */ ],
  "exam_results": [ /* result_scope = exam */ ]
}
```

**Each mark object in `exam_marks`:**


| Field                                 | Description                             |
| ------------------------------------- | --------------------------------------- |
| `exam_name`, `exam_type`, `exam_date` | Exam metadata                           |
| `subject_name`, `subject_id`          | Subject                                 |
| `score`                               | Raw score (string decimal)              |
| `max_score`, `pass_score`             | Out of / pass threshold                 |
| `percent`                             | 0–100 computed percentage               |
| `letter_grade`                        | e.g. A, B, C, D, F                      |
| `is_absent`                           | boolean                                 |
| `is_passed`, `passed`                 | Pass flags                              |
| `mark_status`                         | Always `verified` or `locked` in portal |
| `recorded_at`                         | Date mark was entered                   |


**Computed result object (term/subject rollup):**


| Field                            | Description                             |
| -------------------------------- | --------------------------------------- |
| `subject_name`                   |                                         |
| `percentage`                     | Weighted term %                         |
| `grade_letter`, `gpa_points`     |                                         |
| `rank_in_class`, `rank_in_grade` | Optional ranks                          |
| `result_scope`                   | `subject_term`, `term_total`, or `exam` |
| `term_name`, `term_id`           |                                         |


---

### GET `/report-card`

Returns **PDF binary** (not JSON).

**Query:** `term_id` (optional)

**Headers in response:**

```http
Content-Type: application/pdf
Content-Disposition: attachment; filename=my-report-card.pdf
```

**Mobile:** use blob/arraybuffer response type; open with OS PDF viewer or in-app WebView.

---

### GET `/fees`

**Response `data`:**

```json
{
  "invoices": [
    {
      "id": "uuid",
      "academic_year": "2025/2026",
      "term": 1,
      "amount": "19000.00",
      "status": "pending",
      "due_date": "2026-05-31T00:00:00.000Z",
      "total_paid": "0.00",
      "balance": "19000.00",
      "line_items": [
        { "name": "Tuition", "amount": 19000 }
      ]
    }
  ],
  "total_balance": 19000
}
```

Invoice status values: `pending`, `partial`, `paid`, `unpaid`, etc.

---

### GET `/announcements`

**Response `data`:** array of announcements (max 40)

```json
[
  {
    "id": "uuid",
    "title": "Sports day",
    "content": "Full message body…",
    "priority": "normal",
    "target_role": "STUDENT",
    "created_at": "2026-05-01T10:00:00.000Z",
    "expires_at": null,
    "author_first_name": "Admin",
    "author_last_name": "User"
  }
]
```

Priority: `urgent` | `normal` | others (sorted urgent first).

---

### POST `/change-password`

**Body:**

```json
{
  "current_password": "string",
  "new_password": "string"
}
```

**Success `data`:** `{ "updated": true }`

**Errors:** wrong current password → 401 `INVALID_CREDENTIALS`; short new password → 400 `VALIDATION_ERROR`.

---

## 7. Supplementary APIs (resources)

Students also use the **resource library** under `/api/v1/resources`. Same JWT; role `STUDENT` allowed.


| Method | Path                                | Purpose                            |
| ------ | ----------------------------------- | ---------------------------------- |
| GET    | `/resources/section/:sectionId`     | List materials shared with section |
| GET    | `/resources/:id/access?action=view` | Get URL to open file               |
| GET    | `/resources/:id`                    | Resource metadata                  |
| POST   | `/resources/:id/bookmark`           | Toggle bookmark (optional v1.1)    |


### GET `/resources/section/:sectionId`

**Query:** `search`, `category_id`, `subject_id`, `page`, `limit` (max 100)

**Security:** server verifies the student is enrolled in that section; otherwise **403**.

**Response `data`:** array of resources:

```json
[
  {
    "id": "uuid",
    "title": "Chapter 3 Notes",
    "title_am": null,
    "description": "…",
    "file_type": "pdf",
    "thumbnail_url": null,
    "external_url": null,
    "language": "en",
    "view_count": 12,
    "download_count": 3,
    "created_at": "2026-04-01T00:00:00.000Z",
    "category_name": "Notes",
    "category_icon": "book",
    "share_id": "uuid",
    "share_note": "For Monday class",
    "is_pinned": true,
    "shared_at": "2026-04-02T00:00:00.000Z",
    "source": "section"
  }
]
```

### GET `/resources/:id/access`

**Query:** `action=view` | `download`

**Response `data`:**

```json
{
  "url": "https://…",
  "type": "file",
  "mime_type": "application/pdf"
}
```

Or for external links: `{ "url": "https://…", "type": "external" }`.

Open `url` in browser / WebView / native document viewer.

---

## 8. Grades & report cards

### Visibility rules (critical for UX copy)

Students only see marks when **both** conditions are met:

1. Exam `status = PUBLISHED`
2. Mark `mark_status` is `verified` or `locked`

Draft, submitted, or rejected marks **never** appear in `/student-portal/exams`. If the list is empty, show: *“No published results yet. Your school will release grades after exams are finalized.”*

### Grade scale (typical Ethiopian default)


| Letter | Percentage |
| ------ | ---------- |
| A      | 90–100     |
| B      | 80–89.99   |
| C      | 70–79.99   |
| D      | 60–69.99   |
| F      | Below 60   |


Letter grades in API responses are pre-computed server-side.

### Term results

After admin runs term computation, `term_results` contains weighted subject grades using exam-type weights (quiz 10%, assignment 10%, midterm 30%, final 40%, etc.). Show these as “Term average” cards separate from individual exam marks.

See also: `docs/GRADING_SYSTEM.md` for admin/teacher workflow.

---

## 9. Data models & field notes

### Student identity chain

```
identity.users (login)
    └── student.students (user_id)
            └── student.studentenrollments (active)
                    └── academic.sections / classes / grades
```

All portal services resolve the student from `**req.tenant.userId**` + `**req.tenant.schoolId**`. The mobile app must **not** send student UUIDs on portal routes.

### Nullable / empty states


| Scenario               | API behavior                       | UI suggestion                 |
| ---------------------- | ---------------------------------- | ----------------------------- |
| No enrollment          | `section_id` null, empty timetable | “Not enrolled in a class yet” |
| No attendance recorded | `total: 0`, `rate: null`           | “No attendance data”          |
| No published grades    | empty `exam_marks`                 | Explain publish delay         |
| No announcements       | `[]`                               | Empty state illustration      |
| No resources           | `[]`                               | “No materials shared yet”     |


### Currency

Display fees in **ETB** (Ethiopian Birr). Web uses `Intl.NumberFormat('en-ET', { currency: 'ETB' })`.

---

## 10. Error handling & edge cases

### Global 401 handling

On any `401` except during login:

1. Clear stored token
2. Navigate to login
3. Show message from `message` field if present

Web reference: `src/api/http.js` interceptor.

### 403 on resources

Student requested a section they are not enrolled in → show error, do not retry.

### Network failures

- Show cached dashboard with “Last updated …” if implementing offline cache
- Queue password change until online (or block with message)

### PDF download failures

- Check content-type is `application/pdf`
- Minimum file size check before saving corrupt empty responses

### Maintenance mode

Login may return **503** with message *“The platform is under maintenance…”* — show full-screen maintenance state.

---

## 11. Mobile UX recommendations

### Navigation

- **Bottom tabs:** Home, Timetable, Grades, More
- **More menu:** Attendance, Fees, Announcements, Resources, Account, Logout

### Home cards

Match web dashboard KPIs (attendance %, grade average, fee balance, announcement count).

### Timetable

- Default to **today's day** tab
- Highlight current period based on device local time vs `start_time`/`end_time`

### Grades

- Term filter dropdown populated from `terms[]`
- Toggle: List by Exam | List by Subject
- Color-code pass/fail (green/red) using `passed` or `is_passed`
- Progress bar using `percent` (web uses 0–100 width)

### Pull to refresh

Implement on all list/summary screens.

### Security

- No screenshots on report card screen (optional, OS-level)
- Biometric unlock for reopening app (local only, no API)
- Do not log tokens or passwords

### Accessibility

- Minimum touch target 44pt
- Support font scaling
- Announcement priority announced for urgent items

---

## 12. Implementation plan (phases)

### Phase 0 — Foundation (week 1)

- Project setup (RN / Flutter / native)
- Configurable `API_BASE_URL` per environment (dev/staging/prod)
- HTTP client with Bearer interceptor
- Secure token storage
- Login + logout + 401 handling
- Role check (`STUDENT`)

**Exit criteria:** Login works against demo student; token persists across app restarts.

### Phase 1 — Core read-only portal (weeks 2–3)

- Dashboard screen
- Profile / account screen
- Timetable screen
- Attendance screen
- Empty/error/loading states

**Exit criteria:** Parity with web student home + timetable + attendance.

### Phase 2 — Academics (week 4)

- Grades screen (by exam, by subject, term filter)
- Report card PDF download + share
- Summary stat cards

**Exit criteria:** Grades match web for demo student after `npm run seed:grading`.

### Phase 3 — Fees & comms (week 5)

- Fee invoices list
- Announcements list + detail

### Phase 4 — Resources (week 6)

- Section library list + search
- Open PDF / external links via access URL
- Handle 403 when no enrollment

### Phase 5 — Polish & release (week 7–8)

- Change password
- Pull-to-refresh everywhere
- App icon, splash, store listing
- QA on slow network + token expiry
- Optional: push notifications (requires new backend — see §14)

### Suggested API call sequence on cold start

```
1. POST /auth/session          (if no token)
2. GET  /student-portal/dashboard
```

Lazy-load other tabs on first visit to save bandwidth.

---

## 13. Test accounts & seed data

### Demo student login


| Field    | Value                     |
| -------- | ------------------------- |
| Email    | `DEMO-G9A-001@demo.local` |
| Password | `Student123!`             |
| School   | Demo Academy              |


Other demo students: `DEMO-G9A-002@demo.local` … `DEMO-G10B-040@demo.local` (same password pattern).

### Seed commands (backend repo)

```bash
# Academic structure + students + demo exam
npm run seed:demo

# Published grades for portal (Grade 9, 3 exams, locked marks)
npm run seed:grading
```

### Expected data after seeding

- Dashboard shows timetable slots, fee invoice (~19,000 ETB pending), 3 published grade rows
- Grades screen: Midterm (Math), English Quiz, Amharic Assignment
- Report card PDF generates for current term

### Local API URL

```
http://localhost:3003/api/v1
```

Ensure mobile emulator can reach host machine (`10.0.2.2:3003` on Android emulator).

---

## 14. Out of scope / future APIs

Not available for student mobile v1 (plan separately):


| Feature                    | Status                   | Notes                                                                     |
| -------------------------- | ------------------------ | ------------------------------------------------------------------------- |
| Fee payment (Chapa)        | Parent portal only       | `POST /parent-portal/invoices/:id/pay-chapa`                              |
| Push notifications         | No student endpoint      | `/notifications/*` is admin-only                                          |
| Token refresh              | Not implemented          | Re-login after 24h                                                        |
| Profile photo upload       | Not in student portal    | Would need `/files` integration                                           |
| Messaging / chat           | Not implemented          |                                                                           |
| Continuous assessment (CA) | Teacher/lesson-plan APIs | `GET /lesson-plans/ca/student/:id` exists but not wired to student portal |
| Offline mark viewing       | N/A                      | Server-authoritative published grades only                                |


Future backend work for mobile v2:

- `POST /auth/refresh` refresh tokens
- `GET /student-portal/notifications` in-app alerts
- `PATCH /student-portal/profile` update phone
- Device token registration for FCM/APNs

---

## 15. Backend source map


| Area                       | Path                                                                |
| -------------------------- | ------------------------------------------------------------------- |
| Student portal routes      | `src/routes/studentPortalRoutes.js`                                 |
| Controllers                | `src/controllers/studentPortalController.js`                        |
| Business logic             | `src/services/studentPortalService.js`                              |
| Grade read layer           | `src/services/grading/gradingReadService.js`                        |
| Report card PDF            | `src/services/reportCardPdfService.js`                              |
| Auth login                 | `src/controllers/auth/loginController.js` → `authService.loginUser` |
| JWT middleware             | `src/middlewares/authMiddleware.js`                                 |
| Resource library           | `src/routes/resourceRoutes.js`, `src/services/library/*`            |
| Web student UI             | `Student_mangement_system_director_dashbored/src/pages/student/*`   |
| Grading architecture       | `docs/GRADING_SYSTEM.md`                                            |
| Teacher portal (reference) | `docs/TEACHER_PORTAL.md`                                            |


---

## Quick reference — all student-facing endpoints


| Method | Endpoint                               | Returns              |
| ------ | -------------------------------------- | -------------------- |
| POST   | `/auth/session`                        | JWT + user info      |
| POST   | `/auth/logout`                         | Success message      |
| GET    | `/student-portal/dashboard`            | Home summary JSON    |
| GET    | `/student-portal/profile`              | Student profile JSON |
| POST   | `/student-portal/change-password`      | `{ updated: true }`  |
| GET    | `/student-portal/timetable`            | Weekly slots JSON    |
| GET    | `/student-portal/attendance?days=60`   | Attendance JSON      |
| GET    | `/student-portal/exams?term_id=`       | Grade report JSON    |
| GET    | `/student-portal/report-card?term_id=` | PDF bytes            |
| GET    | `/student-portal/fees`                 | Invoices JSON        |
| GET    | `/student-portal/announcements`        | Announcements array  |
| GET    | `/resources/section/:sectionId`        | Resources array      |
| GET    | `/resources/:id/access?action=view`    | File URL JSON        |


---

*Document version: 1.0 — aligned with backend student portal as of May 2026.*