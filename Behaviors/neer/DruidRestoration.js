import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import objMgr, { me } from "@/Core/ObjectManager";
import { defaultHealTargeting as heal } from "@/Targeting/HealTargeting";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import Settings from "@/Core/Settings";
import { DispelPriority } from "@/Data/Dispels";
import { WoWDispelType } from "@/Enums/Auras";

/*
 * Basic Restoration Druid healer. Kit limited to the spells we have for now:
 * Lifebloom, Wild Growth, Rejuvenation, Regrowth, Swiftmend (+ Barkskin, Mark of
 * the Wild). Heals are driven off the shared heal-targeting priority list / tank
 * list. Damage filler is Wrath single-target, Starfire when enemies are clustered.
 */

// Aura ids we actually read (hasAura / getAuraByMe). Heals are cast by name.
const auras = {
  lifebloom: 33763,
  rejuvenation: 774,
  regrowth: 8936,
  wildGrowth: 48438,
  barkskin: 22812,
  markOfTheWild: 1126,
};

// Spell-cast ids compared against the in-progress cast (currentCastOrChannel.cast).
const spells = {
  regrowth: 8936,
};

// Radius (yds) Starfire splashes around its primary target — used to decide
// whether enemies are clustered enough to be worth the hard cast.
const STARFIRE_SPLASH = 8;

export class DruidRestorationBehavior extends Behavior {
  name = "Druid [Restoration]";
  context = BehaviorContext.Any;
  specialization = Specialization.Druid.Restoration;

  static settings = [
    {
      header: "Healing",
      options: [
        { type: "slider", uid: "NeerRestoSwiftmendHp", text: "Swiftmend HP% (instant emergency heal)", min: 0, max: 100, default: 50 },
        { type: "slider", uid: "NeerRestoRegrowthHp", text: "Regrowth HP% (urgent direct heal)", min: 0, max: 100, default: 65 },
        { type: "slider", uid: "NeerRestoRegrowthStopPct", text: "Stop Regrowth if target reaches HP% (overheal)", min: 50, max: 100, default: 95 },
        { type: "slider", uid: "NeerRestoRejuvHp", text: "Rejuvenation HP% (blanket HoT)", min: 0, max: 100, default: 90 },
        { type: "checkbox", uid: "NeerRestoPreHotTargeted", text: "Pre-HoT Rejuv on non-tank players enemies are targeting", default: true },
        { type: "slider", uid: "NeerRestoWildGrowthHp", text: "Wild Growth HP% (counts as injured)", min: 0, max: 100, default: 90 },
        { type: "slider", uid: "NeerRestoWildGrowthCount", text: "Wild Growth min injured allies", min: 1, max: 20, default: 3 },
        { type: "checkbox", uid: "NeerRestoLifebloomSelf", text: "Lifebloom self when no tank found", default: true },
      ],
    },
    {
      header: "Utility",
      options: [
        { type: "checkbox", uid: "NeerRestoMarkOfTheWild", text: "Keep Mark of the Wild up", default: true },
        { type: "slider", uid: "NeerRestoBarkskinHp", text: "Barkskin self HP%", min: 0, max: 100, default: 50 },
      ],
    },
    {
      header: "Damage",
      options: [
        { type: "checkbox", uid: "NeerRestoWrathFiller", text: "Cast Wrath as filler DPS when nothing to heal", default: true },
        { type: "checkbox", uid: "NeerRestoStarfire", text: "Cast Starfire on enemy clusters", default: true },
        { type: "slider", uid: "NeerRestoStarfireCluster", text: "Starfire min clustered enemies", min: 2, max: 10, default: 2 },
      ],
    },
  ];

