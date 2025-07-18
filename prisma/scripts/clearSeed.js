import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function clearSeedData() {
  try {
    // 1. Delete SubjectResults first (child of StudentGrade)
    await prisma.subjectResult.deleteMany();

    // 2. Delete StudentGrades (child of Student)
    await prisma.studentGrade.deleteMany();

    // 3. Delete Students
    await prisma.student.deleteMany();

    console.log("🧹 All seeded data has been deleted.");
  } catch (error) {
    console.error("❌ Error deleting seed data:", error);
  } finally {
    await prisma.$disconnect();
  }
}

clearSeedData();
