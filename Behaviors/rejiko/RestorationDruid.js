import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import objMgr, { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import { defaultHealTargeting as heal } from "@/Targeting/HealTargeting";
import { DispelPriority } from "@/Data/Dispels";
import { WoWDispelType } from "@/Enums/Auras";
import Settings from '@/Core/Settings';

export class DruidRestorationBehavior extends Behavior {
  name = "[Rejiko] Restoration Druid";
  context = BehaviorContext.Any;
  specialization = Specialization.Druid.Restoration;
  static settings = [
    {
      header: "Defense",
      options: [
        { type: "slider", uid: "DruidRestoBarkskinHP", text: "Barkskin (HP %)", min: 1, max: 100, default: 60 },
      ]
    },
    {
      header: "Healing",
      options: [
        { type: "slider", uid: "DruidRestoNaturesSwiftnessHP", text: "Nature's Swiftness (HP %)", min: 1, max: 100, default: 40 },
        { type: "slider", uid: "DruidRestoSwiftmendHP", text: "Swiftmend (HP %)", min: 1, max: 100, default: 60 },
        { type: "slider", uid: "DruidRestoWildGrowthTargets", text: "Wild Growth min targets", min: 2, max: 6, default: 3 },
        { type: "slider", uid: "DruidRestoWildGrowthHP", text: "Wild Growth count below (HP %)", min: 1, max: 100, default: 90 },
        { type: "checkbox", uid: "DruidRestoUseEfflorescence", text: "Use Efflorescence (on tank)", default: true },
        { type: "slider", uid: "DruidRestoRejuvenationHP", text: "Rejuvenation (HP %)", min: 1, max: 100, default: 85 },
        { type: "slider", uid: "DruidRestoRegrowthHP", text: "Regrowth (HP %)", min: 1, max: 100, default: 65 },
        { type: "checkbox", uid: "DruidRestoRebirth", text: "Auto-rez dead allies (Rebirth in combat, Revive out)", default: true },
      ]
    },
    {
      header: "Filler",
      options: [
        { type: "checkbox", uid: "DruidRestoDPSFiller", text: "DPS when nobody needs healing", default: true },
        { type: "slider", uid: "DruidRestoDPSStopHP", text: "Stop DPS if anyone below (HP %)", min: 1, max: 100, default: 95 },
      ]
    }
  ];

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      common.waitForCastOrChannel(),
      spell.cast("Barkskin", on => me, req => me.pctHealth <= Settings.DruidRestoBarkskinHP),
      spell.cast("Nature's Swiftness", on => me, req => {
        if (me.hasAuraByMe("Nature's Swiftness")) return false;
        const t = heal.getPriorityTarget();
        return t && t.predictedHealthPercent <= Settings.DruidRestoNaturesSwiftnessHP;
      }),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.dispel("Nature's Cure", true, DispelPriority.Low, true,
            WoWDispelType.Magic, WoWDispelType.Curse, WoWDispelType.Poison),
          spell.cast("Rebirth", on => me.inCombat() ? this.deadAllyInRange() : null),
          spell.cast("Revive", on => !me.inCombat() ? this.deadAllyInRange() : null),
          spell.cast("Swiftmend", on => this.swiftmendTarget()),
          this.castEfflorescence(),
          spell.cast("Wild Growth", on => heal.getPriorityTarget(), req => this.wildGrowthReady()),
          spell.cast("Lifebloom", on => this.lifebloomTarget()),
          spell.cast("Rejuvenation", on => this.rejuvenationTarget()),
          spell.cast("Regrowth", on => this.regrowthTarget()),
          spell.cast("Mark of the Wild", on => this.motwTarget()),
          this.fillerDPS()
        )
      )
    );
  }

  swiftmendTarget() {
    for (const u of heal.priorityList) {
      if (u.predictedHealthPercent <= Settings.DruidRestoSwiftmendHP &&
          (u.hasAuraByMe("Rejuvenation") || u.hasAuraByMe("Regrowth"))) {
        return u;
      }
    }
    return null;
  }

  efflorescenceTarget() {
    if (!Settings.DruidRestoUseEfflorescence) return null;
    if (!me.inCombat()) return null;
    if (wow.frameTime - this.lastEfflorescenceTime < 1500) return null;

    for (const tank of heal.friends.Tanks) {
      if (tank.deadOrGhost || me.distanceTo(tank) > 40 || tank.isMoving()) continue;
      if (!combat.targets.some(m => tank.isWithinMeleeRange(m))) continue;

      if (wow.frameTime - this.lastEfflorescenceTime < 30000 && this.lastEfflorescencePos) {
        const dx = tank.position.x - this.lastEfflorescencePos.x;
        const dy = tank.position.y - this.lastEfflorescencePos.y;
        if (dx * dx + dy * dy <= 100) continue;
      }

      return tank;
    }
    return null;
  }

  castEfflorescence() {
    return new bt.Action(() => {
      const tank = this.efflorescenceTarget();
      if (!tank) return bt.Status.Failure;

      const eff = spell.getSpell("Efflorescence");
      if (!eff || !spell.canCast(eff, tank, {})) return bt.Status.Failure;

      this.lastEfflorescencePos = { x: tank.position.x, y: tank.position.y };
      this.lastEfflorescenceTime = wow.frameTime;
      eff.cast(tank.position);
      return bt.Status.Success;
    });
  }

  wildGrowthReady() {
    let count = 0;
    for (const u of heal.priorityList) {
      if (u.predictedHealthPercent < Settings.DruidRestoWildGrowthHP && me.distanceTo(u) <= 30) {
        count++;
        if (count >= Settings.DruidRestoWildGrowthTargets) return true;
      }
    }
    return false;
  }

  lifebloomTarget() {
    for (const tank of heal.friends.Tanks) {
      const lb = tank.getAuraByMe("Lifebloom");
      if (!lb || lb.remaining <= 4500) return tank;
    }
    return null;
  }

  rejuvenationTarget() {
    for (const u of heal.priorityList) {
      if (u.predictedHealthPercent <= Settings.DruidRestoRejuvenationHP &&
          !u.hasAuraByMe("Rejuvenation")) {
        return u;
      }
    }
    return null;
  }

  regrowthTarget() {
    const t = heal.getPriorityTarget();
    if (t && t.predictedHealthPercent <= Settings.DruidRestoRegrowthHP) return t;
    return null;
  }

  motwTarget() {
    return heal.friends.All.find(u => !u.hasAuraByMe("Mark of the Wild")) || null;
  }

  deadAllyInRange() {
    if (!Settings.DruidRestoRebirth) return null;
    const party = me.currentParty;
    if (!party) return null;
    for (const pm of party.members) {
      const u = objMgr.findObject(pm.guid);
      if (u && u.deadOrGhost && me.distanceTo(u) <= 40) return u;
    }
    return null;
  }

  fillerDPS() {
    return new bt.Decorator(
      () => {
        if (!Settings.DruidRestoDPSFiller) return false;
        if (!combat.bestTarget) return false;
        for (const u of heal.priorityList) {
          if (u.predictedHealthPercent < Settings.DruidRestoDPSStopHP) return false;
        }
        return true;
      },
      new bt.Selector(
        common.waitForFacing(),
        spell.cast("Moonfire", on => this.moonfireTarget()),
        spell.cast("Wrath", on => combat.bestTarget)
      )
    );
  }

  moonfireTarget() {
    const t = me.target;
    if (!t) return null;
    const dot = t.getAuraByMe("Moonfire");
    if (!dot || dot.remaining <= 1500) return t;
    return null;
  }
}
