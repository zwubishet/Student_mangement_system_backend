// prisma/seed.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Create Users
  const studentUser = await prisma.user.create({
    data: {
      fullName: 'Alice Student',
      password: await bcrypt.hash('studentpass', 10),
      role: 'STUDENT',
    },
  });

  const teacherUser = await prisma.user.create({
    data: {
      fullName: 'Bob Teacher',
      password: await bcrypt.hash('teacherpass', 10),
      role: 'TEACHER',
    },
  });

  const directorUser = await prisma.user.create({
    data: {
      fullName: 'Dr. Director',
      password: await bcrypt.hash('directorpass', 10),
      role: 'DIRECTOR',
    },
  });

  // Create GradeSection
  const gradeSection = await prisma.gradeSection.create({
    data: {
      grade: '7',
      section: 'A',
    },
  });

  // Create Student
  const student = await prisma.student.create({
    data: {
      userId: studentUser.id,
      studentId: 'STU001',
      gradeSectionId: gradeSection.id,
    },
  });

  // Create Teacher
  await prisma.teacher.create({
    data: {
      userId: teacherUser.id,
      teacherId: 'TEA001',
      subject: 'Mathematics',
    },
  });

  // Create Director
  await prisma.director.create({
    data: {
      userId: directorUser.id,
      directorId: 'DIR001',
      office: 'Main Office',
    },
  });

  // Create StudentGrade
  const studentGrade = await prisma.studentGrade.create({
    data: {
      studentId: student.userId,
      year: 2025,
      semester: 1,
      totalScore: 95,
      averageScore: 95,
      rank: 1,
    },
  });

  // Create SubjectResult
  await prisma.subjectResult.create({
    data: {
      studentGradeId: studentGrade.id,
      subjectName: 'Mathematics',
      test1: 15,
      test2: 18,
      test3: 17,
      assignment: 20,
      finalExam: 25,
      total: 95,
    },
  });

  // Create Schedule
  await prisma.schedule.create({
    data: {
      weekSchedule: {
        Monday: 'Math, English',
        Tuesday: 'Biology, Chemistry',
      },
      gradeSectionId: gradeSection.id,
    },
  });

  // Create Announcement
  await prisma.announcement.create({
    data: {
      title: 'Welcome Back',
      message: 'School resumes on Monday!',
      isPublic: true,
      gradeId: gradeSection.id,
    },
  });

  // Create CommunityPost
  const post = await prisma.communityPost.create({
    data: {
      title: 'Study Group',
      content: 'Let’s meet to study algebra.',
      type: 'Grade 7',
      studentId: student.userId,
    },
  });

  // Create Comment
  await prisma.comment.create({
    data: {
      content: 'I will join!',
      postId: post.id,
      studentId: student.userId,
    },
  });
}

main()
  .then(() => console.log('✅ Seed data created successfully'))
  .catch((e) => console.error('❌ Error seeding data:', e))
  .finally(async () => await prisma.$disconnect());
