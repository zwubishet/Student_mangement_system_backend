import Joi from 'joi';

/** Accept school/demo addresses like teacher01@demo.local (Joi default TLD check rejects .local). */
export const emailField = Joi.string()
  .email({ tlds: { allow: false } })
  .lowercase()
  .trim();

export const signupSchema = Joi.object({
  schoolName: Joi.string().min(3).max(100).required(),
  email: emailField.required(),
  password: Joi.string().min(8).required(),
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  domain: Joi.string().hostname().optional()
});

// Add this to your existing authValidation.js
export const loginSchema = Joi.object({
  email: emailField.required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
  password: Joi.string().min(1).required().messages({
    'any.required': 'Password is required',
  }),
});

/** Hasura RegisterSchoolAction input.object */
export const registerSchoolSchema = Joi.object({
  school_name: Joi.string().min(2).max(200).required(),
  school_address: Joi.string().max(500).allow('', null),
  admin_email: emailField.required(),
  admin_password: Joi.string().min(8).max(128).required(),
  first_name: Joi.string().min(1).max(100).required(),
  last_name: Joi.string().min(1).max(100).required(),
});