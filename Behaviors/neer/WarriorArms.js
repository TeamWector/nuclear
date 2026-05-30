import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import { PowerType } from "@/Enums/PowerType";
import Settings from "@/Core/Settings";

const auras = {
  battleShout: 6673,
  dieByTheSword: 118038,
  suddenDeath: 52437,
};

export class WarriorArmsBehavior extends Behavior {
  name = "Warrior [Arms]";
  context = BehaviorContext.Any;
  specialization = Specialization.Warrior.Arms;

  static settings = [
    { header: "Defensives" },
    { type: "slider", uid: "NeerArmsDefWindowMs", text: "Damage window (ms)", min: 1000, max: 8000, default: 4000 },
    { type: "slider", uid: "NeerArmsDieByTheSwordPct", text: "Die by the Sword: % HP lost in window", min: 5, max: 60, default: 25 },
    { type: "slider", uid: "NeerArmsVictoryRushHp", text: "Victory Rush HP threshold (%)", min: 20, max: 100, default: 80 },
    { type: "slider", uid: "NeerArmsPanicHpPct", text: "Panic HP%", min: 10, max: 80, default: 35 },
    { header: "Rotation" },
    { type: "slider", uid: "NeerArmsAoeCount", text: "AoE: min enemies in melee", min: 2, max: 8, default: 2 },
    { type: "slider", uid: "NeerArmsSlamMinRage", text: "Slam: min rage", min: 20, max: 100, default: 50 },
  ];

  constructor() {
    super();
    this._dmgHits = [];
    this._lastHp = null;
    this._lastTick = 0;
    this._cacheFrame = -1;
    this._cachedTargetMelee = undefined;
    this._cachedTarget30 = undefined;
  }

  _refreshCache() {
    if (this._cacheFrame === wow.frameTime) return;
    this._cacheFrame = wow.frameTime;
    this._cachedTargetMelee = undefined;
    this._cachedTarget30 = undefined;
  }

  _computeTarget(distance) {
    const inRange = distance === undefined
      ? (t => me.isWithinMeleeRange(t))
      : (t => me.distanceTo(t) <= distance);
    const best = combat.bestTarget;
    if (best && me.isFacing(best) && inRange(best)) return best;
    const reachable = combat.targets.find(t => me.isFacing(t) && inRange(t));
    return reachable || best || null;
  }

  getTarget(distance) {
    this._refreshCache();
    if (distance === undefined) {
      if (this._cachedTargetMelee === undefined) {
        this._cachedTargetMelee = this._computeTarget(undefined);
      }
      return this._cachedTargetMelee;
    }
    if (distance === 30) {
      if (this._cachedTarget30 === undefined) {
        this._cachedTarget30 = this._computeTarget(30);
      }
      return this._cachedTarget30;
    }
    return this._computeTarget(distance);
  }

  build() {
    return new bt.Selector(
      new bt.Action(() => { this.updateDamageTracker(); return bt.Status.Failure; }),
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      common.waitForCastOrChannel(),
      spell.interrupt("Pummel"),
      spell.cast("Die by the Sword", on => me, req => this.shouldDieByTheSword()),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          new bt.Action(() => {
            const target = this.getTarget();
            if (target && me.isWithinMeleeRange(target)) {
              const aa = spell.getSpell("Auto Attack");
              if (aa && !aa.isActive) me.startAttack();
            }
            return bt.Status.Failure;
          }),
          spell.cast("Battle Shout", on => me, req => !me.hasAura(auras.battleShout)),
          spell.cast("Charge", on => combat.bestTarget, req =>
            combat.bestTarget && !me.isWithinMeleeRange(combat.bestTarget)
          ),
          spell.cast("Heroic Throw", on => this.getTarget(30), req => {
            const t = this.getTarget(30);
            return t && !me.isWithinMeleeRange(t);
          }),
          spell.cast("Execute", on => this.getTarget(), req => me.hasAura(auras.suddenDeath) && this.getTarget() !== null, { skipUsableCheck: true }),
          spell.cast("Victory Rush", on => this.getTarget(), req => me.pctHealth <= Settings.NeerArmsVictoryRushHp),
          spell.cast("Sweeping Strikes", on => me, req => this.enemiesInMelee() >= Settings.NeerArmsAoeCount),
          spell.cast("Colossus Smash", on => this.getTarget()),
          spell.cast("Execute", on => this.getTarget(), req => {
            const t = this.getTarget();
            return t && t.pctHealth <= 20;
          }),
          spell.cast("Mortal Strike", on => this.getTarget()),
          spell.cast("Overpower", on => this.getTarget()),
          spell.cast("Whirlwind", on => me, req => this.enemiesInMelee() >= Settings.NeerArmsAoeCount),
          spell.cast("Slam", on => this.getTarget(), req => me.powerByType(PowerType.Rage) >= Settings.NeerArmsSlamMinRage)
        )
      )
    );
  }

  enemiesInMelee() {
    let count = 0;
    for (const t of combat.targets) {
      if (me.isWithinMeleeRange(t)) count++;
    }
    return count;
  }

  updateDamageTracker() {
    const now = wow.frameTime;
    if (now === this._lastTick) return;
    this._lastTick = now;

    const hp = me.health;
    if (this._lastHp !== null) {
      const drop = this._lastHp - hp;
      if (drop > 0) this._dmgHits.push({ t: now, amount: drop });
    }
    this._lastHp = hp;

    const windowMs = Settings.NeerArmsDefWindowMs ?? 4000;
    const cutoff = now - windowMs;
    while (this._dmgHits.length && this._dmgHits[0].t < cutoff) {
      this._dmgHits.shift();
    }
  }

  damageTakenPctInWindow() {
    const maxHp = me.maxHealth;
    if (!maxHp) return 0;
    let total = 0;
    for (const hit of this._dmgHits) total += hit.amount;
    return (total / maxHp) * 100;
  }

  shouldDieByTheSword() {
    if (!me.inCombat()) return false;
    if (me.hasAura(auras.dieByTheSword)) return false;
    const dmgPct = this.damageTakenPctInWindow();
    const threshold = Settings.NeerArmsDieByTheSwordPct ?? 25;
    const panicHp = Settings.NeerArmsPanicHpPct ?? 35;
    return dmgPct >= threshold || me.pctHealth <= panicHp;
  }

  hasMeleeAttackersOnMe() {
    if (!me.guid) return false;
    for (const t of combat.targets) {
      if (t?.target?.equals(me.guid) && me.isWithinMeleeRange(t)) return true;
    }
    return false;
  }

  hasAttackersOnMe() {
    if (!me.guid) return false;
    for (const t of combat.targets) {
      if (t?.target?.equals(me.guid)) return true;
    }
    return false;
  }
}
