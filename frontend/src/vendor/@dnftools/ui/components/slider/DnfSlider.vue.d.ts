type __VLS_Props = {
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    name?: string;
    label?: string;
    showValue?: boolean;
    orientation?: 'horizontal' | 'vertical';
    skin?: 'default' | 'seconds' | 'fps';
};
type __VLS_ModelProps = {
    modelValue?: number;
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare var __VLS_32: {
    value: number;
};
type __VLS_Slots = {} & {
    default?: (props: typeof __VLS_32) => any;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    "update:modelValue": (value: number) => any;
    commit: (value: number) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    "onUpdate:modelValue"?: ((value: number) => any) | undefined;
    onCommit?: ((value: number) => any) | undefined;
}>, {
    label: string;
    orientation: "vertical" | "horizontal";
    skin: "default" | "seconds" | "fps";
    max: number;
    min: number;
    step: number;
    showValue: boolean;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
