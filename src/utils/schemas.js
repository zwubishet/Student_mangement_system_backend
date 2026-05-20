import Joi from 'joi';
import {
  SCHOOL_STATUSES,
  SUBSCRIPTION_PLANS,
  GRADING_SYSTEMS,
  KNOWN_FEATURES,
} from '../constants/tenant.js';

// ─── Auth ────────────────────────────────────────────────────────────────────
export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const tenantSchoolCore = {
  school_name: Joi.string().trim().min(2).max(100),
  name: Joi.string().trim().min(2).max(100),
  slug: Joi.string().trim().lowercase().pattern(/^[a-z0-9-]+$/).max(80),
  school_address: Joi.string().trim().max(255).allow(''),
  address: Joi.string().trim().max(255).allow(''),
  email: Joi.string().email(),
  phone: Joi.string().trim().max(30).allow(''),
  city: Joi.string().trim().max(100).allow(''),
  region: Joi.string().trim().max(100).allow(''),
  country: Joi.string().length(2).uppercase().default('ET'),
  logo_url: Joi.string().uri().allow('', null),
  timezone: Joi.string().trim().max(64),
  locale: Joi.string().trim().max(10),
  academic_year_start_month: Joi.number().integer().min(1).max(12),
  grading_system: Joi.string().valid(...GRADING_SYSTEMS),
  max_class_size: Joi.number().integer().min(1).max(200),
  plan: Joi.string().valid(...SUBSCRIPTION_PLANS),
  status: Joi.string().valid(...SCHOOL_STATUSES),
  trial_days: Joi.number().integer().min(1).max(365),
  settings: Joi.object().unknown(true),
  feature_flags: Joi.array().items(
    Joi.object({
      feature: Joi.string().valid(...KNOWN_FEATURES).required(),
      enabled: Joi.boolean().required(),
    })
  ),
};

export const registerSchoolSchema = Joi.object({
  ...tenantSchoolCore,
  admin_email: Joi.string().email().required(),
  admin_password: Joi.string().min(8).required(),
  first_name: Joi.string().trim().min(1).max(50).required(),
  last_name: Joi.string().trim().min(1).max(50).required(),
}).or('school_name', 'name');

export const createSchoolSchema = registerSchoolSchema;

// ─── REST API (v1) ───────────────────────────────────────────────────────────
const uuid = Joi.string().uuid();

const guardianInputSchema = Joi.object({
  first_name: Joi.string().trim().min(1).max(50),
  last_name: Joi.string().trim().max(50),
  full_name: Joi.string().trim().min(1).max(100),
  relationship: Joi.string().trim().max(30).required(),
  phone_primary: Joi.string().max(20).allow(''),
  phone: Joi.string().max(20).allow(''),
  phone_secondary: Joi.string().max(20).allow(''),
  email: Joi.string().email().allow('', null),
  occupation: Joi.string().max(100).allow(''),
  is_primary: Joi.boolean().optional(),
  is_emergency: Joi.boolean().optional(),
  can_pickup: Joi.boolean().optional(),
}).or('full_name', 'first_name');

