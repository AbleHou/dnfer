import type { DnfSourceNavOption, DnfValue } from '../../types';
type __VLS_Props = {
    options: DnfSourceNavOption[];
    disabled?: boolean;
    label?: string;
};
type __VLS_ModelProps = {
    modelValue?: DnfValue;
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare const __VLS_export: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    select: (option: DnfSourceNavOption) => any;
    "update:modelValue": (value: DnfValue | undefined) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    onSelect?: ((option: DnfSourceNavOption) => any) | undefined;
    "onUpdate:modelValue"?: ((value: DnfValue | undefined) => any) | undefined;
}>, {
    label: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
