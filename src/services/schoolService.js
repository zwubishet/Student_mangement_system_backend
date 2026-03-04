import client from '../hasuraClient.js';
import pkg_apollo from '@apollo/client';
const { gql } = pkg_apollo;

export async function insertSchool({ name, code, address, createdBy }) {
  const INSERT_SCHOOL = gql`
    mutation InsertSchool($name: String!, $code: String!, $address: String, $createdBy: String!) {
      insert_School_one(object: { name: $name, code: $code, address: $address, created_by: $createdBy }) {
        id
        name
        code
      }
    }
  `;

  const result = await client.mutate({
    mutation: INSERT_SCHOOL,
    variables: { name, code, address, createdBy }
  });
  return result.data.insert_School_one;
}

export async function updateSchool({ id, name, code, address }) {
  const UPDATE_SCHOOL = gql`
    mutation UpdateSchool($id: uuid!, $name: String, $code: String, $address: String) {
      update_School_by_pk(pk_columns: { id: $id }, _set: { name: $name, code: $code, address: $address }) {
        id
      }
    }
  `;

  const resp = await client.mutate({ mutation: UPDATE_SCHOOL, variables: { id, name, code, address } });
  return resp.data.update_School_by_pk;
}

export async function deleteSchool({ id }) {
  const DELETE_SCHOOL = gql`
    mutation DeleteSchool($id: uuid!) {
      delete_School_by_pk(id: $id) {
        id
      }
    }
  `;
  const resp = await client.mutate({ mutation: DELETE_SCHOOL, variables: { id } });
  return resp.data.delete_School_by_pk;
}
