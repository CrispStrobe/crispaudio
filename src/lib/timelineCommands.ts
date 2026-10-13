import {disabledTimelineTools} from '../hooks/useTimelineTool';
import {nativeMenuContext} from './nativeMenu';
import type {TimelineCommand} from './timelineCommandCatalog';
export {timelineCommands,type TimelineCommand} from './timelineCommandCatalog';
export function commandEnabled(command: TimelineCommand, context = nativeMenuContext()) { return !disabledTimelineTools().includes(command.id) && (!command.requires || context[command.requires]); }
