import prisma from "../prisma/client.js";

// GET Public Announcements
const PublicAnnouncements = async (req, res) => {
  try {
    const publicAnnouncement = await prisma.announcement.findMany({
      where: {
        isPublic: true,  // Only fetch public announcements
      }
    });

    if (publicAnnouncement.length === 0) {
      return res.status(404).json({
        message: "No public announcements found."
      });
    }

    res.json(publicAnnouncement);
  } catch (err) {
    console.error("Error fetching public announcements:", err);
    res.status(500).json({
      message: `Error: ${err.message}`
    });
  }
};

// GET Private Announcements for a Student's Grade Section
const privateAnnouncements = async (req, res) => {
  const userId = req.user.userId;

  try {
    const student = await prisma.student.findUnique({
      where: { userId: userId },
      include: {
        gradeSection: true,
      },
    });

    if (!student || !student.gradeSection) {
      return res.status(404).json({
        message: "Student or grade section not found."
      });
    }

    const privateAnnouncements = await prisma.announcement.findMany({
      where: {
        isPublic: false,
        gradeId: student.gradeSection.id,
      },
      select: {
        id: true,
        title: true,
        message: true,
        createdAt: true,
      },
    });

    if (privateAnnouncements.length === 0) {
      return res.status(404).json({
        message: "No private announcements found for your grade."
      });
    }

    res.json(privateAnnouncements);
  } catch (err) {
    console.error("Error fetching private announcements:", err);
    res.status(500).json({
      message: `Error: ${err.message}`
    });
  }
};

export default { PublicAnnouncements, privateAnnouncements };
