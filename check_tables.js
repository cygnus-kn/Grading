require('dotenv').config();
const { supabase } = require('./src/config/supabase');

async function checkCommentsTable() {
  if (!supabase) {
    console.error("No supabase client");
    return;
  }
  
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .limit(1);

  if (error) {
    console.error("Error querying 'comments':", error.message);
  } else {
    console.log("'comments' table exists:", data);
  }
  
  const { data: fbData, error: fbError } = await supabase
    .from('feedback')
    .select('*')
    .limit(1);

  if (fbError) {
    console.error("Error querying 'feedback':", fbError.message);
  } else {
    console.log("'feedback' table exists:", fbData);
  }
}

checkCommentsTable();