  constructor() {
    super();
    this._cacheFrame = -1;
    this._alliesCache = null;
    this._targetCache = undefined;
  }

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),

      // Abort a Regrowth hard-cast that's about to overheal its target.
      new bt.Decorator(
        () => this.shouldStopOverheal(),
        new bt.Action(() => {
          me.stopCasting();
          return bt.Status.Success;
        })
      ),

      common.waitForCastOrChannel(),

      // Self-defensive (off the GCD)
      spell.cast("Barkskin", on => me, req => this.shouldBarkskin()),

      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          // Swiftmend — instant emergency heal; needs a Rejuv/Regrowth/Wild Growth HoT present.
          // skipUsableCheck: spell.isUsable reflects the *current* target's HoT, not our chosen
          // swiftmendTarget(); we already require a qualifying HoT in the target helper.
          spell.cast("Swiftmend", on => this.swiftmendTarget(), req => this.swiftmendTarget() !== null, { skipUsableCheck: true }),
          // Nature's Cure — removes Magic, Curse, and Poison (gated by General → Dispel Mode).
          spell.dispel("Nature's Cure", true, DispelPriority.Low, false, WoWDispelType.Magic, WoWDispelType.Curse, WoWDispelType.Poison),
          // Wild Growth — instant AoE when several allies are hurt.
          spell.cast("Wild Growth", on => this.wildGrowthTarget(), req => this.wildGrowthTarget() !== null),
          // Regrowth — urgent single-target direct heal (the only hard-cast here).
          spell.cast("Regrowth", on => this.regrowthTarget(), req => this.regrowthTarget() !== null),
          // Lifebloom — keep one rolling on the tank (or self).
          spell.cast("Lifebloom", on => this.lifebloomTarget(), req => this.lifebloomTarget() !== null),
          // Rejuvenation — blanket HoT on injured allies missing it.
          spell.cast("Rejuvenation", on => this.rejuvenationTarget(), req => this.rejuvenationTarget() !== null),
          // Pre-HoT — Rejuv a non-tank player an enemy is targeting (incoming damage).
          spell.cast("Rejuvenation", on => this.preHotTarget(), req => this.preHotTarget() !== null),
          // Mark of the Wild — on the GCD, so keep it up only out of combat (idle).
          spell.cast("Mark of the Wild", on => me, req =>
            (Settings.NeerRestoMarkOfTheWild ?? true) && !me.inCombat() && !me.hasAura(auras.markOfTheWild)),

          // Damage filler when there's nothing left to heal.
          new bt.Decorator(
            ret => combat.targets.length > 0,
            new bt.Selector(
              common.waitForTarget(),
              common.waitForFacing(),
              // Starfire — AoE-leaning nuke aimed at the densest enemy cluster.
              spell.cast("Starfire", on => this.starfireTarget(), req => this.starfireTarget() !== null),
              // Wrath — single-target filler.
              spell.cast("Wrath", on => this.getTarget(), req =>
                (Settings.NeerRestoWrathFiller ?? true) && this.getTarget() !== null)
            )
          )
        )
      )
    );
  }

  // --- Ally selection (cached per frame) ---

  getValidAllies() {
    if (this._cacheFrame !== wow.frameTime) {
      this._cacheFrame = wow.frameTime;
      this._alliesCache = (heal.priorityList || []).filter(a =>
        a && a.effectiveHealthPercent > 0 && me.withinLineOfSight(a) && me.distanceTo(a) <= 40
      );
    }
    return this._alliesCache;
  }

  getLowestAlly() {
    const list = this.getValidAllies();
    if (list.length === 0) return null;
    return list.reduce((lo, a) => (a.effectiveHealthPercent < lo.effectiveHealthPercent ? a : lo), list[0]);
  }

  getTank() {
    return heal.friends.Tanks?.[0] || null;
  }

  // --- Heal target helpers ---

  // Cast on the lowest injured ally; Wild Growth smart-heals the group around them.
  wildGrowthTarget() {
    const hpPct = Settings.NeerRestoWildGrowthHp ?? 90;
    const need = Settings.NeerRestoWildGrowthCount ?? 3;
    const injured = this.getValidAllies().filter(a => a.effectiveHealthPercent <= hpPct);
    if (injured.length < need) return null;
    return injured.reduce((lo, a) => (a.effectiveHealthPercent < lo.effectiveHealthPercent ? a : lo), injured[0]);
  }

  regrowthTarget() {
    const ally = this.getLowestAlly();
    if (!ally) return null;
    return ally.effectiveHealthPercent <= (Settings.NeerRestoRegrowthHp ?? 65) ? ally : null;
  }

  // Keep exactly one Lifebloom rolling; refresh inside its ~4.5s pandemic window.
  lifebloomTarget() {
    const target = this.getTank() || ((Settings.NeerRestoLifebloomSelf ?? true) ? me : null);
    if (!target) return null;
    const lb = target.getAuraByMe(auras.lifebloom);
    return (!lb || lb.remaining < 4500) ? target : null;
  }

  // Blanket Rejuvenation onto a hurt ally that doesn't already have ours.
  rejuvenationTarget() {
    const hpPct = Settings.NeerRestoRejuvHp ?? 90;
    return this.getValidAllies().find(a =>
      a.effectiveHealthPercent <= hpPct && !a.hasAuraByMe(auras.rejuvenation)
    ) || null;
  }

  // Pre-HoT: a non-tank player that an enemy we're fighting is targeting, and who
  // doesn't already have our Rejuvenation. Ramps healing ahead of incoming damage.
  preHotTarget() {
    if (!(Settings.NeerRestoPreHotTargeted ?? true)) return null;
    const tank = this.getTank();
    return this.getValidAllies().find(a =>
      a.isPlayer() &&
      (!tank || !a.guid.equals(tank.guid)) &&
      !a.hasAuraByMe(auras.rejuvenation) &&
      combat.targets.some(e => e?.target && e.target.equals(a.guid))
    ) || null;
  }

  // Swiftmend the lowest ally below the threshold that carries one of our HoTs
  // (Swiftmend requires a Rejuvenation, Regrowth, or Wild Growth to consume).
  swiftmendTarget() {
    const hpPct = Settings.NeerRestoSwiftmendHp ?? 50;
    const candidates = this.getValidAllies().filter(a =>
      a.effectiveHealthPercent <= hpPct &&
      (a.hasAuraByMe(auras.rejuvenation) || a.hasAuraByMe(auras.regrowth) || a.hasAuraByMe(auras.wildGrowth))
    );
    if (candidates.length === 0) return null;
    return candidates.reduce((lo, a) => (a.effectiveHealthPercent < lo.effectiveHealthPercent ? a : lo), candidates[0]);
  }

  // --- Damage target (Wrath, 40yd) ---

  // Prefer the combat best target when we're already facing it and it's in range;
  // otherwise fall back to any reachable enemy. Cached per frame.
  getTarget() {
    if (this._targetCache !== undefined && this._targetFrame === wow.frameTime) {
      return this._targetCache;
    }
    this._targetFrame = wow.frameTime;
    const inRange = t => me.distanceTo(t) <= 40;
    const best = combat.bestTarget;
    if (best && me.isFacing(best) && inRange(best)) {
      this._targetCache = best;
    } else {
      this._targetCache = combat.targets.find(t => me.isFacing(t) && inRange(t)) || best || null;
    }
    return this._targetCache;
  }

  // Pick the reachable enemy with the largest enemy cluster around it, when that
  // cluster meets the configured minimum (>1). null → no worthwhile Starfire.
  starfireTarget() {
    if (!(Settings.NeerRestoStarfire ?? true)) return null;
    const need = Settings.NeerRestoStarfireCluster ?? 2;
    let best = null;
    let bestCount = 0;
    for (const t of combat.targets) {
      if (!me.isFacing(t) || me.distanceTo(t) > 40) continue;
      const count = combat.getUnitsAroundUnit(t, STARFIRE_SPLASH).length;
      if (count >= need && count > bestCount) {
        best = t;
        bestCount = count;
      }
    }
    return best;
  }

  // Stop our Regrowth if its target has been topped past the overheal breakpoint
  // (e.g. HoTs/other healers caught up while we were casting).
  shouldStopOverheal() {
    const info = me.currentCastOrChannel;
    if (!info || info.cast !== spells.regrowth) return false;
    // Leave the tail of the cast alone — too late to save meaningful throughput.
    if (info.castEnd - wow.frameTime < 400) return false;
    const guid = info.spellTargetGuid;
    if (!guid || guid.isNull) return false;
    const target = objMgr.findObject(guid);
    if (!target) return false;
    return target.effectiveHealthPercent >= (Settings.NeerRestoRegrowthStopPct ?? 95);
  }

  shouldBarkskin() {
    if (!me.inCombat()) return false;
    if (me.hasAura(auras.barkskin)) return false;
    return me.pctHealth <= (Settings.NeerRestoBarkskinHp ?? 50);
  }
}
