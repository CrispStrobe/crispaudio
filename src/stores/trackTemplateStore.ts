import {create} from 'zustand';
import {TEMPLATE_LIMIT,validTrackTemplate,type TrackTemplate} from '../lib/trackTemplates';
const KEY='crispaudio-track-templates';
export function readTrackTemplates():TrackTemplate[]{
 try{const value:unknown=JSON.parse(localStorage.getItem(KEY)??'[]');return Array.isArray(value)&&value.length<=TEMPLATE_LIMIT&&value.every(validTrackTemplate)&&new Set(value.map(t=>t.id)).size===value.length?value:[];}catch{return [];}
}
interface Library {templates:TrackTemplate[];save:(template:TrackTemplate)=>void;remove:(id:string)=>void}
export const useTrackTemplateStore=create<Library>((set,get)=>({templates:readTrackTemplates(),save:template=>{
 if(!validTrackTemplate(template))throw new Error('templates.invalid');
 const templates=[...get().templates.filter(t=>t.id!==template.id),structuredClone(template)];
 if(templates.length>TEMPLATE_LIMIT)throw new Error('templates.full');
 try{localStorage.setItem(KEY,JSON.stringify(templates));}catch{throw new Error('templates.storage');}
 set({templates});
},remove:id=>{const templates=get().templates.filter(t=>t.id!==id);try{localStorage.setItem(KEY,JSON.stringify(templates));}catch{throw new Error('templates.storage');}set({templates});}}));
