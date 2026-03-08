import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import client from '../../hasuraClient.js';
import pkg from '@apollo/client';
const { gql } = pkg;
import { generateAccessToken, generateRefreshToken } from '../../util/jwt.js';

export const register = async (req, res) => {
  console.log("🔥=== REGISTER HANDLER ===");
  console.log("🔥 req.body (RAW):", req.body);
  
  // ✅ SAME DOUBLE-NESTING FIX as login!
  let finalInput = req.body.input?.input || req.body.input || req.body;
  let { role, fullName, password, identifier, gradeSectionId, subject, office, schoolId } = finalInput || {};
  
  console.log("✅ EXTRACTED:", { role, identifier, fullName: fullName?.slice(0,20), schoolId });

  // ✅ Normalize role to lowercase (for consistency with login)
  const normalizedRole = role?.toString().toLowerCase().trim();

  // ✅ Input validation - Hasura Action format
  if (!normalizedRole || !fullName?.trim() || !password?.trim() || !identifier?.trim()) {
    return res.status(400).json({ 
      success: false,
      message: 'role, fullName, password and identifier are required' 
    });
  }

  // ✅ Role-specific validation
  if (normalizedRole === 'student' && !gradeSectionId?.trim()) {
    return res.status(400).json({ 
      success: false,
      message: 'gradeSectionId is required for student' 
    });
  }
  if (normalizedRole === 'teacher' && !subject?.trim()) {
    return res.status(400).json({ 
      success: false,
      message: 'subject is required for teacher' 
    });
  }
  if (normalizedRole === 'director' && !office?.trim()) {
    return res.status(400).json({ 
      success: false,
      message: 'office is required for director' 
    });
  }

  // ✅ School validation (allow super_admin without schoolId)
  const validRoles = ['student', 'teacher', 'director', 'super_admin'];
  if (!validRoles.includes(normalizedRole)) {
    return res.status(400).json({ 
      success: false,
      message: `Valid roles: ${validRoles.join(', ')}` 
    });
  }

  if (normalizedRole !== 'super_admin' && !schoolId) {
    return res.status(400).json({ 
      success: false,
      message: 'schoolId is required for non-super-admin users' 
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(password.trim(), 12);
    const userId = uuidv4();

    // ✅ 1. Create USER
    const CREATE_USER = gql`
      mutation CreateUser($id: String!, $fullName: String!, $password: String!, $role: String!, $schoolId: uuid) {
        insert_users_one(object: { 
          id: $id, 
          full_name: $fullName, 
          password: $password, 
          role: $role,
          school_id: $schoolId
        }) {
          id
        }
      }
    `;

    await client.mutate({
      mutation: CREATE_USER,
      variables: { 
        id: userId, 
        fullName: fullName.trim(), 
        password: hashedPassword, 
        role: normalizedRole,
        ...(schoolId && { schoolId })
      }
    });

    // ✅ 2. Create PROFILE (role-specific)
    if (normalizedRole === 'student') {
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
        variables: { 
          userId, 
          studentId: identifier.trim(), 
          gradeSectionId: gradeSectionId.trim() 
        }
      });
    } else if (normalizedRole === 'teacher') {
      const CREATE_TEACHER = gql`
        mutation CreateTeacher($userId: String!, $teacherId: String!, $subject: String!) {
          insert_teachers_one(object: { 
            user_id: $userId, 
            teacher_id: $teacherId, 
            subject: $subject 
          }) {
            user_id
          }
        }
      `;
      await client.mutate({
        mutation: CREATE_TEACHER,
        variables: { 
          userId, 
          teacherId: identifier.trim(), 
          subject: subject.trim() 
        }
      });
    } else if (normalizedRole === 'director') {
      const CREATE_DIRECTOR = gql`
        mutation CreateDirector($userId: String!, $directorId: String!, $office: String!) {
          insert_directors_one(object: { 
            user_id: $userId, 
            director_id: $directorId, 
            office: $office 
          }) {
            user_id
          }
        }
      `;
      await client.mutate({
        mutation: CREATE_DIRECTOR,
        variables: { 
          userId, 
          directorId: identifier.trim(), 
          office: office.trim() 
        }
      });
    }
    // ✅ SUPER_ADMIN - no profile table needed

    // ✅ 3. Generate tokens
    const payload = { 
      userId, 
      role: normalizedRole, 
      ...(schoolId && { schoolId }) 
    };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // ✅ 4. Store refresh token
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
      variables: { token: refreshToken, userId } 
    });

    // ✅ EXACT Hasura Action Response Format
    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      userId,
      accessToken,
      refreshToken
    });

  } catch (err) {
    console.error('Registration error:', {
      message: err.message,
      graphQLErrors: err.graphQLErrors,
      input: { role: normalizedRole, identifier: identifier?.slice(0,4)+'...' }
    });
    
    if (err.message.includes('duplicate key')) {
      return res.status(409).json({ 
        success: false,
        message: 'Identifier or userId already exists' 
      });
    }
    
    return res.status(500).json({ 
      success: false,
      message: 'Registration failed' 
    });
  }
};
