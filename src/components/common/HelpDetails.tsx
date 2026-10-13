import type {ReactNode} from 'react';
import {InfoButton} from './InfoButton';
/** Explanations open on demand and do not occupy the working view. */
export function HelpDetails({children}:{children:ReactNode}){return <InfoButton>{children}</InfoButton>;}
