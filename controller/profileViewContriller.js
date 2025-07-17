import  {PrismaClient} from "@prisma/client";

const prisma = new PrismaClient;

const profileView = async (req, res) =>{
  try{
      const {studentId } = req.user;
    const student = await prisma.student.findUnique({
        where: {studentId },
        select: {
        fullName: true,
        studentId: true,
        // other profile fields
        }
    });
    

    if(!student){
        res.status(404).json(
            {
                message: "User not Found!!!"
            }
        )
    }

    res.json(student);
  }catch(error){
    console.error("Error fetching student profile:", error);
    return res.status(401).json({
      message: "Unauthorized access!"
    });
  }    
}


export default profileView;