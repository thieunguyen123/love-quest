// Twin TypeScript của calc_atk / calc_def / calc_battle (nguồn sự thật là server) – dùng cho xem trước & test (BTL-02)
export type UnitRow = { atk: number; qty: number };
export type BattleCfg = { armyAtkPct: number; defenderArmyRatio: number; minDamageRatio: number; lootPerDamage: number };

const armyBase = (units: UnitRow[]) => units.reduce((a, u) => a + u.atk * u.qty, 0);

export function calcAtk(units: UnitRow[], armyLevel: number, weaponPcts: number[], dragonPct: number, c: BattleCfg) {
  return armyBase(units) * (1 + c.armyAtkPct * armyLevel) * (1 + weaponPcts.reduce((a, b) => a + b, 0)) * (1 + dragonPct);
}

export function calcDef(houseDef: number, corgiDef: number, units: UnitRow[], armyLevel: number, c: BattleCfg) {
  return houseDef + corgiDef + c.defenderArmyRatio * armyBase(units) * (1 + c.armyAtkPct * armyLevel);
}

export function calcBattle(atk: number, def: number, rand: number, hp: number, c: BattleCfg) {
  const damage = Math.min(hp, Math.round(Math.max(atk - def, c.minDamageRatio * atk) * rand));
  return { damage, loot: Math.round(damage * c.lootPerDamage) };
}
