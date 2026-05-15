import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import Pet from "@/Core/Pet";
import Settings from "@/Core/Settings";
import { PowerType } from "@/Enums/PowerType";

const auras = {
  burningRush: 111400,
  felDomination: 333889,
  demonicCore: 264173,
  infernalBeneficiary: 1265810,
};

const spells = {
  drainLife: 234153,
  summons: {
    Imp: 688,
    Voidwalker: 697,
    Felhunter: 691,
    Succubus: 712,
    Felguard: 30146,
  },
};

export class WarlockDemonologyBehavior extends Behavior {
  name = "Warlock [Demonology]";
  context = BehaviorContext.Any;
  specialization = Specialization.Warlock.Demonology;

  static settings = [
    {
      header: "Pet",
      options: [
        {
          type: "combobox",
          uid: "DemoPetType",
          text: "Pet to summon",
          values: ["Imp", "Voidwalker", "Felhunter", "Succubus", "Felguard"],
          default: "Felguard"
        }
      ]
    }
  ];

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      new bt.Decorator(
        () => {
          if (me.spellInfo?.spellChannelId !== spells.drainLife) return false;
          if (me.pctHealth < 100) return false;
          if (!me.hasAura(auras.infernalBeneficiary)) return true;
          const pet = Pet.current;
          return !pet || !Pet.isAlive() || pet.pctHealth >= 100;
        },
        new bt.Action(() => {
          me.stopCasting();
          return bt.Status.Success;
        })
      ),
      new bt.Decorator(
        () => Pet.isAlive() && me.spellInfo?.cast === spells.summons[Settings.DemoPetType],
        new bt.Action(() => {
          me.stopCasting();
          return bt.Status.Success;
        })
      ),
      new bt.Decorator(
        () => me.hasAura(auras.burningRush) && (me.pctHealth < 50 || !me.isMoving()),
        new bt.Action(() => {
          me.cancelAura(auras.burningRush);
          return bt.Status.Success;
        })
      ),
      spell.cast("Fel Domination", on => me, req =>
        me.inCombat() && !Pet.isAlive() && !me.hasAura(auras.felDomination)
      ),
      common.waitForCastOrChannel(),
      this.summonSelectedPet(),
      this.petAttackMyAttacker(),
      Pet.follow(() => !me.targetUnit && !me.inCombat() && !combat.bestTarget),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        spell.cast("Burning Rush", on => me, req => me.isMoving() && me.pctHealth > 50 && !me.hasAura(auras.burningRush))
      ),
      common.waitForTarget(),
      common.waitForFacing(),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Drain Life", on => combat.bestTarget, req => {
            if (me.pctHealth < 50) return true;
            if (!me.hasAura(auras.infernalBeneficiary)) return false;
            const pet = Pet.current;
            return pet && Pet.isAlive() && pet.pctHealth < 50;
          }),
          spell.cast("Call Dreadstalkers", on => combat.bestTarget, req => me.powerByType(PowerType.SoulShards) >= 2),
          spell.cast("Demonbolt", on => combat.bestTarget, req => me.hasAura(auras.demonicCore) && me.powerByType(PowerType.SoulShards) <= 3),
          spell.cast("Hand of Gul'dan", on => combat.bestTarget, req => me.powerByType(PowerType.SoulShards) >= 3),
          spell.cast("Shadow Bolt", on => combat.bestTarget)
        )
      )
    );
  }

  summonSelectedPet() {
    return new bt.Action(() => {
      if (Pet.isAlive()) return bt.Status.Failure;
      if (me.inCombat() && !me.hasAura(auras.felDomination)) return bt.Status.Failure;

      const wSpell = spell.getSpell("Summon " + Settings.DemoPetType);
      if (!spell.canCast(wSpell, me, {})) return bt.Status.Failure;

      return spell.castPrimitive(wSpell, me) ? bt.Status.Success : bt.Status.Failure;
    });
  }

  petAttackMyAttacker() {
    return new bt.Action(() => {
      const pet = Pet.current;
      if (!pet) return bt.Status.Failure;

      const attackerOnMe = combat.targets.find(t => t.target && t.target.equals(me.guid));
      const desired = attackerOnMe
        || (me.targetUnit && common.validTarget(me.targetUnit) ? me.targetUnit : null)
        || combat.bestTarget;

      if (!desired) return bt.Status.Failure;
      if (pet.target && pet.target.equals(desired.guid)) return bt.Status.Failure;

      wow.PetInfo.sendAction(wow.PetInfo.actions[0], desired.guid);
      return bt.Status.Failure;
    });
  }
}
