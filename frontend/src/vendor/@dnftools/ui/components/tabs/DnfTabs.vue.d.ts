import type { DnfTab, DnfValue } from '../../types';
type __VLS_Props = {
    tabs: DnfTab[];
    mode?: 'content' | 'navigation';
    marker?: 'line' | 'arrow';
    skin?: 'default' | 'simulator' | 'precision';
    label?: string;
    activationMode?: 'automatic' | 'manual';
    itemWidth?: number;
    stretch?: boolean;
};
type __VLS_ModelProps = {
    modelValue?: DnfValue;
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare var __VLS_24: {
    tab: DnfTab;
    active: boolean;
    disabled: boolean;
}, __VLS_26: {
    tab: DnfTab;
}, __VLS_45: {
    tab: DnfTab;
};
type __VLS_Slots = {} & {
    link?: (props: typeof __VLS_24) => any;
} & {
    label?: (props: typeof __VLS_26) => any;
} & {
    default?: (props: typeof __VLS_45) => any;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    "update:modelValue": (value: DnfValue | undefined) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    "onUpdate:modelValue"?: ((value: DnfValue | undefined) => any) | undefined;
}>, {
    label: string;
    marker: "line" | "arrow";
    skin: "default" | "precision" | "simulator";
    mode: "content" | "navigation";
    activationMode: "automatic" | "manual";
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