export const enrollStudentBodySchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).optional(),
  first_name: Joi.string().trim().min(1).max(50).required(),
  middle_name: Joi.string().trim().max(50).allow('', null),
  last_name: Joi.string().trim().min(1).max(50).required(),
  first_name_local: Joi.string().trim().max(50).allow('', null),
  last_name_local: Joi.string().trim().max(50).allow('', null),
  gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say').optional(),
  date_of_birth: Joi.date().iso().optional(),
  admission_number: Joi.string().trim().max(50),
  student_id_number: Joi.string().trim().max(50),
  section_id: uuid.required(),
  academic_year_id: uuid.required(),
  class_id: uuid.optional(),
  roll_number: Joi.number().integer().min(1).max(999).optional(),
  phone: Joi.string().max(20).optional().allow(''),
  address: Joi.string().max(255).optional().allow(''),
  home_address: Joi.string().max(255).optional().allow(''),
  city: Joi.string().max(100).optional().allow(''),
  region: Joi.string().max(100).optional().allow(''),
  nationality: Joi.string().max(50).optional().allow(''),
  religion: Joi.string().max(50).optional().allow(''),
  photo_url: Joi.string().uri().allow('', null),
  enrollment_date: Joi.date().iso().optional(),
  emergency_contact_name: Joi.string().max(100).optional().allow(''),
  emergency_contact_phone: Joi.string().max(20).optional().allow(''),
  medical: Joi.object({
    blood_type: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown').optional(),
    allergies: Joi.array().items(Joi.string()).optional(),
    conditions: Joi.array().items(Joi.string()).optional(),
    medications: Joi.array().items(Joi.object({
      name: Joi.string().required(),
      dosage: Joi.string().allow(''),
      frequency: Joi.string().allow(''),
      notes: Joi.string().allow(''),
    })).optional(),
    emergency_notes: Joi.string().allow(''),
  }).optional(),
  guardians: Joi.array().items(guardianInputSchema).optional(),
}).or('admission_number', 'student_id_number');

export const updateStudentProfileSchema = Joi.object({
  first_name: Joi.string().trim().min(1).max(50),
  middle_name: Joi.string().trim().max(50).allow('', null),
  last_name: Joi.string().trim().min(1).max(50),
  first_name_local: Joi.string().trim().max(50).allow('', null),
  last_name_local: Joi.string().trim().max(50).allow('', null),
  gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say'),
  date_of_birth: Joi.date().iso(),
  student_id_number: Joi.string().trim().max(50),
  admission_number: Joi.string().trim().max(50),
  phone: Joi.string().max(20).allow(''),
  address: Joi.string().max(255).allow(''),
  home_address: Joi.string().max(255).allow(''),
  city: Joi.string().max(100).allow(''),
  region: Joi.string().max(100).allow(''),
  nationality: Joi.string().max(50).allow(''),
  religion: Joi.string().max(50).allow(''),
  photo_url: Joi.string().uri().allow('', null),
  enrollment_date: Joi.date().iso(),
  withdrawal_date: Joi.date().iso(),
  withdrawal_reason: Joi.string().max(500).allow(''),
  blood_group: Joi.string().max(10).allow(''),
  emergency_contact_name: Joi.string().max(100).allow(''),
  emergency_contact_phone: Joi.string().max(20).allow(''),
  lifecycle_status: Joi.string().valid('active', 'suspended', 'archived'),
}).min(1);

export const studentMedicalBodySchema = Joi.object({
  blood_type: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'),
  blood_group: Joi.string().max(10),
  allergies: Joi.alternatives().try(Joi.string().allow(''), Joi.array().items(Joi.string())),
  conditions: Joi.alternatives().try(Joi.string().allow(''), Joi.array().items(Joi.string())),
  chronic_conditions: Joi.string().allow(''),
  medications: Joi.alternatives().try(Joi.string().allow(''), Joi.array().items(Joi.object({
    name: Joi.string().required(),
    dosage: Joi.string().allow(''),
    frequency: Joi.string().allow(''),
    notes: Joi.string().allow(''),
  }))),
  emergency_notes: Joi.string().allow(''),
  insurance_provider: Joi.string().max(100).allow(''),
  insurance_number: Joi.string().max(100).allow(''),
  physician_name: Joi.string().max(100).allow(''),
  physician_phone: Joi.string().max(20).allow(''),
  last_checkup_date: Joi.date().iso(),
  vaccination_notes: Joi.string().allow(''),
}).min(1);

const employmentTypeSchema = Joi.string().valid(
  'permanent', 'contract', 'part_time', 'substitute', 'full_time'
);

