import { disabledTimelineTools } from '../hooks/useTimelineTool';
import { nativeMenuContext } from './nativeMenu';
export interface TimelineCommand { id: string; label: string; key?: string; requires?: 'selection' | 'content' | 'editRange' | 'clipboard' | 'canUndo' | 'canRedo' }
export const timelineCommands: Record<string, TimelineCommand[]> = {
    File: [
        { id: 'samples', label: 'Sample Sessions…' },
        { id: 'new', label: 'New Project…', key: '⌘/Ctrl N' }, { id: 'open', label: 'Open Project…', key: '⌘/Ctrl O' }, { id: 'save', label: 'Save Project…', key: '⌘/Ctrl S' },
        { id: 'import', label: 'Import Audio…', key: '⌘/Ctrl I' }, { id: 'load-tracks', label: 'Import Tracks…' }, { id: 'save-tracks', label: 'Save Tracks…' },
        { id: 'export', label: 'Export Audio Mix…', requires: 'content', key: '⌘/Ctrl Shift E' }, { id: 'export-range', label: 'Export Selected Audio Range…', requires: 'editRange' },
        { id: 'delivery', label: 'Delivery…' }, { id: 'export-video', label: 'Export Video…', requires: 'content' },
    ],
    Edit: [
        { id: 'undo', label: 'Undo', key: '⌘/Ctrl Z', requires: 'canUndo' }, { id: 'redo', label: 'Redo', key: '⌘/Ctrl Shift Z', requires: 'canRedo' },
        { id: 'cut', label: 'Cut', key: '⌘/Ctrl X', requires: 'selection' }, { id: 'copy', label: 'Copy', key: '⌘/Ctrl C', requires: 'selection' }, { id: 'paste', label: 'Paste at Playhead', key: '⌘/Ctrl V', requires: 'clipboard' },
        { id: 'select-all', label: 'Select All Clips', requires: 'content', key: '⌘/Ctrl A' }, { id: 'deselect', label: 'Deselect All', requires: 'selection' },
        { id: 'delete', label: 'Delete Selected Clips', key: 'Backspace', requires: 'selection' }, { id: 'split', label: 'Split Selected at Playhead', key: '⌘/Ctrl B', requires: 'selection' }, { id: 'split-all', label: 'Split All at Playhead', requires: 'content' },
        { id: 'clip-settings', label: 'Clip Settings…', requires: 'selection' }, { id: 'trim-tools', label: 'Trim Tools…', requires: 'selection' }, { id: 'fades', label: 'Fades…', requires: 'selection' }, { id: 'blend', label: 'Crossfade Overlaps', requires: 'selection' },
        { id: 'retime', label: 'Speed / Pitch…', requires: 'selection' }, { id: 'range-tools', label: 'Range Edits…', requires: 'editRange' }, { id: 'edit-groups', label: 'Named Edit Groups…', requires: 'content' },
        { id: 'nudge-left', label: 'Nudge Left', requires: 'selection' }, { id: 'nudge-right', label: 'Nudge Right', requires: 'selection' }, { id: 'nudge-settings', label: 'Nudge Step…' },
        { id: 'previous-edit', label: 'Previous Edit Point', requires: 'content', key: '⌘/Ctrl Alt ←' }, { id: 'next-edit', label: 'Next Edit Point', requires: 'content', key: '⌘/Ctrl Alt →' },
        { id: 'add-track', label: 'Add Audio Track', key: '⌘/Ctrl Shift N' },
    ],
    View: [
        { id: 'track-folders', label: 'Track Folders…' },
        { id: 'mixer', label: 'Mixer' }, { id: 'track-settings', label: 'Track Settings…' }, { id: 'automation', label: 'Automation' }, { id: 'workspace', label: 'Show / Hide Workspace' },
        { id: 'fit', label: 'Fit All Tracks', requires: 'content', key: '⌘/Ctrl 0' }, { id: 'zoom-in', label: 'Zoom In Timeline' }, { id: 'zoom-out', label: 'Zoom Out Timeline' },
        { id: 'height-up', label: 'Taller Tracks' }, { id: 'height-down', label: 'Shorter Tracks' }, { id: 'waveform-mode', label: 'Waveform Display' },
        { id: 'help', label: 'Explain Timeline Controls' }, { id: 'shortcuts', label: 'Keyboard Shortcuts' },
    ],
    Tools: [
        { id: 'recording', label: 'Record / Takes…', key: '⌘/Ctrl Shift R' }, { id: 'align', label: 'Alignment…', requires: 'content' }, { id: 'auto-sync', label: 'Synchronize Tracks…', requires: 'content' },
        { id: 'source-speech', label: 'Source Transcripts…', requires: 'content' }, { id: 'tts', label: 'Text to Speech…' },
        { id: 'video-setup', label: 'Video Setup…' }, { id: 'open-session', label: 'Open Media Session…' }, { id: 'detach-video', label: 'Detach Video' }, { id: 'recover-media', label: 'Recover Media…' }, { id: 'multicam', label: 'Multicam…' },
        { id: 'musical-time', label: 'Musical Time…' }, { id: 'midi', label: 'MIDI…' },
    ],
};
export function commandEnabled(command: TimelineCommand, context = nativeMenuContext()) { return !disabledTimelineTools().includes(command.id) && (!command.requires || context[command.requires]); }
