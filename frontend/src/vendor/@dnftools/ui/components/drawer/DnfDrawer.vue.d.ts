import type { DnfDrawerItem } from '../../types';
type __VLS_Props = {
    title: string;
    description?: string;
    variant?: 'default' | 'skill' | 'channel';
    side?: 'left' | 'right' | 'top' | 'bottom';
    /** 局部抽屉放在 surface 插槽所属区域内；否则贴靠视口边缘。 */
    contained?: boolean;
    modal?: boolean;
    disabled?: boolean;
    width?: number | string;
    height?: number | string;
    items?: DnfDrawerItem[];
    closeOnSelect?: boolean;
    /** 网页过渡，可关闭；不表示客户端动画时序。 */
    animated?: boolean;
};
type __VLS_Slots = {
    trigger(props: {
        open: boolean;
    }): unknown;
    surface(props: {
        open: boolean;
    }): unknown;
    default(props: {
        close: () => void;
    }): unknown;
    item(props: {
        item: DnfDrawerItem;
    }): unknown;
    footer(props: {
        close: () => void;
    }): unknown;
};
type __VLS_ModelProps = {
    'open'?: boolean;
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare const __VLS_base: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    select: (item: DnfDrawerItem) => any;
    "update:open": (value: boolean) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    onSelect?: ((item: DnfDrawerItem) => any) | undefined;
    "onUpdate:open"?: ((value: boolean) => any) | undefined;
}>, {
    items: DnfDrawerItem[];
    side: "top" | "left" | "bottom" | "right";
    modal: boolean;
    variant: "default" | "channel" | "skill";
    animated: boolean;
    contained: boolean;
    closeOnSelect: boolean;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
