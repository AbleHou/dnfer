import { type MaybeRefOrGetter, type Ref } from 'vue';
import type { DnfTextLengthMode } from '../types';
export declare function useDnfTextInput(model: Ref<string>, options: {
    maxlength: MaybeRefOrGetter<number | undefined>;
    lengthMode: MaybeRefOrGetter<DnfTextLengthMode>;
}): {
    limit: import("vue").ComputedRef<number | undefined>;
    editor: import("vue").WritableComputedRef<string, string>;
    count: import("vue").ComputedRef<number>;
    nativeMaxlength: import("vue").ComputedRef<number | undefined>;
    onInput: (event: Event) => void;
};
