const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yaqcrnpbkildloxanrql.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : null;

if (!supabase) {
  console.warn('Supabase is not configured. Falling back to Google Drive live scans.');
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return supabase;
}

module.exports = {
  supabase,
  requireSupabase,
};
