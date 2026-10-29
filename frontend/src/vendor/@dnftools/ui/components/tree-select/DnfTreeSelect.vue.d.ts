import type { DnfTreeNode, DnfValue } from '../../types';
type __VLS_Props = {
    nodes: DnfTreeNode[];
    disabled?: boolean;
    placeholder?: string;
    label?: string;
    maxHeight?: number;
    selectBranches?: boolean;
    skin?: 'category' | 'plain';
};
type __VLS_ModelProps = {
    modelValue?: DnfValue;
    'open'?: boolean;
    'expanded'?: string[];
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare const __VLS_export: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    "update:open": (value: boolean) => any;
    "update:modelValue": (value: DnfValue | undefined) => any;
    "update:expanded": (value: string[]) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    "onUpdate:open"?: ((value: boolean) => any) | undefined;
    "onUpdate:modelValue"?: ((value: DnfValue | undefined) => any) | undefined;
    "onUpdate:expanded"?: ((value: string[]) => any) | undefined;
}>, {
    label: string;
    maxHeight: number;
    placeholder: string;
    skin: "plain" | "category";
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
