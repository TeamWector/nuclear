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
    { type: "slider", uid: "NeerRestoOverhealStopPct", text: "Overheal Stop Threshold (%)", min: 50, max: 100, default: 100 },
    { type: "slider", uid: "NeerRestoAscendanceThreshold", text: "Ascendance Threshold (%)", min: 0, max: 100, default: 40 },
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
      common.waitForCastOrChannel(),

      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Water Shield", on => me, req =>
            !me.hasAura(auras.waterShield) && !me.hasAura(auras.ghostWolf)
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
          spell.dispel("Purify Spirit", true, DispelPriority.Low, false, WoWDispelType.Magic),
          spell.dispel("Purify Spirit", true, DispelPriority.Low, false, WoWDispelType.Curse),
          spell.cast("Ascendance", on => me, req =>
            me.inCombat() &&
            !me.hasAura(auras.ascendance) &&
            (this.getLowestAlly()?.effectiveHealthPercent ?? 100) <= Settings.NeerRestoAscendanceThreshold
          ),
          new bt.Sequence(
            spell.cast("Healing Stream Totem", on => me, req =>
              !this.isTotemActive("Healing Stream Totem") &&
              this.anyAllyInjured() &&
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
          spell.cast("Riptide", on => this.getRiptideTarget(), req => this.getRiptideTarget() !== null),
          spell.cast("Chain Heal", on => this.getChainHealTarget(), req => this.getChainHealTarget() !== null),
          spell.cast("Healing Wave", on => this.getHealingWaveTarget(), req => this.getHealingWaveTarget() !== null),

          common.waitForTarget(),
          common.waitForFacing(),
          spell.cast("Chain Lightning", on => this.getChainLightningTarget(), req => this.getChainLightningTarget() !== null),
          spell.cast("Lightning Bolt", on => combat.bestTarget)
        )
      )
    );
  }

  hasEarthShield(unit) {
    if (!unit) return false;
    return unit.hasAura(auras.earthShield) || unit.hasAura(auras.earthShieldSelf);
  }

  getTankNeedingEarthShield() {
    const tanks = (heal.friends.Tanks || []).filter(t => t);
    const active = tanks.find(t =>
      t.guid && !t.guid.equals(me.guid) && t.isTanking() &&
      !this.hasEarthShield(t) && me.withinLineOfSight(t) && me.distanceTo(t) <= 40
    );
    if (active) return active;
    return tanks.find(t =>
      t.guid && !t.guid.equals(me.guid) &&
      !this.hasEarthShield(t) && me.withinLineOfSight(t) && me.distanceTo(t) <= 40
    ) || null;
  }

  getLowestAlly() {
    const list = (heal.priorityList || []).filter(a =>
      a && a.effectiveHealthPercent > 0 && me.withinLineOfSight(a) && me.distanceTo(a) <= 40
    );
    if (list.length === 0) return null;
    return list.reduce((lo, a) => (a.effectiveHealthPercent < lo.effectiveHealthPercent ? a : lo), list[0]);
  }

  getRiptideTarget() {
    const list = (heal.priorityList || []).filter(a =>
      a && a.effectiveHealthPercent > 0 && me.withinLineOfSight(a) && me.distanceTo(a) <= 40
    );
    const injured = list.find(a =>
      a.effectiveHealthPercent <= Settings.NeerRestoRiptideThreshold && !a.hasAuraByMe(auras.riptide)
    );
    return injured || null;
  }

  getHealingWaveTarget() {
    const ally = this.getLowestAlly();
    if (!ally) return null;
    return ally.effectiveHealthPercent <= Settings.NeerRestoHealingWaveThreshold ? ally : null;
  }

  getChainLightningTarget() {
    return combat.targets.find(t => combat.getUnitsAroundUnit(t, 10).length >= 2) || null;
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

  anyAllyInjured() {
    const ally = this.getLowestAlly();
    return ally !== null && ally.effectiveHealthPercent < 100;
  }

  shouldStopOverheal() {
    if (!me.isCastingOrChanneling) return false;
    const cur = me.currentCastOrChannel;
    if (!cur || cur.timeleft < 400) return false;
    if (cur.name !== "Healing Wave" && cur.name !== "Chain Heal") return false;
    const guid = cur.spellTargetGuid;
    if (!guid || guid.isNull) return false;
    const target = objMgr.findObject(guid);
    if (!target) return false;
    return target.effectiveHealthPercent >= Settings.NeerRestoOverhealStopPct;
  }

  getChainHealTarget() {
    const list = (heal.priorityList || []).filter(a =>
      a && a.effectiveHealthPercent > 0 && me.withinLineOfSight(a) && me.distanceTo(a) <= 40
    );
    const injured = list.filter(a => a.effectiveHealthPercent <= Settings.NeerRestoChainHealThreshold);
    if (injured.length < Settings.NeerRestoChainHealMinTargets) return null;
    return injured.reduce((lo, a) => (a.effectiveHealthPercent < lo.effectiveHealthPercent ? a : lo), injured[0]);
  }

}
