import type { DnfMenuItem, DnfMenuVariant } from '../../types';
type __VLS_Props = {
    items: DnfMenuItem[];
    /** 设置菜单使用独立底板；NPC 与物品菜单共用紧凑布局。 */
    variant?: DnfMenuVariant;
    /** 可见的菜单标题；不提供时隐藏标题栏。 */
    title?: string;
    label?: string;
};
type __VLS_Slots = {
    trigger(): unknown;
    title(): unknown;
    'header-icon'(): unknown;
    icon(props: {
        item: DnfMenuItem;
    }): unknown;
    default(props: {
        item: DnfMenuItem;
    }): unknown;
};
type __VLS_ModelProps = {
    'open'?: boolean;
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare const __VLS_base: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    select: (item: DnfMenuItem) => any;
    "update:open": (value: boolean) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    onSelect?: ((item: DnfMenuItem) => any) | undefined;
    "onUpdate:open"?: ((value: boolean) => any) | undefined;
}>, {
    variant: DnfMenuVariant;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
