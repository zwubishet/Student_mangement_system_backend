import client from '../src/hasuraClient.js';
import { gql } from '@apollo/client/core';

const GET_STUDENT_GRADES = gql`
  query GetStudentGrades($studentId: String!) {
    studentGrade(where: { studentId: { _eq: $studentId } }) {
      id
      year
      semester
      totalScore
      averageScore
      rank
      createdAt
      subjectResults {
        id
        subjectName
        test1
        test2
        test3
        assignment
        finalExam
        total
      }
      student {
        user {
          fullName
        }
      }
    }
  }
`;

export const getStudentGrades = async (studentId) => {
  const res = await client.query({
    query: GET_STUDENT_GRADES,
    variables: { studentId },
    fetchPolicy: 'no-cache',
  });

  // The returned shape depends on your Hasura table/field naming.
  // If your GraphQL root field is named differently (e.g. `student_grade`), adjust the query above.
  return res?.data?.studentGrade || [];
};

export default { getStudentGrades };
