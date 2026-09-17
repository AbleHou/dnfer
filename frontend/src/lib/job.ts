export function jobIcon(jobName: string): string { return `/images/jobs/${jobName}.png` }
export function categoryIcon(parentName: string): string { return `/images/sub/${parentName}.png` }
export const ICON_FALLBACK = '/images/jobs/empty.png'
