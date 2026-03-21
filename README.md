# 🎓 Student Management System (SMS) – High-Scale Backend

A robust, multi-tenant school management system designed for high-scale academic environments. This backend serves as the "source of truth" for students, teachers, and school directors, utilizing a modern GraphQL-first architecture.

---

## 🚀 The Modern Stack

* **Hasura GraphQL Engine** – High-performance GraphQL Gateway & Real-time API.
* **Node.js & Express.js** – Dedicated Business Logic layer (Hasura Actions & Webhooks).
* **PostgreSQL** – Relational database with a multi-schema design (`identity`, `tenancy`, `academic`).
* **Redis** – High-speed session management and JWT blacklisting (Logout).
* **JWT (JSON Web Tokens)** – Custom Hasura-compatible claims for granular Role-Based Access Control (RBAC).
* **Docker & Docker Compose** – Full-stack container orchestration.
* **Native PG Driver (`pg`)** – High-performance SQL control for complex transactions and bulk operations.

---

## 🏗 High-Scale Architecture

This project has moved from a monolith to a **Microservices-ready architecture**:

1.  **Isolation:** Every request is filtered through Hasura using a JWT containing `x-hasura-school-id`.
2.  **Stateless Logic:** Express handles complex "Actions" (like bulk creation) by pulling security context directly from Hasura session variables.
3.  **Database Design:**
    * `identity`: Manages Users, Roles, and Auth.
    * `tenancy`: Manages Schools and Subscription status.
    * `academic`: Manages Years, Terms, Grades, Sections, Classes, Teachers, and Subjects.



---

## 🔐 Implemented Hasura Actions

| Action | Logic Type | Description |
| :--- | :--- | :--- |
| `loginAction` | Authentication | Authenticates user & returns Hasura-compatible JWT. |
| `logoutAction` | Redis Security | Instant token invalidation via Redis Blacklist (TTL). |
| `createAcademicYearAction`| Validation | Creates school years with strict date-range checks. |
| `createGradeWithSections` | Transactional | Atomic creation of a Grade and all its Sections. |
| `createClassesBulkAction` | Idempotent | Bulk-activates sections for the year using `ON CONFLICT`. |
| `createTeacherAction` | Identity Link | Atomic creation of Auth User + Teacher Profile. |
| `assignTeacherAction` | Multi-Tenant | Links Teacher/Subject/Section with cross-school security. |

---

## ⚙️ Getting Started

### 1. Environment Configuration
Create a `.env` file in the root directory:
```env
ACTION_SECRET=your_webhook_secret
HASURA_GRAPHQL_ADMIN_SECRET=admin_secret
JWT_SECRET=your_jwt_signing_key
REDIS_URL=redis://redis:6379
DATABASE_URL=postgres://user:pass@postgres:5432/sms_db
```

### 2. Launch the Stack
```bash
docker-compose up --build
```
* **Express Webhooks:** `http://localhost:3003`
* **Hasura Console:** `http://localhost:8082`

### 3. Apply Metadata & Migrations
```bash
cd hasura
hasura migrate apply
hasura metadata apply
```

---

## 🛠 Project Status & Roadmap

- [x] **Phase 1: Security** (JWT, Redis Logout, Action Protection)
- [x] **Phase 2: Academic Infrastructure** (Multi-tenant Years, Grades, Sections)
- [x] **Phase 3: Staffing** (Teacher Creation, Subject Assignment)
- [ ] **Phase 4: Students** (Bulk Enrollment, Student Profiles) 🔄 *Current Focus*
- [ ] **Phase 5: Academic Records** (Attendance, Grading, Exams) 📅 *Next Up*
- [ ] **Phase 6: Finances** (Fee Management & Invoicing) 🚀 *Future*

---

## 👨‍💻 Author

**Wubishet Wudu**
💼 Full-stack Developer (Flutter + Node.js + Hasura)
📬 [wubishetwudu1624@gmail.com](mailto:wubishetwudu1624@gmail.com)
```

---