import type { DnfTimerMode, DnfTimerSnapshot } from '../types';
export declare const DNF_TIMER_MAX = 5999990;
export declare function clampTimer(value: number): number;
export declare function formatTimer(value: number, mode?: DnfTimerMode): string;
export interface DnfTimerOptions {
    mode?: DnfTimerMode;
    durationMs?: number;
}
export declare function createDnfTimer(options?: DnfTimerOptions & {
    now?: () => number;
    request?: (callback: FrameRequestCallback) => number;
    cancel?: (id: number) => void;
    change?: (snapshot: DnfTimerSnapshot) => void;
    finish?: (snapshot: DnfTimerSnapshot) => void;
}): {
    start(next?: DnfTimerOptions): void;
    pause(): void;
    resume(): void;
    reset: (next?: DnfTimerOptions) => void;
    set(next: number): void;
    snapshot: () => DnfTimerSnapshot;
    dispose(): void;
};
