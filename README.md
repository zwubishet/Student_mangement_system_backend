# 🎓 Student Management System – Backend

This is the backend for a **student-centered school management system**, built for government primary schools.  
It powers mobile and web apps for students, teachers, and school directors — securely managing data, access, and academic processes.

---

## 🚀 Tech Stack

- **Node.js** & **Express.js** – Web server and routing
- **PostgreSQL** – Relational database
- **Prisma ORM** – Schema modeling and queries
- **Knex.js** – Advanced SQL control (for complex logic)
- **JWT (JSON Web Tokens)** – Authentication
- **Bcrypt** – Password hashing
- **Dotenv** – Environment variable management

---

## 📁 Project Structure

```

student-management-backend/
│
├── src/
│   ├── controllers/       # Route logic (Auth, Students, etc.)
│   ├── routes/            # Express route definitions
│   ├── middlewares/       # Auth middleware, error handling
│   ├── services/          # Business logic layer
│   ├── utils/             # Helper functions (e.g. token generation)
│   └── app.js             # Express app entry point
│
├── config/                # DB and environment configs
├── prisma/                # Prisma schema and seed script
├── migrations/            # Prisma migrations
├── .env                   # Environment variables
├── package.json
└── README.md

````

---

## 🔐 Authentication

- Students are **pre-registered** (no public sign-up)
- Login is handled via:
  - Student ID + Password
  - Passwords hashed with Bcrypt
  - JWT tokens issued on successful login

---

## 📚 Core Features (Implemented or In Progress)

| Feature                        | Status        |
|-------------------------------|---------------|
| 🔐 Student Login              | ✅ Done        |
| 📄 Student Profile (view-only) | ✅ Done        |
| 📅 Class Schedules            | 🔄 In progress |
| 📊 Grades & Academic Records  | 🔄 Planned     |
| 📢 Announcements              | 🔄 Planned     |
| ✅ Attendance Summary         | 🔄 Planned     |
| 💬 Student Community Forum    | 🔄 Planned     |
| 📁 Learning Resources Sharing | 🔄 Planned     |
| 🧠 AI Academic Insights       | 🔄 Future phase|

---

## ⚙️ Getting Started

### 1. Clone the project

```bash
git clone https://github.com/your-username/student-management-backend.git
cd student-management-backend
````

### 2. Install dependencies

```bash
npm install
```

### 3. Set up your environment

Create a `.env` file:

```env
DATABASE_URL=postgresql://youruser:yourpassword@localhost:5432/yourdb
JWT_SECRET=your_super_secret_key
```

### 4. Setup Prisma

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 5. Seed sample student

```bash
node prisma/seed.js
```

### 6. Run the server

```bash
node index.js
```

Server will run on:
📍 `http://localhost:3000`

---

## 📌 API Endpoints (Sample)

| Method | Route                  | Description              |
| ------ | ---------------------- | ------------------------ |
| POST   | `/api/auth/login`      | Student login            |
| GET    | `/api/student/profile` | Get profile (JWT needed) |
| GET    | `/api/schedule`        | Get student schedule     |

More routes coming soon as development continues.

---

## 🛠 Development Roadmap

* [x] Authentication with Prisma & JWT
* [ ] Authorization middleware
* [ ] Role-based access: student / teacher / director
* [ ] Attendance tracking logic (manual + smart)
* [ ] Notifications system
* [ ] Community posts and chat
* [ ] Telegram bot integration (optional)

---

## 👨‍💻 Author

**Wubishet Wudu**
💼 Full-stack Developer (Flutter + Node.js)
📬 [wubishetwudu1624@gmail.com](mailto:wubishetwudu1624@gmail.com)

---
