import type {TimelineProject} from '../../types/audio';
import {DEFAULT_MUSIC,validMusic} from '../../lib/musicalTime';
export interface PluginTransport {samplePosition:number;projectPosition?:number;tempo:number;numerator:number;denominator:number;originSeconds:number;playing:boolean}
export function validatePluginTransport(value:PluginTransport){
 if(value.projectPosition!==undefined&&(!Number.isSafeInteger(value.projectPosition)||Math.abs(value.projectPosition)>Number.MAX_SAFE_INTEGER-4096))throw new Error('Invalid plugin project position');
 if(!Number.isSafeInteger(value.samplePosition)||value.samplePosition<0||value.samplePosition>Number.MAX_SAFE_INTEGER-4096||!Number.isFinite(value.tempo)||value.tempo<20||value.tempo>300||!Number.isInteger(value.numerator)||value.numerator<1||value.numerator>32||![1,2,4,8,16].includes(value.denominator)||!Number.isFinite(value.originSeconds)||value.originSeconds<0||value.originSeconds>86400||typeof value.playing!=='boolean')throw new Error('Invalid plugin transport');return {...value};
}
export function projectPluginTransport(project:TimelineProject,start:number,rate:number):PluginTransport{
 if(!Number.isFinite(start)||start<0||!Number.isFinite(rate)||rate<8000||rate>192000)throw new Error('Invalid plugin project clock');
 const music=project.music??DEFAULT_MUSIC;if(!validMusic(music))throw new Error('Invalid project musical settings');
 return validatePluginTransport({samplePosition:Math.round(start*rate),tempo:music.tempo,numerator:music.numerator,denominator:music.denominator,originSeconds:music.origin,playing:true});
}
