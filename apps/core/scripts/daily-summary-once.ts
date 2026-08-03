/** One-shot daily summary for launchd / cron (no HTTP server required). */
import { buildDailySummary } from '../src/summary/daily.js';
import { closeDb } from '../src/db/index.js';

try {
  const result = buildDailySummary();
  console.log(JSON.stringify(result));
} finally {
  closeDb();
}
