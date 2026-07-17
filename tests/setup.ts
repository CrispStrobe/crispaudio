import '@testing-library/jest-dom';
import { enableMapSet } from 'immer';

// Immer's MapSet plugin must be enabled globally before any store tests run.
// The synthStore uses a Set<keyof SynthParams> for locked params which requires
// this plugin to be active inside Immer drafts.
enableMapSet();

// ---------------------------------------------------------------------------
// localStorage / sessionStorage polyfill
//
// Node 20 (CI) gets a working Web Storage from jsdom, so this is a no-op there.
// Node >= 22 ships its own experimental `localStorage` global that is unusable
// without --localstorage-file; it shadows jsdom's getter, leaving bare
// `localStorage` references (zustand persist, useAutosave) resolving to
// `undefined`. We install a faithful in-memory Storage only when none is
// available, keeping it independent per instance and rooted on Storage.prototype
// so existing `vi.spyOn(Storage.prototype, 'setItem')` tests keep working.
// ---------------------------------------------------------------------------
function installStorage(name: 'localStorage' | 'sessionStorage'): void {
  const existing = (globalThis as { [k: string]: unknown })[name];
  if (existing && typeof (existing as Storage).setItem === 'function') return;

  const backings = new WeakMap<object, Map<string, string>>();
  const backing = (inst: object): Map<string, string> => {
    let m = backings.get(inst);
    if (!m) {
      m = new Map<string, string>();
      backings.set(inst, m);
    }
    return m;
  };

  const proto = Storage.prototype as unknown as {
    getItem(k: string): string | null;
    setItem(k: string, v: string): void;
    removeItem(k: string): void;
    clear(): void;
    key(i: number): string | null;
  };
  proto.getItem = function (this: object, k: string) {
    const m = backing(this);
    return m.has(String(k)) ? m.get(String(k))! : null;
  };
  proto.setItem = function (this: object, k: string, v: string) {
    backing(this).set(String(k), String(v));
  };
  proto.removeItem = function (this: object, k: string) {
    backing(this).delete(String(k));
  };
  proto.clear = function (this: object) {
    backing(this).clear();
  };
  proto.key = function (this: object, i: number) {
    return Array.from(backing(this).keys())[i] ?? null;
  };
  Object.defineProperty(Storage.prototype, 'length', {
    get(this: object) {
      return backing(this).size;
    },
    configurable: true,
  });

  const store = Object.create(Storage.prototype) as Storage;
  const descriptor = { value: store, configurable: true, writable: true };
  Object.defineProperty(globalThis, name, descriptor);
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, name, descriptor);
  }
}

installStorage('localStorage');
installStorage('sessionStorage');
