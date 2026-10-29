export type DnfIconState = 'rest' | 'hover' | 'pressed' | 'selected' | 'disabled';
export interface DnfIconDefinition {
    src: string;
    label: string;
    group: string;
    width: number;
    height: number;
    states?: Partial<Record<DnfIconState, string>>;
    vector?: {
        viewBox: string;
        path: string;
        fill?: string;
        stroke?: string;
        strokeWidth?: number;
    };
    shape?: 'tree-branch';
}
