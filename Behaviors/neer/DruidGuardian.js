import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { PowerType } from "@/Enums/PowerType";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";

const auras = {
  ironfur: 192081,
  galacticguardian: 213708
}

export class DruidGuardianBehavior extends Behavior {
  context = BehaviorContext.Any;
  specialization = Specialization.Druid.Guardian;
  name = "Druid [Guardian]"

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          common.waitForTarget(),
          common.waitForCastOrChannel(),
          common.waitForFacing(),

          // Ensure Bear Form is active
          spell.cast("Bear Form", on => me, req => !me.hasVisibleAura("Bear Form")),

          // Cooldowns: Use unless holding is necessary
          spell.cast("Rage of the Sleeper"),
          spell.cast("Lunar Beam"),
          spell.cast("Heart of the Wild"),
          spell.cast("Berserk"),

          // Spend rage on Ironfur
          spell.cast("Ironfur", on => me, req => this.shouldCastIronfur()),

          // Keep Moonfire up on the target
          spell.cast("Moonfire", on => me.target, req => !me.target.hasAuraByMe("Moonfire")),

          // Keep Thrash on cooldown
          spell.cast("Thrash", on => me.target),

          // Keep Mangle on cooldown
          spell.cast("Mangle", on => me.target, req => me.powerByType(PowerType.Rage) < 90),

          // Consume Tooth and Claw with Maul or Raze
          spell.cast("Raze", on => me.target, req => combat.targets.filter(unit => unit.distanceTo(me) <= 8).length > 1),
          spell.cast("Maul", on => me.target, req => combat.targets.filter(unit => unit.distanceTo(me) <= 8).length <= 1),

          // Backup Moonfire application for Galactic Guardian proc
          spell.cast("Moonfire", this.findMoonfireTarget),
          spell.cast("Moonfire", on => me.target, req => me.getAura(auras.galacticguardian)?.remaining < 2000),

          // Interrupts
          spell.interrupt("Skull Bash"),

          // Alternative spells or abilities
          spell.cast("Swipe", on => me, req => combat.targets.filter(unit => unit.distanceTo(me) <= 8).length > 1),
        )
      )
    );
  }

  shouldCastIronfur() {
    const currentStacks = me.getAura(auras.ironfur)?.stacks || 0;
    const desiredStacks = Math.min(3, Math.ceil((100 - me.pctHealth) / 20));
    return currentStacks < desiredStacks || me.powerByType(PowerType.Rage) == 100;
  }

  shouldCastFrenziedRegeneration() {
    const charges = spell.getCharges("Frenzied Regeneration");
    return (charges === 2 && me.pctHealth < 80) || (charges === 1 && me.pctHealth < 40);
  }

  findMoonfireTarget() {
    const moonFireTarget = combat.targets.find(unit => !unit.hasAuraByMe("Moonfire"));
    return moonFireTarget ? moonFireTarget : false;
  }
}
