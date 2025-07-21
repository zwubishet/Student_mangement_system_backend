import prisma from "../../prisma/client.js";

const assignResult = async (req, res) => {
  try {
    const studentId = req.body.studentId;
    const subject = req.body.subject;
    const {test1, test2, test3, finalExam, assignment } = req.body;

    // Find the active student grade record
    const studentGrade = await prisma.studentGrade.findFirst({
      where: { studentId },
    });

    if (!studentGrade) {
      return res.status(404).json({ error: "Student grade not found" });
    }

    // Find existing subject result
    const subjectResult = await prisma.subjectResult.findFirst({
      where: {
        studentGradeId: studentGrade.id,
        subjectName: subject,
      },
    });

    let updatedResult;

    if (subjectResult) {
      // ✅ Update existing subject result
      updatedResult = await prisma.subjectResult.update({
        where: { id: subjectResult.id },
        data: {
          ...(test1 !== undefined && { test1 }),
          ...(test2 !== undefined && { test2 }),
          ...(test3 !== undefined && { test3 }),
          ...(assignment !== undefined && { assignment }),
          ...(finalExam !== undefined && { finalExam }),
          total: (test1 || 0) + (test2 || 0) + (test3 || 0) + (assignment || 0) + (finalExam || 0)
        },
      });
    } else {
      // ✅ Create a new subject result
      updatedResult = await prisma.subjectResult.create({
        data: {
          subjectName,
          test1,
          test2,
          test3,
          assignment,
          finalExam,
          total: (test1 || 0) + (test2 || 0) + (test3 || 0) + (assignment || 0) + (finalExam || 0),
          studentGradeId: studentGrade.id,
        },
      });
    }

    res.status(200).json({ message: "Result assigned successfully", data: updatedResult });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to assign result" });
  }
};

export default assignResult;
