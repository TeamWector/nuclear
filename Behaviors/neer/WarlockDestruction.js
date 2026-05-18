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
  immolate: 157736,
  backdraft: 117828,
  infernalBeneficiary: 1265810,
};

const spells = {
  drainLife: 234153,
  summons: {
    Imp: 688,
    Voidwalker: 697,
    Felhunter: 691,
    Succubus: 712,
  },
};

export class WarlockDestructionBehavior extends Behavior {
  name = "Warlock [Destruction]";
  context = BehaviorContext.Any;
  specialization = Specialization.Warlock.Destruction;

  static settings = [
    {
      header: "Pet",
      options: [
        {
          type: "combobox",
          uid: "DestructionPetType",
          text: "Pet to summon",
          values: ["Imp", "Voidwalker", "Felhunter", "Succubus"],
          default: "Imp"
        }
      ]
    },
    {
      header: "Self Healing",
      options: [
        { type: "slider", uid: "DestructionDrainLifeHp", text: "Drain Life HP %", min: 1, max: 100, default: 80 }
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
        () => Pet.isAlive() && me.spellInfo?.cast === spells.summons[Settings.DestructionPetType],
        new bt.Action(() => {
          me.stopCasting();
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
      common.waitForTarget(),
      common.waitForFacing(),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Drain Life", on => combat.bestTarget, req => {
            if (!combat.bestTarget) return false;
            const threshold = Settings.DestructionDrainLifeHp ?? 80;
            if (me.pctHealth < threshold) return true;
            if (!me.hasAura(auras.infernalBeneficiary)) return false;
            const pet = Pet.current;
            return pet && Pet.isAlive() && pet.pctHealth < threshold;
          }),
          spell.cast("Immolate", on => combat.bestTarget, req => this.needsImmolate(combat.bestTarget)),
          spell.cast("Rain of Fire", on => this.rainOfFireTarget(), req =>
            me.powerByType(PowerType.SoulShards) >= 3 && this.rainOfFireTarget() !== null
          ),
          spell.cast("Conflagrate", on => combat.bestTarget, req =>
            combat.bestTarget && !me.hasAura(auras.backdraft)
          ),
          spell.cast("Chaos Bolt", on => combat.bestTarget, req =>
            combat.bestTarget && combat.bestTarget.pctHealth > 50 &&
            me.powerByType(PowerType.SoulShards) >= 2
          ),
          spell.cast("Incinerate", on => combat.bestTarget)
        )
      )
    );
  }

  needsImmolate(target) {
    if (!target) return false;
    const dot = target.getAuraByMe(auras.immolate);
    if (!dot) return true;
    return dot.remaining <= dot.duration * 0.3;
  }

  rainOfFireTarget() {
    let best = null;
    let bestCount = 5;
    for (const t of combat.targets) {
      const count = combat.getUnitsAroundUnit(t, 8).length;
      if (count > bestCount) {
        bestCount = count;
        best = t;
      }
    }
    return best;
  }

  summonSelectedPet() {
    return new bt.Action(() => {
      if (Pet.isAlive()) return bt.Status.Failure;
      if (me.inCombat() && !me.hasAura(auras.felDomination)) return bt.Status.Failure;

      const wSpell = spell.getSpell("Summon " + Settings.DestructionPetType);
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
