import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import client from '../hasuraClient.js';
import pkg_apollo from '@apollo/client';
const { gql } = pkg_apollo;

export const login = async (req, res) => {
  const { role, identifier, password } = req.body;
  console.log("Login attempt:", { role, identifier });

  if (!identifier || !role || !password) {
    return res.status(400).json({ message: "identifier, role, and password are required" });
  }

  try {
    let userRecord, payload;

    // ✅ STUDENT LOGIN
    if (role === "student") {
      const GET_STUDENT = gql`
        query GetStudent($studentId: String!) {
          students(where: { student_id: { _eq: $studentId } }) {
            student_id
            user {
              id
              full_name
              password
              role
            }
          }
        }
      `;
      const resp = await client.query({ 
        query: GET_STUDENT, 
        variables: { studentId: identifier }, 
        fetchPolicy: 'no-cache' 
      });
      
      const student = resp?.data?.students?.[0];
      if (!student?.user) return res.status(404).json({ message: 'Student not found' });
      
      userRecord = student;
      payload = { studentId: student.student_id, userId: student.user.id, role: student.user.role };
    }

    // ✅ TEACHER LOGIN
    else if (role === "teacher") {
      const GET_TEACHER = gql`
        query GetTeacher($teacherId: String!) {
          teachers(where: { teacher_id: { _eq: $teacherId } }) {
            teacher_id
            user {
              id
              full_name
              password
              role
            }
          }
        }
      `;
      const resp = await client.query({ 
        query: GET_TEACHER, 
        variables: { teacherId: identifier }, 
        fetchPolicy: 'no-cache' 
      });
      
      const teacher = resp?.data?.teachers?.[0];
      if (!teacher?.user) return res.status(404).json({ message: 'Teacher not found' });
      
      userRecord = teacher;
      payload = { teacherId: teacher.teacher_id, userId: teacher.user.id, role: teacher.user.role };
    }

    // ✅ DIRECTOR LOGIN
    else if (role === "director") {
      const GET_DIRECTOR = gql`
        query GetDirector($directorId: String!) {
          directors(where: { director_id: { _eq: $directorId } }) {
            director_id
            user {
              id
              full_name
              password
              role
            }
          }
        }
      `;
      const resp = await client.query({ 
        query: GET_DIRECTOR, 
        variables: { directorId: identifier }, 
        fetchPolicy: 'no-cache' 
      });
      
      const director = resp?.data?.directors?.[0];
      if (!director?.user) return res.status(404).json({ message: 'Director not found' });
      
      userRecord = director;
      payload = { directorId: director.director_id, userId: director.user.id, role: director.user.role };
    } else {
      return res.status(400).json({ message: "Invalid role" });
    }

    // ✅ Password verification
    const isPasswordValid = await bcrypt.compare(password, userRecord.user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // ✅ Generate tokens (import from util/jwt.js)
    const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '30d' });

    // ✅ Store refresh token
    const INSERT_REFRESH = gql`
      mutation InsertRefresh($token: String!, $userId: String!) {
        insert_refresh_tokens_one(object: { token: $token, user_id: $userId }) {
          id
          token
        }
      }
    `;
    await client.mutate({ 
      mutation: INSERT_REFRESH, 
      variables: { token: refreshToken, userId: userRecord.user.id } 
    });

    return res.status(200).json({
      message: "Login successful",
      accessToken,
      refreshToken,
      user: {
        userId: userRecord.user.id,
        fullName: userRecord.user.full_name,
        role: userRecord.user.role,
      },
    });

  } catch (error) {
    console.error("Login error details:", error);
    return res.status(500).json({ message: "Unable to complete login process" });
  }
};

