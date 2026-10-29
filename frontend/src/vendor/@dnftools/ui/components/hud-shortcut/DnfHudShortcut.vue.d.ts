type __VLS_Props = {
    title: string;
    tag?: string;
    description?: string;
    icon?: 'quest' | 'guide';
    iconSrc?: string;
    disabled?: boolean;
};
type __VLS_ModelProps = {
    'open'?: boolean;
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare var __VLS_16: {};
type __VLS_Slots = {} & {
    icon?: (props: typeof __VLS_16) => any;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    toggle: (open: boolean) => any;
    "update:open": (value: boolean) => any;
    activate: () => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    onToggle?: ((open: boolean) => any) | undefined;
    "onUpdate:open"?: ((value: boolean) => any) | undefined;
    onActivate?: (() => any) | undefined;
}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
