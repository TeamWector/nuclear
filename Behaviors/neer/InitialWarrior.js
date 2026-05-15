import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import { PowerType } from "@/Enums/PowerType";

export class WarriorInitialBehavior extends Behavior {
  name = "Warrior [Initial]";
  context = BehaviorContext.Any;
  specialization = Specialization.Warrior.Initial;
  static settings = [];

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      common.waitForCastOrChannel(),
      spell.interrupt("Pummel"),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          common.waitForTarget(),
          common.waitForFacing(),
          common.ensureAutoAttack(),
          spell.cast("Charge", on => combat.bestTarget, req =>
            combat.bestTarget && !me.isWithinMeleeRange(combat.bestTarget)
          ),
          spell.cast("Victory Rush", on => combat.bestTarget),
          spell.cast("Shield Slam", on => combat.bestTarget),
          spell.cast("Execute", on => combat.targets.find(t => t.pctHealth <= 20), { skipUsableCheck: true }),
          spell.cast("Slam", on => combat.bestTarget, req => me.powerByType(PowerType.Rage) >= 20),
          spell.cast("Strike", on => combat.bestTarget)
        )
      )
    );
  }
}
