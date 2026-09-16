export type ClassType = '输出' | '辅助'
export type Duty = '主C' | '辅C' | '主奶' | '太阳奶' | '划水'

export interface User { id: number; username: string; nickname: string; is_admin: boolean }
export interface Character { id: number; name: string; class_type: ClassType; fame: number;
  simulated_damage: number | null; sustained_dps: number | null; buff_amount: number | null }
export interface Slot { id: number; squad_index: number; row_index: number;
  character_id: number | null; character_name: string | null; character_class: ClassType | null;
  fame: number | null; simulated_damage: number | null; sustained_dps: number | null;
  buff_amount: number | null; owner_id: number | null; owner_nickname: string | null;
  duty: Duty | null; version: number }
export interface Wave { id: number; index: number; slots: Slot[] }
export interface Raid { id: number; name: string; dungeon: string; size: number; locked: boolean; waves: Wave[] }
export interface RaidListItem { id: number; name: string; dungeon: string; size: number; locked: boolean; wave_count: number }
export interface CodeItem { id: number; code: string; used_by: number | null; used_at: string | null;
  expires_at: string | null; single_use: boolean }
