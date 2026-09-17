/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_API_URL?: string;
  readonly VITE_DEPLOY_SHA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
