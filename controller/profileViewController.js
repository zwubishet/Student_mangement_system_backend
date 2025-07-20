import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const profileView = async (req, res) => {
  try {
    const { userId, role } = req.user;

    let userData;

    if (role === "STUDENT") {
      const student = await prisma.student.findUnique({
        where: { userId: userId },
        select: {
          studentId: true,
          gradeSection: {
            select: {
              grade: true,
              section: true,
            },
          },
          user: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!student) {
        return res.status(404).json({ message: "Student not found!" });
      }

      userData = student;
    } 
    else if (["TEACHER", "DIRECTOR"].includes(role)) {
      const result = await prisma[role.toLowerCase()].findUnique({
        where: { userId: userId },
        select: { 
          userId: true,
          user: true
        },
      });

      if (!result) {
        return res.status(404).json({ message: `${role} not found!` });
      }

      userData = result;
    } 
    else {
      return res.status(403).json({ message: "Role not authorized for profile view" });
    }

    return res.json(userData);
  } catch (error) {
    console.error("Error fetching profile:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export default profileView;
