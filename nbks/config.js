import {createRepo, localAdapter, supabaseAdapter} from "./repo.js";

// Fill these in after creating the Supabase project (Project Settings → API).
// The anon key is meant to be public: security comes from the row-level-security policies in schema.sql.
export const CONFIG = {
  supabaseUrl: "",   // e.g. https://xxxx.supabase.co
  anonKey: ""        // the public "anon" key
};

// With no Supabase URL, the pages use this browser's localStorage: handy for trying everything out locally.
export const repo = createRepo(
  CONFIG.supabaseUrl
    ? supabaseAdapter({url: CONFIG.supabaseUrl, anonKey: CONFIG.anonKey})
    : localAdapter()
);
