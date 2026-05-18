import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";

const spells = {
  cracklingJadeLightning: 117952,
};

export class MonkInitialBehavior extends Behavior {
  name = "Monk [Initial]";
  context = BehaviorContext.Any;
  specialization = Specialization.Monk.Initial;
  static settings = [];

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      new bt.Decorator(
        () => me.spellInfo?.spellChannelId === spells.cracklingJadeLightning
          && combat.bestTarget && me.isWithinMeleeRange(combat.bestTarget),
        new bt.Action(() => {
          me.stopCasting();
          return bt.Status.Success;
        })
      ),
      common.waitForCastOrChannel(),
      spell.interrupt("Spear Hand Strike"),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          common.waitForTarget(),
          common.waitForFacing(),
          common.ensureAutoAttack(),
          spell.cast("Blackout Kick", on => combat.bestTarget, req =>
            combat.bestTarget && me.isWithinMeleeRange(combat.bestTarget)
          ),
          spell.cast("Vivify", on => me, req => me.pctHealth < 50),
          spell.cast("Tiger Palm", on => combat.bestTarget, req =>
            combat.bestTarget && me.isWithinMeleeRange(combat.bestTarget)
          ),
          spell.cast("Crackling Jade Lightning", on => combat.bestTarget)
        )
      )
    );
  }
}
