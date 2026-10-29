import type { DnfColumn, DnfSort, DnfValue } from '../../types';
declare const __VLS_export: <T extends Record<string, unknown> = Record<string, unknown>>(__VLS_props: NonNullable<Awaited<typeof __VLS_setup>>["props"], __VLS_ctx?: __VLS_PrettifyLocal<Pick<NonNullable<Awaited<typeof __VLS_setup>>, "attrs" | "emit" | "slots">>, __VLS_exposed?: NonNullable<Awaited<typeof __VLS_setup>>["expose"], __VLS_setup?: Promise<{
    props: import("vue").PublicProps & __VLS_PrettifyLocal<({
        columns: DnfColumn[];
        rows: T[];
        rowKey?: Extract<keyof T, string> | ((row: T) => DnfValue);
        label?: string;
        compact?: boolean;
        selectable?: boolean;
        stickyHeader?: boolean;
        maxHeight?: string;
        variant?: "default" | "training";
    } & {
        modelValue?: DnfValue;
        sort?: DnfSort<Extract<keyof T, string>> | undefined;
    }) & {
        onSelect?: ((row: T) => any) | undefined;
        "onUpdate:modelValue"?: ((value: DnfValue | undefined) => any) | undefined;
        onSortChange?: ((sort: DnfSort<Extract<keyof T, string>> | undefined) => any) | undefined;
        "onUpdate:sort"?: ((value: DnfSort<Extract<keyof T, string>> | undefined) => any) | undefined;
    }> & (typeof globalThis extends {
        __VLS_PROPS_FALLBACK: infer P;
    } ? P : {});
    expose: (exposed: {}) => void;
    attrs: any;
    slots: {
        [name: `cell-${string}`]: (props: {
            row: T;
            value: T[Extract<keyof T, string>];
            column: DnfColumn;
        }) => unknown;
        [name: `header-${string}`]: (props: {
            column: DnfColumn;
            sort: DnfSort<Extract<keyof T, string>> | undefined;
            toggle: () => void;
        }) => unknown;
        footer(props: {
            columns: DnfColumn[];
            rows: T[];
        }): unknown;
        empty(): unknown;
    };
    emit: (((evt: "select", row: T) => void) & ((evt: "sortChange", sort: DnfSort<Extract<keyof T, string>> | undefined) => void)) & (((event: "update:modelValue", value: DnfValue | undefined) => void) & ((event: "update:sort", value: DnfSort<Extract<keyof T, string>> | undefined) => void));
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
