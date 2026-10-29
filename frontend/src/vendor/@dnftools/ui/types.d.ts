import type { DnfIconName } from './components/icon/icons';
export type DnfValue = string | number;
export type DnfWindowTone = 'blue' | 'warning';
export type DnfQuality = 'normal' | 'advanced' | 'rare' | 'artifact' | 'legend' | 'epic' | 'chronicle' | 'mythic' | 'primeval';
export interface DnfOption {
    value: DnfValue;
    label: string;
    disabled?: boolean;
    quality?: DnfQuality;
}
export interface DnfFavoriteOption extends DnfOption {
    icon?: import('./components/icon/icons').DnfIconName;
    iconSrc?: string;
}
export interface DnfTreeNode extends DnfOption {
    children?: DnfTreeNode[];
}
export type DnfSettingsNavIcon = 'home' | 'display' | 'effects' | 'sound' | 'game' | 'social';
export interface DnfSettingsNavNode extends DnfTreeNode {
    icon?: DnfSettingsNavIcon;
    children?: DnfSettingsNavNode[];
}
export interface DnfTab extends DnfOption {
    href?: string;
    target?: string;
    rel?: string;
}
export interface DnfSort<K extends string = string> {
    key: K;
    order: 'asc' | 'desc';
}
export interface DnfColumn<K extends string = string> {
    key: K;
    sortable?: boolean;
    label: string;
    width?: string;
    align?: 'left' | 'center' | 'right';
}
export interface DnfMenuItem extends DnfOption {
    separator?: boolean;
    icon?: DnfMenuIcon;
    iconSrc?: string;
}
export type DnfMenuIcon = DnfIconName;
export type DnfMenuVariant = 'settings' | 'context' | 'item';
export interface DnfAccordionItem {
    value: string;
    title: string;
    disabled?: boolean;
    /** @deprecated Kept for compatibility; all panels now share one background without category icons. */
    category?: 'raid' | 'legion' | 'special' | 'advanced' | 'normal';
    notice?: boolean;
}
export interface DnfTooltipLine {
    text: string;
    gapBefore?: boolean;
}
export type DnfTimerMode = 'up' | 'down';
export type DnfTimerState = 'idle' | 'running' | 'paused' | 'finished';
export interface DnfTimerSnapshot {
    mode: DnfTimerMode;
    state: DnfTimerState;
    valueMs: number;
    durationMs: number;
}
export type DnfNinePatchSlice = readonly [top: number, right: number, bottom: number, left: number];
export type DnfNinePatchSkin = 'library' | 'tree' | 'strip' | 'journal' | 'social';
export type DnfFrameSurface = 'panel' | 'well' | 'group' | 'library' | 'journal' | 'strip' | 'tree' | 'social';
export type DnfTextLengthMode = 'characters' | 'wide';
export interface DnfCommandOption extends DnfOption {
    channel?: string;
    tone?: 'default' | 'green' | 'pink' | 'purple' | 'blue' | 'orange';
    command?: string;
    color?: string;
    description?: string;
}
export interface DnfCommandHint {
    command: string;
    description: string;
}
export interface DnfSourceNavOption extends DnfOption {
    icon: 'dungeon' | 'exchange' | 'npc' | 'profession' | 'other';
}
export interface DnfQuickMenuOption extends DnfOption {
    icon?: import('./components/icon/icons').DnfIconName;
    iconSrc?: string;
}
export interface DnfDrawerItem extends DnfOption {
    icon?: import('./components/icon/icons').DnfIconName;
    iconSrc?: string;
}
export interface DnfIconOption extends DnfOption {
    src?: string;
}
