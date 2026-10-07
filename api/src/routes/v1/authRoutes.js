import express from 'express';
import { registerSchool } from '../../controllers/auth/registerController.js';
import {
  protectAction,
  protectHasuraAction,
  restrictBlacklisted,
  verifyActionSecretIfPresent,
} from '../../middlewares/authMiddleware.js';
import { loginHasuraAction, loginSession } from '../../controllers/auth/loginController.js';
import { logout } from '../../controllers/auth/logoutController.js';
import { validate, validateHasuraAction } from '../../middlewares/validate.js';
import { loginSchema, registerSchoolSchema } from '../../utils/validators.js';

const authrouter = express.Router();

/** Primary REST login (SaaS dashboard, integrations). */
authrouter.post('/session', validate(loginSchema), loginSession);

/** Hasura LoginAction webhook — action secret only; role `anonymous` in metadata. */
authrouter.post(
  '/login',
  protectHasuraAction,
  validateHasuraAction(loginSchema),
  loginHasuraAction
);

/** Hasura RegisterSchoolAction — requires platform session + action secret. */
authrouter.post(
  '/register-school',
  protectAction,
  validateHasuraAction(registerSchoolSchema),
  registerSchool
);

/** REST + Hasura logoutAction — blacklist current Bearer token. */
authrouter.post('/logout', restrictBlacklisted, verifyActionSecretIfPresent, logout);

export default authrouter;
