import type { DnfValue, DnfIconOption } from '../../types';
declare const __VLS_export: <T extends DnfIconOption = DnfIconOption>(__VLS_props: NonNullable<Awaited<typeof __VLS_setup>>["props"], __VLS_ctx?: __VLS_PrettifyLocal<Pick<NonNullable<Awaited<typeof __VLS_setup>>, "attrs" | "emit" | "slots">>, __VLS_exposed?: NonNullable<Awaited<typeof __VLS_setup>>["expose"], __VLS_setup?: Promise<{
    props: import("vue").PublicProps & __VLS_PrettifyLocal<({
        options: T[];
        label: string;
        columns?: number;
        /** Minimum inventory rows; incomplete rows are padded with inert empty slots. */
        rows?: number;
        disabled?: boolean;
        clearable?: boolean;
        emptyLabel?: string;
        maxHeight?: number;
    } & {
        modelValue?: DnfValue;
        open?: boolean;
    }) & {
        "onUpdate:open"?: ((value: boolean) => any) | undefined;
        "onUpdate:modelValue"?: ((value: DnfValue | undefined) => any) | undefined;
    }> & (typeof globalThis extends {
        __VLS_PROPS_FALLBACK: infer P;
    } ? P : {});
    expose: (exposed: {}) => void;
    attrs: any;
    slots: {
        trigger(props: {
            option: T | undefined;
            value: DnfValue | undefined;
        }): unknown;
        option(props: {
            option: T;
            selected: boolean;
        }): unknown;
    };
    emit: ((event: "update:open", value: boolean) => void) & ((event: "update:modelValue", value: DnfValue | undefined) => void);
}>) => import("vue").VNode & {
    __ctx?: NonNullable<Awaited<typeof __VLS_setup>>;
};
declare const _default: typeof __VLS_export;
export default _default;
type __VLS_PrettifyLocal<T> = (T extends any ? {
    [K in keyof T]: T[K];
} : {
    [K in keyof T as K]: T[K];
}) & {};
