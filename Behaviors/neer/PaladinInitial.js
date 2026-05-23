import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";

const auras = {
};

const spells = {
};

export class PaladinInitialBehavior extends Behavior {
  name = "Paladin [Initial]";
  context = BehaviorContext.Any;
  specialization = Specialization.Paladin.Initial;
  static settings = [
  ];

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      common.waitForCastOrChannel(),
      spell.cast("Shield of the Righteous", on => me, req => this.meleeEnemiesInFront() > 0),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Flash of Light", on => me, req => me.pctHealth < 60),
          spell.cast("Hammer of Justice", on => this.findHojTarget(), req => this.findHojTarget() !== undefined),
          common.waitForTarget(),
          common.waitForFacing(),
          common.ensureAutoAttack(),
          spell.cast("Consecration", on => me, req =>
            !me.isMoving() && this.enemiesInRange(8) > 0
          ),
          spell.cast("Judgment", on => this.getTarget(30)),
          spell.cast("Crusader Strike", on => this.getTarget())
        )
      )
    );
  }

  getTarget(distance) {
    const inRange = distance === undefined
      ? (t => me.isWithinMeleeRange(t))
      : (t => me.distanceTo(t) <= distance);
    const best = combat.bestTarget;
    if (best && me.isFacing(best) && inRange(best)) {
      return best;
    }
    const reachable = combat.targets.find(t => me.isFacing(t) && inRange(t));
    return reachable || best;
  }

  enemiesInRange(distance) {
    return combat.targets.filter(t => me.distanceTo(t) <= distance).length;
  }

  meleeEnemiesInFront() {
    return combat.targets.filter(t => me.isWithinMeleeRange(t) && me.isFacing(t)).length;
  }

  findHojTarget() {
    return combat.targets.find(t =>
      me.isFacing(t) &&
      me.distanceTo(t) <= 10 &&
      t.isCastingOrChanneling
    );
  }
}
