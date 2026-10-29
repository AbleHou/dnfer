import type { DnfNinePatchSkin, DnfNinePatchSlice } from '../../types';
type __VLS_Props = {
    /** 装饰层可使用 span，默认 div。 */
    as?: 'div' | 'span';
    /** 内置贴图；src 可覆盖贴图而保留预设切片。 */
    skin?: DnfNinePatchSkin;
    src?: string;
    /** 原图像素顺序：上、右、下、左。 */
    slice?: DnfNinePatchSlice;
    /** 固定边角的显示倍率，中心随容器拉伸。 */
    scale?: number;
    repeat?: 'stretch' | 'repeat' | 'round';
    fill?: boolean;
    padding?: string;
};
declare var __VLS_7: {};
type __VLS_Slots = {} & {
    default?: (props: typeof __VLS_7) => any;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {
    repeat: "repeat" | "stretch" | "round";
    fill: boolean;
    as: "div" | "span";
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
