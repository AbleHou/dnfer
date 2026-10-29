import type { DnfTextLengthMode } from '../../types';
type __VLS_Props = {
    disabled?: boolean;
    readonly?: boolean;
    invalid?: boolean;
    maxlength?: number;
    showCount?: boolean;
    lengthMode?: DnfTextLengthMode;
    height?: number;
};
type __VLS_ModelProps = {
    modelValue?: string;
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare var __VLS_8: {
    count: number;
    limit: number | undefined;
};
type __VLS_Slots = {} & {
    footer?: (props: typeof __VLS_8) => any;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_PublicProps, {
    focus: () => void | undefined;
}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    "update:modelValue": (value: string) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    "onUpdate:modelValue"?: ((value: string) => any) | undefined;
}>, {
    height: number;
    maxlength: number;
    showCount: boolean;
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
