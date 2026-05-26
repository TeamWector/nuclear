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
  bearForm: 5487,
  ironfur: 192081,
  barkskin: 22812,
  survivalInstincts: 61336,
  frenziedRegeneration: 22842,
  galacticGuardian: 213708,
  moonfire: 164812,
  thrashBear: 192090,
  rageOfTheSleeper: 200851,
  incarnGuardian: 102558,
  berserkBear: 50334,
};

const spells = {
};

export class DruidGuardianBehavior extends Behavior {
  name = "Druid [Guardian]";
  context = BehaviorContext.Any;
  specialization = Specialization.Druid.Guardian;

  static settings = [
    {
      header: "Defensives",
      options: [
        { type: "slider", uid: "NeerGuardianDefWindowMs", text: "Damage window (ms)", min: 1000, max: 8000, default: 4000 },
        { type: "slider", uid: "NeerGuardianIronfurMinRage", text: "Ironfur: min rage to apply stack", min: 20, max: 80, default: 40 },
        { type: "slider", uid: "NeerGuardianIronfurMaxStacks", text: "Ironfur: max overlapping stacks", min: 1, max: 4, default: 2 },
        { type: "slider", uid: "NeerGuardianIronfurSpikePct", text: "Ironfur extra stack: % HP lost in window", min: 5, max: 60, default: 18 },
        { type: "slider", uid: "NeerGuardianFrenziedHpPct", text: "Frenzied Regeneration HP%", min: 20, max: 95, default: 75 },
        { type: "slider", uid: "NeerGuardianSurvivalHpPct", text: "Survival Instincts HP%", min: 10, max: 60, default: 35 },
        { type: "checkbox", uid: "NeerGuardianBarkskinOnCd", text: "Barkskin on cooldown in combat", default: true },
      ],
    },
    {
      header: "Cooldowns",
      options: [
        { type: "checkbox", uid: "NeerGuardianUseIncarn", text: "Use Incarnation / Berserk on cooldown in combat", default: true },
        { type: "checkbox", uid: "NeerGuardianUseLunarBeam", text: "Use Lunar Beam on cooldown (Elune's Chosen)", default: true },
        { type: "checkbox", uid: "NeerGuardianUseRageOfSleeper", text: "Use Rage of the Sleeper on cooldown in combat", default: true },
        { type: "slider", uid: "NeerGuardianMaulRage", text: "Maul min rage", min: 30, max: 100, default: 80 },
      ],
    },
  ];

  constructor() {
    super();
    this._dmgHits = [];
    this._lastHp = null;
    this._lastTick = 0;
  }

