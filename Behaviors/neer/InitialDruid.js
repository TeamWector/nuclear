import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";

// Leveling (pre-specialization) Druid: Cat Form + Shred spam. Everything is cast
// by name so abilities not yet learned at low level just fall through.
const auras = {
  catForm: 768,
  markOfTheWild: 1126,
};

export class DruidInitialBehavior extends Behavior {
  name = "Druid [Initial]";
  context = BehaviorContext.Any;
  specialization = Specialization.Druid.Initial;
  static settings = [];

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      common.waitForCastOrChannel(),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          // Mark of the Wild — castable only in caster form, so apply it before we
          // shift (e.g. pre-combat). Falls through harmlessly while in Cat Form.
          spell.cast("Mark of the Wild", on => me, req => !me.hasAura(auras.markOfTheWild)),

          // Emergency self-heal: Regrowth is form-locked, so drop Cat Form first,
          // then hard-cast it. We re-shift below once we're healthy again.
          new bt.Action(() => {
            if (me.pctHealth < 50 && me.hasAura(auras.catForm)) {
              me.cancelAura(auras.catForm);
              return bt.Status.Success;
            }
            return bt.Status.Failure;
          }),
          spell.cast("Regrowth", on => me, req => me.pctHealth < 50),

          // Shift into Cat Form for the melee rotation.
          spell.cast("Cat Form", on => me, req => !me.hasAura(auras.catForm)),

          common.waitForTarget(),
          common.waitForFacing(),
          common.ensureAutoAttack(),

          //spell.cast("Ferocious Bite", on => combat.bestTarget, req => combat.bestTarget && me.Power),
          // Shred spam.
          spell.cast("Shred", on => combat.bestTarget, req => combat.bestTarget && me.isWithinMeleeRange(combat.bestTarget))
        )
      )
    );
  }
}
