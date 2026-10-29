import type { DnfWindowPosition } from '../../composables/window-position';
import type { DnfDialogCloseReason } from './service';
import type { DnfWindowTone } from '../../types';
type __VLS_Props = {
    title: string;
    tone?: DnfWindowTone;
    description?: string;
    modal?: boolean;
    width?: string;
    animated?: boolean;
    closeOnEscape?: boolean;
    closeOnOutside?: boolean;
    closable?: boolean;
    /** Retain content after its first opening, without retaining active focus traps. */
    keepMounted?: boolean;
    draggable?: boolean;
    constrainToViewport?: boolean;
};
type __VLS_Slots = {
    trigger(): unknown;
    default(props: {
        close: () => void;
    }): unknown;
    footer(props: {
        close: () => void;
    }): unknown;
};
type __VLS_ModelProps = {
    'open'?: boolean;
    'position'?: DnfWindowPosition | undefined;
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare const __VLS_base: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    close: (reason: DnfDialogCloseReason) => any;
    "update:open": (value: boolean) => any;
    openAutoFocus: (event: Event) => any;
    closeAutoFocus: (event: Event) => any;
    "update:position": (value: DnfWindowPosition | undefined) => any;
    afterClose: () => any;
    show: () => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    onClose?: ((reason: DnfDialogCloseReason) => any) | undefined;
    "onUpdate:open"?: ((value: boolean) => any) | undefined;
    onOpenAutoFocus?: ((event: Event) => any) | undefined;
    onCloseAutoFocus?: ((event: Event) => any) | undefined;
    "onUpdate:position"?: ((value: DnfWindowPosition | undefined) => any) | undefined;
    onAfterClose?: (() => any) | undefined;
    onShow?: (() => any) | undefined;
}>, {
    width: string;
    closable: boolean;
    modal: boolean;
    closeOnEscape: boolean;
    closeOnOutside: boolean;
    animated: boolean;
    constrainToViewport: boolean;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