export const createTeacherBodySchema = Joi.object({
  first_name: Joi.string().trim().min(1).max(50).required(),
  last_name: Joi.string().trim().min(1).max(50).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().trim().max(20).optional().allow(''),
  staff_id_number: Joi.string().trim().max(50).allow(''),
  staff_id: Joi.string().trim().max(50).allow(''),
  hire_date: Joi.date().iso().optional(),
  department: Joi.string().trim().max(80).optional().allow(''),
  employment_type: employmentTypeSchema.optional(),
  qualification_summary: Joi.string().max(500).optional().allow(''),
  address: Joi.string().max(255).optional().allow(''),
  home_address: Joi.string().max(255).optional().allow(''),
  teaching_licence_number: Joi.string().max(50).allow(''),
  licence_expiry_date: Joi.date().iso().allow('', null).empty(''),
  specialisation_subjects: Joi.array().items(Joi.string()).optional(),
  date_of_birth: Joi.date().iso().allow('', null).empty(''),
  gender: Joi.string().max(20).allow(''),
  nationality: Joi.string().max(50).allow(''),
  religion: Joi.string().max(50).allow(''),
  city: Joi.string().max(100).allow(''),
  region: Joi.string().max(100).allow(''),
  emergency_contact_name: Joi.string().max(100).allow(''),
  emergency_contact_phone: Joi.string().max(20).allow(''),
  emergency_contact_rel: Joi.string().max(50).allow(''),
  highest_degree: Joi.string()
    .valid('certificate', 'diploma', 'bachelor', 'masters', 'phd')
    .allow('', null)
    .empty(''),
  degree_subject: Joi.string().max(100).allow(''),
  university_name: Joi.string().max(150).allow(''),
  graduation_year: Joi.number().integer().min(1950).max(2100).allow('', null).empty(''),
  years_of_experience: Joi.number().integer().min(0).max(60).allow('', null).empty(''),
  password: Joi.string().min(6).optional(),
});

export const updateTeacherBodySchema = createTeacherBodySchema.fork(
  ['first_name', 'last_name', 'email', 'hire_date'],
  (s) => s.optional()
).keys({
  leave_status: Joi.string().valid('available', 'on_leave', 'unavailable', 'active').optional(),
  status: Joi.string().valid('active', 'suspended', 'archived').optional(),
  photo_url: Joi.string().uri().allow('', null),
  bank_name: Joi.string().max(100).allow(''),
  bank_account_number: Joi.string().max(50).allow(''),
  bank_branch: Joi.string().max(100).allow(''),
  tax_identification_number: Joi.string().max(50).allow(''),
  pension_number: Joi.string().max(50).allow(''),
  payment_method: Joi.string().valid('bank_transfer', 'cash', 'mobile_money'),
  termination_date: Joi.date().iso(),
  termination_reason: Joi.string().max(500).allow(''),
  is_active: Joi.boolean(),
}).min(1);

export const staffContractBodySchema = Joi.object({
  academic_year_id: Joi.string().uuid().required(),
  contract_type: Joi.string().trim().min(1).max(50).required(),
  salary_amount: Joi.number().min(0).optional(),
  currency: Joi.string().max(10).optional(),
  start_date: Joi.date().iso().required(),
  end_date: Joi.date().iso(),
  signed_at: Joi.date().iso(),
  signed_document_url: Joi.string().uri().allow(''),
  notes: Joi.string().max(500).allow(''),
});

export const staffLeaveBodySchema = Joi.object({
  leave_type: Joi.string().valid('annual', 'sick', 'maternity', 'paternity', 'bereavement', 'study', 'unpaid').required(),
  from_date: Joi.date().iso().required(),
  to_date: Joi.date().iso().required(),
  days_count: Joi.number().integer().min(1).optional(),
  reason: Joi.string().max(500).allow(''),
  substitute_id: Joi.string().uuid().optional(),
});

export const staffLeaveStatusSchema = Joi.object({
  status: Joi.string().valid('approved', 'rejected', 'cancelled').required(),
  rejection_reason: Joi.string().max(500).allow(''),
});

