import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://qimhuzwqytputeohyjcm.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpbWh1endxeXRwdXRlb2h5amNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxODIwNzUsImV4cCI6MjA4OTc1ODA3NX0.dmwNVi_0BDkxTmZhO0Yx06Z3lTMskaZXwn-SFd3FrF8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    lock: false as any,
  },
});
