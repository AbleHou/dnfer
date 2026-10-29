import type { DnfTimerMode, DnfTimerSnapshot } from '../../types';
import type { DnfTimerOptions } from '../../composables/timer';
/** Compatibility wrapper; the controller and renderer belong to DnfTimer. */
type __VLS_Props = {
    mode?: DnfTimerMode;
    durationMs?: number;
    valueMs?: number;
    autoStart?: boolean;
};
declare const __VLS_export: import("vue").DefineComponent<__VLS_Props, {
    start: (options?: DnfTimerOptions) => void | undefined;
    pause: () => void | undefined;
    resume: () => void | undefined;
    reset: (options?: DnfTimerOptions) => void | undefined;
    set: (value: number) => void | undefined;
    dispose: () => void | undefined;
    snapshot: () => DnfTimerSnapshot;
}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    tick: (snapshot: DnfTimerSnapshot) => any;
    finish: (snapshot: DnfTimerSnapshot) => any;
    stateChange: (snapshot: DnfTimerSnapshot) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{
    onTick?: ((snapshot: DnfTimerSnapshot) => any) | undefined;
    onFinish?: ((snapshot: DnfTimerSnapshot) => any) | undefined;
    onStateChange?: ((snapshot: DnfTimerSnapshot) => any) | undefined;
}>, {
    mode: DnfTimerMode;
    durationMs: number;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
