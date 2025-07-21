import prisma from '../../prisma/client.js';

const getTeachers = async (req, res) => {
    const teachers = await prisma.teacher.findMany({
        select: {
            teacherId: true,
            subject: true,
            user: true
        }
    });

    if(!teachers || teachers.length === 0){
        return res.status(403).json({
            message: "Teachers not found!!",
        })
    }

    res.json(teachers);
}

const getStudents = async (req, res) => {
    const students = await prisma.student.findMany({
        select: {
            studentId: true,
            user: true,
            gradeSection: true,
            communityPosts: true
        }
    });

    if(!students || students.length === 0){
        return res.status(403).json({
            message: "students not found!!",
        })
    }

    res.json(students);
}

const getClasses = async (req, res) => {
    const classes = await prisma.gradeSection.findMany({
        select: {
            grade: true,
            section: true,
            students: true,
            schedules: true,
            announcements: true
        }
    });

    if(!classes || classes.length === 0){
        return res.status(403).json({
            message: "classes not found!!",
        })
    }

    res.json(classes);
}

const getSpecficClassesStudents = async (req, res) => {
    const  {grade, section} = req.params;
    const classes = await prisma.gradeSection.findMany({
        where: {
            grade: grade,
            section: section
        },
        select: {
            students: true,
            schedules: true,
            announcements: true
        }
    });

    if(!classes || classes.length === 0){
        return res.status(403).json({
            message: "classes not found!!",
        })
    }

    res.json(classes);
}


const getResoures = async (req, res) => {
    const resources = await prisma.resource.findMany({
        select: {
            title: true,
            description: true,
            resourceType: true,
            link: true,
            file: true
        }
    });

    if(!resources || resources.length === 0){
        return res.status(403).json({
            message: "resources not found!!",
        })
    }

    res.json(resources);
}

const getAnnouncements = async (req, res) => {
    const announcements = await prisma.announcement.findMany({
        select: {
            id: true,
            title: true,
            message: true,
            grade: true,
            isPublic: true
        }
    });

    if(!announcements || announcements.length === 0){
        return res.status(403).json({
            message: "announcements not found!!",
        })
    }

    res.json(announcements);
}

export default {getTeachers, getStudents, getClasses, getResoures, getAnnouncements, getSpecficClassesStudents}