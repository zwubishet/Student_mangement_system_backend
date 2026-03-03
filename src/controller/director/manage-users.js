import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
// the client is located two levels up
import client from '../../hasuraClient.js';
import pkg_apollo from '@apollo/client';
const { gql } = pkg_apollo;

// ✅ Single endpoint for all CRUD operations on users
const manageUsers = async (req, res) => {
  let { action, userId, role, fullName, password, identifier, gradeSectionId, subject, office, schoolId } = req.body;
  if (role) role = role.toString().toUpperCase();
  
  // Validate action
  const validActions = ['create', 'update', 'delete'];
  if (!validActions.includes(action)) {
    return res.status(400).json({ message: 'Action must be "create", "update", or "delete"' });
  }

  // Authorization: only directors can manage users (add middleware validation)
  const currentUserRole = req.user?.role; // From JWT middleware
  if (currentUserRole !== 'director') {
    return res.status(403).json({ message: 'Only directors can manage users' });
  }

  // directors may only manage users belonging to their own school
  const currentSchool = req.user?.schoolId;
  if (!currentSchool) {
    return res.status(500).json({ message: 'Director account missing schoolId claim' });
  }

  try {
    if (action === 'create') {
      return handleCreateUser(req, res);
    } else if (action === 'update') {
      if (!userId) {
        return res.status(400).json({ message: 'userId is required for update' });
      }
      return handleUpdateUser(req, res);
    } else if (action === 'delete') {
      if (!userId) {
        return res.status(400).json({ message: 'userId is required for delete' });
      }
      return handleDeleteUser(req, res);
    }
  } catch (error) {
    console.error('ManageUsers error:', error);
    return res.status(500).json({ 
      message: 'Operation failed',
      debug: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};

// 🆕 CREATE - Enhanced version of your register function
const handleCreateUser = async (req, res) => {
  let { role, fullName, password, identifier, gradeSectionId, subject, office } = req.body;
  if (role) role = role.toString().toUpperCase();

  if (!role || !fullName || !password || !identifier) {
    return res.status(400).json({ message: 'role, fullName, password, and identifier are required' });
  }

  // Role-specific validation
  if (role === 'STUDENT' && !gradeSectionId) {
    return res.status(400).json({ message: 'gradeSectionId required for STUDENT' });
  }
  if (role === 'TEACHER' && !subject) {
    return res.status(400).json({ message: 'subject required for TEACHER' });
  }
  if (role === 'DIRECTOR' && !office) {
    return res.status(400).json({ message: 'office required for DIRECTOR' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUserId = uuidv4();

  // school of created user is the same as the director performing the action
  const schoolId = req.user.schoolId;

  // 1. Create user
  const CREATE_USER = gql`
    mutation CreateUser($id: String!, $fullName: String!, $password: String!, $role: String!, $schoolId: uuid!) {
      insert_users_one(object: { id: $id, full_name: $fullName, password: $password, role: $role, school_id: $schoolId }) {
        id
      }
    }
  `;
  
  await client.mutate({
    mutation: CREATE_USER,
    variables: { id: newUserId, fullName, password: hashedPassword, role, schoolId }
  });

  // 2. Create profile
  let profile;
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
    profile = await client.mutate({
      mutation: CREATE_STUDENT,
      variables: { userId: newUserId, studentId: identifier, gradeSectionId }
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
    profile = await client.mutate({
      mutation: CREATE_TEACHER,
      variables: { userId: newUserId, teacherId: identifier, subject }
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
    profile = await client.mutate({
      mutation: CREATE_DIRECTOR,
      variables: { userId: newUserId, directorId: identifier, office }
    });
  }

  return res.status(201).json({ 
    message: 'User created successfully', 
    userId: newUserId,
    profile: profile.data
  });
};

// 🆕 UPDATE - Update user + profile in one transaction
const handleUpdateUser = async (req, res) => {
  const { userId, fullName, password, identifier, gradeSectionId, subject, office } = req.body;

  // Check if user exists first
  const GET_USER = gql`
    query GetUser($userId: String!) {
      users_by_pk(id: $userId) {
        id
        role
        school_id
      }
    }
  `;
  
  const userCheck = await client.query({
    query: GET_USER,
    variables: { userId }
  });

  if (!userCheck.data.users_by_pk) {
    return res.status(404).json({ message: 'User not found' });
  }

  const userRole = userCheck.data.users_by_pk.role;
  const targetSchool = userCheck.data.users_by_pk.school_id;
  if (targetSchool !== req.user.schoolId) {
    return res.status(403).json({ message: 'Cannot modify a user from another school' });
  }
  let hashedPassword = password ? await bcrypt.hash(password, 10) : undefined;

  // 1. Update user record
  const UPDATE_USER = gql`
    mutation UpdateUser($userId: String!, $fullName: String, $password: String) {
      update_users_by_pk(pk_columns: { id: $userId }, _set: {
        ${fullName ? 'full_name: $fullName' : ''}
        ${password ? 'password: $password' : ''}
      }) {
        id
      }
    }
  `;

  const userUpdateVars = { userId };
  if (fullName) userUpdateVars.fullName = fullName;
  if (hashedPassword) userUpdateVars.password = hashedPassword;

  await client.mutate({
    mutation: UPDATE_USER,
    variables: userUpdateVars
  });

  // 2. Update profile based on role
  if (userRole === 'STUDENT' && (identifier || gradeSectionId)) {
    const UPDATE_STUDENT = gql`
      mutation UpdateStudent($userId: String!, $studentId: String, $gradeSectionId: String) {
        update_students_by_pk(pk_columns: { userId: $userId }, _set: {
          ${identifier ? 'student_id: $studentId' : ''}
          ${gradeSectionId ? 'grade_section_id: $gradeSectionId' : ''}
        }) {
          userId
        }
      }
    `;
    await client.mutate({
      mutation: UPDATE_STUDENT,
      variables: { 
        userId, 
        studentId: identifier, 
        gradeSectionId 
      }
    });
  } else if (userRole === 'TEACHER' && (identifier || subject)) {
    const UPDATE_TEACHER = gql`
      mutation UpdateTeacher($userId: String!, $teacherId: String, $subject: String) {
        update_teachers_by_pk(pk_columns: { userId: $userId }, _set: {
          ${identifier ? 'teacher_id: $teacherId' : ''}
          ${subject ? 'subject: $subject' : ''}
        }) {
          userId
        }
      }
    `;
    await client.mutate({
      mutation: UPDATE_TEACHER,
      variables: { userId, teacherId: identifier, subject }
    });
  } else if (userRole === 'DIRECTOR' && (identifier || office)) {
    const UPDATE_DIRECTOR = gql`
      mutation UpdateDirector($userId: String!, $directorId: String, $office: String) {
        update_directors_by_pk(pk_columns: { userId: $userId }, _set: {
          ${identifier ? 'director_id: $directorId' : ''}
          ${office ? 'office: $office' : ''}
        }) {
          userId
        }
      }
    `;
    await client.mutate({
      mutation: UPDATE_DIRECTOR,
      variables: { userId, directorId: identifier, office }
    });
  }

  return res.json({ message: 'User updated successfully', userId });
};

// 🆕 DELETE - Cascade deletes profile automatically
const handleDeleteUser = async (req, res) => {
  const { userId } = req.body;

  // ensure the user belongs to the same school as director
  const CHECK_USER = gql`
    query CheckUser($userId: String!) {
      users_by_pk(id: $userId) {
        id
        school_id
      }
    }
  `;
  const checkResp = await client.query({ query: CHECK_USER, variables: { userId } });
  if (!checkResp.data.users_by_pk) {
    return res.status(404).json({ message: 'User not found' });
  }
  if (checkResp.data.users_by_pk.school_id !== req.user.schoolId) {
    return res.status(403).json({ message: 'Cannot delete a user from another school' });
  }

  // Soft delete option (add deleted_at column) or hard delete
  const DELETE_USER = gql`
    mutation DeleteUser($userId: String!) {
      delete_users_by_pk(pk_columns: { id: $userId }) {
        id
      }
    }
  `;

  const result = await client.mutate({
    mutation: DELETE_USER,
    variables: { userId }
  });

  if (result.data.delete_users_by_pk) {
    return res.json({ 
      message: 'User deleted successfully', 
      userId,
      deleted: true 
    });
  } else {
    return res.status(404).json({ message: 'User not found' });
  }
};

// Export the main handler
export { manageUsers };
