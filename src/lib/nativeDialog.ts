import {open as nativeOpen} from '@tauri-apps/plugin-dialog';
import {rememberResources} from './resourceAccess';
export {save} from '@tauri-apps/plugin-dialog';
/** Persist selected resources before a caller starts decoding or queues a job. */
export const open:typeof nativeOpen=async options=>{
 const result=await nativeOpen(options);
 const paths=Array.isArray(result)?result:typeof result==='string'?[result]:[];
 await rememberResources(paths,options?.directory===true);
 return result;
};

/** Native renders stage files beside the destination, so require a selected folder. */
export async function ensureWritableFolder(path:string,title:string):Promise<boolean>{
 const {usesMacResourceAccess}=await import('./resourceAccess');
 if(!usesMacResourceAccess())return true;
 const {invoke}=await import('@tauri-apps/api/core');
 const parent=path.slice(0,path.lastIndexOf('/'))||'/';
 if(await invoke<boolean>('resource_folder_writable',{path:parent}))return true;
 const picked=await open({directory:true,multiple:false,defaultPath:parent,title});
 if(typeof picked!=='string')return false;
 if(!await invoke<boolean>('resource_folder_writable',{path:parent})){
  const {default:i18n}=await import('../i18n');throw new Error(i18n.t('editor.projectMediaFolderMismatch'));
 }
 return true;
}
export const saveNative:typeof import('@tauri-apps/plugin-dialog').save=async options=>{
 const {save}=await import('@tauri-apps/plugin-dialog');
 const path=await save(options);if(!path)return null;
 const {default:i18n}=await import('../i18n');
 return await ensureWritableFolder(path,i18n.t('editor.nativeExportFolder'))?path:null;
};
