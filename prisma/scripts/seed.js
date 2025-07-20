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
  // await prisma.resource.create({
  //   data: {
  //     title: 'Flutter Documentation',
  //     description: 'Official Flutter documentation for learning.',
  //     resourceType: 'link',
  //     link: 'https://flutter.dev/docs',
  //   },
  // });

  // await prisma.resource.create({
  //   data: {
  //     title: 'Introduction to Node.js',
  //     description: 'A PDF guide to get started with Node.js.',
  //     resourceType: 'pdf',
  //     file: 'path/to/file.pdf',
  //   },
  // });


//   const passwordHash = await bcrypt.hash("123456", 10);


//   const teacherUser = await prisma.user.create({
//     data: {
//       fullName: "Mr. Solomon Bekele",
//       teacherId: "TECH01",
//       password: passwordHash,
//       role: "TEACHER",
//     },
//   });

//   const directorUser = await prisma.user.create({
//     data: {
//       fullName: "Mrs. Eden Fikre",
//       directorId: "DIR01",
//       password: passwordHash,
//       role: "DIRECTOR",
//     },
//   });

//   // Create Teacher
//   await prisma.teacher.create({
//     data: {
//       userId: teacherUser.id,
//       teacherId: teacherUser.teacherId,
//       subject: "Mathematics",
//     },
//   });

//   // Create Director
//   await prisma.director.create({
//     data: {
//       userId: directorUser.id,
//       directorId: directorUser.directorId,
//       office: "Main Office",
//     },
//   });

//   console.log('✅ Sample resources seeded');
// }

// main()
//   .catch((e) => console.error(e))
//   .finally(() => prisma.$disconnect());


// import { PrismaClient } from '@prisma/client';
// const prisma = new PrismaClient();

// async function main() {
//   // Get a grade section to use for grade-specific announcement
//   const grade = await prisma.gradeSection.findFirst();

//   if (!grade) {
//     console.error("⚠️ No GradeSection found. Please seed grade sections first.");
//     return;
//   }

//   // Create public announcement
//   await prisma.announcement.create({
//     data: {
//       title: "School Closure",
//       message: "School will be closed on Monday due to maintenance.",
//       isPublic: true
//     }
//   });

//   // Create grade-specific announcement
//   await prisma.announcement.create({
//     data: {
//       title: "Math Exam Reminder",
//       message: "Don't forget your math exam on Friday.",
//       isPublic: false,
//       gradeId: grade.id
//     }
//   });

//   console.log("✅ Sample announcements seeded.");
// }

// main()
//   .catch((e) => console.error(e))
//   .finally(() => prisma.$disconnect());



// import { PrismaClient } from '@prisma/client';
// const prisma = new PrismaClient();

// async function main() {
//   // 🔹 1. Create a student
//   const student = await prisma.student.create({
//     data: {
//       studentId: 'STU1001',
//       fullName: 'Wubishet Wudu',
//       passwordHash: 'hashed_password',
//     },
//   });

//   // 🔹 2. Create a StudentGrade for semester 1
//   const studentGrade = await prisma.studentGrade.create({
//     data: {
//       studentId: student.id,
//       year: 2025,
//       semester: 1,
//       totalScore: 480,
//       averageScore: 68.57,
//       rank: 5,
//     },
//   });

//   // 🔹 3. Add subject results
//   const subjects = [
//     {
//       subjectName: 'Mathematics',
//       test1: 12,
//       test2: 14,
//       test3: 13,
//       assignment: 10,
//       finalExam: 45,
//     },
//     {
//       subjectName: 'English',
//       test1: 10,
//       test2: 12,
//       test3: 11,
//       assignment: 8,
//       finalExam: 40,
//     },
//     {
//       subjectName: 'Physics',
//       test1: 11,
//       test2: 13,
//       test3: 12,
//       assignment: 9,
//       finalExam: 41,
//     },
//   ];

