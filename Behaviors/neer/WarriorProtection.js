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
  shieldBlock: 132404,
  ignorePain: 190456,
};

export class WarriorProtectionBehavior extends Behavior {
  name = "Warrior [Protection]";
  context = BehaviorContext.Any;
  specialization = Specialization.Warrior.Protection;

  static settings = [
    { header: "Defensives" },
    { type: "slider", uid: "NeerProtDefWindowMs", text: "Damage window (ms)", min: 1000, max: 8000, default: 4000 },
    { type: "slider", uid: "NeerProtShieldBlockPct", text: "Shield Block: % HP lost in window", min: 5, max: 60, default: 20 },
    { type: "slider", uid: "NeerProtIgnorePainPct", text: "Ignore Pain: % HP lost in window", min: 5, max: 60, default: 12 },
    { type: "slider", uid: "NeerProtIgnorePainMinRage", text: "Ignore Pain: min rage", min: 20, max: 80, default: 40 },
    { type: "slider", uid: "NeerProtShieldBlockMinRage", text: "Shield Block: min rage", min: 15, max: 60, default: 30 },
    { type: "slider", uid: "NeerProtPanicHpPct", text: "Panic HP% (force Shield Block/IP)", min: 10, max: 80, default: 50 },
  ];

  constructor() {
    super();
    this._dmgHits = [];      // [{ t, amount }]
    this._lastHp = null;
    this._lastTick = 0;
  }

  build() {
    return new bt.Selector(
      new bt.Action(() => { this.updateDamageTracker(); return bt.Status.Failure; }),
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      common.waitForCastOrChannel(),
      spell.interrupt("Pummel"),
      spell.cast("Shield Block", on => me, req => this.shouldShieldBlock()),
      spell.cast("Ignore Pain", on => me, req => this.shouldIgnorePain()),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Taunt", on => this.findTauntTarget()),
          common.waitForTarget(),
          common.waitForFacing(),
          common.ensureAutoAttack(),
          spell.cast("Battle Shout", on => me, req => !me.hasAura(auras.battleShout)),
          spell.cast("Charge", on => combat.bestTarget, req =>
            combat.bestTarget && !me.isWithinMeleeRange(combat.bestTarget)
          ),
          spell.cast("Heroic Throw", on => this.heroicThrowTarget(), req => this.heroicThrowTarget() != null),
          spell.cast("Victory Rush", on => combat.bestTarget),
          spell.cast("Thunder Clap", on => combat.bestTarget, req => combat.bestTarget && combat.bestTarget.distanceTo(me) <= 8),
          spell.cast("Shield Slam", on => combat.bestTarget),
          spell.cast("Revenge", on => combat.bestTarget, req =>
            combat.bestTarget && me.isWithinMeleeRange(combat.bestTarget) && me.isFacing(combat.bestTarget)
          ),
          spell.cast("Execute", on => combat.targets.find(t => t.pctHealth <= 20), { skipUsableCheck: true }),
          spell.cast("Devastate", on => combat.bestTarget)
        )
      )
    );
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

    const windowMs = Settings.NeerProtDefWindowMs ?? 4000;
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

  shouldShieldBlock() {
    if (!me.inCombat()) return false;
    if (me.powerByType(PowerType.Rage) < (Settings.NeerProtShieldBlockMinRage ?? 30)) return false;

    const sb = me.getAura(auras.shieldBlock);
    const refreshable = !sb || sb.remaining < 2000;
    if (!refreshable) return false;

    const dmgPct = this.damageTakenPctInWindow();
    const threshold = Settings.NeerProtShieldBlockPct ?? 20;
    const panicHp = Settings.NeerProtPanicHpPct ?? 50;
    return dmgPct >= threshold || me.pctHealth <= panicHp;
  }

  shouldIgnorePain() {
    if (!me.inCombat()) return false;
    if (me.powerByType(PowerType.Rage) < (Settings.NeerProtIgnorePainMinRage ?? 40)) return false;

    const dmgPct = this.damageTakenPctInWindow();
    const threshold = Settings.NeerProtIgnorePainPct ?? 12;
    const panicHp = Settings.NeerProtPanicHpPct ?? 50;
    return dmgPct >= threshold || me.pctHealth <= panicHp;
  }

  findTauntTarget() {
    return combat.targets.find(t => t.target && !t.isTanking());
  }

  heroicThrowTarget() {
    const main = combat.bestTarget;
    if (main && !me.isWithinMeleeRange(main)) return main;
    if (!spell.getCooldown("Taunt")?.ready) {
      return combat.targets.find(t => me.isFacing(t) && t.target && !t.isTanking()) ?? null;
    }
    return null;
  }
}
