import type { DnfAccordionItem } from '../../types';
type __VLS_Props = {
    items: DnfAccordionItem[];
    type?: 'single' | 'multiple';
    disabled?: boolean;
    collapsible?: boolean;
    /** Compact panel heading with the same background and right-side arrow. */
    compact?: boolean;
};
type __VLS_Slots = {
    default?(props: {
        item: DnfAccordionItem;
    }): any;
    title?(props: {
        item: DnfAccordionItem;
    }): any;
    trigger?(props: {
        item: DnfAccordionItem;
    }): any;
};
type __VLS_ModelProps = {
    modelValue?: string | string[];
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare const __VLS_base: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    "update:modelValue": (value: string | string[] | undefined) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    "onUpdate:modelValue"?: ((value: string | string[] | undefined) => any) | undefined;
}>, {
    type: "single" | "multiple";
    collapsible: boolean;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
