import {invoke} from '@tauri-apps/api/core';
import {isIOSApp} from './native';

export function usesMacResourceAccess():boolean {
 return typeof window!=='undefined' && '__TAURI_INTERNALS__' in window && !isIOSApp() && /Mac/.test(navigator.platform+' '+navigator.userAgent);
}
/** Call while the OS picker/drop grant is active, before using or retaining paths. */
export async function rememberResources(paths:string[],writable=false):Promise<void>{
 if(usesMacResourceAccess()&&paths.length)await invoke('remember_resources',{paths,writable});
}
