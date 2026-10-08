/** Seconds or colon-separated h:m:s, accepting comma decimals for German input. */
export function parseTimelineTime(text: string): number | null {
  const parts=text.trim().replace(',', '.').split(':');
  if(parts.length>3||parts.some(part=>!/^\d+(?:\.\d+)?$/.test(part)))return null;
  if(parts.length>1&&parts.slice(1).some(part=>Number(part)>=60))return null;
  const value=parts.reduce((sum,part)=>sum*60+Number(part),0);
  return Number.isFinite(value)?value:null;
}
export function formatTimelineTime(value: number): string {
  const milliseconds=Math.round(Math.max(0,value)*1000),seconds=Math.floor(milliseconds/1000);
  return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}.${String(milliseconds%1000).padStart(3,'0')}`;
}
