import { type MaybeRefOrGetter, type Ref } from 'vue';
import type { DnfTreeNode, DnfValue } from '../types';
/** Search temporarily expands matching branches, then restores the caller's expansion. */
export declare function useDnfTreeSearch(options: {
    nodes: MaybeRefOrGetter<DnfTreeNode[]>;
    query: Ref<string>;
    expanded: Ref<string[]>;
    enabled?: MaybeRefOrGetter<boolean>;
}): {
    filtered: import("vue").ComputedRef<DnfTreeNode[]>;
    index: import("vue").ComputedRef<{
        byValue: Map<DnfValue, DnfTreeNode>;
        branches: Set<string>;
    }>;
};
