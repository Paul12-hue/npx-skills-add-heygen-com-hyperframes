export interface PointRule {
  basePoints: number;
  pointsPerTier: number;
}

/** Punkte einer Truhe: Basis + (Stufe − 1) × Aufschlag je Stufe. Nie negativ. */
export function chestPoints(rule: PointRule, tier: number): number {
  const t = Math.max(1, Math.floor(tier));
  return Math.max(0, rule.basePoints + (t - 1) * rule.pointsPerTier);
}
