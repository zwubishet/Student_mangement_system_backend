import Joi from 'joi';

const optionalUuid = Joi.string().guid().empty('').optional();
const optionalStr = Joi.string().trim().empty('').optional();

/** Shared list/export query validation — pagination + common admin filters */
export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(20),
  search: optionalStr.max(100),
  sort: optionalStr,
  order: Joi.string().valid('asc', 'desc').insensitive().default('asc'),
  // Student list filters
  status: optionalStr,
  gender: optionalStr,
  grade_id: optionalUuid,
  section_id: optionalUuid,
  academic_year_id: optionalUuid,
  enrolled_from: optionalStr,
  enrolled_to: optionalStr,
  include_deleted: Joi.string().valid('true', 'false').optional(),
  include_archived: Joi.string().valid('true', 'false').optional(),
  // Teacher list filters
  department: optionalStr,
  employment_type: optionalStr,
  subject_id: optionalUuid,
  leave_status: optionalStr,
  availability: optionalStr,
}).unknown(true);

export const getPaginationParams = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};
