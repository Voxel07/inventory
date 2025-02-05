import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://jfjrgeegpvpzjdpmmaix.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmanJnZWVncHZwempkcG1tYWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgyNjkwNzUsImV4cCI6MjA1Mzg0NTA3NX0.IXMaIeGZZaLorpURyaBYxw7yE66OR30wxCBNTuQkxdU";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables.");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
export default supabase;
