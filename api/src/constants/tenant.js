export const SCHOOL_STATUSES = ['pending', 'active', 'suspended', 'inactive', 'trial_expired'];

export const SUBSCRIPTION_PLANS = ['trial', 'standard', 'professional', 'enterprise'];

export const GRADING_SYSTEMS = ['percentage', 'gpa', 'letter'];

/** Default feature flags provisioned for every new school. */
export const DEFAULT_TENANT_FEATURES = [
  { feature: 'parent_portal', enabled: true },
  { feature: 'sms_notifications', enabled: false },
  { feature: 'chapa_payments', enabled: false },
];

export const KNOWN_FEATURES = ['parent_portal', 'sms_notifications', 'chapa_payments'];

/** Statuses that allow tenant user login. */
export const LOGIN_ALLOWED_STATUSES = ['active'];
