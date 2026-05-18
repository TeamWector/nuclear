import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import objMgr, { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import { defaultHealTargeting as heal } from "@/Targeting/HealTargeting";
import Settings from '@/Core/Settings';

export class ShamanRestorationBehavior extends Behavior {
  name = "[Rejiko] Restoration Shaman";
  context = BehaviorContext.Any;
  specialization = Specialization.Shaman.Restoration;
  static settings = [
    {
      header: "Healing",
      options: [
        { type: "slider", uid: "ShamanRestoRiptideHP", text: "Riptide (HP %)", min: 1, max: 100, default: 85 },
        { type: "slider", uid: "ShamanRestoHealingWaveHP", text: "Healing Wave (HP %)", min: 1, max: 100, default: 70 },
        { type: "slider", uid: "ShamanRestoChainHealHP", text: "Chain Heal count below (HP %)", min: 1, max: 100, default: 80 },
        { type: "slider", uid: "ShamanRestoChainHealTargets", text: "Chain Heal min targets", min: 2, max: 5, default: 3 },
        { type: "checkbox", uid: "ShamanRestoEarthShield", text: "Earth Shield on tank", default: true },
        { type: "checkbox", uid: "ShamanRestoHealingStreamTotem", text: "Healing Stream Totem (in combat)", default: true },
        { type: "checkbox", uid: "ShamanRestoAncestralVision", text: "Mass rez (Ancestral Vision) out of combat", default: true },
      ]
    },
    {
      header: "Filler",
      options: [
        { type: "checkbox", uid: "ShamanRestoDPSFiller", text: "DPS when nobody needs healing", default: true },
        { type: "slider", uid: "ShamanRestoDPSStopHP", text: "Stop DPS if anyone below (HP %)", min: 1, max: 100, default: 95 },
      ]
    }
  ];

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      spell.cast("Water Shield", on => me, req =>
        !me.hasAuraByMe("Water Shield") && !me.hasAuraByMe("Ghost Wolf")
      ),
      common.waitForCastOrChannel(),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Ancestral Vision", on => me, req => this.shouldMassRez()),
          spell.cast("Earth Shield", on => this.earthShieldTarget()),
          spell.cast("Healing Stream Totem", on => me, req => this.shouldDropHealingStream()),
          spell.cast("Riptide", on => this.riptideTarget()),
          spell.cast("Chain Heal", on => this.chainHealTarget()),
          spell.cast("Healing Wave", on => this.healingWaveTarget()),
          spell.cast("Ghost Wolf", on => me, req => this.shouldGhostWolf()),
          this.fillerDPS()
        )
      )
    );
  }

  earthShieldTarget() {
    if (!Settings.ShamanRestoEarthShield) return null;
    for (const tank of heal.friends.Tanks) {
      if (tank.deadOrGhost || me.distanceTo(tank) > 40) continue;
      if (!tank.hasAuraByMe("Earth Shield")) return tank;
    }
    return null;
  }

  shouldDropHealingStream() {
    if (!Settings.ShamanRestoHealingStreamTotem) return false;
    if (!me.inCombat()) return false;
    if (this.isTotemActive("Healing Stream Totem")) return false;
    return combat.targets.some(t => me.distanceTo(t) <= 40);
  }

  isTotemActive(name) {
    if (!wow.GameUI.totemInfo) return false;
    for (let i = 1; i <= 6; i++) {
      const info = wow.GameUI.totemInfo[i];
      if (info && info.name === name) return true;
    }
    return false;
  }

  shouldGhostWolf() {
    if (me.inCombat()) return false;
    if (!me.isMoving()) return false;
    if (me.hasAuraByMe("Ghost Wolf")) return false;
    for (const u of heal.priorityList) {
      if (me.distanceTo(u) <= 40 && u.predictedHealthPercent < Settings.ShamanRestoDPSStopHP) return false;
    }
    return true;
  }

  shouldMassRez() {
    if (!Settings.ShamanRestoAncestralVision) return false;
    if (me.inCombat()) return false;
    const party = me.currentParty;
    if (!party) return false;
    for (const pm of party.members) {
      const u = objMgr.findObject(pm.guid);
      if (u && u.deadOrGhost && me.distanceTo(u) <= 40) return true;
    }
    return false;
  }

  riptideTarget() {
    for (const u of heal.priorityList) {
      if (u.predictedHealthPercent <= Settings.ShamanRestoRiptideHP &&
          !u.hasAuraByMe("Riptide")) {
        return u;
      }
    }
    return null;
  }

  healingWaveTarget() {
    const t = heal.getPriorityTarget();
    if (t && t.predictedHealthPercent <= Settings.ShamanRestoHealingWaveHP) return t;
    return null;
  }

  chainHealTarget() {
    let best = null;
    let bestCount = 0;
    for (const u of heal.priorityList) {
      if (u.predictedHealthPercent > Settings.ShamanRestoChainHealHP) continue;
      let count = 0;
      for (const other of heal.priorityList) {
        if (other.predictedHealthPercent <= Settings.ShamanRestoChainHealHP &&
            u.distanceTo(other) <= 20) {
          count++;
        }
      }
      if (count > bestCount) {
        best = u;
        bestCount = count;
      }
    }
    return bestCount >= Settings.ShamanRestoChainHealTargets ? best : null;
  }

  fillerDPS() {
    return new bt.Decorator(
      () => {
        if (!Settings.ShamanRestoDPSFiller) return false;
        if (!combat.bestTarget) return false;
        for (const u of heal.priorityList) {
          if (u.predictedHealthPercent < Settings.ShamanRestoDPSStopHP) return false;
        }
        return true;
      },
      new bt.Selector(
        common.waitForFacing(),
        spell.cast("Chain Lightning", on => combat.bestTarget, req => combat.targets.length >= 2),
        spell.cast("Lightning Bolt", on => combat.bestTarget)
      )
    );
  }
}
