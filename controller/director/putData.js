import prisma from "../../prisma/client.js";

const putResoures = async (req, res) => {
    const {title, description, resourceType, link, file} = req.body;

    const resources = await prisma.resource.create({
        data: {
            title: title,
            description: description,
            resourceType: resourceType,
            link: link,
            file: file
        }
    });

    if(!resources || resources.length === 0){
        return res.status(403).json({
            message: "resources not Created!!",
        })
    }

    res.json(resources);
}


const putAnnouncements = async (req, res) => {
  try {
    const { title, message, grade, section } = req.body;

    let gradeId = null;

    if (grade && section) {
      const gradeSection = await prisma.gradeSection.findUnique({
        where: {
          grade_section_unique: {
            grade,
            section,
          },
        },
      });

      if (!gradeSection) {
        return res.status(404).json({ message: "Grade section not found" });
      }

      gradeId = gradeSection.id;

    const announcement = await prisma.announcement.create({
      data: {
        title,
        message,
        gradeId,
        isPublic: !gradeId,
      },
    });
    res.status(201).json(announcement);

}else{
    const announcement = await prisma.announcement.create({
      data: {
        title,
        message,
        gradeId: null,
        isPublic: true,
      },
    });

    res.status(201).json(announcement);
}

  } catch (error) {
    console.error("Error creating announcement:", error);
    res.status(500).json({ message: "Failed to create announcement" });
  }
};

const updateAnnouncement = async (req, res) => {
  const { id, title, message } = req.body;

  if (!id) {
    return res.status(400).json({ message: "Announcement ID is required" });
  }

  try {
    const updatedAnnouncement = await prisma.announcement.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(message && { message }),
      },
    });

    return res.json({
      message: "Announcement updated successfully",
      updatedAnnouncement,
    });

  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: "Announcement not found" });
    }

    console.error("Update error:", error);
    return res.status(500).json({ message: "Failed to update announcement" });
  }
};


const deleteAnnouncement = async (req, res) => {
  const { id } = req.body;

  try {
    const deletedAnnouncement = await prisma.announcement.delete({
      where: { id },
    });

    return res.json({
      message: "Announcement deleted successfully",
      deletedAnnouncement,
    });

  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: "Announcement not found" });
    }

    console.error("Delete error:", error);
    return res.status(500).json({ message: "Failed to delete announcement" });
  }
};


export default {putResoures, putAnnouncements, deleteAnnouncement, updateAnnouncement}