import { createClient } from '@supabase/supabase-js'

// Supabase renamed the browser key from "anon" to "publishable"; projects in
// flight have either one in .env.local, so accept both rather than throwing on
// the name we happen not to find.
// `||`, not `??`: an env var that is present but empty (a stray
// `NEXT_PUBLIC_SUPABASE_ANON_KEY=` line) is not nullish, so `??` would select
// the empty string and silently drop the real key sitting in the other name.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export const isSupabaseConfigured = Boolean(url && key)

if (!isSupabaseConfigured && process.env.NODE_ENV !== 'production') {
  console.warn(
    '[scanmint] Supabase is not configured — set NEXT_PUBLIC_SUPABASE_URL and ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY (or …_PUBLISHABLE_KEY) in frontend/.env.local. ' +
      'Running in guest mode: receipts are saved to localStorage only.',
  )
}

// createClient throws on a missing key, which would take down every route at
// import time — including the prerender pass, where nothing is signed in
// anyway. Guest mode is a first-class path (lib/receipts.ts falls back to
// localStorage whenever there is no user), so an unconfigured project should
// degrade to it rather than fail to build.
export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  key ?? 'placeholder-key',
)
