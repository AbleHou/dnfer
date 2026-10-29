import type { DnfTextLengthMode } from '../../types';
type __VLS_Props = {
    disabled?: boolean;
    readonly?: boolean;
    type?: string;
    invalid?: boolean;
    skin?: 'default' | 'inventory';
    maxlength?: number;
    showCount?: boolean;
    lengthMode?: DnfTextLengthMode;
    /** 长度提示右侧的有效标记，由应用决定业务有效性。 */
    valid?: boolean;
};
type __VLS_ModelProps = {
    modelValue?: string;
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare var __VLS_1: {}, __VLS_8: {};
type __VLS_Slots = {} & {
    prefix?: (props: typeof __VLS_1) => any;
} & {
    suffix?: (props: typeof __VLS_8) => any;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    "update:modelValue": (value: string) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    "onUpdate:modelValue"?: ((value: string) => any) | undefined;
}>, {
    type: string;
    skin: "default" | "inventory";
    lengthMode: DnfTextLengthMode;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
