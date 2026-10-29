type __VLS_Props = {
    id?: string;
    invalid?: boolean;
    inputAttrs?: Record<string, unknown>;
    locale?: string;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    readonly?: boolean;
    name?: string;
    label?: string;
    framed?: boolean;
    formatOptions?: Intl.NumberFormatOptions;
};
type __VLS_ModelProps = {
    modelValue?: number;
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare var __VLS_10: {}, __VLS_21: {}, __VLS_32: {};
type __VLS_Slots = {} & {
    prefix?: (props: typeof __VLS_10) => any;
} & {
    suffix?: (props: typeof __VLS_21) => any;
} & {
    default?: (props: typeof __VLS_32) => any;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    change: (event: Event) => any;
    "update:modelValue": (value: number) => any;
    commit: (value: number) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    onChange?: ((event: Event) => any) | undefined;
    "onUpdate:modelValue"?: ((value: number) => any) | undefined;
    onCommit?: ((value: number) => any) | undefined;
}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