//   for (const s of subjects) {
//     const total = s.test1 + s.test2 + s.test3 + s.assignment + s.finalExam;
//     await prisma.subjectResult.create({
//       data: {
//         studentGradeId: studentGrade.id,
//         subjectName: s.subjectName,
//         test1: s.test1,
//         test2: s.test2,
//         test3: s.test3,
//         assignment: s.assignment,
//         finalExam: s.finalExam,
//         total: total,
//       },
//     });
//   }

//   console.log('✅ Seed completed.');
// }

// main()
//   .catch((e) => {
//     console.error(e);
//     process.exit(1);
//   })
//   .finally(async () => {
//     await prisma.$disconnect();
//   });



// import { PrismaClient } from "@prisma/client";
// import bcrypt from 'bcrypt'
// const prisma = new PrismaClient();

// async function main() {

//   const password = "pass123";
// const passwordHash = await bcrypt.hash(password, 10);
//   // 1. Create Student
//   const student = await prisma.student.create({
//     data: {
//       id: "7eee3560-5eb4-4f36-bca0-668bb9bb5ba8",
//       studentId: "STU12345",
//       fullName: "Wubishet Wudu",
//       passwordHash: passwordHash,
//     },
//   });

//   // 2. Create StudentGrade
//   const studentGrade = await prisma.studentGrade.create({
//     data: {
//       id: "bea5e5a9-ecd7-435f-afec-1a528b10c15c",
//       studentId: student.id,
//       year: 2025,
//       semester: 1,
//       totalScore: 630.5,
//       averageScore: 90.07,
//       rank: 2,
//     },
//   });

//   // 3. Create SubjectResults
//   await prisma.subjectResult.createMany({
//     data: [
//       {
//         id: "4e96ed60-b427-4e9b-a791-11df4930f3af",
//         studentGradeId: studentGrade.id,
//         subjectName: "Math",
//         test1: 8.02,
//         test2: 9.55,
//         test3: 5.66,
//         assignment: 9.39,
//         finalExam: 13.77,
//         total: 46.39,
//       },
//       {
//         id: "1b59e8d7-c29a-41c7-83f2-b979b514eaed",
//         studentGradeId: studentGrade.id,
//         subjectName: "English",
//         test1: 6.71,
//         test2: 6.96,
//         test3: 5.24,
//         assignment: 9.96,
//         finalExam: 20.63,
//         total: 49.5,
//       },
//       {
//         id: "80b01705-524d-4a9f-81b2-d19a3d5f8ad5",
//         studentGradeId: studentGrade.id,
//         subjectName: "Physics",
//         test1: 9.19,
//         test2: 7.84,
//         test3: 8.37,
//         assignment: 6.14,
//         finalExam: 36.66,
//         total: 68.2,
//       },
//       {
//         id: "8df439af-f8d4-49e9-b6c9-ce083bdd33e5",
//         studentGradeId: studentGrade.id,
//         subjectName: "Chemistry",
//         test1: 10.0,
//         test2: 8.2,
//         test3: 8.9,
//         assignment: 7.05,
//         finalExam: 21.0,
//         total: 55.15,
//       },
//       {
//         id: "6791e0e5-ec30-4bdf-ab25-a6be707307d9",
//         studentGradeId: studentGrade.id,
//         subjectName: "Biology",
//         test1: 6.81,
//         test2: 9.03,
//         test3: 8.08,
//         assignment: 6.48,
//         finalExam: 19.37,
//         total: 49.77,
//       },
//       {
//         id: "6d85b0b5-3956-4956-964e-f4e921acbe15",
//         studentGradeId: studentGrade.id,
//         subjectName: "History",
//         test1: 5.65,
//         test2: 8.67,
//         test3: 7.59,
//         assignment: 9.29,
//         finalExam: 21.88,
//         total: 53.08,
//       },
//       {
//         id: "abdd2d9c-90d5-4801-9f60-62296ee1bf9c",
//         studentGradeId: studentGrade.id,
//         subjectName: "Civics",
//         test1: 8.37,
//         test2: 8.92,
//         test3: 7.47,
//         assignment: 9.98,
//         finalExam: 20.09,
//         total: 54.83,
//       },
//     ],
//   });

//   console.log("✅ Seed completed.");
// }

