import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { PowerType } from "@/Enums/PowerType";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";

const auras = {
  boneshield: 195181,
  deathanddecay: 227591,
  bloodplague: 55078
};

export class DeathKnightBloodBehavior extends Behavior {
  context = BehaviorContext.Any;
  specialization = Specialization.DeathKnight.Blood;
  name = "Deathknight [Blood]"

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          common.waitForTarget(),
          common.waitForCastOrChannel(),
          common.waitForFacing(),
          common.ensureAutoAttack(),
          spell.interrupt("Mind Freeze", false),
          spell.cast("Dark Command",
            on => combat.targets.find(unit => unit.inCombat() && unit.distanceTo(me) <= 30 && !unit.isTanking()),
            req => combat.targets.find(unit => unit.inCombat() && unit.distanceTo(me) <= 30 && !unit.isTanking()) !== undefined),
          spell.cast("Death Strike", on => me.target, req => me.pctHealth < 75),
          spell.cast("Death's Caress", on => me.target, req => !me.isWithinMeleeRange(me.target) && me.getAuraStacks(auras.boneshield) < 5),
          spell.cast("Marrowrend", on => me.target, req => me.getAuraStacks(auras.boneshield) <= 5),
          spell.cast("Blood Boil", on => me, req => this.shouldCastBloodBoil()),
          spell.cast("Raise Dead", on => me),
          spell.cast("Death and Decay", on => me, req => me.isWithinMeleeRange(me.target) && !me.isMoving()),
          spell.cast("Soul Reaper", on => me.target, req => me.target.pctHealth < 35),
          spell.cast("Dancing Rune Weapon", on => me, req => me.isWithinMeleeRange(me.target) && !me.isMoving()),
          spell.cast("Tombstone", on => me, req => me.hasAura(auras.deathanddecay) && me.getAuraStacks(auras.boneshield) >= 5),
          spell.cast("Bonestorm", on => me, req => me.hasAura(auras.deathanddecay) && me.getAuraStacks(auras.boneshield) >= 10),
          spell.cast("Death Strike", on => me.target, req => me.pctPower >= 90),
          spell.cast("Consumption", on => me.target, req => me.isWithinMeleeRange(me.target)),
          spell.cast("Rune Strike", on => me.target)
        )
      )
    );
  }

  shouldCastBloodBoil() {
    // Check if there are more than 0 nearby units within the specified distance
    const hasNearbyUnits = combat.targets.some(unit => unit.distanceTo(me) <= 10);
    // Check if there are nearby units without the auras.bloodplague aura
    const hasSuitableTarget = combat.targets.some(unit =>
      unit.distanceTo(me) <= 10 && !unit.hasAura(auras.bloodplague)
    );
    // Check if the spell has 2 charges
    const hasTwoCharges = spell.getCharges("Blood Boil") === 2;
    // Return true if there are nearby units and either there are suitable targets or the spell has 2 charges
    return hasNearbyUnits && (hasSuitableTarget || hasTwoCharges);
  }
}
