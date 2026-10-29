import type { DnfTreeNode, DnfValue } from '../../types';
type __VLS_Props = {
    nodes: DnfTreeNode[];
    disabled?: boolean;
    label?: string;
    selectBranches?: boolean;
    skin?: 'plain' | 'category' | 'search';
};
type __VLS_ModelProps = {
    modelValue?: DnfValue;
    'expanded'?: string[];
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare var __VLS_23: {
    node: DnfTreeNode;
};
type __VLS_Slots = {} & {
    default?: (props: typeof __VLS_23) => any;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    select: (node: DnfTreeNode) => any;
    "update:modelValue": (value: DnfValue | undefined) => any;
    "update:expanded": (value: string[]) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    onSelect?: ((node: DnfTreeNode) => any) | undefined;
    "onUpdate:modelValue"?: ((value: DnfValue | undefined) => any) | undefined;
    "onUpdate:expanded"?: ((value: string[]) => any) | undefined;
}>, {
    label: string;
    skin: "search" | "plain" | "category";
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
