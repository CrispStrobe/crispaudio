import {createContext,type RefObject} from 'react';
import type {TimelineEngine} from '../../audio/engine/TimelineEngine';
export const TimelineEngineContext=createContext<RefObject<TimelineEngine|null>|null>(null);
