import { type DnfWindowPosition } from '../../composables/window-position';
import type { DnfWindowTone } from '../../types';
type __VLS_Props = {
    title: string;
    tone?: DnfWindowTone;
    animated?: boolean;
    closable?: boolean;
    draggable?: boolean;
    constrainToViewport?: boolean;
};
type __VLS_ModelProps = {
    'position'?: DnfWindowPosition | undefined;
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare var __VLS_6: {}, __VLS_8: {}, __VLS_17: {}, __VLS_19: {}, __VLS_21: {};
type __VLS_Slots = {} & {
    title?: (props: typeof __VLS_6) => any;
} & {
    close?: (props: typeof __VLS_8) => any;
} & {
    description?: (props: typeof __VLS_17) => any;
} & {
    default?: (props: typeof __VLS_19) => any;
} & {
    footer?: (props: typeof __VLS_21) => any;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    close: () => any;
    "update:position": (value: DnfWindowPosition | undefined) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    onClose?: (() => any) | undefined;
    "onUpdate:position"?: ((value: DnfWindowPosition | undefined) => any) | undefined;
}>, {
    closable: boolean;
    tone: DnfWindowTone;
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
