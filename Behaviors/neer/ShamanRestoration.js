import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import objMgr, { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import { defaultHealTargeting as heal } from "@/Targeting/HealTargeting";
import Settings from "@/Core/Settings";
import { DispelPriority } from "@/Data/Dispels";
import { WoWDispelType } from "@/Enums/Auras";

const auras = {
  waterShield: 52127,
  earthShield: 974,
  earthShieldSelf: 383648,
  elementalOrbit: 383010,
  riptide: 61295,
  ghostWolf: 2645,
  ascendance: 114052,
  earthlivingWeapon: 382022,
  astralShift: 108271,
  skyfury: 462854,
};

// Spell-cast ids compared against the in-progress cast (currentCastOrChannel.cast).
const spells = {
  healingWave: 77472,
  chainHeal: 1064,
};

export class ShamanRestorationBehavior extends Behavior {
  name = "Shaman [Restoration]";
  context = BehaviorContext.Any;
  specialization = Specialization.Shaman.Restoration;

  static settings = [
    { type: "slider", uid: "NeerRestoRiptideThreshold", text: "Riptide Threshold (%)", min: 0, max: 100, default: 95 },
    { type: "slider", uid: "NeerRestoHealingWaveThreshold", text: "Healing Wave Threshold (%)", min: 0, max: 100, default: 80 },
    { type: "slider", uid: "NeerRestoChainHealThreshold", text: "Chain Heal Threshold (%)", min: 0, max: 100, default: 75 },
    { type: "slider", uid: "NeerRestoChainHealMinTargets", text: "Chain Heal Min Injured", min: 2, max: 5, default: 3 },
    { type: "slider", uid: "NeerRestoHealingStreamTotemHp", text: "Healing Stream Totem HP% (drop when ally below)", min: 0, max: 100, default: 90 },
    { type: "slider", uid: "NeerRestoOverhealStopPct", text: "Overheal Stop Threshold (%)", min: 50, max: 100, default: 100 },
    { type: "slider", uid: "NeerRestoAscendanceThreshold", text: "Ascendance HP% (counts as injured)", min: 0, max: 100, default: 70 },
    { type: "slider", uid: "NeerRestoAscendanceMinTargets", text: "Ascendance min injured allies", min: 1, max: 10, default: 3 },
    { type: "slider", uid: "NeerRestoAstralShiftPct", text: "Astral Shift HP% (self defensive)", min: 0, max: 100, default: 40 },
    { type: "slider", uid: "NeerRestoUnleashLifePct", text: "Unleash Life HP% (lowest ally)", min: 0, max: 100, default: 85 },
    { type: "checkbox", uid: "NeerRestoEarthlivingWeapon", text: "Keep Earthliving Weapon imbue (out of combat)", default: true },
    { type: "checkbox", uid: "NeerRestoPurge", text: "Purge enemy Magic buffs (needs Dispel Mode on)", default: false },
  ];

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      new bt.Decorator(
        () => this.shouldStopOverheal(),
        new bt.Action(() => {
          me.stopCasting();
          return bt.Status.Success;
        })
      ),
      spell.interrupt("Wind Shear", false),
      // Astral Shift — off-GCD personal defensive; fire even while mid-cast.
      spell.cast("Astral Shift", on => me, req => this.shouldAstralShift()),
      common.waitForCastOrChannel(),

      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Water Shield", on => me, req =>
            !me.hasAura(auras.waterShield) && !me.hasAura(auras.ghostWolf)
          ),
          // Earthliving Weapon — keep the healing imbue up; apply only out of combat.
          spell.cast("Earthliving Weapon", on => me, req =>
            (Settings.NeerRestoEarthlivingWeapon ?? true) && !me.inCombat() && !me.hasAura(auras.earthlivingWeapon)
          ),
          // Skyfury — keep the group buff up (caster form only).
          spell.cast("Skyfury", on => me, req =>
            !me.hasAura(auras.skyfury) && !me.hasAura(auras.ghostWolf)
          ),
          spell.cast("Earth Shield", on => me, req =>
            me.hasAura(auras.elementalOrbit) &&
            !this.hasEarthShield(me) &&
            !me.hasAura(auras.ghostWolf)
          ),
          spell.cast("Earth Shield", on => this.getTankNeedingEarthShield(), req =>
            this.getTankNeedingEarthShield() !== null && !me.hasAura(auras.ghostWolf)
          ),
          spell.cast("Ghost Wolf", on => me, req =>
            me.isMoving() && !me.inCombat() && !me.hasAura(auras.ghostWolf)
          ),
          spell.dispel("Purify Spirit", true, DispelPriority.Low, false, WoWDispelType.Magic, WoWDispelType.Curse),
          // Ascendance — raid-wide healing CD; press when several allies are hurt (AoE damage).
          spell.cast("Ascendance", on => me, req =>
            me.inCombat() &&
            !me.hasAura(auras.ascendance) &&
            this.injuredAllyCount(Settings.NeerRestoAscendanceThreshold ?? 70) >= (Settings.NeerRestoAscendanceMinTargets ?? 3)
          ),
          new bt.Sequence(
            spell.cast("Healing Stream Totem", on => me, req =>
              !this.isTotemActive("Healing Stream Totem") &&
              (this.getLowestAlly()?.effectiveHealthPercent ?? 100) <= (Settings.NeerRestoHealingStreamTotemHp ?? 90) &&
              combat.targets.length > 0
            ),
            new bt.Action(() => {
              const ally = this.getLowestAlly();
              const hp = ally ? ally.effectiveHealthPercent.toFixed(1) : "n/a";
              const name = ally ? (ally.unsafeName || "unknown") : "n/a";
              console.info(`[NeerResto] Cast HST | lowest ally: ${name} @ ${hp}%`);
              return bt.Status.Success;
            })
          ),
          // Unleash Life — instant heal that amplifies the next heal; cast first so the buff carries.
          spell.cast("Unleash Life", on => this.getUnleashLifeTarget(), req => this.getUnleashLifeTarget() !== null),
          spell.cast("Riptide", on => this.getRiptideTarget(), req => this.getRiptideTarget() !== null),
          spell.cast("Chain Heal", on => this.getChainHealTarget(), req => this.getChainHealTarget() !== null),
          spell.cast("Healing Wave", on => this.getHealingWaveTarget(), req => this.getHealingWaveTarget() !== null),

          // Purge — strip a Magic buff off an enemy. Opt-in; also gated by Dispel Mode.
          // Picks its own enemy target internally, so it sits ahead of the target gate.
          new bt.Decorator(
            () => Settings.NeerRestoPurge ?? false,
            spell.dispel("Purge", false, DispelPriority.Low, false, WoWDispelType.Magic)
          ),

          spell.cast("Chain Lightning", on => this.getChainLightningTarget(), req => this.getChainLightningTarget() !== null),
          spell.cast("Lightning Bolt", on => this.getTarget(), req => this.getTarget() !== null)
        )
      )
    );
  }

  _cacheFrame = -1;
  _cachedAllies = null;
  _cachedLowestAlly = undefined;
  _cachedTank = undefined;
  _cachedChainLightning = undefined;
  _cachedTarget = undefined;

  _refreshCache() {
    if (this._cacheFrame === wow.frameTime) return;
    this._cacheFrame = wow.frameTime;
    this._cachedAllies = null;
    this._cachedLowestAlly = undefined;
    this._cachedTank = undefined;
    this._cachedChainLightning = undefined;
    this._cachedTarget = undefined;
  }

  getValidAllies() {
    this._refreshCache();
    if (this._cachedAllies !== null) return this._cachedAllies;
    this._cachedAllies = (heal.priorityList || []).filter(a =>
      a && a.effectiveHealthPercent > 0 && me.withinLineOfSight(a) && me.distanceTo(a) <= 40
    );
    return this._cachedAllies;
  }

  getLowestAlly() {
    this._refreshCache();
    if (this._cachedLowestAlly !== undefined) return this._cachedLowestAlly;
    const list = this.getValidAllies();
    this._cachedLowestAlly = list.length === 0
      ? null
      : list.reduce((lo, a) => (a.effectiveHealthPercent < lo.effectiveHealthPercent ? a : lo), list[0]);
    return this._cachedLowestAlly;
  }

  hasEarthShield(unit) {
    if (!unit) return false;
    return unit.hasAura(auras.earthShield) || unit.hasAura(auras.earthShieldSelf);
  }

  getTankNeedingEarthShield() {
    this._refreshCache();
    if (this._cachedTank !== undefined) return this._cachedTank;
    const tanks = (heal.friends.Tanks || []).filter(t => t);
    const eligible = t => t.guid && !t.guid.equals(me.guid) && !this.hasEarthShield(t) &&
      me.withinLineOfSight(t) && me.distanceTo(t) <= 40;
    this._cachedTank = tanks.find(t => eligible(t) && t.isTanking()) || tanks.find(eligible) || null;
    return this._cachedTank;
  }

  shouldAstralShift() {
    if (!me.inCombat()) return false;
    if (me.hasAura(auras.astralShift)) return false;
    return me.effectiveHealthPercent <= (Settings.NeerRestoAstralShiftPct ?? 40);
  }

  getUnleashLifeTarget() {
    const ally = this.getLowestAlly();
    if (!ally) return null;
    return ally.effectiveHealthPercent <= (Settings.NeerRestoUnleashLifePct ?? 85) ? ally : null;
  }

  getRiptideTarget() {
    const list = this.getValidAllies();
    return list.find(a =>
      a.effectiveHealthPercent <= Settings.NeerRestoRiptideThreshold && !a.hasAuraByMe(auras.riptide)
    ) || null;
  }

  getHealingWaveTarget() {
    const ally = this.getLowestAlly();
    if (!ally) return null;
    return ally.effectiveHealthPercent <= Settings.NeerRestoHealingWaveThreshold ? ally : null;
  }

  getChainLightningTarget() {
    this._refreshCache();
    if (this._cachedChainLightning !== undefined) return this._cachedChainLightning;
    this._cachedChainLightning = combat.targets.find(t =>
      me.isFacing(t) && me.distanceTo(t) <= 40 && combat.getUnitsAroundUnit(t, 10).length >= 2
    ) || null;
    return this._cachedChainLightning;
  }

  // Facing, in-range (40yd) enemy for our filler nukes; prefers the combat best
  // target, else the first reachable one. Cached per frame.
  getTarget() {
    this._refreshCache();
    if (this._cachedTarget !== undefined) return this._cachedTarget;
    const inRange = t => me.distanceTo(t) <= 40;
    const best = combat.bestTarget;
    if (best && me.isFacing(best) && inRange(best)) {
      this._cachedTarget = best;
    } else {
      this._cachedTarget = combat.targets.find(t => me.isFacing(t) && inRange(t)) || null;
    }
    return this._cachedTarget;
  }

  isTotemActive(totemName) {
    const ti = wow.GameUI.totemInfo;
    if (!ti) return false;
    for (let i = 0; i <= 6; i++) {
      const info = ti[i];
      if (info && info.name === totemName) return true;
    }
    return false;
  }

  injuredAllyCount(pct) {
    return this.getValidAllies().filter(a => a.effectiveHealthPercent <= pct).length;
  }

  // Cancel a hard-cast Healing Wave / Chain Heal whose target has been topped past
  // the overheal threshold. Identify the cast by spell id (SpellInfo has no name /
  // timeleft fields) and derive remaining time from castEnd.
  shouldStopOverheal() {
    const info = me.currentCastOrChannel;
    if (!info) return false;
    if (info.cast !== spells.healingWave && info.cast !== spells.chainHeal) return false;
    if (info.castEnd - wow.frameTime < 400) return false;
    const guid = info.spellTargetGuid;
    if (!guid || guid.isNull) return false;
    const target = objMgr.findObject(guid);
    if (!target) return false;
    return target.effectiveHealthPercent >= (Settings.NeerRestoOverhealStopPct ?? 100);
  }

  getChainHealTarget() {
    const list = this.getValidAllies();
    const injured = list.filter(a => a.effectiveHealthPercent <= Settings.NeerRestoChainHealThreshold);
    if (injured.length < Settings.NeerRestoChainHealMinTargets) return null;
    return injured.reduce((lo, a) => (a.effectiveHealthPercent < lo.effectiveHealthPercent ? a : lo), injured[0]);
  }

}
