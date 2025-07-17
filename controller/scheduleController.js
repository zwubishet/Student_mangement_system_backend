import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const Schedules = async (req, res) =>{
    const userId = req.user.id;
    console.log("Decoded user from token:", req.user);


    try{
        const studentWithSchedule = await prisma.student.findUnique({
        where: {id: userId},
        include: {
            gradeSection: {
                include: {
                    schedules: true
                }
            }
        }
    }
        
    )

    if(!studentWithSchedule){
        res.status(404).json(
            {
                message: "No schedule found"
            }
        )
    }

    res.json(studentWithSchedule.gradeSection.schedules[0].weekSchedule);

    }catch(err){
        console.error("Error fetching student profile:", err);
    return res.status(401).json({
      message: "Unauthorized access!"
    });
    }

}

const todaySchedules = async (req, res) =>{
    const userId = req.user.id;
    console.log("Decoded user from token:", req.user);
    const toDay = new Date().toLocaleDateString("en-US", { weekday: "long" });

    try{
        const studentWithSchedule = await prisma.student.findUnique({
        where: {id: userId},
        include: {
            gradeSection: {
                include: {
                    schedules: true
                }
            }
        }
    }
        
    )

    if(!studentWithSchedule){
        res.status(404).json(
            {
                message: "No schedule found"
            }
        )
    }
    const todaySchedule = studentWithSchedule.gradeSection.schedules[0].weekSchedule[toDay]
    if(!todaySchedule || todaySchedule.length == 0 ){
        res.json({
            message: "the is no schedule $toDay",
            day: toDay,
            schedule: todaySchedule
        })
    }

    res.json(
       {
         message: "succefully feach $toDay schedule",
            day: toDay,
            schedule: todaySchedule
       }
    );

    }catch(err){
        console.error("Error fetching student profile:", err);
    return res.status(401).json({
      message: "Unauthorized access!"
    });
    }

}

export default {Schedules, todaySchedules}; 
