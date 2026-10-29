import type { DnfTreeNode, DnfValue } from '../../types';
type __VLS_Props = {
    nodes: DnfTreeNode[];
    maxHeight?: number;
    disabled?: boolean;
    placeholder?: string;
};
type __VLS_ModelProps = {
    modelValue?: DnfValue;
    'search'?: string;
    'expanded'?: string[];
    'open'?: boolean;
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare const __VLS_export: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    search: (query: string) => any;
    reset: () => any;
    "update:open": (value: boolean) => any;
    "update:modelValue": (value: DnfValue | undefined) => any;
    "update:search": (value: string) => any;
    "update:expanded": (value: string[]) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    onSearch?: ((query: string) => any) | undefined;
    onReset?: (() => any) | undefined;
    "onUpdate:open"?: ((value: boolean) => any) | undefined;
    "onUpdate:modelValue"?: ((value: DnfValue | undefined) => any) | undefined;
    "onUpdate:search"?: ((value: string) => any) | undefined;
    "onUpdate:expanded"?: ((value: string[]) => any) | undefined;
}>, {
    maxHeight: number;
    placeholder: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
