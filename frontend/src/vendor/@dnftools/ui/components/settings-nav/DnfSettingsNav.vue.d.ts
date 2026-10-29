import type { DnfSettingsNavNode, DnfValue } from '../../types';
type __VLS_Props = {
    nodes: DnfSettingsNavNode[];
    disabled?: boolean;
};
type __VLS_ModelProps = {
    modelValue?: DnfValue;
    'expanded'?: string[];
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare var __VLS_14: {
    node: DnfSettingsNavNode;
}, __VLS_26: {
    node: DnfSettingsNavNode;
};
type __VLS_Slots = {} & {
    icon?: (props: typeof __VLS_14) => any;
} & {
    icon?: (props: typeof __VLS_26) => any;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    "update:modelValue": (value: DnfValue | undefined) => any;
    "update:expanded": (value: string[]) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    "onUpdate:modelValue"?: ((value: DnfValue | undefined) => any) | undefined;
    "onUpdate:expanded"?: ((value: string[]) => any) | undefined;
}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
