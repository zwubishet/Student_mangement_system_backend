import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
  { letter_grade: 'D', min_score: 60, max_score: 69.99, grade_points: 1, is_pass: true },
  { letter_grade: 'F', min_score: 0, max_score: 59.99, grade_points: 0, is_pass: false },
];

describe('gradeEngine', () => {
  it('scoreToGrade maps 85% to B', () => {
    const g = scoreToGrade(85, 100, ETHIOPIAN_BANDS);
    assert.equal(g.letter, 'B');
    assert.equal(g.isPassed, true);
  });

  it('boundary 80 is B with inclusive_max', () => {
    const g = scoreToGrade(80, 100, ETHIOPIAN_BANDS, { boundaryRule: 'inclusive_max' });
    assert.equal(g.letter, 'B');
  });

  it('computeWeightedAverage excludes absent when policy exclude', () => {
    const avg = computeWeightedAverage([80, null], [50, 50], { absentPolicy: 'exclude' });
    assert.equal(avg, 80);
  });

  it('computeClassRank handles ties', () => {
    const ranked = computeClassRank([
      { student_id: 'a', percentage: 90 },
      { student_id: 'b', percentage: 90 },
      { student_id: 'c', percentage: 70 },
    ]);
    assert.equal(ranked[0].rank, 1);
    assert.equal(ranked[1].rank, 1);
    assert.equal(ranked[2].rank, 3);
  });

  it('validateBandsContiguous passes Ethiopian scale', () => {
    const v = validateBandsContiguous(ETHIOPIAN_BANDS);
    assert.equal(v.valid, true);
  });

  it('findBand returns expected letter', () => {
    assert.equal(findBand(95, ETHIOPIAN_BANDS)?.letter_grade, 'A');
  });
});
