import Joi from 'joi';

// ─── Auth ────────────────────────────────────────────────────────────────────
export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

export const registerSchoolSchema = Joi.object({
  school_name: Joi.string().trim().min(2).max(100).required(),
  school_address: Joi.string().trim().max(255).optional().allow(''),
  admin_email: Joi.string().email().required(),
  admin_password: Joi.string().min(8).required(),
  first_name: Joi.string().trim().min(1).max(50).required(),
  last_name: Joi.string().trim().min(1).max(50).required(),
});

// ─── REST API (v1) ───────────────────────────────────────────────────────────
const uuid = Joi.string().uuid();

export const enrollStudentBodySchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).optional(),
  first_name: Joi.string().trim().min(1).max(50).required(),
  last_name: Joi.string().trim().min(1).max(50).required(),
  gender: Joi.string().valid('male', 'female', 'other').optional(),
  date_of_birth: Joi.date().iso().optional(),
  admission_number: Joi.string().trim().max(50).required(),
  section_id: uuid.required(),
  academic_year_id: uuid.required(),
  phone: Joi.string().max(20).optional().allow(''),
  address: Joi.string().max(255).optional().allow(''),
  nationality: Joi.string().max(50).optional().allow(''),
  emergency_contact_name: Joi.string().max(100).optional().allow(''),
  emergency_contact_phone: Joi.string().max(20).optional().allow(''),
  guardians: Joi.array().items(
    Joi.object({
      full_name: Joi.string().required(),
      relationship: Joi.string().optional(),
      email: Joi.string().email().optional(),
      phone: Joi.string().optional(),
      is_primary: Joi.boolean().optional(),
    })
  ).optional(),
});

export const createTeacherBodySchema = Joi.object({
  first_name: Joi.string().trim().min(1).max(50).required(),
  last_name: Joi.string().trim().min(1).max(50).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().trim().max(20).optional().allow(''),
  hire_date: Joi.date().iso().optional(),
  department: Joi.string().trim().max(80).optional().allow(''),
  employment_type: Joi.string().valid('full_time', 'part_time', 'contract').optional(),
  qualification_summary: Joi.string().max(500).optional().allow(''),
  address: Joi.string().max(255).optional().allow(''),
  password: Joi.string().min(6).optional(),
});

export const updateTeacherBodySchema = createTeacherBodySchema.fork(
  ['first_name', 'last_name', 'email'],
  (s) => s.optional()
);

export const createClassBodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  grade_id: uuid.optional(),
  grade_name: Joi.string().trim().min(1).max(80).optional(),
  capacity: Joi.number().integer().min(1).max(500).required(),
  academic_year_id: uuid.required(),
  section_name: Joi.string().trim().min(1).max(50).required(),
}).or('grade_id', 'grade_name');

export const assignTeacherBodySchema = Joi.object({
  teacher_user_id: uuid.required(),
  subject_id: uuid.required(),
});

export const createExamBodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  term_id: uuid.required(),
  weightage: Joi.number().min(0).max(100).optional(),
});

// ─── Hasura Actions ──────────────────────────────────────────────────────────
export const createStudentSchema = Joi.object({
  input: Joi.object({
    object: Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().min(6).optional(),
      first_name: Joi.string().trim().min(1).max(50).required(),
      last_name: Joi.string().trim().min(1).max(50).required(),
      gender: Joi.string().valid('male', 'female', 'other').optional(),
      date_of_birth: Joi.date().iso().optional(),
      admission_number: Joi.string().trim().max(50).required(),
      section_id: Joi.number().integer().positive().required(),
      academic_year_id: Joi.number().integer().positive().required(),
    }).required(),
  }).required(),
  session_variables: Joi.object().unknown(true).required(),
});

// ─── Teachers ────────────────────────────────────────────────────────────────
export const createTeacherSchema = Joi.object({
  input: Joi.object({
    object: Joi.object({
      first_name: Joi.string().trim().min(1).max(50).required(),
      last_name: Joi.string().trim().min(1).max(50).required(),
      email: Joi.string().email().required(),
      phone: Joi.string().trim().max(20).optional().allow(''),
      hire_date: Joi.date().iso().optional(),
    }).required(),
  }).required(),
  session_variables: Joi.object().unknown(true).required(),
});

