import bcrypt from 'bcrypt';
// helper to create tokens with Hasura claims
import { generateAccessToken, generateRefreshToken } from '../../util/jwt.js';
// fix relative path: hasuraClient lives in src/ not src/controller/auth
import client from '../../hasuraClient.js';
import pkg_apollo from '@apollo/client';
const { gql } = pkg_apollo;

export const login = async (req, res) => {
  let { role, identifier, password } = req.body;
  if (role) role = role.toLowerCase();
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
            schoolId
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
      payload = { studentId: student.student_id, userId: student.user.id, role: student.user.role, schoolId: student.user.schoolId };
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
            schoolId
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
      payload = { teacherId: teacher.teacher_id, userId: teacher.user.id, role: teacher.user.role, schoolId: teacher.user.schoolId };
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
            schoolId
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
      payload = { directorId: director.director_id, userId: director.user.id, role: director.user.role, schoolId: director.user.schoolId };
      console.log("Director login payload:", payload);
    } else {
      return res.status(400).json({ message: "Invalid role" });
    }

    // ✅ Password verification
    const isPasswordValid = await bcrypt.compare(password, userRecord.user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // ✅ Generate tokens (includes Hasura JWT claims)
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

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