export const staffAppraisalBodySchema = Joi.object({
  academic_year_id: Joi.string().uuid().required(),
  appraisal_date: Joi.date().iso().required(),
  overall_rating: Joi.string().valid('excellent', 'good', 'satisfactory', 'needs_improvement', 'unsatisfactory').required(),
  scores: Joi.object().pattern(Joi.string(), Joi.number().min(0).max(5)).optional(),
  strengths: Joi.string().allow(''),
  areas_to_improve: Joi.string().allow(''),
  action_plan: Joi.string().allow(''),
});

export const staffCpdBodySchema = Joi.object({
  activity_name: Joi.string().trim().min(1).max(200).required(),
  provider: Joi.string().max(150).allow(''),
  category: Joi.string().max(80).allow(''),
  activity_date: Joi.date().iso().required(),
  hours: Joi.number().min(0.5).max(500).required(),
  certificate_url: Joi.string().uri().allow(''),
});

export const createClassBodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).optional(),
  grade_id: uuid.optional(),
  grade_name: Joi.string().trim().min(1).max(80).optional(),
  capacity: Joi.number().integer().min(1).max(500).required(),
  academic_year_id: uuid.required(),
  section_id: uuid.optional(),
  section_name: Joi.string().trim().min(1).max(50).optional(),
})
  .or('section_id', 'section_name')
  .custom((value, helpers) => {
    if (value.section_id) return value;
    if (!value.grade_id && !value.grade_name) {
      return helpers.error('any.custom', {
        message: 'grade_id or grade_name is required when section_name is used',
      });
    }
    return value;
  });

export const assignTeacherBodySchema = Joi.object({
  teacher_user_id: uuid.required(),
  subject_id: uuid.required(),
});

export const createExamBodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  term_id: uuid.required(),
  weightage: Joi.number().min(0).max(100).optional(),
  exam_type: Joi.string().valid('midterm', 'final', 'quiz', 'assignment', 'practical', 'continuous_assessment').optional(),
  max_score: Joi.number().min(1).max(200).optional(),
  pass_score: Joi.number().min(0).max(200).optional(),
  exam_date: Joi.date().iso().optional(),
  instructions: Joi.string().trim().max(5000).optional().allow(''),
});

export const updateExamBodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(100),
  weightage: Joi.number().min(0).max(100),
  exam_type: Joi.string().valid('midterm', 'final', 'quiz', 'assignment', 'practical', 'continuous_assessment'),
  max_score: Joi.number().min(1).max(200),
  pass_score: Joi.number().min(0).max(200),
  exam_date: Joi.date().iso().allow(null),
  instructions: Joi.string().trim().max(5000).allow(''),
  status: Joi.string().valid('DRAFT', 'ACTIVE', 'COMPLETED', 'PUBLISHED'),
}).min(1);

export const examScheduleSchema = Joi.object({
  class_id: uuid.required(),
  subject_id: uuid.required(),
  max_score: Joi.number().min(1).max(200).optional(),
  pass_score: Joi.number().min(0).max(200).optional(),
  room: Joi.string().trim().max(50).optional().allow(''),
  start_time: Joi.date().iso().optional(),
  end_time: Joi.date().iso().optional(),
  invigilator_id: uuid.optional(),
});

export const updateExamScheduleSchema = Joi.object({
  max_score: Joi.number().min(1).max(200),
  pass_score: Joi.number().min(0).max(200),
  room: Joi.string().trim().max(50).allow(''),
  start_time: Joi.date().iso().allow(null),
  end_time: Joi.date().iso().allow(null),
  invigilator_id: uuid.allow(null),
}).min(1);

