export type ClassType = '输出' | '辅助'
export type Duty = '主C' | '辅C' | '主奶' | '太阳奶' | '划水'

export interface User { id: number; username: string; nickname: string; is_admin: boolean; avatar: string | null; is_banned: boolean }
export interface AdminUser extends User { character_count: number }
export interface AdminCharacterRow extends Character {
  owner_id: number; owner_nickname: string; owner_username: string; owner_is_banned: boolean
}
export interface CharacterQueryResult { items: AdminCharacterRow[]; total: number }
export interface RaidSignup { user: User; created_at: string | null }
export interface Character { id: number; name: string; job_name: string; job_title: string;
  parent_name: string; class_type: ClassType; fame: number;
  simulated_damage: number | null; sustained_dps: number | null; buff_amount: number | null }
export interface PlayerCharacters { user: User; characters: Character[] }
export interface Slot { id: number; squad_index: number; row_index: number;
  character_id: number | null; character_name: string | null;
  character_class: ClassType | null; job_name: string | null; job_title: string | null;
  fame: number | null; simulated_damage: number | null; sustained_dps: number | null;
  buff_amount: number | null; owner_id: number | null; owner_nickname: string | null;
  owner_avatar: string | null; duty: Duty | null; version: number }
export interface CharacterPlacement { wave_index: number; squad_index: number; duty: Duty }
export interface JobChild { id: number; name: string; title: string; class_type: ClassType }
export interface JobCategory { id: number; name: string; title: string; children: JobChild[] }
export interface Wave { id: number; index: number; slots: Slot[] }
export interface Dungeon { id: number; name: string; size: number; description: string; created_at: string }
export interface Raid { id: number; name: string; dungeon_id: number; dungeon_name: string;
  size: number; locked: boolean; starts_at: string; waves: Wave[]; signups: RaidSignup[] }
export interface RaidListItem { id: number; name: string; dungeon_id: number; dungeon_name: string;
  size: number; locked: boolean; starts_at: string; wave_count: number; signup_count: number; my_signed_up: boolean }
export interface CodeItem { id: number; code: string; used_by: number | null; used_at: string | null;
  expires_at: string | null; single_use: boolean }
