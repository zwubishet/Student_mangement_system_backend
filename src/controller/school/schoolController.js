import client from '../hasuraClient.js';
import pkg_apollo from '@apollo/client';
const { gql } = pkg_apollo;

/**
 * Controller responsible for all school-related operations. This mirrors the
 * pattern used by `manageUsers` - a single endpoint driven by an `action`
 * parameter in the request body. Supported actions:
 *   - create: create a new school (requires name and code)
 *   - update: update an existing school (requires schoolId and at least one of
 *             name/code/address)
 *   - delete: delete a school by id (requires schoolId)
 *   - list:   return all schools (no body fields required)
 *
 * Only SUPER_ADMIN users may invoke this controller; that restriction is
 * enforced by middleware in the route.
 */
export const manageSchool = async (req, res) => {
  const { action, schoolId, name, code, address } = req.body;

  if (!action) {
    return res.status(400).json({ message: 'action is required' });
  }

  try {
    switch (action) {
      case 'create': {
        if (!name || !code) {
          return res.status(400).json({ message: 'name and code are required' });
        }
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
      }

      case 'update': {
        if (!schoolId) {
          return res.status(400).json({ message: 'schoolId is required for update' });
        }
        if (!name && !code && !address) {
          return res.status(400).json({ message: 'name, code, or address must be specified' });
        }
        const UPDATE_SCHOOL = gql`
          mutation UpdateSchool($id: uuid!, $name: String, $code: String, $address: String) {
            update_School_by_pk(pk_columns: { id: $id }, _set: { name: $name, code: $code, address: $address }) {
              id
            }
          }
        `;
        const vars = { id: schoolId, name, code, address };
        const resp = await client.mutate({ mutation: UPDATE_SCHOOL, variables: vars });
        if (!resp.data.update_School_by_pk) {
          return res.status(404).json({ message: 'School not found' });
        }
        return res.json({ message: 'School updated', schoolId });
      }

      case 'delete': {
        if (!schoolId) {
          return res.status(400).json({ message: 'schoolId is required for delete' });
        }
        const DELETE_SCHOOL = gql`
          mutation DeleteSchool($id: uuid!) {
            delete_School_by_pk(id: $id) {
              id
            }
          }
        `;
        const resp = await client.mutate({ mutation: DELETE_SCHOOL, variables: { id: schoolId } });
        if (!resp.data.delete_School_by_pk) {
          return res.status(404).json({ message: 'School not found' });
        }
        return res.json({ message: 'School deleted', schoolId });
      }

      default: {
        return res.status(400).json({ message: `Unknown action: ${action}` });
      }
    }
  } catch (err) {
    console.error('manageSchool error:', err);
    if (err.message && err.message.toLowerCase().includes('duplicate')) {
      return res.status(409).json({ message: 'School code already exists' });
    }
    return res.status(500).json({ message: 'Operation failed' });
  }
};