  build() {
    return new bt.Selector(
      new bt.Action(() => { this.updateDamageTracker(); return bt.Status.Failure; }),
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      common.waitForCastOrChannel(),
      new bt.Action(() => me.deadOrGhost ? bt.Status.Success : bt.Status.Failure),

      // Off-GCD: interrupt, taunt, defensives
      spell.interrupt("Skull Bash", false),
      spell.cast("Growl", on => this.findTauntTarget()),
      spell.cast("Survival Instincts", on => me, req => this.shouldSurvivalInstincts()),
      spell.cast("Barkskin", on => me, req => this.shouldBarkskin()),
      spell.cast("Frenzied Regeneration", on => me, req => this.shouldFrenziedRegen()),
      spell.cast("Ironfur", on => me, req => this.shouldIronfur()),

      // Form maintenance
      spell.cast("Bear Form", on => me, req => !me.hasAura(auras.bearForm)),

      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          common.waitForTarget(),
          common.waitForFacing(),
          common.ensureAutoAttack(),

          // Offensive cooldowns — press on CD in combat with a melee target
          spell.cast("Incarnation: Guardian of Ursoc", on => me, req => this.shouldOffensiveCd()),
          spell.cast("Berserk", on => me, req => this.shouldOffensiveCd()),
          spell.cast("Rage of the Sleeper", on => me, req => this.shouldRageOfSleeper()),

          // Lunar Beam — core Elune's Chosen button; offensive + leech defensive (Boundless Moonlight)
          spell.cast("Lunar Beam", on => me, req => this.shouldLunarBeam()),

          // Maintain Moonfire DoT (and consume Galactic Guardian procs)
          spell.cast("Moonfire", on => this.findMoonfireTarget(), req => this.findMoonfireTarget() != null),

          // Thrash — keep DoT up, dump charges before capping
          spell.cast("Thrash", on => combat.bestTarget, req => this.shouldThrash()),

          // Mangle — primary rage builder on CD
          spell.cast("Mangle", on => combat.bestTarget, req => combat.bestTarget && me.isWithinMeleeRange(combat.bestTarget)),

          // Maul — rage dump at 80+ rage
          spell.cast("Maul", on => combat.bestTarget, req => this.shouldMaul()),

          // Swipe — AoE filler
          spell.cast("Swipe", on => combat.bestTarget, req => this.meleeTargetCount() >= 2),

          // Thrash — filler dump (in case charges are sitting)
          spell.cast("Thrash", on => combat.bestTarget, req => combat.bestTarget && me.isWithinMeleeRange(combat.bestTarget)),

          // Moonfire — filler; every cast feeds Lunation CDR and can re-proc Galactic Guardian
          spell.cast("Moonfire", on => combat.bestTarget)
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

    const windowMs = Settings.NeerGuardianDefWindowMs ?? 4000;
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

  ironfurStacks() {
    const aura = me.getAura(auras.ironfur);
    return aura ? aura.stacks : 0;
  }

  ironfurRemaining() {
    const aura = me.getAura(auras.ironfur);
    return aura ? aura.remaining : 0;
  }

  // Maintain >=1 Ironfur stack at all times in melee combat; layer a second
  // stack when a damage spike happens. Mirrors current Midnight guidance:
  // "Maintain at least one stack; pool rage for multiple stacks during spikes."
  shouldIronfur() {
    if (!me.inCombat()) return false;
    if (!me.hasAura(auras.bearForm)) return false;
    if (me.powerByType(PowerType.Rage) < (Settings.NeerGuardianIronfurMinRage ?? 40)) return false;
    if (!combat.targets.some(t => me.isWithinMeleeRange(t))) return false;

    const stacks = this.ironfurStacks();
    const remaining = this.ironfurRemaining();
    const maxStacks = Settings.NeerGuardianIronfurMaxStacks ?? 2;

    // Always refresh when about to drop or no stack present
    if (stacks === 0 || remaining < 2000) return true;

    if (stacks >= maxStacks) return false;

    // Layer extra stack on damage spike
    const dmgPct = this.damageTakenPctInWindow();
    return dmgPct >= (Settings.NeerGuardianIronfurSpikePct ?? 18);
  }

  shouldFrenziedRegen() {
    if (!me.inCombat()) return false;
    if (!me.hasAura(auras.bearForm)) return false;
    if (me.pctHealth > (Settings.NeerGuardianFrenziedHpPct ?? 75)) return false;
    // Pool charges — only consume one if we have at least 1 available; Spell.cast handles cooldown
    return true;
  }

  shouldBarkskin() {
    if (!me.inCombat()) return false;
    if (me.hasAura(auras.barkskin)) return false;
    if (!Settings.NeerGuardianBarkskinOnCd) return false;
    return combat.targets.some(t => me.isWithinMeleeRange(t));
  }

  shouldSurvivalInstincts() {
    if (!me.inCombat()) return false;
    if (me.hasAura(auras.survivalInstincts)) return false;
    return me.pctHealth <= (Settings.NeerGuardianSurvivalHpPct ?? 35);
  }

  shouldOffensiveCd() {
    if (!Settings.NeerGuardianUseIncarn) return false;
    if (!me.inCombat()) return false;
    return combat.targets.some(t => me.isWithinMeleeRange(t));
  }

  shouldRageOfSleeper() {
    if (!Settings.NeerGuardianUseRageOfSleeper) return false;
    if (!me.inCombat()) return false;
    if (me.hasAura(auras.rageOfTheSleeper)) return false;
    return combat.targets.some(t => me.isWithinMeleeRange(t));
  }

  shouldLunarBeam() {
    if (!Settings.NeerGuardianUseLunarBeam) return false;
    if (!me.inCombat()) return false;
    if (me.isMoving()) return false;
    // Drop on the player — beam follows you; want enemies inside it (Boundless Moonlight leech)
    return combat.targets.some(t => me.distanceTo(t) <= 10);
  }

  shouldMaul() {
    if (!me.hasAura(auras.bearForm)) return false;
    const target = combat.bestTarget;
    if (!target || !me.isWithinMeleeRange(target)) return false;
    return me.powerByType(PowerType.Rage) >= (Settings.NeerGuardianMaulRage ?? 80);
  }

  shouldThrash() {
    if (spell.getChargesFractional("Thrash") >= 1.7) return true;
    const target = combat.bestTarget;
    if (!target || !me.isWithinMeleeRange(target)) return false;
    const dot = target.getAuraByMe(auras.thrashBear);
    return !dot || dot.remaining < 3000;
  }

  // Galactic Guardian gives a free instant Moonfire (and +rage in EC builds);
  // otherwise apply/refresh Moonfire on a target whose DoT is missing or pandemic-window.
  findMoonfireTarget() {
    if (me.hasAura(auras.galacticGuardian)) {
      return combat.bestTarget;
    }
    return combat.targets.find(t => {
      if (!me.isFacing(t)) return false;
      if (me.distanceTo(t) > 40) return false;
      const dot = t.getAuraByMe(auras.moonfire);
      return !dot || dot.remaining < 4000;
    });
  }

  findTauntTarget() {
    return combat.targets.find(t => t.target && !t.isTanking() && me.distanceTo(t) <= 30);
  }

  meleeTargetCount() {
    return combat.targets.filter(t => me.isWithinMeleeRange(t)).length;
  }
}
