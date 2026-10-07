export const EMPLOYMENT_TYPES = ['permanent', 'contract', 'part_time', 'substitute'];

/** @deprecated API accepts legacy values; stored as employment_type enum */
export const LEGACY_EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract'];

export const HIGHEST_DEGREES = ['certificate', 'diploma', 'bachelor', 'masters', 'phd'];

export const APPRAISAL_RATINGS = [
  'excellent', 'good', 'satisfactory', 'needs_improvement', 'unsatisfactory',
];

export const LEAVE_TYPES = [
  'annual', 'sick', 'maternity', 'paternity', 'bereavement', 'study', 'unpaid',
];

export const LEAVE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];

export const PAYMENT_METHODS = ['bank_transfer', 'cash', 'mobile_money'];

export const mapEmploymentType = (value) => {
  if (!value) return 'permanent';
  const v = String(value).toLowerCase();
  if (v === 'full_time') return 'permanent';
  if (EMPLOYMENT_TYPES.includes(v)) return v;
  return 'permanent';
};
