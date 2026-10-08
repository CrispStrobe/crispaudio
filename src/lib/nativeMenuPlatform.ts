/** Keep shortcut detection independent of stores and translation initialization. */
export const isNativeMac = () => typeof window!=='undefined'&&'__TAURI_INTERNALS__' in window&&/Mac/i.test(navigator.platform)&&!/iPhone|iPad|iPod/.test(navigator.userAgent)&&navigator.maxTouchPoints<=1;