export const submitExamMarksSchema = Joi.object({
  results: Joi.array().items(
    Joi.object({
      student_id: uuid.required(),
      score: Joi.number().min(0).max(200).allow(null),
      is_absent: Joi.boolean().optional(),
      teacher_notes: Joi.string().trim().max(500).optional().allow(''),
    })
  ).min(1).required(),
});

export const gradingScaleSchema = Joi.object({
  id: uuid.optional(),
  exam_id: uuid.optional().allow(null),
  label: Joi.string().trim().min(1).max(10).required(),
  min_score: Joi.number().min(0).max(100).required(),
  max_score: Joi.number().min(0).max(100).required(),
  grade_points: Joi.number().min(0).max(4).optional(),
  description: Joi.string().trim().max(200).optional().allow(''),
  sort_order: Joi.number().integer().min(0).max(99).optional(),
});

const gradeBandSchema = Joi.object({
  letter_grade: Joi.string().trim().min(1).max(5).required(),
  label: Joi.string().trim().max(50).optional(),
  display_label: Joi.string().trim().max(50).optional(),
  min_score: Joi.number().min(0).max(100).required(),
  max_score: Joi.number().min(0).max(100).required(),
  grade_points: Joi.number().min(0).max(4).optional(),
  is_pass: Joi.boolean().optional(),
  sort_order: Joi.number().integer().min(0).optional(),
});

export const createGradingScaleProfileSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  scale_type: Joi.string().valid('percentage', 'raw', 'gpa').optional(),
  boundary_rule: Joi.string().valid('inclusive_max', 'inclusive_min').optional(),
  activate: Joi.boolean().optional(),
  bands: Joi.array().items(gradeBandSchema).min(1).required(),
});

export const termAssessmentWeightsSchema = Joi.object({
  subject_id: uuid.optional().allow(null),
  weights: Joi.array().items(
    Joi.object({
      exam_type_id: uuid.required(),
      weight_percent: Joi.number().min(0).max(100).required(),
    })
  ).min(1).required(),
});

export const rejectMarksSchema = Joi.object({
  reason: Joi.string().trim().min(3).max(1000).required(),
});

export const bulkMarksCsvSchema = Joi.object({
  csv: Joi.string().min(10).required(),
});

export const scheduleConflictQuerySchema = Joi.object({
  class_id: uuid.required(),
  room: Joi.string().trim().max(50).optional(),
  start_time: Joi.date().iso().required(),
  end_time: Joi.date().iso().required(),
  invigilator_id: uuid.optional(),
  exclude_schedule_id: uuid.optional(),
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
  email: Joi.string().email().allow('', null).optional(),
  logo_url: Joi.string().uri().allow('', null).optional(),
  timezone: Joi.string().max(50).optional(),
  academic_year_format: Joi.string().max(20).optional(),
  allow_student_self_register: Joi.boolean().optional(),
  max_students_per_class: Joi.number().integer().min(1).max(500).optional(),
  sms_enabled: Joi.boolean().optional(),
  sms_sender_id: Joi.string().trim().max(20).allow('', null).optional(),
  sms_provider: Joi.string().trim().max(30).optional(),
  default_locale: Joi.string().trim().max(10).optional(),
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
  status: Joi.string().valid('draft', 'active', 'closed').optional(),
  is_current: Joi.boolean().optional(),
});

export const updateAcademicYearSchema = Joi.object({
  name: Joi.string().trim().min(1).max(50),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
  status: Joi.string().valid('draft', 'active', 'closed'),
  is_current: Joi.boolean(),
}).min(1);

export const createTermSchema = Joi.object({
  academic_year_id: Joi.string().uuid().required(),
  name: Joi.string().trim().min(1).max(50).required(),
  start_date: Joi.date().iso().required(),
  end_date: Joi.date().iso().greater(Joi.ref('start_date')).required(),
  term_number: Joi.number().integer().min(1).max(20).optional(),
  status: Joi.string().valid('upcoming', 'active', 'closed').optional(),
  is_current: Joi.boolean().optional(),
});