// ─── Classes ─────────────────────────────────────────────────────────────────
export const createClassSchema = Joi.object({
  input: Joi.object({
    object: Joi.object({
      name: Joi.string().trim().min(1).max(100).required(),
      grade_level: Joi.string().trim().max(20).optional(),
      capacity: Joi.number().integer().min(1).max(500).required(),
      academic_year_id: Joi.number().integer().positive().required(),
      section_name: Joi.string().trim().min(1).max(50).required(),
    }).required(),
  }).required(),
  session_variables: Joi.object().unknown(true).required(),
});

// ─── Exams ───────────────────────────────────────────────────────────────────
export const createExamSchema = Joi.object({
  input: Joi.object({
    object: Joi.object({
      name: Joi.string().trim().min(1).max(100).required(),
      term_id: Joi.number().integer().positive().required(),
      exam_date: Joi.date().iso().optional(),
      total_marks: Joi.number().positive().optional(),
    }).required(),
  }).required(),
  session_variables: Joi.object().unknown(true).required(),
});

// ─── Settings ────────────────────────────────────────────────────────────────
export const updateSchoolSettingsSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).optional(),
  school_address: Joi.string().trim().max(255).optional().allow(''),
  phone: Joi.string().trim().max(20).optional().allow(''),
  email: Joi.string().email().optional(),
  logo_url: Joi.string().uri().optional().allow(''),
  timezone: Joi.string().max(50).optional(),
  academic_year_format: Joi.string().max(20).optional(),
});

export const createGradeScaleSchema = Joi.object({
  name: Joi.string().trim().min(1).max(50).required(),
  min_score: Joi.number().min(0).max(100).required(),
  max_score: Joi.number().min(0).max(100).required(),
  grade_letter: Joi.string().trim().max(5).required(),
  gpa_points: Joi.number().min(0).max(4).optional(),
  description: Joi.string().trim().max(100).optional().allow(''),
});

// ─── Academic Year / Term ─────────────────────────────────────────────────────
/** Hasura action payload */
export const createAcademicYearActionSchema = Joi.object({
  input: Joi.object({
    object: Joi.object({
      name: Joi.string().trim().min(1).max(50).required(),
      start_date: Joi.date().iso().required(),
      end_date: Joi.date().iso().greater(Joi.ref('start_date')).required(),
    }).required(),
  }).required(),
  session_variables: Joi.object().unknown(true).required(),
});

/** REST catalog POST /catalog/years */
export const createAcademicYearSchema = Joi.object({
  name: Joi.string().trim().min(1).max(50).required(),
  start_date: Joi.date().iso().required(),
  end_date: Joi.date().iso().greater(Joi.ref('start_date')).required(),
});

export const createTermSchema = Joi.object({
  academic_year_id: Joi.string().uuid().required(),
  name: Joi.string().trim().min(1).max(50).required(),
  start_date: Joi.date().iso().required(),
  end_date: Joi.date().iso().greater(Joi.ref('start_date')).required(),
});

// ─── Platform control plane (SUPER_ADMIN) ────────────────────────────────────
export const createSchoolSchema = registerSchoolSchema;

export const updateSchoolSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100),
  school_address: Joi.string().trim().max(255).allow(''),
  domain: Joi.string().max(255).allow('', null),
  plan: Joi.string().trim().max(50),
}).min(1);

export const updateSchoolStatusSchema = Joi.object({
  school_id: Joi.string().uuid().required(),
  status: Joi.string().valid('active', 'inactive', 'suspended').required(),
});

export const patchPlatformSettingsSchema = Joi.object({
  maintenance_mode: Joi.boolean(),
  default_school_plan: Joi.string(),
  max_schools: Joi.number().integer().min(1),
}).min(1);
