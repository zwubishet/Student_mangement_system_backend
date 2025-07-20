import prisma from "../prisma/client.js";

export const getStudentGrades = async (studentId) => {
  return await prisma.studentGrade.findMany({
      where: {
        studentId: studentId
      },
      select: {
        year: true,
        semester: true,
        totalScore: true,
        averageScore: true,
        rank: true,
        createdAt: true,
        subjectResults: {
          select: {
            subjectName: true,
            test1: true,
            test2: true,
            test3: true,
            assignment: true,
            finalExam: true,
            total: true
          }
        },
        student: {
          select: {
            user: true
          }
        },
        student: {
  select: {
    user: {
      select: {
        fullName: true
      }
    }
  }
}

      }
    });
};
