import { type MaybeRefOrGetter } from 'vue';
/** Keep DNF's interrupted-transition origin and live duration; VueUse owns scheduling. */
export declare function useDnfLinearTransition(initial: number, duration: MaybeRefOrGetter<number>): {
    value: import("vue").Ref<number, number>;
    set: (next: number, animated: boolean) => void;
};
