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
  password: Joi.string().required().messages({
    'any.required': 'Password is required'
  })
});