import {create} from 'zustand';
interface InputLevel {peak:number;channels:number}
/** Ephemeral input meters never enter project history or saved sessions. */
export const useRecordingMeterStore=create<{levels:Record<string,InputLevel>;update:(trackId:string,peak:number,channels:number)=>void;clear:(trackId?:string)=>void}>()((set)=>({
 levels:{},
 update:(trackId,peak,channels)=>{if(!Number.isFinite(peak)||!Number.isFinite(channels))return;set(state=>({levels:{...state.levels,[trackId]:{peak:Math.max(0,peak),channels:Math.max(0,Math.floor(channels))}}}));},
 clear:trackId=>set(state=>{if(!trackId)return {levels:{}};const levels={...state.levels};delete levels[trackId];return {levels};}),
}));
