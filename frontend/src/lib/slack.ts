import type { Character, SlackMetric, SlackRuleSet } from '../types'

export function metricValue(c: Character, m: SlackMetric): number | null {
  return c[m]
}

export function isSlackingChar(c: Character, criteria: SlackRuleSet['criteria']): boolean {
  return criteria.some(cr => c.class_type === cr.class_type && metricValue(c, cr.metric) != null
    && (metricValue(c, cr.metric) as number) < cr.value)
}

export function charExchangeCount(c: Character, exchange: SlackRuleSet['exchange']): number {
  let best = 0
  for (const ex of exchange) {
    if (c.class_type === ex.class_type && metricValue(c, ex.metric) != null
        && (metricValue(c, ex.metric) as number) > ex.value) {
      best = Math.max(best, ex.count)
    }
  }
  return best
}

function slackingByUser(rules: SlackRuleSet, charsByUser: Record<number, Character[]>): Record<number, Character[]> {
  const out: Record<number, Character[]> = {}
  for (const [uid, chars] of Object.entries(charsByUser)) {
    out[Number(uid)] = chars.filter(c => isSlackingChar(c, rules.criteria))
  }
  return out
}

export function computeSlack(
  rules: SlackRuleSet,
  charsByUser: Record<number, Character[]>,
): Record<number, number[]> {
  const slacking = slackingByUser(rules, charsByUser)
  const out: Record<number, number[]> = {}
  for (const [uid, chars] of Object.entries(charsByUser)) {
    const n = Number(uid)
    const allowance = chars.reduce((acc, c) => acc + charExchangeCount(c, rules.exchange), 0)
    const excess = slacking[n].length - allowance
    out[n] = excess > 0 ? slacking[n].slice(-excess).map(c => c.id) : []
  }
  return out
}

export function slackCountByUser(
  rules: SlackRuleSet,
  charsByUser: Record<number, Character[]>,
): Record<number, number> {
  const out: Record<number, number> = {}
  for (const [uid, chars] of Object.entries(slackingByUser(rules, charsByUser))) {
    out[Number(uid)] = chars.length
  }
  return out
}
