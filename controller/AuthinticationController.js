import express from 'express';
import bycrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const login = async (req, res)=>{
    const {studentId, password} = req.body;

    try{
        const student = await prisma.student.findUnique({
  where: { studentId },
  select: {
    id: true,
    studentId: true,
    fullName: true,
    passwordHash: true, // ✅ Must include this
  },
});
        console.log("student:", student);

        if(!student){
            return res.status(404).json({message: "Student not found"});
        }
 console.log("password from user:", password);
        console.log("passwordHash from DB:", student.passwordHash);
        const isPasswordValid = await bycrypt.compare(password, student.passwordHash);
       


        if(!isPasswordValid){
            return res.status(401).json({message: "Invalid password"});
        }
        const jwtToken = jwt.sign({
            id: student.id,
            studentId: student.studentId,
            fullName: student.fullName
        }, process.env.JWT_SECRET, {
            expiresIn: '30m'
        })

        return res.status(200).json({
            message: "Login successful",
            token: jwtToken,
            student: {
                studentId: student.studentId,
                fullName: student.fullName
            }
        })
    }catch(error){
        console.error("Error during login:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}


export { login };