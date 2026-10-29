import { type Ref } from 'vue';
import { type DnfCursorName } from '../components/cursor/cursors';
/** One scoped controller shared by Cursor and Provider (including its portal). */
export declare function useDnfCursor(options: () => {
    name?: DnfCursorName;
    frame?: number;
    disabled?: boolean;
    hotspot?: readonly [number, number];
}, roots: readonly Ref<HTMLElement | undefined>[]): import("vue").ComputedRef<{}>;
