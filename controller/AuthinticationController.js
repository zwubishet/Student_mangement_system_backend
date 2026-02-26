import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { generateAccessToken, generateRefreshToken } from '../util/jwt.js';
import prisma from '../prisma/client.js';
import client from '../src/hasuraClient.js';
import pkg_apollo from '@apollo/client';
const { gql } = pkg_apollo;

const login = async (req, res) => {
  const { role, identifier, password } = req.body;

  if (!identifier || !role || !password) {
    return res.status(400).json({ message: "identifier, role, and password are required" });
  }

  try {
    let userRecord;
    let payload;

    // Use Hasura GraphQL to look up user records (incremental migration: keep Prisma for token storage)
    if (role === "STUDENT") {
      const GET_STUDENT = gql`
        query GetStudent($studentId: String!) {
          student(where: { studentId: { _eq: $studentId } }) {
            studentId
            user {
              id
              fullName
              password
              role
            }
          }
        }
      `;

      const resp = await client.query({ query: GET_STUDENT, variables: { studentId: identifier }, fetchPolicy: 'no-cache' });
      const student = resp?.data?.student && resp.data.student.length ? resp.data.student[0] : null;

      if (!student || !student.user) return res.status(404).json({ message: 'Student not found' });

      userRecord = student;
      payload = { studentId: student.studentId, userId: student.user.id, role: student.user.role };
    }

    else if (role === "TEACHER") {
      const GET_TEACHER = gql`
        query GetTeacher($teacherId: String!) {
          teacher(where: { teacherId: { _eq: $teacherId } }) {
            teacherId
            user {
              id
              fullName
              password
              role
            }
          }
        }
      `;

      const resp = await client.query({ query: GET_TEACHER, variables: { teacherId: identifier }, fetchPolicy: 'no-cache' });
      const teacher = resp?.data?.teacher && resp.data.teacher.length ? resp.data.teacher[0] : null;

      if (!teacher || !teacher.user) return res.status(404).json({ message: 'Teacher not found' });

      userRecord = teacher;
      payload = { teacherId: teacher.teacherId, userId: teacher.user.id, role: teacher.user.role };
    }

    else if (role === "DIRECTOR") {
      const GET_DIRECTOR = gql`
        query GetDirector($directorId: String!) {
          director(where: { directorId: { _eq: $directorId } }) {
            directorId
            user {
              id
              fullName
              password
              role
            }
          }
        }
      `;

      const resp = await client.query({ query: GET_DIRECTOR, variables: { directorId: identifier }, fetchPolicy: 'no-cache' });
      const director = resp?.data?.director && resp.data.director.length ? resp.data.director[0] : null;

      if (!director || !director.user) return res.status(404).json({ message: 'Director not found' });

      userRecord = director;
      payload = { directorId: director.directorId, userId: director.user.id, role: director.user.role };
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

    // store refresh token in Hasura
    const INSERT_REFRESH = gql`
      mutation InsertRefresh($token: String!, $userId: String!) {
        insert_RefreshToken_one(object: { token: $token, userId: $userId }) {
          id
          token
        }
      }
    `;
    await client.mutate({ mutation: INSERT_REFRESH, variables: { token: refreshToken, userId: userRecord.user.id } });

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

  // lookup refresh token via Hasura
  const GET_REFRESH = gql`
    query GetRefresh($token: String!) {
      refreshToken(where: { token: { _eq: $token } }) {
        id
        token
        userId
      }
    }
  `;
  const storedResp = await client.query({ query: GET_REFRESH, variables: { token }, fetchPolicy: 'no-cache' });
  const storedArr = storedResp?.data?.refreshToken || [];
  if (!storedArr.length) return res.status(401).json({ message: "Invalid refresh token" });
  const stored = storedArr[0];

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
    const DELETE_REFRESH = gql`
      mutation DeleteRefresh($token: String!) {
        delete_RefreshToken(where: { token: { _eq: $token } }) {
          affected_rows
        }
      }
    `;
    await client.mutate({ mutation: DELETE_REFRESH, variables: { token } });
    return res.json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err.message);
    return res.status(500).json({ message: "Logout failed" });
  }
};

export { login, refreshToken, logout };
