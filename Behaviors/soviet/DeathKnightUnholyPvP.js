import {Behavior, BehaviorContext} from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import spell from "@/Core/Spell";
import {me} from "@/Core/ObjectManager";
import {defaultCombatTargeting as Combat} from "@/Targeting/CombatTargeting";
import Specialization from "@/Enums/Specialization";
import common from "@/Core/Common";
import Pet from "@/Core/Pet";
import Spell from "@/Core/Spell";

const auras = {
  darkSuccor: 101568,
  chainsOfIce: 45524,
  festeringWound: 194310,
  deathAndDecay: 188290,
  suddenDoom: 81340,
  virulentPlague: 191587,
  darkTransform: 63560
}

export class DeathKnightUnholy extends Behavior {
  name = "Death Knight (Unholy) PvP";
  context = BehaviorContext.Any; // PvP or PvE
  specialization = Specialization.DeathKnight.Unholy

  build() {
    return new bt.Selector(
      common.waitForNotSitting(),
      common.waitForNotMounted(),
      common.waitForCastOrChannel(),
      common.waitForTarget(),
      new bt.Decorator(
        ret => me.pet && me.pet.hasVisibleAura(auras.darkTransform),
        spell.interrupt("Leap", true)
      ),
      spell.interrupt("Gnaw", true),
      common.waitForFacing(),
      spell.cast("Raise Dead", on => me, req => !Pet.current),
      spell.interrupt("Mind Freeze", true),
      spell.cast("Claw", on => me.target),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          common.waitForNotWaitingForArenaToStart(),
          common.waitForNotSitting(),
          common.waitForNotMounted(),
          common.waitForCastOrChannel(),
          spell.cast("Death Strike", ret => me.pctHealth < 95 && me.hasAura(auras.darkSuccor)),
          spell.cast("Death Strike", ret => me.pctHealth < 55 && (Spell.getTimeSinceLastCast("Death Strike") > 3000 || me.power > 50)),
          new bt.Decorator(
            ret => Combat.burstToggle && me.target && me.isWithinMeleeRange(me.target),
            this.burstDamage()
          ),
          this.sustainedDamage(),
        )
      )
    );
  }

  // Merged Burst Damage
  burstDamage() {
    return new bt.Selector(
      spell.cast("Army of the Dead", ret => true),
      //spell.cast("Chains of Ice", on => me.target, ret => me.target && me.targetUnit.isPlayer() && !me.targetUnit.hasAuraByMe(auras.chainsOfIce)),
      spell.cast("Summon Gargoyle", ret => true),
      spell.cast("Abomination Limb", ret => true),
      spell.cast("Unholy Assault", ret => true),
      spell.cast("Apocalypse", ret => true, ret => me.target && me.targetUnit.getAuraStacks(auras.festeringWound) >= 4),
      spell.cast("Death and Decay", on => me, ret => this.shouldDeathAndDecay()),
      spell.cast("Dark Transformation", ret => true),
      spell.cast("Death Coil", on => me.target, ret => this.shouldDeathCoil(90) && me.targetUnit.hasAuraByMe(auras.festeringWound) >= 3 && this.apocalypseOnCooldown()),
      spell.cast("Outbreak", on => me.target, ret => me.target && !me.targetUnit.hasAuraByMe(auras.virulentPlague)),
      spell.cast("Scourge Strike", on => me.target, ret => me.target && me.targetUnit.hasAuraByMe(auras.festeringWound) && this.apocalypseOnCooldown()),
      spell.cast("Death Coil", on => me.target, ret => this.shouldDeathCoil(60) && (this.apocalypseOnCooldown() || me.getReadyRunes() < 2)),
      spell.cast("Festering Strike", on => me.target, ret => me.target && me.targetUnit.getAuraStacks(auras.festeringWound) < 5),
    );
  }

  // Sustained Damage
  sustainedDamage() {
    return new bt.Selector(
      //spell.cast("Chains of Ice", on => me.target, ret => me.target && me.targetUnit.isPlayer() && !me.targetUnit.hasAuraByMe(auras.chainsOfIce)),
      spell.cast("Outbreak", on => me.target, ret => me.target && !me.targetUnit.hasAuraByMe(auras.virulentPlague)),
      spell.cast("Death and Decay", ret => this.shouldDeathAndDecay()),
      spell.cast("Festering Strike", on => me.target, ret => me.target && me.targetUnit.getAuraStacks(auras.festeringWound) < 5),
      spell.cast("Scourge Strike", on => me.target, ret => me.target && me.targetUnit.hasAuraByMe(auras.festeringWound)),
      spell.cast("Death Coil", on => me.target, ret => this.shouldDeathCoil(60))
    );
  }

  shouldDeathCoil(minPowerForCoil) {
    return me.power > minPowerForCoil || (me.power > (minPowerForCoil - 20) && me.hasAura(auras.suddenDoom));
  }

  shouldDeathAndDecay() {
    return me.targetUnit && me.isWithinMeleeRange(me.targetUnit) && !me.hasAura(auras.deathAndDecay)
  }

  apocalypseOnCooldown() {
    const apocalypse = wow.SpellBook.getSpellByName("Apocalypse");
    return apocalypse && apocalypse.cooldown.duration > 0;
  }
}
