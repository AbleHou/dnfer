import type { DnfQuality } from '../../types';
type __VLS_Props = {
    /** Static display shares the same bitmap layers without button semantics. */
    interactive?: boolean;
    src?: string;
    label: string;
    quality?: DnfQuality;
    selected?: boolean;
    /** Outline uses the green selection border; search adds the match magnifier. */
    selection?: 'glow' | 'outline' | 'search';
    /** Multiple status badges occupy one row, in the supplied order. */
    lock?: 'gold' | 'blue' | readonly ('gold' | 'blue')[];
    disabled?: boolean;
    count?: number;
    level?: string | number;
    levelTone?: 'gold' | 'blue' | 'green';
    notice?: boolean;
    skin?: 'default' | 'level' | 'collection';
};
type __VLS_Slots = {
    overlay(): unknown;
    badges(): unknown;
    default(): unknown;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {
    skin: "default" | "level" | "collection";
    quality: DnfQuality;
    interactive: boolean;
    selection: "search" | "glow" | "outline";
    levelTone: "blue" | "green" | "gold";
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
