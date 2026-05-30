import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import { PowerType } from "@/Enums/PowerType";
import Settings from "@/Core/Settings";

/*
 * Basic (leveling) Guardian Druid bear tank. Scoped to the low-level kit:
 * Bear Form, Growl, Mangle, Thrash, Swipe, Maul, Ironfur, Frenzied
 * Regeneration, Moonfire (+ Mark of the Wild). Everything is cast by name, so
 * anything not yet learned simply falls through.
 *
 * Priority:
 *   Off-GCD / reactive — Growl (taunt) > Frenzied Regen (heal) > Ironfur
 *     (physical mitigation) > Bear Form (maintain).
 *   GCD rotation — Mangle (builder) > Thrash (builder + AoE DoT) > Swipe
 *     (AoE filler) > Maul (rage dump) > Moonfire (DoT / ranged filler).
 *
 * Ironfur is checked before Maul's high rage gate, so mitigation always gets
 * first claim on rage and Maul only dumps the surplus.
 */
const auras = {
  bearForm: 5487,
  ironfur: 192081,
  moonfire: 164812,
  markOfTheWild: 1126,
  frenziedRegeneration: 22842,
};

export class DruidGuardianBehavior extends Behavior {
  name = "Druid [Guardian]";
  context = BehaviorContext.Any;
  specialization = Specialization.Druid.Guardian;

  static settings = [
    {
      header: "Survival",
      options: [
        { type: "slider", uid: "NeerGuardianFrenzied2ChargeHpPct", text: "Frenzied Regen HP% (both charges up)", min: 20, max: 95, default: 75 },
        { type: "slider", uid: "NeerGuardianFrenzied1ChargeHpPct", text: "Frenzied Regen HP% (last charge)", min: 20, max: 95, default: 50 },
        { type: "slider", uid: "NeerGuardianIronfurMinRage", text: "Ironfur min rage", min: 10, max: 80, default: 40 },
      ],
    },
    {
      header: "Rotation",
      options: [
        { type: "slider", uid: "NeerGuardianMaulRage", text: "Maul min rage (rage dump)", min: 30, max: 100, default: 80 },
        { type: "slider", uid: "NeerGuardianSwipeMinTargets", text: "Swipe min targets (AoE)", min: 2, max: 8, default: 2 },
        { type: "checkbox", uid: "NeerGuardianMarkOfTheWild", text: "Keep Mark of the Wild up (out of combat)", default: true },
      ],
    },
  ];

  _cacheFrame = -1;
  _cachedMelee = undefined;
  _cached40 = undefined;

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      common.waitForCastOrChannel(),
      new bt.Action(() => me.deadOrGhost ? bt.Status.Success : bt.Status.Failure),

      // --- Off-GCD / reactive ---
      // Growl — taunt a mob that isn't on a tank yet.
      spell.cast("Growl", on => this.findTauntTarget(), req => this.findTauntTarget() !== null),
      // Frenzied Regeneration — emergency self-heal.
      spell.cast("Frenzied Regeneration", on => me, req => this.shouldFrenziedRegen()),
      // Ironfur — maintain physical mitigation while taking melee hits.
      spell.cast("Ironfur", on => me, req => this.shouldIronfur()),

      // Form maintenance.
      spell.cast("Bear Form", on => me, req => !me.hasAura(auras.bearForm)),
      // Mark of the Wild — caster-form buff, only worth it out of combat (idle).
      spell.cast("Mark of the Wild", on => me, req =>
        (Settings.NeerGuardianMarkOfTheWild ?? true) && !me.inCombat() && !me.hasAura(auras.markOfTheWild)),

      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          // Thrash — highest damage priority, always on cooldown. PBAoE around us, so
          // no target/facing needed; just fire whenever an enemy is nearby.
          spell.cast("Thrash", on => me, req => combat.targets.some(t => me.isWithinMeleeRange(t))),

          common.waitForTarget(),
          common.waitForFacing(),
          common.ensureAutoAttack(),

