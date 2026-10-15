import {usesMacResourceAccess} from './resourceAccess';
import {disabledTimelineTools} from '../hooks/useTimelineTool';
import {nativeMenuContext} from './nativeMenu';
import type {TimelineCommand} from './timelineCommandCatalog';
export {timelineCommands,type TimelineCommand} from './timelineCommandCatalog';
export function commandEnabled(command: TimelineCommand, context = nativeMenuContext()) { return (command.id!=='media-folder'||usesMacResourceAccess()) && !disabledTimelineTools().includes(command.id) && (!command.requires || context[command.requires]); }
