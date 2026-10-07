/** GraphQL LoginOutput / RegisterSchoolOutput field names (snake_case). */

export const toLoginOutput = (result) => ({
  id: result.user.id,
  token: result.token,
  email: result.user.email,
  first_name: result.user.firstName,
  last_name: result.user.lastName,
  school_id: result.user.schoolId,
  roles: result.user.roles,
});

export const toRegisterSchoolOutput = (result) => ({
  school_id: result.schoolId,
  admin_id: result.userId,
  token: result.token,
});

export const toLogoutOutput = () => ({
  status: 'success',
  message: 'Logged out successfully',
});
