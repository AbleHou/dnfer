import { type DnfIconName, type DnfIconState } from './icons';
type __VLS_Props = {
    src?: string;
    name?: DnfIconName;
    label?: string;
    width?: number;
    height?: number;
    pixelated?: boolean;
    /** auto follows the immediate button's hover, press, selection and disabled states. */
    state?: DnfIconState | 'auto';
    /** Tint a bitmap with currentColor while keeping its original alpha. */
    mask?: boolean;
};
declare const __VLS_export: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {
    pixelated: boolean;
    state: DnfIconState | "auto";
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
