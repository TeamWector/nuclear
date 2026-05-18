import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import { defaultHealTargeting as heal } from "@/Targeting/HealTargeting";
import Settings from '@/Core/Settings';

export class ShamanInitialBehavior extends Behavior {
  name = "[Rejiko] Initial Shaman";
  context = BehaviorContext.Any;
  specialization = Specialization.Shaman.Initial;
  static settings = [
    {
      header: "Defense",
      options: [
        { type: "slider", uid: "ShamanInitialHealingSurgeHP", text: "Healing Surge (HP %)", min: 1, max: 100, default: 60 },
      ]
    },
    {
      header: "DPS",
      options: [
        { type: "checkbox", uid: "ShamanInitialUsePrimalStrike", text: "Use Primal Strike (melee)", default: false },
      ]
    }
  ];

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      spell.cast("Lightning Shield", on => me, req =>
        !me.hasAuraByMe("Lightning Shield") && !me.hasAuraByMe("Ghost Wolf")
      ),
      common.waitForCastOrChannel(),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Healing Surge", on => this.healingSurgeTarget()),
          spell.cast("Ghost Wolf", on => me, req =>
            !me.inCombat() && me.isMoving() && !me.hasAuraByMe("Ghost Wolf")
          ),
          common.waitForTarget(),
          common.waitForFacing(),
          common.ensureAutoAttack(),
          spell.cast("Flame Shock", on => this.flameShockTarget()),
          spell.cast("Primal Strike", on => combat.bestTarget, req => {
            if (!Settings.ShamanInitialUsePrimalStrike) return false;
            if (!me.isMoving()) return false;
            const t = combat.bestTarget;
            return t && me.isWithinMeleeRange(t);
          }),
          spell.cast("Lightning Bolt", on => combat.bestTarget)
        )
      )
    );
  }

  healingSurgeTarget() {
    const t = heal.getPriorityTarget();
    if (t && t.predictedHealthPercent <= Settings.ShamanInitialHealingSurgeHP) return t;
    return null;
  }

  flameShockTarget() {
    const t = combat.bestTarget;
    if (!t) return null;
    const fs = t.getAuraByMe("Flame Shock");
    if (!fs || fs.remaining <= 5400) return t;
    return null;
  }
}
