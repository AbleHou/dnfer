import type { ClassType, Duty } from '../types'
const DUTY_BY_CLASS: Record<ClassType, Duty[]> = {
  '输出': ['主C', '辅C', '划水'],
  '辅助': ['主奶', '太阳奶', '划水'],
}
export function dutyOptions(c: ClassType): Duty[] { return DUTY_BY_CLASS[c] }
export function defaultDuty(c: ClassType): Duty { return c === '输出' ? '主C' : '主奶' }
