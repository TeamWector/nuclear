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
  shadowburnFree: 1245664,
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

const BURNING_RUSH_MOVE_THRESHOLD_MS = 1000;
let moveStartFrameTime = 0;
let lastMoveSampleFrame = -1;

function sampleMovement() {
  if (lastMoveSampleFrame === wow.frameTime) return;
  lastMoveSampleFrame = wow.frameTime;
  if (!me.isMoving()) {
    moveStartFrameTime = 0;
  } else if (moveStartFrameTime === 0) {
    moveStartFrameTime = wow.frameTime;
  }
}

function hasBeenMovingFor(ms) {
  sampleMovement();
  return moveStartFrameTime !== 0 && (wow.frameTime - moveStartFrameTime) >= ms;
}

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
        { type: "slider", uid: "DestructionDrainLifeHp", text: "Drain Life HP %", min: 1, max: 100, default: 80 },
        { type: "slider", uid: "DestructionPetDrainLifeHp", text: "Drain Life Pet HP %", min: 0, max: 100, default: 50 }
      ]
    },
    {
      header: "AoE",
      options: [
        { type: "slider", uid: "DestructionAoEThreshold", text: "AoE Target Count", min: 2, max: 8, default: 3 }
      ]
    }
  ];

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      new bt.Decorator(
        () => this.shouldStopDrainLife(),
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
        spell.cast("Burning Rush", on => me, req =>
          hasBeenMovingFor(BURNING_RUSH_MOVE_THRESHOLD_MS) && me.pctHealth > 50 && !me.hasAura(auras.burningRush)
        )
      ),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown() && this.shouldDrainLife(),
        spell.cast("Drain Life", on => me.targetUnit || combat.bestTarget, req =>
          !!(me.targetUnit || combat.bestTarget)
        )
      ),
      common.waitForTarget(),
      common.waitForFacing(),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Immolate", on => combat.bestTarget, req => this.needsImmolate(combat.bestTarget)),
          spell.cast("Summon Infernal", on => combat.bestTarget, req =>
            combat.burstToggle && combat.bestTarget
          ),
          spell.cast("Cataclysm", on => this.cataclysmTarget(), req =>
            combat.targets.length >= this.aoeThreshold() && this.cataclysmTarget() !== null
          ),
          spell.cast("Malevolence", on => combat.bestTarget, req =>
            combat.burstToggle && combat.bestTarget
          ),
          spell.cast("Shadowburn", on => combat.bestTarget, req => {
            if (!combat.bestTarget) return false;
            if (me.hasAura(auras.shadowburnFree)) return true;
            return combat.bestTarget.pctHealth < 20
              && combat.targets.length < this.aoeThreshold();
          }),
          spell.cast("Rain of Fire", on => this.rainOfFireTarget(), req =>
            combat.targets.length >= this.aoeThreshold()
            && me.powerByType(PowerType.SoulShards) >= 3
            && this.rainOfFireTarget() !== null
          ),
          spell.cast("Chaos Bolt", on => combat.bestTarget, req =>
            combat.bestTarget && me.powerByType(PowerType.SoulShards) >= 2
          ),
          spell.cast("Soul Fire", on => combat.bestTarget, req => combat.bestTarget),
          spell.cast("Conflagrate", on => combat.bestTarget, req => combat.bestTarget),
          spell.cast("Incinerate", on => combat.bestTarget)
        )
      )
    );
  }

  aoeThreshold() {
    return Settings.DestructionAoEThreshold ?? 3;
  }

  shouldDrainLife() {
    if (me.pctHealth < (Settings.DestructionDrainLifeHp ?? 80)) return true;
    const pet = Pet.current;
    return !!(pet && Pet.isAlive() && pet.pctHealth < (Settings.DestructionPetDrainLifeHp ?? 50));
  }

  shouldStopDrainLife() {
    if (me.spellInfo?.spellChannelId !== spells.drainLife) return false;
    if (me.pctHealth < 100) return false;
    const pet = Pet.current;
    if (pet && Pet.isAlive() && pet.pctHealth < 100) return false;
    return true;
  }

  cataclysmTarget() {
    let best = null;
    let bestCount = this.aoeThreshold() - 1;
    for (const t of combat.targets) {
      const count = combat.getUnitsAroundUnit(t, 8).length;
      if (count > bestCount) {
        bestCount = count;
        best = t;
      }
    }
    return best;
  }

  needsImmolate(target) {
    if (!target) return false;
    const dot = target.getAuraByMe(auras.immolate);
    if (!dot) return true;
    return dot.remaining <= dot.duration * 0.3;
  }

  rainOfFireTarget() {
    let best = null;
    let bestCount = this.aoeThreshold() - 1;
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
