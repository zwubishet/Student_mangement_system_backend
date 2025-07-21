import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function clearSeedData() {
  try {
    console.log("🚮 Clearing seed data...");

    await prisma.comment.deleteMany();
    await prisma.communityPost.deleteMany();
    await prisma.subjectResult.deleteMany();
    await prisma.studentGrade.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.student.deleteMany();
    await prisma.teacher.deleteMany();
    await prisma.director.deleteMany();


    await prisma.user.deleteMany();
    await prisma.schedule.deleteMany();
    await prisma.announcement.deleteMany();
    await prisma.gradeSection.deleteMany();

    console.log("✅ Seed data cleared successfully.");
  } catch (error) {
    console.error("❌ Error deleting seed data:", error);
  } finally {
    await prisma.$disconnect();
  }
}

clearSeedData();
