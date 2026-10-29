import { type MaybeRefOrGetter, type Ref } from 'vue';
/** Guard both trigger changes and externally controlled opens while disabled. */
export declare function useDnfDisabledOpen(open: Ref<boolean>, disabled: MaybeRefOrGetter<boolean | undefined>): import("vue").WritableComputedRef<boolean, boolean>;
