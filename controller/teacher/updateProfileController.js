import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const updateTeacherProfile = async (req, res) => {
  const userId = req.user.userId;
  const role = req.user.role;

  if (role !== "TEACHER") {
    return res.status(403).json({ message: "Access denied" });
  }

  const fullName = req.body.fullName;

  try {
    const userUpdate = await prisma.user.update({
      where: { id: userId },
      data: { fullName },
    });

    return res.json({
      message: "Profile updated successfully",
      user: {
        fullName: userUpdate.fullName,
      }
    });

  } catch (error) {
    console.error("Update error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
