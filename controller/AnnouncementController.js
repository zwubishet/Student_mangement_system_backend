import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PublicAnnouncements = async (req, res) => {
    try{
        const publicAnnouncement = await prisma.Announcement.findMany();

        if(!publicAnnouncement){
            res.status(404).json({
                message: "No Announcement Found!"
            })
        } else if(publicAnnouncement.isPublic == false  && publicAnnouncement.gradeId == null){
            res.status(404).json({
                message: "Private Announcement must have gradeid"
            })
        }else if(publicAnnouncement.isPublic == true  && publicAnnouncement.gradeId !== null){
            res.status(404).json({
                message: "public Announcement dont have gradeid"
            })
        }

        res.json(publicAnnouncement)
    }catch(err){
        console.log(err);
        res.status(500).json(
            {
                message: `Error: ${err}`
            }
        )
    }
}

const privateAnnouncements = async (req, res) => {
    const userId = req.user.id;  // Assuming req.user contains decoded user information

    try {
        // Find the gradeSection for the user
        const student = await prisma.student.findUnique({
            where: { id: userId },
            include: {
                gradeSection: true
            }
        });

        if (!student || !student.gradeSection) {
            return res.status(404).json({ message: "Student or GradeSection not found." });
        }

        // Fetch the private announcements for the gradeSection
        const privateAnnouncements = await prisma.announcement.findMany({
            where: {
                isPublic: false,
                gradeId: student.gradeSection.id // Get announcements for this specific grade
            },
            select: {
                id: true,
                title: true,
                message: true,
            }
        });

        if (privateAnnouncements.length === 0) {
            return res.status(404).json({ message: "No private announcements found for your grade." });
        }

        // Respond with the fetched private announcements
        res.json(privateAnnouncements);
    } catch (err) {
        console.error("Error fetching private announcements:", err);
        res.status(500).json({ message: `Error: ${err.message}` });
    }
};



export default {PublicAnnouncements, privateAnnouncements};