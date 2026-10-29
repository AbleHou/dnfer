type __VLS_Props = {
    speaker?: string;
    /** Portrait canvas defaults to the game's 372 x 327 NPC canvas. */
    portraitSrc?: string;
    portraitAlt?: string;
    placement?: 'inline' | 'bottom';
    /** Milliseconds; 0 waits for the user. Hover/focus pauses a positive duration. */
    duration?: number;
    disabled?: boolean;
    closable?: boolean;
    continueLabel?: string;
};
type __VLS_Slots = {
    default(): unknown;
    portrait(props: {
        src: string;
        alt: string;
    }): unknown;
    actions(props: {
        advance: () => void;
    }): unknown;
};
type __VLS_ModelProps = {
    'open'?: boolean;
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare const __VLS_base: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    close: () => any;
    "update:open": (value: boolean) => any;
    advance: () => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    onClose?: (() => any) | undefined;
    "onUpdate:open"?: ((value: boolean) => any) | undefined;
    onAdvance?: (() => any) | undefined;
}>, {
    closable: boolean;
    duration: number;
    placement: "inline" | "bottom";
    speaker: string;
    portraitSrc: string;
    continueLabel: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
