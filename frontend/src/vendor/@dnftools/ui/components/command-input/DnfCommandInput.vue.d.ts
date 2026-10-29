import type { DnfCommandOption, DnfCommandHint, DnfValue } from '../../types';
type __VLS_Props = {
    options: DnfCommandOption[];
    hints?: DnfCommandHint[];
    channel?: string;
    disabled?: boolean;
    label?: string;
    placeholder?: string;
};
type __VLS_Slots = {
    channel(props: {
        option: DnfCommandOption | undefined;
    }): unknown;
    default(props: {
        option: DnfCommandOption;
    }): unknown;
    hint(props: {
        hint: DnfCommandHint;
    }): unknown;
};
type __VLS_ModelProps = {
    modelValue?: DnfValue;
    'search'?: string;
    'open'?: boolean;
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare const __VLS_base: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    "update:open": (value: boolean) => any;
    "update:modelValue": (value: DnfValue | undefined) => any;
    "update:search": (value: string) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    "onUpdate:open"?: ((value: boolean) => any) | undefined;
    "onUpdate:modelValue"?: ((value: DnfValue | undefined) => any) | undefined;
    "onUpdate:search"?: ((value: string) => any) | undefined;
}>, {
    label: string;
    placeholder: string;
    channel: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
