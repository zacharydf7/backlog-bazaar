/// <reference types="vite/client" />

/** Build id injected by vite.config.ts `define`. Used for update detection. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_RAWG_KEY?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
