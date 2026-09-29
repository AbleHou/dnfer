export function jobIcon(jobName: string): string { return `/images/jobs/${jobName}.png` }
export function categoryIcon(parentName: string): string { return `/images/sub/${parentName}.png` }
export const ICON_FALLBACK = '/images/jobs/empty.png'
export function handleIconError(e: Event) {
  const img = e.target as HTMLImageElement
  if (img.src !== ICON_FALLBACK) img.src = ICON_FALLBACK
}

// 男女双版职业：job_name → 性别（纯前端展示层；对应职业信息.json 中 title 同时存在于男女大类的职业）。
// 注意：蓝拳圣使男版 job_name 为 infighter（无 _male 后缀），必须显式映射，不能靠后缀推断。
const GENDER_SPLIT: Record<string, '男' | '女'> = {
  ranger_male: '男', ranger_female: '女',
  launcher_male: '男', launcher_female: '女',
  mechanic_male: '男', mechanic_female: '女',
  spitfire_male: '男', spitfire_female: '女',
  crusader_male: '男', crusader_female: '女',
  infighter: '男', infighter_female: '女',
  nenmaster_male: '男', nenmaster_female: '女',
  striker_male: '男', striker_female: '女',
  brawler_male: '男', brawler_female: '女',
  grappler_male: '男', grappler_female: '女',
}

/** 男女双版职业在 title 后追加（男）/（女）；单性别或未知返回原 title。 */
export function jobGenderTitle(jobName: string | null | undefined, title: string | null | undefined): string {
  if (!jobName || !title) return title ?? ''
  const g = GENDER_SPLIT[jobName]
  return g ? `${title}（${g}）` : title
}
