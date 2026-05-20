import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import { defaultHealTargeting as heal } from "@/Targeting/HealTargeting";
import Settings from '@/Core/Settings';

export class DruidInitialBehavior extends Behavior {
  name = "[Rejiko] Initial Druid";
  context = BehaviorContext.Any;
  specialization = Specialization.Druid.Initial;
  static settings = [
    {
      header: "Defense",
      options: [
        { type: "slider", uid: "DruidInitialBarkskinHP", text: "Barkskin (HP %)", min: 1, max: 100, default: 60 },
        { type: "slider", uid: "DruidInitialRegrowthHP", text: "Regrowth (HP %)", min: 1, max: 100, default: 70 },
      ]
    },
    {
      header: "DPS",
      options: [
        { type: "slider", uid: "DruidInitialMoonfireRefreshMs", text: "Moonfire refresh window (ms)", min: 0, max: 3000, default: 1500 },
      ]
    }
  ];

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      common.waitForCastOrChannel(),
      spell.cast("Barkskin", on => me, req => me.pctHealth <= Settings.DruidInitialBarkskinHP),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Regrowth", on => this.regrowthTarget()),
          spell.cast("Mark of the Wild", on => this.motwTarget()),
          common.waitForTarget(),
          common.waitForFacing(),
          common.ensureAutoAttack(),
          spell.cast("Moonfire", on => this.moonfireTarget()),
          spell.cast("Wrath", on => combat.bestTarget)
        )
      )
    );
  }

  regrowthTarget() {
    const t = heal.getPriorityTarget();
    if (t && t.predictedHealthPercent <= Settings.DruidInitialRegrowthHP) return t;
    return null;
  }

  motwTarget() {
    return heal.friends.All.find(u => !u.hasAuraByMe("Mark of the Wild")) || null;
  }

  moonfireTarget() {
    const t = me.target;
    if (!t) return null;
    const dot = t.getAuraByMe("Moonfire");
    if (!dot || dot.remaining <= Settings.DruidInitialMoonfireRefreshMs) return t;
    return null;
  }
}
