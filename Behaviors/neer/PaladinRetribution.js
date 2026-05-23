import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import { PowerType } from "@/Enums/PowerType";

const auras = {
  crusaderAura: 32223,
  devotionAura: 465,
};

const spells = {
};

export class PaladinRetributionBehavior extends Behavior {
  name = "Paladin [Retribution]";
  context = BehaviorContext.Any;
  specialization = Specialization.Paladin.Retribution;
  static settings = [
  ];

  build() {
    return new bt.Selector(
      common.waitForNotSitting(),
      common.waitForNotMounted(),
      common.waitForCastOrChannel(),
      spell.interrupt("Rebuke"),
      spell.cast("Lay on Hands", on => me, req => me.pctHealth < 10),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Word of Glory", on => me, req => me.pctHealth < 20),
          spell.cast("Crusader Aura", on => me, req => me.isMounted && !me.hasAura(auras.crusaderAura)),
          spell.cast("Devotion Aura", on => me, req => !me.isMounted && !me.hasAura(auras.devotionAura)),
          spell.interrupt("Hammer of Justice"),
          common.waitForTarget(),
          common.waitForFacing(),
          common.ensureAutoAttack(),
          spell.cast("Avenging Wrath", on => me, req => combat.targets.length >= 1),
          spell.cast("Divine Toll", on => this.getTarget(30), req => me.powerByType(PowerType.HolyPower) === 0 && combat.targets.length > 0),
          spell.cast("Judgment", on => this.getTarget(30)),
          spell.cast("Hammer of Wrath", on => this.getTarget(30)),
          spell.cast("Divine Storm", on => me, req => combat.getUnitsAroundUnit(me, 8).length > 2),
          spell.cast("Final Verdict", on => this.getTarget()),
          spell.cast("Blade of Justice", on => this.getTarget()),
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
}
