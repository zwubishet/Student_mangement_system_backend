import catchAsync from '../../utils/catchAsync.js';

/** @deprecated Use POST /api/v1/grading/terms/:termId/compute */
export const handleCalculateTermResults = catchAsync(async (req, res) => {
  res.status(410).json({
    success: false,
    code: 'DEPRECATED_ENDPOINT',
    message:
      'Legacy Hasura calculate-term-results is deprecated. Use POST /api/v1/grading/terms/:termId/compute with term_assessment_weights.',
    migration: {
      compute_term: 'POST /api/v1/grading/terms/:termId/compute',
      weights: 'PUT /api/v1/grading/terms/:termId/assessment-weights',
    },
  });
});
