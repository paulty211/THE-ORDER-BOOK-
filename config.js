/* Online registration (optional).
 * Fill these two values from your Supabase project (see SETUP-CLOUD.md) to save every business registration online.
 * Leave them empty and the app works exactly as before, saving registration on the phone only.
 * The "anon" key is meant to be public – it is protected by the row-level security rules in supabase.sql. */
window.TOB_CLOUD = {
  url: '',   // e.g. 'https://abcdefghijkl.supabase.co'
  key: ''    // e.g. 'eyJhbGciOi...' (the "anon public" key, NOT the service_role key)
};
