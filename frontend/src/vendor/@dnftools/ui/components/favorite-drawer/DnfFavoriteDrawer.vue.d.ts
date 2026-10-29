import type { DnfFavoriteOption, DnfValue } from '../../types';
type __VLS_Props = {
    title?: string;
    options?: DnfFavoriteOption[];
    disabled?: boolean;
    /** 列表最大高度，超过后显示公共滚动条。 */
    maxHeight?: number;
    /** 默认采用原图的 120px 宽度；加宽时保留星形和箭头尺寸。 */
    width?: number | string;
    emptyText?: string;
};
type __VLS_ModelProps = {
    /** 当前选择的收藏项，不再表示多选复选框。 */
    modelValue?: DnfValue;
    'open'?: boolean;
};
type __VLS_PublicProps = __VLS_Props & __VLS_ModelProps;
declare var __VLS_20: {}, __VLS_40: {}, __VLS_43: {
    option: DnfFavoriteOption;
}, __VLS_56: {
    option: DnfFavoriteOption;
};
type __VLS_Slots = {} & {
    title?: (props: typeof __VLS_20) => any;
} & {
    default?: (props: typeof __VLS_40) => any;
} & {
    icon?: (props: typeof __VLS_43) => any;
} & {
    item?: (props: typeof __VLS_56) => any;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_PublicProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    select: (option: DnfFavoriteOption) => any;
    remove: (option: DnfFavoriteOption) => any;
    "update:open": (value: boolean) => any;
    "update:modelValue": (value: DnfValue | undefined) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_PublicProps> & Readonly<{
    onSelect?: ((option: DnfFavoriteOption) => any) | undefined;
    onRemove?: ((option: DnfFavoriteOption) => any) | undefined;
    "onUpdate:open"?: ((value: boolean) => any) | undefined;
    "onUpdate:modelValue"?: ((value: DnfValue | undefined) => any) | undefined;
}>, {
    title: string;
    maxHeight: number;
    options: DnfFavoriteOption[];
    emptyText: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