export const updateTermSchema = createTermSchema.fork(
  ['academic_year_id', 'name', 'start_date', 'end_date'],
  (s) => s.optional()
).min(1);

export const createGradeLevelSchema = Joi.object({
  name: Joi.string().trim().min(1).max(80).required(),
  level_order: Joi.number().integer().min(1).max(99).optional(),
});

export const updateGradeLevelSchema = Joi.object({
  name: Joi.string().trim().min(1).max(80),
  level_order: Joi.number().integer().min(1).max(99),
}).min(1);

export const createSectionSchema = Joi.object({
  name: Joi.string().trim().min(1).max(50).required(),
  grade_id: Joi.string().uuid().required(),
});

export const updateSectionSchema = Joi.object({
  name: Joi.string().trim().min(1).max(50),
  grade_id: Joi.string().uuid(),
}).min(1);

export const createSubjectSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  code: Joi.string().trim().max(30).allow('', null),
  description: Joi.string().max(500).allow('', null),
  is_core: Joi.boolean().optional(),
});

export const updateSubjectSchema = createSubjectSchema.fork(['name'], (s) => s.optional()).min(1);

export const classSubjectSchema = Joi.object({
  class_id: Joi.string().uuid().required(),
  subject_id: Joi.string().uuid().required(),
  periods_per_week: Joi.number().integer().min(1).max(40).optional(),
});

export const bulkClassSubjectsSchema = Joi.object({
  class_id: Joi.string().uuid().required(),
  subject_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
  periods_per_week: Joi.number().integer().min(1).max(40).optional(),
});

export const timetableSlotSchema = Joi.object({
  class_id: Joi.string().uuid().required(),
  subject_id: Joi.string().uuid().required(),
  teacher_id: Joi.string().uuid().optional().allow(null),
  day_of_week: Joi.number().integer().min(1).max(6).required(),
  period_number: Joi.number().integer().min(1).max(12).required(),
  start_time: Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).required(),
  end_time: Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).required(),
});

// ─── Platform control plane (SUPER_ADMIN) ────────────────────────────────────
export const updateSchoolSchema = Joi.object({
  name: tenantSchoolCore.name,
  slug: tenantSchoolCore.slug,
  address: tenantSchoolCore.address,
  school_address: tenantSchoolCore.school_address,
  email: tenantSchoolCore.email,
  phone: tenantSchoolCore.phone,
  city: tenantSchoolCore.city,
  region: tenantSchoolCore.region,
  country: tenantSchoolCore.country,
  logo_url: tenantSchoolCore.logo_url,
  timezone: tenantSchoolCore.timezone,
  locale: tenantSchoolCore.locale,
  academic_year_start_month: tenantSchoolCore.academic_year_start_month,
  grading_system: tenantSchoolCore.grading_system,
  max_class_size: tenantSchoolCore.max_class_size,
  plan: tenantSchoolCore.plan,
  trial_ends_at: Joi.date().iso(),
  chapa_customer_id: Joi.string().max(128).allow('', null),
  chapa_subscription_id: Joi.string().max(128).allow('', null),
  settings: tenantSchoolCore.settings,
  domain: Joi.string().max(255).allow('', null),
}).min(1);

export const updateSchoolStatusSchema = Joi.object({
  school_id: Joi.string().uuid().required(),
  status: Joi.string().valid(...SCHOOL_STATUSES).required(),
  suspended_reason: Joi.string().trim().max(500).allow('', null),
});

export const featureFlagsSchema = Joi.object({
  features: Joi.array().items(
    Joi.object({
      feature: Joi.string().valid(...KNOWN_FEATURES).required(),
      enabled: Joi.boolean().required(),
    })
  ).min(1).required(),
});

export const patchPlatformSettingsSchema = Joi.object({
  maintenance_mode: Joi.boolean(),
  default_school_plan: Joi.string(),
  max_schools: Joi.number().integer().min(1),
}).min(1);