// main()
//   .catch((e) => {
//     console.error(e);
//     process.exit(1);
//   })
//   .finally(() => prisma.$disconnect());




// import { PrismaClient } from "@prisma/client";
// import bcrypt from 'bcrypt'
// const prisma = new PrismaClient();

// async function main() {
//     const password = "pass1234";
//     const passwordHash = await bcrypt.hash(password, 10);
//   // Create 1 student to associate with community posts
//     const student = await prisma.student.create({
//     data: {
//       studentId: "STU12",
//       fullName: "Wubishet",
//       passwordHash: passwordHash, // Replace with actual hash if needed
//     },
//   });

//   // Create a few community posts
//   await prisma.communityPost.createMany({
//     data: [
//       {
//         title: "Welcome to Grade 7",
//         content: "This is a general intro for new Grade 7 students.",
//         type: "Grade 7",
//         image: "uploads/welcome.jpg",
//         document: "uploads/intro.pdf",
//         studentId: student.id,
//       },
//       {
//         title: "School Clean-Up Day",
//         content: "All students are invited to help clean the school on Friday.",
//         type: "General",
//         image: "uploads/cleanup.png",
//         studentId: student.id,
//       },
//       {
//         title: "Math Quiz Reminder",
//         content: "Don’t forget to prepare for the quiz on Monday!",
//         type: "Grade 6",
//         studentId: student.id,
//       }
//     ]
//   });

//   console.log("🌱 Seed complete");
// }

// main()
//   .catch(e => {
//     console.error(e);
//     process.exit(1);
//   })
//   .finally(async () => {
//     await prisma.$disconnect();
//   });



// import { PrismaClient } from '@prisma/client';
// import bcrypt from 'bcrypt';

// const prisma = new PrismaClient();

// async function main() {
//   console.log("Seeding database...");

//   // // Clear all data (optional for dev)
//   // await prisma.comment.deleteMany();
//   // await prisma.communityPost.deleteMany();
//   // await prisma.announcement.deleteMany();
//   // await prisma.schedule.deleteMany();
//   // await prisma.gradeSection.deleteMany();
//   // await prisma.subjectResult.deleteMany();
//   // await prisma.studentGrade.deleteMany();
//   // await prisma.student.deleteMany();
//   // await prisma.teacher.deleteMany();
//   // await prisma.director.deleteMany();
//   // await prisma.user.deleteMany();

//   // Create Users (with roles)
//   const passwordHash = await bcrypt.hash("123456", 10);

//   const studentUser = await prisma.user.create({
//     data: {
//       fullName: "Liya Alemu",
//       password: passwordHash,
//       role: "STUDENT",
//     },
//   });

//   const teacherUser = await prisma.user.create({
//     data: {
//       fullName: "Mr. Solomon Bekele",
//       password: passwordHash,
//       role: "TEACHER",
//     },
//   });

//   const directorUser = await prisma.user.create({
//     data: {
//       fullName: "Mrs. Eden Fikre",
//       password: passwordHash,
//       role: "DIRECTOR",
//     },
//   });

//   // Create Teacher
//   await prisma.teacher.create({
//     data: {
//       userId: teacherUser.id,
//       subject: "Mathematics",
//     },
//   });

//   // Create Director
//   await prisma.director.create({
//     data: {
//       userId: directorUser.id,
//       office: "Main Office",
//     },
//   });

//   // Grade Section
//   const gradeSection = await prisma.gradeSection.create({
//     data: {
//       grade: "7",
//       section: "A",
//     },
//   });

//   // Schedule
//   await prisma.schedule.create({
//     data: {
//       gradeSectionId: gradeSection.id,
//       weekSchedule: {
//         Monday: ["Math", "Science"],
//         Tuesday: ["English", "Art"],
//       },
//     },
//   });

//   // Student
//   const student = await prisma.student.create({
//     data: {
//       userId: studentUser.id,
//       studentId: "STD123",
//       gradeSectionId: gradeSection.id,
//     },
//   });

