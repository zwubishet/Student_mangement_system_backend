import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const Resources = async (req, res)=>{
    try{
        const resourcesData = await prisma.resource.findMany();
        if(!resourcesData){
            res.status(404).json({
                message: "No resource found"
            })
        }
        res.json(resourcesData);
    }catch(err){
        console.log(err)
        res.status(500).json({
            error: `error feaching resource: ${err}`
        })
    }

}


const SearchResource = async (req, res) =>{
    try{
        const serchResult = await prisma.resource.findMany(
            {
                where: {
                    title: req.body.title
                },
                select: {
                    id: true,
        title: true,
        description: true,
        resourceType: true,
        link: true,
        file: true,
                }
            }
        )
         if (!serchResult.length) {
      return res.status(404).json({ message: "No resources found." });
    }

    return res.json(serchResult);
  } catch (err) {
    console.error("Error fetching resources:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
    }

export default {Resources, SearchResource};