          // Mangle — primary rage builder + threat, on cooldown.
          spell.cast("Mangle", on => this.getTarget(), req => this.getTarget() !== null),
          // Swipe — cheap AoE filler when several enemies are in melee.
          spell.cast("Swipe", on => this.getTarget(), req => this.meleeTargetCount() >= (Settings.NeerGuardianSwipeMinTargets ?? 2)),
          // Maul — single-target rage dump once we're flush (won't starve Ironfur).
          spell.cast("Maul", on => this.getTarget(), req => this.shouldMaul()),
          // Moonfire — maintain the DoT (and pull / ranged filler).
          spell.cast("Moonfire", on => this.findMoonfireTarget(), req => this.findMoonfireTarget() !== null),
          spell.cast("Moonfire", on => this.getTarget(40), req => this.getTarget(40) !== null)
        )
      )
    );
  }

  // --- Survival ---

  // Two charges: spend freely at the higher HP%. Down to the last charge: hold it
  // for a lower HP% so we keep an emergency heal banked.
  shouldFrenziedRegen() {
    if (!me.inCombat()) return false;
    if (!me.hasAura(auras.bearForm)) return false;
    if (me.hasAura(auras.frenziedRegeneration)) return false;
    const charges = spell.getCharges("Frenzied Regeneration");
    if (charges < 1) return false;
    const threshold = charges >= 2
      ? (Settings.NeerGuardianFrenzied2ChargeHpPct ?? 75)
      : (Settings.NeerGuardianFrenzied1ChargeHpPct ?? 50);
    return me.pctHealth <= threshold;
  }

  // Maintain at least one Ironfur stack while in melee combat with rage to spare.
  shouldIronfur() {
    if (!me.inCombat()) return false;
    if (!me.hasAura(auras.bearForm)) return false;
    if (me.powerByType(PowerType.Rage) < (Settings.NeerGuardianIronfurMinRage ?? 40)) return false;
    if (!combat.targets.some(t => me.isWithinMeleeRange(t))) return false;
    const aura = me.getAura(auras.ironfur);
    return !aura || aura.remaining < 2000;
  }

  // --- Rotation helpers ---

  shouldMaul() {
    if (!me.hasAura(auras.bearForm)) return false;
    if (!this.getTarget()) return false;
    return me.powerByType(PowerType.Rage) >= (Settings.NeerGuardianMaulRage ?? 80);
  }

  // Facing + in-range enemy, preferring the combat best target; cached per frame.
  // distance omitted = melee range; otherwise within `distance` yards (e.g. 40 for Moonfire).
  getTarget(distance) {
    if (this._cacheFrame !== wow.frameTime) {
      this._cacheFrame = wow.frameTime;
      this._cachedMelee = undefined;
      this._cached40 = undefined;
    }
    if (distance === 40) {
      if (this._cached40 === undefined) this._cached40 = this._computeTarget(40);
      return this._cached40;
    }
    if (this._cachedMelee === undefined) this._cachedMelee = this._computeTarget(undefined);
    return this._cachedMelee;
  }

  _computeTarget(distance) {
    const inRange = distance === undefined
      ? (t => me.isWithinMeleeRange(t))
      : (t => me.distanceTo(t) <= distance);
    const best = combat.bestTarget;
    if (best && me.isFacing(best) && inRange(best)) return best;
    return combat.targets.find(t => me.isFacing(t) && inRange(t)) || null;
  }

  // Refresh Moonfire on a facing, in-range enemy whose DoT is missing or expiring.
  findMoonfireTarget() {
    return combat.targets.find(t => {
      if (!me.isFacing(t) || me.distanceTo(t) > 40) return false;
      const dot = t.getAuraByMe(auras.moonfire);
      return !dot || dot.remaining < 4000;
    }) || null;
  }

  // Taunt a mob that's attacking someone other than the active tank.
  findTauntTarget() {
    return combat.targets.find(t => t.target && !t.isTanking() && me.distanceTo(t) <= 30) || null;
  }

  meleeTargetCount() {
    return combat.targets.filter(t => me.isWithinMeleeRange(t)).length;
  }
}
