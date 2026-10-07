/**
 * Pure grading formula engine — no DB I/O.
 * @module services/grading/gradeEngine
 */

const DEFAULT_BOUNDARY = 'inclusive_max';

/**
 * @typedef {object} GradeBand
 * @property {string} letter_grade
 * @property {number} min_score
 * @property {number} max_score
 * @property {number|null} gpa_points
 * @property {string} [display_label]
 * @property {boolean} [is_pass]
 */

/**
 * @typedef {object} GradeResult
 * @property {string} letter
 * @property {number|null} gpa
 * @property {string} label
 * @property {boolean} isPassed
 * @property {number} percentage
 */

/**
 * Normalize percentage for band lookup (handles bonus > 100).
 * @param {number} score
 * @param {number} maxScore
 * @returns {number}
 */
export function toPercentage(score, maxScore) {
  const max = Number(maxScore) || 100;
  if (max <= 0) return 0;
  return (Number(score) / max) * 100;
}

/**
 * @param {number} pct
 * @param {GradeBand[]} bands
 * @param {'inclusive_max'|'inclusive_min'} boundaryRule
 * @returns {GradeBand|null}
 */
export function findBand(pct, bands, boundaryRule = DEFAULT_BOUNDARY) {
  if (!bands?.length) return null;
  const sorted = [...bands].sort((a, b) => Number(b.min_score) - Number(a.min_score));
  for (const band of sorted) {
    const min = Number(band.min_score);
    const max = Number(band.max_score);
    const inRange = boundaryRule === 'inclusive_min'
      ? pct >= min && pct < max
      : pct >= min && pct <= max;
    if (inRange) return band;
  }
  return sorted[sorted.length - 1] || null;
}

/**
 * @param {number} score
 * @param {number} maxScore
 * @param {GradeBand[]} bands
 * @param {object} [opts]
 * @returns {GradeResult}
 */
export function scoreToGrade(score, maxScore, bands, opts = {}) {
  const pct = toPercentage(score, maxScore);
  const band = findBand(pct, bands, opts.boundaryRule || DEFAULT_BOUNDARY);
  if (!band) {
    const passed = pct >= (opts.defaultPassPercent ?? 50);
    return {
      letter: passed ? 'C' : 'F',
      gpa: passed ? 2 : 0,
      label: passed ? 'Pass' : 'Fail',
      isPassed: passed,
      percentage: Math.round(pct * 100) / 100,
    };
  }
  return {
    letter: band.letter_grade || band.label,
    gpa: band.gpa_points != null ? Number(band.gpa_points) : null,
    label: band.display_label || band.letter_grade || band.label,
    isPassed: band.is_pass !== false,
    percentage: Math.round(pct * 100) / 100,
  };
}

/**
 * @param {Array<number|null|undefined>} scores
 * @param {Array<number|null|undefined>} weights
 * @param {object} [opts]
 * @returns {number|null}
 */
export function computeWeightedAverage(scores, weights, opts = {}) {
  const absentPolicy = opts.absentPolicy || 'zero';
  let weightedSum = 0;
  let weightSum = 0;

  for (let i = 0; i < scores.length; i++) {
    const w = Number(weights[i]);
    if (!w || w <= 0) continue;
    const raw = scores[i];
    if (raw == null || raw === '') {
      if (absentPolicy === 'exclude') continue;
      if (absentPolicy === 'null') return null;
      weightedSum += 0;
    } else {
      weightedSum += Number(raw) * w;
    }
    weightSum += w;
  }

  if (weightSum === 0) return null;
  return Math.round((weightedSum / weightSum) * 10000) / 10000;
}

/**
 * @param {Array<{ score: number|null, weight: number, isAbsent?: boolean, maxScore?: number }>} examScores
 * @param {object} [opts]
 * @returns {{ total: number|null, weightedScore: number|null, percentages: number[] }}
 */
export function computeSubjectTotal(examScores, opts = {}) {
  const percentages = examScores.map((e) => {
    if (e.isAbsent) {
      if (opts.absentPolicy === 'exclude') return null;
      return 0;
    }
    if (e.score == null) return null;
    return toPercentage(e.score, e.maxScore ?? 100);
  });

  const weights = examScores.map((e) => Number(e.weight) || 0);
  const weightedScore = computeWeightedAverage(percentages, weights, opts);

  const valid = percentages.filter((p) => p != null);
  const total = valid.length
    ? Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100
    : null;

  return { total, weightedScore, percentages };
}

/**
 * @param {Array<{ weightedScore: number|null, credit?: number, gpa?: number|null }>} subjectTotals
 * @returns {{ gpa: number|null, average: number|null }}
 */
export function computeTermTotal(subjectTotals) {
  let creditSum = 0;
  let gpaWeighted = 0;
  let avgSum = 0;
  let avgCount = 0;

  for (const s of subjectTotals) {
    const credit = Number(s.credit) > 0 ? Number(s.credit) : 1;
    if (s.weightedScore != null) {
      avgSum += s.weightedScore;
      avgCount += 1;
    }
    if (s.gpa != null) {
      gpaWeighted += Number(s.gpa) * credit;
      creditSum += credit;
    }
  }

  return {
    gpa: creditSum > 0 ? Math.round((gpaWeighted / creditSum) * 100) / 100 : null,
    average: avgCount > 0 ? Math.round((avgSum / avgCount) * 100) / 100 : null,
  };
}

/**
 * Assign ranks with tie handling (1224 ranking).
 * @param {Array<Record<string, unknown>>} studentTotals
 * @param {string} field
 * @returns {Array<Record<string, unknown>>}
 */
export function computeClassRank(studentTotals, field = 'percentage') {
  const sorted = [...studentTotals].sort((a, b) => {
    const av = Number(a[field]) ?? -1;
    const bv = Number(b[field]) ?? -1;
    return bv - av;
  });

  let rank = 0;
  let position = 0;
  let prev = null;

  return sorted.map((row) => {
    position += 1;
    const val = Number(row[field]);
    if (prev === null || val !== prev) {
      rank = position;
      prev = val;
    }
    return { ...row, rank };
  });
}

/**
 * Validate bands cover 0–100 contiguously.
 * @param {GradeBand[]} bands
 * @param {number} [max=100]
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateBandsContiguous(bands, max = 100) {
  const errors = [];
  if (!bands?.length) {
    errors.push('At least one grade band is required.');
    return { valid: false, errors };
  }

  const sorted = [...bands].sort((a, b) => Number(a.min_score) - Number(b.min_score));
  let cursor = 0;

  for (const band of sorted) {
    const min = Number(band.min_score);
    const top = Number(band.max_score);
    if (min > cursor + 0.01) {
      errors.push(`Gap between ${cursor} and ${min} (${band.letter_grade || band.label}).`);
    }
    if (top < min) errors.push(`Invalid band ${band.letter_grade}: max < min.`);
    cursor = Math.max(cursor, top);
  }

  if (cursor < max - 0.01) {
    errors.push(`Bands do not reach ${max}% (ends at ${cursor}).`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * @param {number} weightRows - sum of weights
 * @returns {boolean}
 */
export function weightsSumTo100(weightRows) {
  const sum = weightRows.reduce((a, w) => a + Number(w.weight_percent || w), 0);
  return Math.abs(sum - 100) < 0.01;
}
