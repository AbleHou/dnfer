import { type InjectionKey, type Ref } from 'vue';
export interface DnfThemeContext {
    portal: Ref<HTMLElement | undefined>;
}
export declare const dnfThemeKey: InjectionKey<DnfThemeContext>;
export declare function useDnfPortal(): Ref<HTMLElement | undefined, HTMLElement | undefined> | undefined;
