import client from '../hasuraClient.js';
import pkg_apollo from '@apollo/client';
const { gql } = pkg_apollo;

// Super-admin only endpoint to manage schools
export const createSchool = async (req, res) => {
  const { name, code, address } = req.body;
  if (!name || !code) {
    return res.status(400).json({ message: 'name and code are required' });
  }

  try {
    const INSERT_SCHOOL = gql`
      mutation InsertSchool($name: String!, $code: String!, $address: String) {
        insert_School_one(object: { name: $name, code: $code, address: $address, created_by: "${req.user.userId}" }) {
          id
          name
          code
        }
      }
    `;

    const result = await client.mutate({
      mutation: INSERT_SCHOOL,
      variables: { name, code, address }
    });

    return res.status(201).json({ school: result.data.insert_School_one });
  } catch (err) {
    console.error('Create school error:', err);
    if (err.message && err.message.toLowerCase().includes('duplicate')) {
      return res.status(409).json({ message: 'School code already exists' });
    }
    return res.status(500).json({ message: 'Failed to create school' });
  }
};

export const listSchools = async (req, res) => {
  try {
    const GET_SCHOOLS = gql`
      query GetSchools {
        School {
          id
          name
          code
          address
        }
      }
    `;
    const resp = await client.query({ query: GET_SCHOOLS, fetchPolicy: 'no-cache' });
    return res.json({ schools: resp.data.School });
  } catch (err) {
    console.error('List schools error:', err);
    return res.status(500).json({ message: 'Failed to list schools' });
  }
};