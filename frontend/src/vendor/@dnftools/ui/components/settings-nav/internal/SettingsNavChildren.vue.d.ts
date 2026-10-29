import type { DnfSettingsNavNode, DnfValue } from '../../../types';
type __VLS_Props = {
    nodes: DnfSettingsNavNode[];
    depth: number;
    disabled?: boolean;
};
type __VLS_ModelProps = {
    modelValue?: DnfValue;
    'expanded': string[];
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare const __VLS_export: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    "update:modelValue": (value: DnfValue | undefined) => any;
    "update:expanded": (value: string[]) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    "onUpdate:modelValue"?: ((value: DnfValue | undefined) => any) | undefined;
    "onUpdate:expanded"?: ((value: string[]) => any) | undefined;
}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
