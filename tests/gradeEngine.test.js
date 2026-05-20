import {
  scoreToGrade,
  computeWeightedAverage,
  computeClassRank,
  validateBandsContiguous,
  findBand,
} from '../src/services/grading/gradeEngine.js';

const ETHIOPIAN_BANDS = [
  { letter_grade: 'A', min_score: 90, max_score: 100, grade_points: 4, is_pass: true },
  { letter_grade: 'B', min_score: 80, max_score: 89.99, grade_points: 3, is_pass: true },
  { letter_grade: 'C', min_score: 70, max_score: 79.99, grade_points: 2, is_pass: true },
  { letter_grade: 'F', min_score: 0, max_score: 59.99, grade_points: 0, is_pass: false },
];

describe('gradeEngine', () => {
  test('scoreToGrade maps 85% to B', () => {
    const g = scoreToGrade(85, 100, ETHIOPIAN_BANDS);
    expect(g.letter).toBe('B');
    expect(g.isPassed).toBe(true);
  });

  test('boundary 80 is B with inclusive_max', () => {
    const g = scoreToGrade(80, 100, ETHIOPIAN_BANDS, { boundaryRule: 'inclusive_max' });
    expect(g.letter).toBe('B');
  });

  test('computeWeightedAverage excludes absent when policy exclude', () => {
    const avg = computeWeightedAverage([80, null], [50, 50], { absentPolicy: 'exclude' });
    expect(avg).toBe(80);
  });

  test('computeClassRank handles ties', () => {
    const ranked = computeClassRank([
      { student_id: 'a', percentage: 90 },
      { student_id: 'b', percentage: 90 },
      { student_id: 'c', percentage: 70 },
    ]);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(1);
    expect(ranked[2].rank).toBe(3);
  });

  test('validateBandsContiguous passes Ethiopian scale', () => {
    const v = validateBandsContiguous(ETHIOPIAN_BANDS);
    expect(v.valid).toBe(true);
  });

  test('findBand returns null-safe fallback', () => {
    expect(findBand(95, ETHIOPIAN_BANDS)?.letter_grade).toBe('A');
  });
});