// ✅ REFRESH TOKEN
export const refreshToken = async (req, res) => {
  const { token } = req.body;

  if (!token) return res.status(401).json({ message: "Refresh token required" });

  try {
    // 1. Validate refresh token exists in DB
    const GET_REFRESH = gql`
      query GetRefresh($token: String!) {
        refresh_tokens(where: { token: { _eq: $token } }) {
          id
          token
          user_id
          expires_at
        }
      }
    `;
    
    const storedResp = await client.query({ 
      query: GET_REFRESH, 
      variables: { token }, 
      fetchPolicy: 'no-cache' 
    });
    
    const storedToken = storedResp?.data?.refresh_tokens?.[0];
    if (!storedToken || new Date(storedToken.expires_at) < new Date()) {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    // 2. Verify JWT signature
    const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    
    // 3. Generate new access token
    const newAccessToken = jwt.sign(
      { userId: decoded.userId, role: decoded.role }, 
      process.env.ACCESS_TOKEN_SECRET, 
      { expiresIn: '15m' }
    );

    return res.json({ accessToken: newAccessToken });

  } catch (err) {
    console.error("Refresh token error:", err.message);
    return res.status(401).json({ message: "Invalid refresh token" });
  }
};

// ✅ LOGOUT
export const logout = async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: "Refresh token required for logout" });
  }

  try {
    // Delete refresh token from database
    const DELETE_REFRESH = gql`
      mutation DeleteRefresh($token: String!) {
        delete_refresh_tokens(where: { token: { _eq: $token } }) {
          affected_rows
        }
      }
    `;
    
    const result = await client.mutate({ 
      mutation: DELETE_REFRESH, 
      variables: { token } 
    });

    if (result.data.delete_refresh_tokens.affected_rows > 0) {
      return res.json({ message: "Logged out successfully" });
    } else {
      return res.status(404).json({ message: "Refresh token not found" });
    }

  } catch (err) {
    console.error("Logout error:", err.message);
    return res.status(500).json({ message: "Logout failed" });
  }
};

// ✅ REGISTER (Admin-only public registration)
export const register = async (req, res) => {
  const { role, fullName, password, identifier, gradeSectionId, subject, office } = req.body;

  if (!role || !fullName || !password || !identifier) {
    return res.status(400).json({ message: 'role, fullName, password and identifier are required' });
  }

  // Role-specific validation
  if (role === 'student' && !gradeSectionId) {
    return res.status(400).json({ message: 'gradeSectionId is required for STUDENT' });
  }
  if (role === 'teacher' && !subject) {
    return res.status(400).json({ message: 'subject is required for TEACHER' });
  }
  if (role === 'director' && !office) {
    return res.status(400).json({ message: 'office is required for DIRECTOR' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    // 1️⃣ Create USER
    const CREATE_USER = gql`
      mutation CreateUser($id: String!, $fullName: String!, $password: String!, $role: String!) {
        insert_users_one(object: { 
          id: $id, 
          full_name: $fullName, 
          password: $password, 
          role: $role 
        }) {
          id
        }
      }
    `;
    
    await client.mutate({
      mutation: CREATE_USER,
      variables: { id: userId, fullName, password: hashedPassword, role }
    });

    // 2️⃣ Create PROFILE
    if (role === 'student') {
      const CREATE_STUDENT = gql`
        mutation CreateStudent($userId: String!, $studentId: String!, $gradeSectionId: String!) {
          insert_students_one(object: { 
            user_id: $userId, 
            student_id: $studentId, 
            grade_section_id: $gradeSectionId 
          }) {
            user_id
          }
        }
      `;
      await client.mutate({
        mutation: CREATE_STUDENT,
        variables: { userId, studentId: identifier, gradeSectionId }
      });
    } else if (role === 'teacher') {
      const CREATE_TEACHER = gql`
        mutation CreateTeacher($userId: String!, $teacherId: String!, $subject: String!) {
          insert_teachers_one(object: { 
            userId: $userId, 
            teacher_id: $teacherId, 
            subject: $subject 
          }) {
            userId
          }
        }
      `;
      await client.mutate({
        mutation: CREATE_TEACHER,
        variables: { userId, teacherId: identifier, subject }
      });
    } else if (role === 'director') {
      const CREATE_DIRECTOR = gql`
        mutation CreateDirector($userId: String!, $directorId: String!, $office: String!) {
          insert_directors_one(object: { 
            userId: $userId, 
            director_id: $directorId, 
            office: $office 
          }) {
            userId
          }
        }
      `;
      await client.mutate({
        mutation: CREATE_DIRECTOR,
        variables: { userId, directorId: identifier, office }
      });
    }

    return res.status(201).json({ message: 'Registration successful', userId });

  } catch (err) {
    console.error('Registration error:', err);
    
    // Handle duplicate identifier errors
    if (err.message.includes('duplicate key')) {
      return res.status(409).json({ message: 'Identifier already exists' });
    }
    
    return res.status(500).json({ message: 'Registration failed' });
  }
};
