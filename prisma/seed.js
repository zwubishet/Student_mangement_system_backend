// import { PrismaClient } from "@prisma/client";
// import bcrypt from "bcrypt";

// const prisma = new PrismaClient();

// async function main() {
//   const password = "pass123";
//   const passwordHash = await bcrypt.hash(password, 10);

//   await prisma.student.upsert({
//     where: { studentId: "STD123" },
//     update: { passwordHash }, // In case student exists, update the hash
//     create: {
//       studentId: "STD123",
//       fullName: "Test Student",
//       passwordHash,
//     },
//   });

//   console.log("✅ Seeded student with passwordHash:", passwordHash);
// }

// main()
//   .catch((e) => console.error("❌ Seed error:", e))
//   .finally(() => prisma.$disconnect());


// import { PrismaClient } from '@prisma/client';
// import bcrypt from 'bcrypt';

// const prisma = new PrismaClient();

// async function main() {
//   // 1. Create or Update a GradeSection
//   const gradeSection = await prisma.gradeSection.upsert({
//     where: { grade_section: { grade: '4', section: 'B' } },
//     update: {}, // nothing to update in this case
//     create: {
//       grade: '4',
//       section: 'B',
//     },
//   });

//   // 2. Create or Update a Student in that GradeSection
//   const passwordHash = await bcrypt.hash('pass123', 10);

//   await prisma.student.upsert({
//     where: { studentId: 'STD1001' },
//     update: { passwordHash, gradeSectionId: gradeSection.id },
//     create: {
//       studentId: 'STD1001',
//       fullName: 'Abebe Kebede',
//       passwordHash,
//       gradeSectionId: gradeSection.id,
//     },
//   });

//   // 3. Create or Update a Schedule
//   await prisma.schedule.upsert({
//     where: { gradeSectionId: gradeSection.id }, // assuming one schedule per section
//     update: {
//       weekSchedule: {
//         Wednesday: [
//           { period: 1, subject: 'Math', teacher: 'Mr. Hailu' },
//           { period: 2, subject: 'English', teacher: 'Mrs. Saba' },
//           { period: 3, subject: 'Chemistry', teacher: 'Mrs. Aster' },
//           { period: 4, subject: 'Biology', teacher: 'Mrs. Lema' },
//           { period: 5, subject: 'Physics', teacher: 'Mr. Abebe' },
//           { period: 6, subject: 'English', teacher: 'Mrs. Saba' },
//         ],
//         ThursDay: [
//           { period: 1, subject: 'Science', teacher: 'Mr. Fikru' },
//           { period: 2, subject: 'Art', teacher: 'Mr. Fikru' },
//           { period: 3, subject: 'Chemistry', teacher: 'Mrs. Aster' },
//           { period: 4, subject: 'Biology', teacher: 'Mrs. Lema' },
//           { period: 5, subject: 'Physics', teacher: 'Mr. Abebe' },
//           { period: 6, subject: 'English', teacher: 'Mrs. Saba' },
//         ],
        
//       },
//     },
//     create: {
//       gradeSectionId: gradeSection.id,
//       weekSchedule: {
//         Monday: [
//           { period: 1, subject: 'Math', teacher: 'Mr. Hailu' },
//           { period: 2, subject: 'English', teacher: 'Mrs. Saba' },
//           { period: 3, subject: 'Chemistry', teacher: 'Mrs. Aster' },
//           { period: 4, subject: 'Biology', teacher: 'Mrs. Lema' },
//           { period: 5, subject: 'Physics', teacher: 'Mr. Abebe' },
//           { period: 6, subject: 'English', teacher: 'Mrs. Saba' },
//         ],
//         Tuesday: [
//           { period: 1, subject: 'Science', teacher: 'Mr. Fikru' },
//           { period: 2, subject: 'Art', teacher: 'Mr. Fikru' },
//           { period: 3, subject: 'Chemistry', teacher: 'Mrs. Aster' },
//           { period: 4, subject: 'Biology', teacher: 'Mrs. Lema' },
//           { period: 5, subject: 'Physics', teacher: 'Mr. Abebe' },
//           { period: 6, subject: 'English', teacher: 'Mrs. Saba' },
//         ],
//       },
//     },
//   });

//   console.log('✅ Seed data inserted successfully!');
// }

// main()
//   .catch((e) => console.error(e))
//   .finally(() => prisma.$disconnect());


// import { PrismaClient } from '@prisma/client';

// const prisma = new PrismaClient();

// async function main() {
//   await prisma.resource.create({
//     data: {
//       title: 'Flutter Documentation',
//       description: 'Official Flutter documentation for learning.',
//       resourceType: 'link',
//       link: 'https://flutter.dev/docs',
//     },
//   });

//   await prisma.resource.create({
//     data: {
//       title: 'Introduction to Node.js',
//       description: 'A PDF guide to get started with Node.js.',
//       resourceType: 'pdf',
//       file: 'path/to/file.pdf',
//     },
//   });

//   console.log('✅ Sample resources seeded');
// }

// main()
//   .catch((e) => console.error(e))
//   .finally(() => prisma.$disconnect());


import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Get a grade section to use for grade-specific announcement
  const grade = await prisma.gradeSection.findFirst();

  if (!grade) {
    console.error("⚠️ No GradeSection found. Please seed grade sections first.");
    return;
  }

  // Create public announcement
  await prisma.announcement.create({
    data: {
      title: "School Closure",
      message: "School will be closed on Monday due to maintenance.",
      isPublic: true
    }
  });

  // Create grade-specific announcement
  await prisma.announcement.create({
    data: {
      title: "Math Exam Reminder",
      message: "Don't forget your math exam on Friday.",
      isPublic: false,
      gradeId: grade.id
    }
  });

  console.log("✅ Sample announcements seeded.");
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
