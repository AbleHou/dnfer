import type { DnfOption, DnfTreeNode, DnfValue } from '../../types';
type __VLS_Props = {
    options?: DnfOption[];
    nodes?: DnfTreeNode[];
    disabled?: boolean;
    placeholder?: string;
    label?: string;
    maxHeight?: number;
    skin?: 'select' | 'search';
};
type __VLS_ModelProps = {
    modelValue?: DnfValue;
    'expanded'?: string[];
    'search'?: string;
    'open'?: boolean;
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare var __VLS_15: {}, __VLS_78: {
    option: DnfOption;
};
type __VLS_Slots = {} & {
    prefix?: (props: typeof __VLS_15) => any;
} & {
    default?: (props: typeof __VLS_78) => any;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    "update:open": (value: boolean) => any;
    "update:modelValue": (value: DnfValue | undefined) => any;
    "update:search": (value: string) => any;
    "update:expanded": (value: string[]) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    "onUpdate:open"?: ((value: boolean) => any) | undefined;
    "onUpdate:modelValue"?: ((value: DnfValue | undefined) => any) | undefined;
    "onUpdate:search"?: ((value: string) => any) | undefined;
    "onUpdate:expanded"?: ((value: string[]) => any) | undefined;
}>, {
    label: string;
    maxHeight: number;
    placeholder: string;
    skin: "search" | "select";
    options: DnfOption[];
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