//   // Grades + Subject Results
//   const gradeRecord = await prisma.studentGrade.create({
//     data: {
//       studentId: student.userId,
//       year: 2025,
//       semester: 1,
//       totalScore: 420,
//       averageScore: 84,
//       rank: 3,
//       subjectResults: {
//         create: [
//           {
//             subjectName: "Math",
//             test1: 15,
//             test2: 18,
//             test3: 17,
//             assignment: 20,
//             finalExam: 30,
//             total: 100,
//           },
//           {
//             subjectName: "English",
//             test1: 14,
//             test2: 16,
//             test3: 15,
//             assignment: 18,
//             finalExam: 27,
//             total: 90,
//           },
//         ],
//       },
//     },
//   });

//   // Announcement (Public + Private)
//   await prisma.announcement.createMany({
//     data: [
//       {
//         title: "School Reopening",
//         message: "School will reopen on September 1.",
//         isPublic: true,
//       },
//       {
//         title: "Grade 7A Exam Schedule",
//         message: "Your midterm exams start next week.",
//         isPublic: false,
//         gradeId: gradeSection.id,
//       },
//     ],
//   });

//   // Community Post
//   const post = await prisma.communityPost.create({
//     data: {
//       title: "Need Help With Math",
//       content: "Can anyone help me with Algebra homework?",
//       type: "General",
//       studentId: student.userId,
//     },
//   });

//   // Comment
//   await prisma.comment.create({
//     data: {
//       content: "Sure, I can help you after class.",
//       postId: post.id,
//       studentId: student.userId,
//     },
//   });

//   console.log("✅ Seeding completed!");
// }

// main()
//   .catch((e) => {
//     console.error("❌ Error seeding data:", e);
//     process.exit(1);
//   })
//   .finally(async () => {
//     await prisma.$disconnect();
//   });



import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
const prisma = new PrismaClient();

async function main() {
  // Create Grade Sections
  const passwordHash = await bcrypt.hash("123456", 10);
 // Grade 7A
const grade7A = await prisma.gradeSection.upsert({
  where: {
    grade_section_unique: {
      grade: '7',
      section: 'A',
    }
  },
  update: {}, // do nothing if exists
  create: {
    grade: '7',
    section: 'A'
  }
});

// Grade 8B
const grade8B = await prisma.gradeSection.upsert({
  where: {
    grade_section_unique: {
      grade: '8',
      section: 'B',
    }
  },
  update: {},
  create: {
    grade: '8',
    section: 'B'
  }
});

  // Create a Student User
  const studentUser = await prisma.user.create({
    data: {
      fullName: 'Alice Student',
      password: passwordHash, // Use hashed value in real cases
      role: 'STUDENT',
      student: {
        create: {
          studentId: 'STU1001',
          gradeSectionId: grade7A.id,
        }
      }
    }
  });

  // Create a Teacher User
  const teacherUser = await prisma.user.create({
    data: {
      fullName: 'Bob Teacher',
      password: passwordHash,
      role: 'TEACHER',
      teacher: {
        create: {
          teacherId: 'TEA9001',
          subject: 'Mathematics',
        }
      }
    }
  });

  // Create a Director User
  const directorUser = await prisma.user.create({
    data: {
      fullName: 'Clara Director',
      password: passwordHash,
      role: 'DIRECTOR',
      director: {
        create: {
          directorId: 'DIR001',
          office: 'Main Office',
        }
      }
    }
  });

  // Create Announcement for Grade 7
  await prisma.announcement.create({
    data: {
      title: 'Grade 7 Exam Info',
      message: 'Final exams start next week!',
      isPublic: false,
      gradeId: grade7A.id,
    }
  });

  // Create Public Announcement
  await prisma.announcement.create({
    data: {
      title: 'Welcome to School!',
      message: 'All students must attend orientation on Monday.',
      isPublic: true
    }
  });

  // Create Community Post and Comment
  const post = await prisma.communityPost.create({
    data: {
      title: 'Study Group',
      content: 'Anyone wants to form a study group for math?',
      type: 'Grade 7',
      studentId: studentUser.id,
    }
  });

  await prisma.comment.create({
    data: {
      content: 'I am interested!',
      postId: post.id,
      studentId: studentUser.id,
    }
  });

  console.log('✅ Seed completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
