type __VLS_Props = {
    label: string;
    side?: 'top' | 'right' | 'bottom' | 'left';
    align?: 'start' | 'center' | 'end';
    sideOffset?: number;
    width?: number | string;
    disabled?: boolean;
    remember?: boolean;
    rememberLabel?: string;
    closeOnOutside?: boolean;
};
type __VLS_Slots = {
    anchor(props: {
        open: boolean;
    }): unknown;
    trigger(props: {
        open: boolean;
    }): unknown;
    default(props: {
        close: () => void;
    }): unknown;
};
type __VLS_ModelProps = {
    'open'?: boolean;
    /** 仅返回勾选状态；持久化和下次是否展示由应用决定。 */
    'dontShowAgain'?: boolean;
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare const __VLS_base: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    close: (dontShowAgain: boolean) => any;
    "update:open": (value: boolean) => any;
    "update:dontShowAgain": (value: boolean) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    onClose?: ((dontShowAgain: boolean) => any) | undefined;
    "onUpdate:open"?: ((value: boolean) => any) | undefined;
    "onUpdate:dontShowAgain"?: ((value: boolean) => any) | undefined;
}>, {
    width: string | number;
    side: "top" | "left" | "bottom" | "right";
    align: "center" | "start" | "end";
    sideOffset: number;
    closeOnOutside: boolean;
    remember: boolean;
    rememberLabel: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
