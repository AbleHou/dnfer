import { type InjectionKey } from 'vue';
export type DnfMessageTone = 'success' | 'error' | 'warning' | 'info' | 'loading' | 'red' | 'green' | 'yellow' | 'blue';
export type DnfMessageSkin = 'default' | 'portrait';
export interface DnfMessageOptions {
    id?: string;
    text: string;
    tone?: DnfMessageTone;
    skin?: DnfMessageSkin;
    avatar?: string;
    avatarLabel?: string;
    maxWidth?: string;
    duration?: number;
    closable?: boolean;
}
export interface DnfMessageHandle {
    id: string;
    update: (options: Partial<DnfMessageOptions>) => void;
    close: () => void;
}
export interface DnfMessageEntry {
    id: string;
    options: DnfMessageOptions;
    revision: number;
    handle: DnfMessageHandle;
}
export declare function createDnfMessage(): {
    entries: Readonly<import("vue").ShallowReactive<DnfMessageEntry[]>>;
    open: (options: DnfMessageOptions) => DnfMessageHandle;
    success: (options: string | Omit<DnfMessageOptions, "tone">) => DnfMessageHandle;
    error: (options: string | Omit<DnfMessageOptions, "tone">) => DnfMessageHandle;
    warning: (options: string | Omit<DnfMessageOptions, "tone">) => DnfMessageHandle;
    info: (options: string | Omit<DnfMessageOptions, "tone">) => DnfMessageHandle;
    loading: (options: string | Omit<DnfMessageOptions, "tone">) => DnfMessageHandle;
    attach(): void;
    dispose(): void;
};
export type DnfMessageService = ReturnType<typeof createDnfMessage>;
export declare const dnfMessageKey: InjectionKey<DnfMessageService>;
export declare function useDnfMessage(): {
    entries: Readonly<import("vue").ShallowReactive<DnfMessageEntry[]>>;
    open: (options: DnfMessageOptions) => DnfMessageHandle;
    success: (options: string | Omit<DnfMessageOptions, "tone">) => DnfMessageHandle;
    error: (options: string | Omit<DnfMessageOptions, "tone">) => DnfMessageHandle;
    warning: (options: string | Omit<DnfMessageOptions, "tone">) => DnfMessageHandle;
    info: (options: string | Omit<DnfMessageOptions, "tone">) => DnfMessageHandle;
    loading: (options: string | Omit<DnfMessageOptions, "tone">) => DnfMessageHandle;
    attach(): void;
    dispose(): void;
};
