import Joi from 'joi';

export const signupSchema = Joi.object({
  schoolName: Joi.string().min(3).max(100).required(),
  email: Joi.string().email().required().lowercase(),
  password: Joi.string().min(8).required(),
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  domain: Joi.string().hostname().optional()
});

// Add this to your existing authValidation.js
export const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required'
  }),
  password: Joi.string().required().messages({
    'any.required': 'Password is required'
  })
});