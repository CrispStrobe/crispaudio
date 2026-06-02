import '@testing-library/jest-dom';
import { enableMapSet } from 'immer';

// Immer's MapSet plugin must be enabled globally before any store tests run.
// The synthStore uses a Set<keyof SynthParams> for locked params which requires
// this plugin to be active inside Immer drafts.
enableMapSet();
