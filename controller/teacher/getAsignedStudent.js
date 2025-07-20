import prisma from '../../prisma/client.js';

const studentAssigned = async (req, res) => {
  const { className, section } = req.body;

  try {
    const gradeSections = await prisma.gradeSection.findMany({
      where: {
        grade: className,
        section: section,
      },
      select: {
        students: {
          select: {
            studentId: true,
          },
        },
      },
    });

    // Safely extract only valid student IDs
    const studentIds = gradeSections.flatMap(g =>
      g.students
        .filter(s => s.studentId !== undefined)
        .map(s => s.studentId)
    );

    // If no students, return empty array early
    if (studentIds.length === 0) {
      return res.status(200).json([]);
    }

    const students = await prisma.student.findMany({
      where: {
        studentId: {
          in: studentIds,
        },
      },
      select: {
        user: true,
      },
    });

    res.status(200).json(students);
  } catch (error) {
    console.error('Error fetching assigned students:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export default studentAssigned;
