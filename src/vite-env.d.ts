/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** CI-only flag that runs the plugin-fs self-test on launch. */
  readonly VITE_FS_SELFTEST?: string;
  /** CI-only override of the starting panel for screenshots ('sfx'|'voice'|'timeline'). */
  readonly VITE_INITIAL_PANEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
