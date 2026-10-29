import { type Component, type InjectionKey, type Ref, type VNodeChild } from 'vue';
import type { DnfWindowPosition } from '../../composables/window-position';
import type { DnfWindowTone } from '../../types';
export type DnfDialogCloseReason = 'confirm' | 'cancel' | 'close-button' | 'escape' | 'outside' | 'programmatic' | 'host-unmount';
export interface DnfDialogResult<T = unknown> {
    action: 'confirm' | 'cancel' | 'close';
    reason: DnfDialogCloseReason;
    data?: T;
}
export interface DnfDialogContentContext<T = unknown> {
    close: (data?: T) => void;
    confirm: () => Promise<void>;
    cancel: () => void;
    busy: boolean;
    error: unknown;
}
export interface DnfDialogOptions<T = unknown> {
    id?: string;
    title: string;
    tone?: DnfWindowTone;
    description?: string;
    content?: string | Component;
    render?: (context: DnfDialogContentContext<T>) => VNodeChild;
    contentProps?: Record<string, unknown>;
    width?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    showCancel?: boolean;
    /** Show a blocking overlay and trap focus; defaults to false. */
    modal?: boolean;
    closeOnEscape?: boolean;
    closeOnOutside?: boolean;
    closable?: boolean;
    draggable?: boolean;
    position?: DnfWindowPosition;
    onConfirm?: () => T | false | Promise<T | false>;
    onError?: (error: unknown) => void;
}
export interface DnfDialogHandle<T = unknown> {
    id: string;
    result: Promise<DnfDialogResult<T>>;
    error: Readonly<Ref<unknown>>;
    update: (options: Partial<DnfDialogOptions<T>>) => void;
    close: (data?: T) => void;
}
export interface DnfDialogEntry {
    id: string;
    key: number;
    options: DnfDialogOptions<any>;
    busy: boolean;
    open: boolean;
    settled: boolean;
    error: Ref<unknown>;
    resolve: (result: DnfDialogResult<any>) => void;
    handle: DnfDialogHandle<any>;
}
/** One explicit service per Host. FIFO; repeated IDs update and return the same handle. */
export declare function createDnfDialog(): {
    entries: Readonly<import("vue").ShallowReactive<DnfDialogEntry[]>>;
    open: <T = unknown>(options: DnfDialogOptions<T>) => DnfDialogHandle<T>;
    executeConfirm: (entry: DnfDialogEntry) => Promise<void>;
    finish: (entry: DnfDialogEntry, reason: DnfDialogCloseReason, data?: unknown) => void;
    remove: (entry: DnfDialogEntry) => void;
    alert: (options: DnfDialogOptions<void> | string) => Promise<DnfDialogResult<void>>;
    confirm: (options: DnfDialogOptions<void> | string) => Promise<DnfDialogResult<void>>;
    attach(): void;
    dispose(): void;
};
export type DnfDialogService = ReturnType<typeof createDnfDialog>;
export declare const dnfDialogKey: InjectionKey<DnfDialogService>;
export declare function useDnfDialog(): {
    open: <T = unknown>(options: DnfDialogOptions<T>) => DnfDialogHandle<T>;
    alert: (options: DnfDialogOptions<void> | string) => Promise<DnfDialogResult<void>>;
    confirm: (options: DnfDialogOptions<void> | string) => Promise<DnfDialogResult<void>>;
};
