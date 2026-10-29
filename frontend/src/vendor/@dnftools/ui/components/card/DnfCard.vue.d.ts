type __VLS_Props = {
    /** Collection tiles, or the encyclopedia's equipment detail surface. */
    variant?: 'collection' | 'detail';
    title?: string;
    description?: string;
    /** Optional centered hint above detail content, separate from the title bar. */
    caption?: string;
    /** Detail footer: textured tags, or a compact separator for explanatory text. */
    footerVariant?: 'tags' | 'plain';
    size?: 'default' | 'extended';
    /** Stacked content, or wrapping rows of item slots. */
    layout?: 'flow' | 'items';
    /** Keep heading text on one line; otherwise it wraps and grows. */
    truncate?: boolean;
    interactive?: boolean;
    disabled?: boolean;
};
type __VLS_ModelProps = {
    'selected'?: boolean;
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare var __VLS_1: {}, __VLS_9: {}, __VLS_11: {}, __VLS_13: {}, __VLS_21: {}, __VLS_23: {}, __VLS_25: {};
type __VLS_Slots = {} & {
    caption?: (props: typeof __VLS_1) => any;
} & {
    title?: (props: typeof __VLS_9) => any;
} & {
    description?: (props: typeof __VLS_11) => any;
} & {
    reward?: (props: typeof __VLS_13) => any;
} & {
    default?: (props: typeof __VLS_21) => any;
} & {
    footer?: (props: typeof __VLS_23) => any;
} & {
    actions?: (props: typeof __VLS_25) => any;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    select: () => any;
    "update:selected": (value: boolean) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    onSelect?: (() => any) | undefined;
    "onUpdate:selected"?: ((value: boolean) => any) | undefined;
}>, {
    size: "default" | "extended";
    variant: "detail" | "collection";
    footerVariant: "tags" | "plain";
    layout: "items" | "flow";
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
