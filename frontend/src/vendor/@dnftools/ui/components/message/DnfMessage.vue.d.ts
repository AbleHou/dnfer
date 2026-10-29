import type { DnfMessageTone, DnfMessageSkin } from './service';
type __VLS_Props = {
    text?: string;
    tone?: DnfMessageTone;
    skin?: DnfMessageSkin;
    avatar?: string;
    avatarLabel?: string;
    maxWidth?: string;
    closable?: boolean;
};
type __VLS_Slots = {
    default(): unknown;
    avatar(): unknown;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    close: () => any;
}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{
    onClose?: (() => any) | undefined;
}>, {
    closable: boolean;
    skin: DnfMessageSkin;
    tone: DnfMessageTone;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
