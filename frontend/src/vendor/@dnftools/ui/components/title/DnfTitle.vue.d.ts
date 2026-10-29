type __VLS_Props = {
    /** 冒险收藏线框 / 彩色缎带。 */
    variant?: 'collection' | 'ribbon';
    /** 缎带配色。 */
    tone?: 'blue' | 'purple' | 'pink' | 'red' | 'gold';
    /** 收藏底板状态，仅控制外观；标题没有按钮行为。 */
    state?: 'normal' | 'highlighted' | 'muted';
    /** 语义标题等级，或作为行内装饰标题。 */
    as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'span';
    width?: number | string;
};
type __VLS_Slots = {
    default(): unknown;
};
declare const __VLS_base: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {
    state: "normal" | "highlighted" | "muted";
    as: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "span";
    variant: "collection" | "ribbon";
    tone: "blue" | "pink" | "purple" | "gold" | "red";
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_export: __VLS_WithSlots<typeof __VLS_base, __VLS_Slots>;
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
