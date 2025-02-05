import { createClient } from "@supabase/supabase-js";

// Get the environment variables based on how they're exposed in different environments
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

// Add some error checking
if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file and configuration.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;