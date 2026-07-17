/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** CI-only flag that runs the plugin-fs self-test on launch. */
  readonly VITE_FS_SELFTEST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
