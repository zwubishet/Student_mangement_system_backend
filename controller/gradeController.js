import prisma from '../prisma/client.js'
import * as GradeService from '../services/gradeService.js';

const StudentGrade = async (req, res) => {
  const id = req.user.userId;
  console.log("Logged-in user ID:", req.user);
  
  try {
    const studentGrade = await prisma.studentGrade.findMany({
      where: {
        studentId: id
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

    if (!studentGrade || studentGrade.length === 0) {
      return res.status(404).json({ message: "No student grade found!" });
    }

    res.json(studentGrade);
  } catch (err) {
    console.error("Error fetching student grade:", err);
    res.status(500).json({ message: `Error: ${err.message}` });
  }
};

const SubjectResult = async (req, res) => {
    const subject = req.params.subject;
    const id = req.user.userId;
    console.log("Logged-in user ID:", req.user);


  try {
    const subjectResult = await prisma.studentGrade.findMany({
      where: {
        studentId: id
      },
      select: {
        subjectResults: {
          where: {
            subjectName: subject,
          },
          select: {
            test1: true,
            test2: true,
            test3: true,
            assignment: true,
            finalExam: true,
            total: true
          }
        }
      }
    });

    if (!subjectResult || subjectResult.length === 0) {
      return res.status(404).json({ message: "No student grade found!" });
    }

    res.json(subjectResult);
  }catch (err) {
    console.error("Error fetching student grade:", err);
    res.status(500).json({ message: `Error: ${err.message}` });
  }
}

const YearlyStudentResult = async (req, res) => {
    const year = parseInt(req.params.year);
    const semester = parseInt(req.params.semester);
    const studentId = req.user.studentId;
    console.log("Logged-in user ID:", req.user);
  
  try {
    const student = await prisma.student.findFirst({
          where: { studentId },
          select: { userId: true }
        });
    
        if (!student) {
          return res.status(404).json({ error: "Student not found" });
        }
    
        const userId = student.userId

    const yearlyResult = await prisma.studentGrade.findMany({
      where: {
        studentId: userId,
        year: year,
        semester: semester
      },
      select: {
        totalScore: true,
        averageScore: true,
        rank: true,
        createdAt: true,
        subjectResults: true
      }
    });

    if (!yearlyResult || yearlyResult.length === 0) {
      return res.status(404).json({ message: "No student grade found!" });
    }

    res.json(yearlyResult);
  }catch (err) {
    console.error("Error fetching student grade:", err);
    res.status(500).json({ message: `Error: ${err.message}` });
  }
}

export default {StudentGrade, SubjectResult, YearlyStudentResult};