type __VLS_Props = {
    /** 图片按横向三段提供；纵向整体旋转，保留像素方向。 */
    orientation?: 'horizontal' | 'vertical';
    /** 两端保持固定尺寸，中段拉伸或平铺。 */
    repeat?: 'stretch' | 'repeat';
    length?: number | string;
    thickness?: number;
    capSize?: number;
    startSrc?: string;
    middleSrc?: string;
    endSrc?: string;
    decorative?: boolean;
};
declare const __VLS_export: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {
    length: string | number;
    repeat: "repeat" | "stretch";
    orientation: "vertical" | "horizontal";
    decorative: boolean;
    thickness: number;
    capSize: number;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
