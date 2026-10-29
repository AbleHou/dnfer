type __VLS_Props = {
    id?: string;
    label: string;
    required?: boolean;
    help?: string;
    error?: string;
    orientation?: 'horizontal' | 'vertical';
};
declare const control: import("vue").ComputedRef<{
    id: string;
    required: boolean;
    invalid: boolean;
    'aria-required': true | undefined;
    'aria-labelledby': string;
    'aria-invalid': true | undefined;
    'aria-describedby': string | undefined;
}>;
type __VLS_Slots = {
    default(props: {
        control: typeof control.value;
        id: string;
    }): unknown;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {
    orientation: "vertical" | "horizontal";
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
