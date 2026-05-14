import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import Pet from "@/Core/Pet";

const auras = {
  corruption: 146739,
};

const spells = {
  drainLife: 234153,
};

export class WarlockInitialBehavior extends Behavior {
  name = "Warlock [Initial]";
  context = BehaviorContext.Any;
  specialization = Specialization.Warlock.Initial;
  static settings = [
  ];

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      new bt.Decorator(
        () => me.spellInfo?.spellChannelId === spells.drainLife && me.pctHealth >= 100,
        new bt.Action(() => {
          me.stopCasting();
          return bt.Status.Success;
        })
      ),
      common.waitForCastOrChannel(),
      this.petAttackMyAttacker(),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          common.waitForTarget(),
          common.ensureAutoAttack(),
          spell.cast("Drain Life", on => combat.bestTarget, req => me.pctHealth < 50),
          spell.cast("Corruption", on => this.corruptionTarget(), req => this.corruptionTarget() !== null),
          spell.cast("Shadow Bolt", on => combat.bestTarget)
        )
      )
    );
  }

  corruptionTarget() {
    for (const t of combat.targets) {
      const dot = t.getAuraByMe(auras.corruption);
      if (!dot || dot.remaining <= dot.duration * 0.3) {
        return t;
      }
    }
    return null;
  }

  petAttackMyAttacker() {
    return new bt.Action(() => {
      const pet = Pet.current;
      if (!pet) return bt.Status.Failure;

      const myAttackers = combat.targets.filter(t => t.target && t.target.equals(me.guid));
      if (myAttackers.length === 0) return bt.Status.Failure;

      if (pet.target && myAttackers.some(t => t.guid.equals(pet.target))) {
        return bt.Status.Failure;
      }

      wow.PetInfo.sendAction(wow.PetInfo.actions[0], myAttackers[0].guid);
      return bt.Status.Failure;
    });
  }
}
