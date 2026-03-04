// controller now delegates to service layer
import * as SchoolService from '../../services/schoolService.js';

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
        const school = await SchoolService.insertSchool({ name, code, address, createdBy: req.user.userId });
        return res.status(201).json({ school });
      }

      case 'update': {
        if (!schoolId) {
          return res.status(400).json({ message: 'schoolId is required for update' });
        }
        if (!name && !code && !address) {
          return res.status(400).json({ message: 'name, code, or address must be specified' });
        }
        const updated = await SchoolService.updateSchool({ id: schoolId, name, code, address });
        if (!updated) {
          return res.status(404).json({ message: 'School not found' });
        }
        return res.json({ message: 'School updated', schoolId });
      }

      case 'delete': {
        if (!schoolId) {
          return res.status(400).json({ message: 'schoolId is required for delete' });
        }
        const deleted = await SchoolService.deleteSchool({ id: schoolId });
        if (!deleted) {
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