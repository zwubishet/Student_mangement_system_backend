import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { generateAccessToken, generateRefreshToken } from '../util/jwt.js';
import prisma from '../prisma/client.js';

const login = async (req, res) => {
  const { role, identifier, password } = req.body;

  if (!identifier || !role || !password) {
    return res.status(400).json({ message: "identifier, role, and password are required" });
  }

  try {
    let userRecord;
    let payload;

    if (role === "STUDENT") {
      const student = await prisma.student.findUnique({
        where: { studentId: identifier },
        include: { user: true },
      });

      if (!student || !student.user) {
        return res.status(404).json({ message: "Student not found" });
      }

      userRecord = student;
      payload = {studentId: student.studentId, userId: student.user.id, role: student.user.role };
    }

    else if (role === "TEACHER") {
      const teacher = await prisma.teacher.findUnique({
        where: { teacherId: identifier },
        include: { user: true },
      });

      if (!teacher || !teacher.user) {
        return res.status(404).json({ message: "Teacher not found" });
      }

      userRecord = teacher;
      payload = {teacherId: teacher.teacherId, userId: teacher.user.id, role: teacher.user.role };
    }

    else if (role === "DIRECTOR") {
      const director = await prisma.director.findUnique({
        where: { directorId: identifier }, // ✅ Fix: You used teacherId instead of directorId
        include: { user: true },
      });

      if (!director || !director.user) {
        return res.status(404).json({ message: "Director not found" });
      }

      userRecord = director;
      payload = {directorId: director.directorId, userId: director.user.id, role: director.user.role };
    }

    else {
      return res.status(400).json({ message: "Invalid role" });
    }

    // ✅ Password check from linked user account
    const isPasswordValid = await bcrypt.compare(password, userRecord.user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid password" });
    }

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        user: {
          connect: { id: userRecord.user.id },
        },
      },
    });

    return res.status(200).json({
      message: "Login successful",
      accessToken,
      refreshToken,
      user: {
        userId: userRecord.user.id,
        fullName: userRecord.user.fullName,
        role: userRecord.user.role,
      },
    });

  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const refreshToken = async (req, res) => {
  const { token } = req.body;

  if (!token) return res.status(401).json({ message: "Refresh token required" });

  const stored = await prisma.refreshToken.findUnique({ where: { token } });
  if (!stored) return res.status(401).json({ message: "Invalid refresh token" });

  try {
    const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    const newAccessToken = generateAccessToken({ userId: decoded.userId, role: decoded.role });
    return res.json({ accessToken: newAccessToken });
  } catch (err) {
    console.error("JWT verification failed:", err.message);
    return res.status(401).json({ message: "Invalid or expired refresh token" });
  }
};

const logout = async (req, res) => {
  const { token } = req.body;

  try {
    await prisma.refreshToken.delete({ where: { token } });
    return res.json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err.message);
    return res.status(500).json({ message: "Logout failed" });
  }
};

export { login, refreshToken, logout };
