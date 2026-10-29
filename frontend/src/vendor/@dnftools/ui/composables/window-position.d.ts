import { type Ref } from 'vue';
export interface DnfWindowPosition {
    x: number;
    y: number;
}
/** Viewport coordinates in CSS pixels; default inline/center layout is retained until moved. */
export declare function useDnfWindowPosition(host: Ref<HTMLElement | undefined>, position: Ref<DnfWindowPosition | undefined>, enabled: () => boolean, bounded: () => boolean): {
    style: import("vue").ComputedRef<{
        position: "fixed";
        width: string | undefined;
        boxSizing: "border-box";
        left: string;
        top: string;
        transform: string;
    } | undefined>;
    dragging: Ref<boolean, boolean>;
    pointerdown: (event: PointerEvent) => void;
    keydown: (event: KeyboardEvent) => void;
};
