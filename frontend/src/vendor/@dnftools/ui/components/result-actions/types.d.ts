export interface DnfResultAction {
    value: string | number;
    label: string;
    /** KeyboardEvent.key, for example F10. Only active while focus is inside the panel. */
    shortcut?: string;
    disabled?: boolean;
}
