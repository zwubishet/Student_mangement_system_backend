import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
// use correct relative path to the shared hasuraClient module
import client from '../../hasuraClient.js';
import pkg_apollo from '@apollo/client';
const { gql } = pkg_apollo;

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
        variables: { userId, teacherId: identifier, subject }
      });
    } else if (role === 'director') {
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