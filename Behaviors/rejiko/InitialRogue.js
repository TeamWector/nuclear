import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import { PowerType } from "@/Enums/PowerType";
import Settings from '@/Core/Settings';

export class RogueInitialBehavior extends Behavior {
  name = "[Rejiko] Initial Rogue";
  context = BehaviorContext.Any;
  specialization = Specialization.Rogue.Initial;
  static settings = [
    {
      header: "Finishers",
      options: [
        { type: "checkbox", uid: "RogueInitialUseEviscerate", text: "Use Eviscerate", default: true },
        { type: "slider", uid: "RogueInitialEviscerateComboPoints", text: "Eviscerate combo points", min: 1, max: 5, default: 5 },
      ]
    },
    {
      header: "Defensives",
      options: [
        { type: "checkbox", uid: "RogueInitialUseCrimsonVial", text: "Use Crimson Vial", default: true },
        { type: "slider", uid: "RogueInitialCrimsonVialHP", text: "Crimson Vial (HP %)", min: 1, max: 100, default: 70 },
      ]
    }
  ];

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      common.waitForCastOrChannel(),
      spell.interrupt("Kick"),
      spell.cast("Crimson Vial", on => me, req =>
        Settings.RogueInitialUseCrimsonVial && me.pctHealth <= Settings.RogueInitialCrimsonVialHP
      ),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Instant Poison", on => me, req => !me.inCombat() && !me.hasVisibleAura("Instant Poison")),
          spell.cast("Stealth", on => me, req => !me.inCombat() && !me.hasVisibleAura("Stealth")),
          common.waitForTarget(),
          common.waitForFacing(),
          new bt.Decorator(
            () => !me.hasVisibleAura("Stealth"),
            common.ensureAutoAttack()
          ),
          spell.cast("Cheap Shot", on => combat.bestTarget, req => me.hasVisibleAura("Stealth")),
          spell.cast("Slice and Dice", on => me, req => {
            if (me.hasVisibleAura("Stealth")) return false;
            if (me.powerByType(PowerType.ComboPoints) < 1) return false;
            const sd = me.getAura("Slice and Dice");
            return !sd || sd.remaining <= sd.duration * 0.3;
          }),
          spell.cast("Eviscerate", on => combat.bestTarget, req =>
            !me.hasVisibleAura("Stealth") &&
            Settings.RogueInitialUseEviscerate &&
            me.powerByType(PowerType.ComboPoints) >= Settings.RogueInitialEviscerateComboPoints
          ),
          spell.cast("Sinister Strike", on => combat.bestTarget, req => !me.hasVisibleAura("Stealth"))
        )
      )
    );
  }
}
