type __VLS_Props = {
    loading?: boolean;
    text?: string;
    size?: 'small' | 'default';
    animated?: boolean;
    /** Milliseconds per frame; a web adaptation, not verified client timing. */
    frameDuration?: number;
    blocking?: boolean;
    retainContent?: boolean;
};
type __VLS_Slots = {
    default(): unknown;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {
    text: string;
    animated: boolean;
    frameDuration: number;
    retainContent: boolean;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
