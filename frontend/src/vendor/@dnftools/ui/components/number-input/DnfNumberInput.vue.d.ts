type __VLS_Props = {
    id?: string;
    invalid?: boolean;
    locale?: string;
    formatOptions?: Intl.NumberFormatOptions;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    name?: string;
    label?: string;
    fastStep?: number;
    skin?: 'default' | 'quantity' | 'editor';
    prefix?: string;
    readonly?: boolean;
};
type __VLS_ModelProps = {
    modelValue?: number;
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare const __VLS_export: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    "update:modelValue": (value: number) => any;
    commit: (value: number) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    "onUpdate:modelValue"?: ((value: number) => any) | undefined;
    onCommit?: ((value: number) => any) | undefined;
}>, {
    label: string;
    skin: "default" | "editor" | "quantity";
    step: number;
    fastStep: number;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
