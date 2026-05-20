#!/usr/bin/env node
/**
 * Poll operations.computation_runs and process pending jobs.
 * Usage: node scripts/computation-worker.mjs
 */
import dotenv from 'dotenv';
dotenv.config();

const { processPendingRuns } = await import('../src/services/grading/computationService.js');

const intervalMs = Number(process.env.COMPUTATION_POLL_MS) || 15000;

async function tick() {
  try {
    const results = await processPendingRuns(5);
    if (results.length) {
      console.log(new Date().toISOString(), 'processed', results);
    }
  } catch (err) {
    console.error('computation worker error:', err.message);
  }
}

console.log('Computation worker started, poll every', intervalMs, 'ms');
await tick();
setInterval(tick, intervalMs);
