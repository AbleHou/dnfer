import type { DnfTimerMode, DnfTimerSnapshot } from '../../types';
type __VLS_Props = {
    /** Battle limit panel or training-room centisecond strip. */
    skin?: 'battle' | 'training';
    mode?: DnfTimerMode;
    durationMs?: number;
    valueMs?: number;
    warningSeconds?: number;
    autoStart?: boolean;
    /** Used by the battle skin; empty string hides the title. */
    title?: string;
};
declare const __VLS_export: import("vue").DefineComponent<__VLS_Props, {
    start(next?: import("../../composables/timer").DnfTimerOptions): void;
    pause(): void;
    resume(): void;
    reset: (next?: import("../../composables/timer").DnfTimerOptions) => void;
    set(next: number): void;
    snapshot: () => DnfTimerSnapshot;
    dispose(): void;
}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    warning: () => any;
    tick: (snapshot: DnfTimerSnapshot) => any;
    finish: (snapshot: DnfTimerSnapshot) => any;
    stateChange: (snapshot: DnfTimerSnapshot) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{
    onWarning?: (() => any) | undefined;
    onTick?: ((snapshot: DnfTimerSnapshot) => any) | undefined;
    onFinish?: ((snapshot: DnfTimerSnapshot) => any) | undefined;
    onStateChange?: ((snapshot: DnfTimerSnapshot) => any) | undefined;
}>, {
    title: string;
    skin: "battle" | "training";
    mode: DnfTimerMode;
    durationMs: number;
    warningSeconds: number;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
