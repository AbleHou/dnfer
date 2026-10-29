import type { DnfResultAction } from './types';
type __VLS_Props = {
    title?: string;
    actions: DnfResultAction[];
    disabled?: boolean;
    /** Shortcuts are local to the focused panel, never registered globally. */
    keyboardShortcuts?: boolean;
};
type __VLS_Slots = {
    title(): unknown;
    action(props: {
        action: DnfResultAction;
    }): unknown;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    select: (action: DnfResultAction) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{
    onSelect?: ((action: DnfResultAction) => any) | undefined;
}>, {
    title: string;
    keyboardShortcuts: boolean;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
