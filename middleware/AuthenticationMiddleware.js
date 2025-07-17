import jwt from "jsonwebtoken";

const  AuthenticationMiddleware = (req, res, next) =>{
    const authHeader = req.headers.authorization;

   if(!authHeader || !authHeader.startsWith("Bearer ")){
    res.status(401).json({message: "Unauthorized access"});
   }

   const token = authHeader.split(" ")[1];

  try{
    const decode = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decode;
    next();
  } catch(error){
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

export default AuthenticationMiddleware;