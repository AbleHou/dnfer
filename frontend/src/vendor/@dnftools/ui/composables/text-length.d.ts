import type { DnfTextLengthMode } from '../types';
/** characters follows HTML maxlength (UTF-16); wide counts ASCII as 1 and other units as 2. */
export declare function countDnfText(value: string, mode?: DnfTextLengthMode): number;
export declare function limitDnfText(value: string, max: number | undefined, mode?: DnfTextLengthMode): string;
export declare function normalizeDnfTextInput(event: Event, max: number | undefined, mode: DnfTextLengthMode): void;
