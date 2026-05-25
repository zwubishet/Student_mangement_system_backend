import catchAsync from '../../utils/catchAsync.js';
import { AppError, ERROR_CODES } from '../../utils/errors.js';

const DEPRECATED_MARK_SUBMIT = {
  success: false,
  code: 'DEPRECATED_ENDPOINT',
  message:
    'Legacy Hasura submit-exam-results is deprecated. Use the REST grading workflow: POST /api/v1/exams/:examId/schedules/:scheduleId/marks (draft) and POST /api/v1/grading/mark-review/exam/:examId/schedules/:scheduleId/submit.',
  migration: {
    mark_entry: 'POST /api/v1/exams/:examId/schedules/:scheduleId/marks',
    submit_for_review: 'POST /api/v1/grading/mark-review/exam/:examId/schedules/:scheduleId/submit',
    docs: 'See docs/GRADING_SYSTEM.md',
  },
};

/** @deprecated Use REST exam schedule mark entry instead. */
export const handleSubmitExamResultsAction = catchAsync(async (req, res) => {
  res.status(410).json(DEPRECATED_MARK_SUBMIT);
});

export const assertLegacyActionDisabled = () => {
  throw new AppError(DEPRECATED_MARK_SUBMIT.message, 410, 'DEPRECATED_ENDPOINT');
};
