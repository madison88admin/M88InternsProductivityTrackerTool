#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import process from 'process';

function getTrackingWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const daysSinceFriday = (day + 2) % 7;
  d.setDate(d.getDate() - daysSinceFriday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getTrackingWeekEnd(date) {
  const friday = getTrackingWeekStart(date);
  friday.setDate(friday.getDate() + 6);
  friday.setHours(23, 59, 59, 999);
  return friday;
}

function calculateSessionHours(timeIn, timeOut) {
  if (!timeIn || !timeOut) return 0;
  const ms = new Date(timeOut) - new Date(timeIn);
  return Math.max(0, ms / (1000 * 60 * 60));
}

function roundToTwo(n) {
  return Math.round(n * 100) / 100;
}

function usageAndExit() {
  console.log('Usage: node scripts/backfill_allowance_periods.js --from YYYY-MM-DD --to YYYY-MM-DD [--force-update-approved]');
  process.exit(1);
}

const args = process.argv.slice(2);
const params = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--from') params.from = args[++i];
  else if (a === '--to') params.to = args[++i];
  else if (a === '--force-update-approved') params.force = true;
}

if (!params.from || !params.to) {
  usageAndExit();
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_ADMIN_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (or VITE_ADMIN_SECRET_KEY) in environment.');
  console.error('Set SUPABASE_SERVICE_ROLE_KEY to a service role key with write permissions to run this backfill.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

async function main() {
  console.log(`Backfill allowance_periods from ${params.from} to ${params.to}`);

  // Fetch settings for hourly rate calculation
  const { data: config } = await supabase.from('allowance_config').select('hourly_rate').order('effective_from', { ascending: false }).limit(1).maybeSingle();
  const baseRate = config?.hourly_rate || 0;

  const { data: setting } = await supabase.from('system_settings').select('value').eq('key', 'intern_hourly_rates').maybeSingle();
  const internRates = setting?.value || {};

  const { data: modeSetting } = await supabase.from('system_settings').select('value').eq('key', 'allowance_rate_mode').maybeSingle();
  const allowanceRateMode = modeSetting?.value?.mode === 'individual' ? 'individual' : 'global';

  // Fetch attendance records in range
  const { data: records, error } = await supabase.from('attendance_records')
    .select('*')
    .gte('date', params.from)
    .lte('date', params.to)
    .order('date', { ascending: true })
    .limit(20000);

  if (error) {
    console.error('Failed to fetch attendance_records', error);
    process.exit(1);
  }

  if (!records || records.length === 0) {
    console.log('No attendance records found in the given range.');
    return;
  }

  // Group by intern + week_start
  const groups = new Map();
  for (const r of records) {
    const weekStart = getTrackingWeekStart(r.date);
    const weekKey = `${r.intern_id}::${weekStart.toISOString().slice(0,10)}`;
    const sessionHours = calculateSessionHours(r.time_in_1, r.time_out_1) + calculateSessionHours(r.time_in_2, r.time_out_2);

    if (!groups.has(weekKey)) groups.set(weekKey, { intern_id: r.intern_id, week_start: weekStart, week_end: getTrackingWeekEnd(r.date), total_hours: 0 });
    groups.get(weekKey).total_hours += sessionHours || (r.total_hours || 0);
  }

  console.log(`Found ${groups.size} intern-week groups to process.`);

  for (const [key, g] of groups) {
    const weekStartStr = g.week_start.toISOString().slice(0,10);
    const weekEndStr = g.week_end.toISOString().slice(0,10);
    const internId = g.intern_id;

    // Determine hourly rate
    let hourlyRate = baseRate;
    if (allowanceRateMode === 'individual') {
      hourlyRate = internRates?.[internId] || baseRate;
    }

    const totalHours = roundToTwo(g.total_hours || 0);
    const totalAmount = roundToTwo(totalHours * Number(hourlyRate || 0));

    // Check existing allowance_period
    const { data: existing } = await supabase.from('allowance_periods').select('*').eq('intern_id', internId).eq('week_start', weekStartStr).maybeSingle();

    if (existing && existing.status === 'approved' && !params.force) {
      console.log(`Skipping approved period for intern ${internId} week ${weekStartStr} (use --force-update-approved to override)`);
      continue;
    }

    const payload = {
      intern_id: internId,
      week_start: weekStartStr,
      week_end: weekEndStr,
      total_hours: totalHours,
      hourly_rate: Number(hourlyRate || 0),
      total_amount: totalAmount,
    };

    // Upsert (insert or update)
    const { data: upserted, error: upsertErr } = await supabase.from('allowance_periods').upsert(payload, { onConflict: ['intern_id', 'week_start'] }).select().maybeSingle();
    if (upsertErr) {
      console.error('Failed to upsert allowance_period for', internId, weekStartStr, upsertErr);
    } else {
      console.log(`Upserted allowance_period for ${internId} ${weekStartStr} -> hours=${totalHours}, amount=${totalAmount}`);
    }
  }

  console.log('Backfill complete.');
}

main().catch(err => {
  console.error('Error running backfill', err);
  process.exit(1);
});
