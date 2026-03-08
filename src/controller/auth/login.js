import bcrypt from 'bcrypt';
import client from '../../hasuraClient.js';
import pkg from '@apollo/client';
const { gql } = pkg;
import { generateAccessToken, generateRefreshToken } from '../../util/jwt.js';

export const login = async (req, res) => {
  console.log("🔥=== HANDLER EXECUTED ===");
  console.log("🔥 req.body (RAW):", req.body);
  
  // ✅ FIX: Handle Hasura's DOUBLE NESTING
  let finalInput = req.body.input?.input || req.body.input || req.body;
  const { role, identifier, password } = finalInput || {};
  
  console.log("✅ FINAL EXTRACTED:", { role, identifier, password });
  
  const normalizedRole = role?.toLowerCase()?.trim();
  console.log("Login attempt:", { role: normalizedRole, identifier })

  // ✅ Input validation
  if (!identifier?.trim() || !normalizedRole || !password?.trim()) {
    return res.status(400).json({ 
      success: false,
      message: "identifier, role, and password are required" 
    });
  }

  // ✅ Role validation
  const validRoles = ['student', 'teacher', 'director', 'super_admin'];
  if (!validRoles.includes(normalizedRole)) {
    return res.status(400).json({ 
      success: false,
      message: `Valid roles: ${validRoles.join(', ')}` 
    });
  }

  try {
    let userRecord, payload;

    

    // ✅ STUDENT LOGIN
    if (normalizedRole === 'student') {
      const GET_STUDENT = gql`
        query GetStudent($studentId: String!) {
          students(where: { student_id: { _eq: $studentId } }) {
            student_id
            user {
              id
              full_name
              password
              role
              school_id
            }
          }
        }
      `;
      const resp = await client.query({ 
        query: GET_STUDENT, 
        variables: { studentId: identifier.trim() }, 
        fetchPolicy: 'no-cache' 
      });
      
      const student = resp?.data?.students?.[0];
      if (!student?.user) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid credentials' 
        });
      }
      
      userRecord = student;
      payload = { 
        studentId: student.student_id, 
        userId: student.user.id, 
        role: student.user.role, 
        schoolId: student.user.school_id 
      };
    }

    // ✅ TEACHER LOGIN
    else if (normalizedRole === 'teacher') {
      const GET_TEACHER = gql`
        query GetTeacher($teacherId: String!) {
          teachers(where: { teacher_id: { _eq: $teacherId } }) {
            teacher_id
            user {
              id
              full_name
              password
              role
              school_id
            }
          }
        }
      `;
      const resp = await client.query({ 
        query: GET_TEACHER, 
        variables: { teacherId: identifier.trim() }, 
        fetchPolicy: 'no-cache' 
      });
      
      const teacher = resp?.data?.teachers?.[0];
      if (!teacher?.user) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid credentials' 
        });
      }
      
      userRecord = teacher;
      payload = { 
        teacherId: teacher.teacher_id, 
        userId: teacher.user.id, 
        role: teacher.user.role, 
        schoolId: teacher.user.school_id 
      };
    }

    // ✅ DIRECTOR LOGIN
    else if (normalizedRole === 'director') {
      const GET_DIRECTOR = gql`
        query GetDirector($directorId: String!) {
          directors(where: { director_id: { _eq: $directorId } }) {
            director_id
            user {
              id
              full_name
              password
              role
              school_id
            }
          }
        }
      `;
      const resp = await client.query({ 
        query: GET_DIRECTOR, 
        variables: { directorId: identifier.trim() }, 
        fetchPolicy: 'no-cache' 
      });
      
      const director = resp?.data?.directors?.[0];
      if (!director?.user) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid credentials' 
        });
      }
      
      userRecord = director;
      payload = { 
        directorId: director.director_id, 
        userId: director.user.id, 
        role: director.user.role, 
        schoolId: director.user.school_id 
      };
    }

        // ✅ SUPER ADMIN LOGIN
    else if (normalizedRole === 'super_admin') {
      const GET_SUPER_ADMIN = gql`
        query GetSuperAdmin($identifier: String!) {
          users(where: { 
            role: { _eq: "super_admin" }, 
            identifier: { _eq: $identifier } 
          }) {
            id
            full_name
            password
            role
          }
        }
      `;
      
      const resp = await client.query({ 
        query: GET_SUPER_ADMIN, 
        variables: { identifier: identifier.trim() }, 
        fetchPolicy: 'no-cache' 
      });
      
      const superAdmin = resp?.data?.users?.[0];
      if (!superAdmin) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid credentials' 
        });
      }
      
      userRecord = { user: superAdmin };
      payload = { 
        userId: superAdmin.id, 
        role: superAdmin.role 
      };
    }


    // ✅ Password verification
    const isPasswordValid = await bcrypt.compare(password.trim(), userRecord.user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid credentials" 
      });
    }

    // ✅ Cleanup old refresh tokens
    const CLEANUP_REFRESH = gql`
      mutation CleanupRefresh($userId: String!) {
        delete_refresh_tokens(where: { user_id: { _eq: $userId } }) {
          affected_rows
        }
      }
    `;
    await client.mutate({ 
      mutation: CLEANUP_REFRESH, 
      variables: { userId: userRecord.user.id } 
    });

    // ✅ Generate tokens
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // ✅ Store new refresh token
    const INSERT_REFRESH = gql`
      mutation InsertRefresh($token: String!, $userId: String!) {
        insert_refresh_tokens_one(object: { 
          token: $token, 
          user_id: $userId 
        }) {
          id
        }
      }
    `;
    await client.mutate({ 
      mutation: INSERT_REFRESH, 
      variables: { token: refreshToken, userId: userRecord.user.id } 
    });

    // ✅ EXACT Hasura Action Response Format
    return res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken,
      refreshToken,
      user: {
        userId: userRecord.user.id,
        fullName: userRecord.user.full_name,
        role: userRecord.user.role,
      }
    });

  } catch (error) {
    console.error("Login error:", {
      message: error.message,
      graphQLErrors: error.graphQLErrors,
      input: { role: normalizedRole, identifier: identifier?.slice(0,4)+'...' }
    });
    
    return res.status(421).json({ 
      success: false,
      message: "Authentication service unavailable" 
    });
  }
};
