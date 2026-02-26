import prisma from "../../prisma/client.js";
import bcrypt from "bcrypt";
import client from '../../src/hasuraClient.js';
import pkg_apollo from '@apollo/client';
const { gql } = pkg_apollo;

export const registerTeacher = async (req, res) => {
  try {
    const { fullName, password, teacherId, subject } = req.body;

    // Check existence via Hasura
    const CHECK_TEACHER = gql`
      query CheckTeacher($teacherId: String!) {
        teacher(where: { teacherId: { _eq: $teacherId } }) {
          teacherId
        }
      }
    `;
    const checkResp = await client.query({ query: CHECK_TEACHER, variables: { teacherId }, fetchPolicy: 'no-cache' });
    const existing = checkResp?.data?.teacher || [];
    if (existing.length) {
      return res.status(400).json({ message: "Teacher ID already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const INSERT_USER = gql`
      mutation InsertUser($fullName: String!, $password: String!, $role: String!) {
        insert_User_one(object: { fullName: $fullName, password: $password, role: $role }) {
          id
          fullName
        }
      }
    `;
    const userResp = await client.mutate({ mutation: INSERT_USER, variables: { fullName, password: hashedPassword, role: 'TEACHER' } });
    const user = userResp?.data?.insert_User_one;

    const INSERT_TEACHER = gql`
      mutation InsertTeacher($userId: String!, $teacherId: String!, $subject: String!) {
        insert_Teacher_one(object: { userId: $userId, teacherId: $teacherId, subject: $subject }) {
          userId
          teacherId
          subject
        }
      }
    `;
    const teacherResp = await client.mutate({ mutation: INSERT_TEACHER, variables: { userId: user.id, teacherId, subject } });
    const teacher = teacherResp?.data?.insert_Teacher_one;

    res.status(201).json({
      message: "Teacher registered successfully",
      teacher: {
        fullName: user.fullName,
        teacherId: teacher.teacherId,
        subject: teacher.subject,
      },
    });

  } catch (error) {
    console.error("Register teacher error:", error);
    res.status(500).json({ message: "Failed to register teacher" });
  }
};

const deleteTeacher = async (req, res) => {
  try {
    const { teacherId } = req.body;

    const GET_TEACHER = gql`
      query GetTeacher($teacherId: String!) {
        teacher(where: { teacherId: { _eq: $teacherId } }) {
          userId
          teacherId
        }
      }
    `;
    const getResp = await client.query({ query: GET_TEACHER, variables: { teacherId }, fetchPolicy: 'no-cache' });
    const teacherArr = getResp?.data?.teacher || [];
    if (!teacherArr.length) return res.status(404).json({ message: 'Teacher not found' });
    const teacher = teacherArr[0];

    const DELETE_TEACHER = gql`
      mutation DeleteTeacher($userId: String!) {
        delete_Teacher(where: { userId: { _eq: $userId } }) {
          affected_rows
        }
      }
    `;
    await client.mutate({ mutation: DELETE_TEACHER, variables: { userId: teacher.userId } });

    const DELETE_USER = gql`
      mutation DeleteUser($id: String!) {
        delete_User(where: { id: { _eq: $id } }) {
          affected_rows
        }
      }
    `;
    await client.mutate({ mutation: DELETE_USER, variables: { id: teacher.userId } });

    res.json({ message: 'Teacher deleted successfully' });

  } catch (error) {
    console.error("Error deleting teacher:", error);
    res.status(500).json({ message: "Failed to delete teacher" });
  }
};



const putResoures = async (req, res) => {
  try {
    const { title, description, resourceType, link, file } = req.body;

    const INSERT_RESOURCE = gql`
      mutation InsertResource($title: String!, $description: String, $resourceType: String!, $link: String, $file: String) {
        insert_Resource_one(object: { title: $title, description: $description, resourceType: $resourceType, link: $link, file: $file }) {
          id
          title
        }
      }
    `;

    const resp = await client.mutate({ mutation: INSERT_RESOURCE, variables: { title, description, resourceType, link, file } });
    const resources = resp?.data?.insert_Resource_one;

    if (!resources) return res.status(403).json({ message: 'resources not Created!!' });

    res.json(resources);
  } catch (err) {
    console.error('Insert resource error:', err.message);
    res.status(500).json({ message: 'Failed to create resource' });
  }
};


const putAnnouncements = async (req, res) => {
  try {
    const { title, message, grade, section } = req.body;

    let gradeId = null;

    if (grade && section) {
      const GET_GRADE = gql`
        query GetGrade($grade: String!, $section: String!) {
          gradeSection(where: { grade: { _eq: $grade }, section: { _eq: $section } }) {
            id
          }
        }
      `;
      const getResp = await client.query({ query: GET_GRADE, variables: { grade, section }, fetchPolicy: 'no-cache' });
      const gs = getResp?.data?.gradeSection && getResp.data.gradeSection.length ? getResp.data.gradeSection[0] : null;
      if (!gs) return res.status(404).json({ message: 'Grade section not found' });
      gradeId = gs.id;
    }

    const INSERT_ANNOUNCEMENT = gql`
      mutation InsertAnnouncement($title: String!, $message: String!, $gradeId: String, $isPublic: Boolean!) {
        insert_Announcement_one(object: { title: $title, message: $message, gradeId: $gradeId, isPublic: $isPublic }) {
          id
          title
        }
      }
    `;

    const resp = await client.mutate({ mutation: INSERT_ANNOUNCEMENT, variables: { title, message, gradeId, isPublic: !gradeId } });
    const announcement = resp?.data?.insert_Announcement_one;
    res.status(201).json(announcement);
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ message: 'Failed to create announcement' });
  }
};

const updateAnnouncement = async (req, res) => {
  const { id, title, message } = req.body;

  if (!id) {
    return res.status(400).json({ message: "Announcement ID is required" });
  }

  try {
    const UPDATE_ANNOUNCEMENT = gql`
      mutation UpdateAnnouncement($id: String!, $title: String, $message: String) {
        update_Announcement(where: { id: { _eq: $id } }, _set: { title: $title, message: $message }) {
          returning { id title message }
        }
      }
    `;
    const resp = await client.mutate({ mutation: UPDATE_ANNOUNCEMENT, variables: { id, title, message } });
    const updated = resp?.data?.update_Announcement?.returning?.[0];
    if (!updated) return res.status(404).json({ message: 'Announcement not found' });
    return res.json({ message: 'Announcement updated successfully', updatedAnnouncement: updated });
  } catch (error) {
    console.error('Update error:', error);
    return res.status(500).json({ message: 'Failed to update announcement' });
  }
};


const deleteAnnouncement = async (req, res) => {
  const { id } = req.body;

  try {
    const DELETE_ANNOUNCEMENT = gql`
      mutation DeleteAnnouncement($id: String!) {
        delete_Announcement(where: { id: { _eq: $id } }) {
          affected_rows
        }
      }
    `;
    const resp = await client.mutate({ mutation: DELETE_ANNOUNCEMENT, variables: { id } });
    const affected = resp?.data?.delete_Announcement?.affected_rows || 0;
    if (!affected) return res.status(404).json({ message: 'Announcement not found' });
    return res.json({ message: 'Announcement deleted successfully', deletedAnnouncement: { id } });
  } catch (error) {
    console.error('Delete error:', error);
    return res.status(500).json({ message: 'Failed to delete announcement' });
  }
};


export default {putResoures, putAnnouncements, deleteAnnouncement, updateAnnouncement, registerTeacher, deleteTeacher}