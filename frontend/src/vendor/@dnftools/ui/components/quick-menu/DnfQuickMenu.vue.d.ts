import type { DnfQuickMenuOption, DnfValue } from '../../types';
type __VLS_Props = {
    options: DnfQuickMenuOption[];
    disabled?: boolean;
    label?: string;
};
type __VLS_ModelProps = {
    modelValue?: DnfValue;
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare var __VLS_14: {
    option: DnfQuickMenuOption;
};
type __VLS_Slots = {} & {
    icon?: (props: typeof __VLS_14) => any;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    select: (option: DnfQuickMenuOption) => any;
    "update:modelValue": (value: DnfValue | undefined) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    onSelect?: ((option: DnfQuickMenuOption) => any) | undefined;
    "onUpdate:modelValue"?: ((value: DnfValue | undefined) => any) | undefined;
}>, {
    label: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
