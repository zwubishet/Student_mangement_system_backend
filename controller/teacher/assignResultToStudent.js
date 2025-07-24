import prisma from "../../prisma/client.js";

const assignResult = async (req, res) => {
  try {
    const { studentId, subject, year, semester, test1, test2, test3, finalExam, assignment } = req.body;
    let userId;

    // Get userId from studentId
    const student = await prisma.student.findFirst({
      where: { studentId },
      select: { userId: true }
    });

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    userId = student.userId;

    // Find correct studentGrade (by year and semester)
    const studentGrade = await prisma.studentGrade.findFirst({
      where: {
        studentId: userId,
        year,
        semester
      }
    });

    if (!studentGrade) {
      return res.status(404).json({ error: "Student grade not found for this semester/year" });
    }

    // Find existing subject result
    const subjectResult = await prisma.subjectResult.findFirst({
      where: {
        studentGradeId: studentGrade.id,
        subjectName: subject,
      },
    });

    const total = (test1 || 0) + (test2 || 0) + (test3 || 0) + (assignment || 0) + (finalExam || 0);

    let updatedResult;

    if (subjectResult) {
      // Update result
      updatedResult = await prisma.subjectResult.update({
        where: { id: subjectResult.id },
        data: {
          ...(test1 !== undefined && { test1 }),
          ...(test2 !== undefined && { test2 }),
          ...(test3 !== undefined && { test3 }),
          ...(assignment !== undefined && { assignment }),
          ...(finalExam !== undefined && { finalExam }),
          total
        },
      });
    } else {
      // Create result
      updatedResult = await prisma.subjectResult.create({
        data: {
          subjectName: subject,
          test1,
          test2,
          test3,
          assignment,
          finalExam,
          total,
          studentGradeId: studentGrade.id,
        },
      });
    }

    res.status(200).json({ message: "Result assigned successfully", data: updatedResult });

  } catch (error) {
    console.error("Failed to assign result:", error);
    res.status(500).json({ error: "Failed to assign result" });
  }
};


const createYearSemester = async (req, res) => {
  const { year, semester } = req.body;
  const { studentId } = req.params;
  let userId;

  // Validate semester range
  if (semester > 3) {
    return res.status(400).json({
      message: `There is no semester ${semester}, it must be less than or equal to 3`
    });
  }

  // Check if same year & semester already exist
  const existing = await prisma.studentGrade.findMany({
    where: {
      year,
      semester,
      student: {
        studentId: studentId // limit to same student
      }
    }
  });

  if (existing.length > 0) {
    return res.status(400).json({
      message: `Year ${year} and Semester ${semester} already exist for this student!`
    });
  }

  try {
    const student = await prisma.student.findFirst({
      where: { studentId },
      select: { userId: true }
    });

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    userId = student.userId;

    const newGrade = await prisma.studentGrade.create({
      data: {
        studentId: userId,
        year,
        semester,
        totalScore: 0,
        averageScore: 0,
        rank: 0,
      },
    });

    res.status(201).json({
      message: "Semester created successfully",
      data: newGrade
    });

  } catch (error) {
    console.error("Error creating semester:", error);
    res.status(500).json({ error: "Failed to create semester" });
  }
};

const workStudentSemsterResult = async (req, res) => {
  const studentId = req.params.studentId;
  const { year, semester } = req.body;

  try {
    // Step 1: Get userId from studentId
    const student = await prisma.student.findFirst({
      where: { studentId },
      select: { userId: true }
    });

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const userId = student.userId;

    // Step 2: Find the correct grade entry for year & semester
    const gradeToUpdate = await prisma.studentGrade.findFirst({
      where: {
        studentId: userId,
        year,
        semester
      },
      select: {
        id: true,
        subjectResults: {
          select: { total: true }
        }
      }
    });

    if (!gradeToUpdate) {
      return res.status(404).json({ error: "Grade entry not found for specified year/semester" });
    }

    // Step 3: Calculate total and average
    const totals = gradeToUpdate.subjectResults.map(sr => sr.total);
    const totalScore = totals.reduce((acc, curr) => acc + curr, 0);
    const averageScore = totals.length > 0 ? totalScore / totals.length : 0;

    // Step 4: Update the total and average
    await prisma.studentGrade.update({
      where: { id: gradeToUpdate.id },
      data: {
        totalScore,
        averageScore
      }
    });

    res.json({
      totals,
      result: totalScore,
      average: averageScore
    });

  } catch (error) {
    console.error("Error fetching subject totals:", error);
    res.status(500).json({ error: "Failed to fetch subject totals" });
  }
};




export default {assignResult, createYearSemester, workStudentSemsterResult};



