type __VLS_Props = {
    disabled?: boolean;
    unavailable?: boolean;
    name?: string;
    required?: boolean;
    skin?: 'default' | 'report';
};
type __VLS_ModelProps = {
    modelValue?: boolean | 'indeterminate';
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare var __VLS_18: {};
type __VLS_Slots = {} & {
    default?: (props: typeof __VLS_18) => any;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    "update:modelValue": (value: boolean | "indeterminate") => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    "onUpdate:modelValue"?: ((value: boolean | "indeterminate") => any) | undefined;
}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
