import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import objMgr, { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import Pet from "@/Core/Pet";
import Settings from "@/Core/Settings";
import KeyBinding from "@/Core/KeyBinding";
import { PowerType } from "@/Enums/PowerType";

const auras = {
  burningRush: 111400,
  felDomination: 333889,
  agony: 980,
  corruption: 146739,
  unstableAffliction: 1259790,
  haunt: 48181,
  seedOfCorruption: 27243,
  absoluteCorruption: 196103,
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

export class WarlockAfflictionBehavior extends Behavior {
  name = "Warlock [Affliction]";
  context = BehaviorContext.Any;
  specialization = Specialization.Warlock.Affliction;

  static settings = [
    {
      header: "Pet",
      options: [
        {
          type: "combobox",
          uid: "AfflictionPetType",
          text: "Pet to summon",
          values: ["Imp", "Voidwalker", "Felhunter", "Succubus"],
          default: "Voidwalker"
        }
      ]
    },
    {
      header: "Quest Dot Mode",
      options: [
        { type: "hotkey", uid: "AfflictionQuestDotKey", text: "Quest Dot Toggle Key", default: imgui.Key.X },
        { type: "slider", uid: "AfflictionQuestDotRange", text: "Quest Dot Range (yards)", min: 10, max: 40, default: 40 }
      ]
    },
    {
      header: "Self Healing",
      options: [
        { type: "slider", uid: "AfflictionDrainLifeHp", text: "Drain Life HP %", min: 1, max: 100, default: 80 }
      ]
    }
  ];

  constructor() {
    super();
    KeyBinding.setDefault("AfflictionQuestDotKey", imgui.Key.X);
    this.questDotMode = false;
  }

  build() {
    return new bt.Selector(
      new bt.Action(() => {
        if (KeyBinding.isPressed("AfflictionQuestDotKey")) {
          this.questDotMode = !this.questDotMode;
          console.info(`[Affliction] Quest Dot Mode ${this.questDotMode ? 'ENABLED' : 'DISABLED'}`);
        }
        return bt.Status.Failure;
      }),
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      new bt.Decorator(
        () => me.spellInfo?.spellChannelId === spells.drainLife && me.pctHealth >= 100,
        new bt.Action(() => {
          me.stopCasting();
          return bt.Status.Success;
        })
      ),
      new bt.Decorator(
        () => Pet.isAlive() && me.spellInfo?.cast === spells.summons[Settings.AfflictionPetType],
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
      new bt.Decorator(
        ret => this.questDotMode && !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Agony", on => this.questDotAgonyTarget(), req => this.questDotAgonyTarget() !== null),
          spell.cast("Corruption", on => this.questDotCorruptionTarget(), req => this.questDotCorruptionTarget() !== null)
        )
      ),
      common.waitForTarget(),
      common.waitForFacing(),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Drain Life", on => combat.bestTarget, req =>
            combat.bestTarget && me.pctHealth < (Settings.AfflictionDrainLifeHp ?? 80)
          ),
          spell.cast("Agony", on => this.agonyTarget(), req => this.agonyTarget() !== null),
          spell.cast("Corruption", on => this.corruptionTarget(), req => this.corruptionTarget() !== null),
          spell.cast("Haunt", on => combat.bestTarget, req => combat.bestTarget && !combat.bestTarget.hasAuraByMe(auras.haunt)),
          spell.cast("Summon Darkglare", on => combat.bestTarget, req => this.allTargetsDotted()),
          spell.cast("Dark Harvest", on => combat.bestTarget, req => this.allTargetsDotted()),
          spell.cast("Seed of Corruption", on => this.seedTarget(), req =>
            combat.targets.length >= 3 && me.powerByType(PowerType.SoulShards) >= 1 && this.seedTarget() !== null
          ),
          spell.cast("Unstable Affliction", on => this.unstableAfflictionTarget(), req =>
            me.powerByType(PowerType.SoulShards) >= 1 && this.unstableAfflictionTarget() !== null
          ),
          spell.cast("Shadow Bolt", on => combat.bestTarget)
        )
      )
    );
  }

  agonyTarget() {
    for (const t of combat.targets) {
      const dot = t.getAuraByMe(auras.agony);
      if (!dot || dot.remaining <= dot.duration * 0.3) return t;
    }
    return null;
  }

  corruptionTarget() {
    const permanent = me.hasAura(auras.absoluteCorruption);
    for (const t of combat.targets) {
      const dot = t.getAuraByMe(auras.corruption);
      if (!dot) return t;
      if (permanent) continue;
      if (dot.remaining <= dot.duration * 0.3) return t;
    }
    return null;
  }

  unstableAfflictionTarget() {
    for (const t of combat.targets) {
      const dot = t.getAuraByMe(auras.unstableAffliction);
      if (!dot || dot.remaining <= dot.duration * 0.3) return t;
    }
    return null;
  }

  seedTarget() {
    for (const t of combat.targets) {
      if (!t.hasAuraByMe(auras.seedOfCorruption) && !t.hasAuraByMe(auras.corruption)) return t;
    }
    return combat.bestTarget;
  }

  allTargetsDotted() {
    if (combat.targets.length === 0) return false;
    return combat.targets.every(t => t.hasAuraByMe(auras.agony) || t.hasAuraByMe(auras.corruption));
  }

  questDotCandidates() {
    const range = Settings.AfflictionQuestDotRange ?? 40;
    const results = [];
    objMgr.objects.forEach(obj => {
      if (!(obj instanceof wow.CGUnit)) return;
      if (obj instanceof wow.CGPlayer) return;
      if (obj === me) return;
      if (obj.deadOrGhost) return;
      if (!obj.isAttackable) return;
      if (!obj.isRelatedToActiveQuest) return;
      if (me.distanceTo(obj) > range) return;
      results.push(obj);
    });
    return results;
  }

  questDotAgonyTarget() {
    return this.questDotCandidates().find(t => {
      const dot = t.getAuraByMe(auras.agony);
      return !dot || dot.remaining <= dot.duration * 0.3;
    }) || null;
  }

  questDotCorruptionTarget() {
    const permanent = me.hasAura(auras.absoluteCorruption);
    return this.questDotCandidates().find(t => {
      const dot = t.getAuraByMe(auras.corruption);
      if (!dot) return true;
      if (permanent) return false;
      return dot.remaining <= dot.duration * 0.3;
    }) || null;
  }

  summonSelectedPet() {
    return new bt.Action(() => {
      if (Pet.isAlive()) return bt.Status.Failure;
      if (me.inCombat() && !me.hasAura(auras.felDomination)) return bt.Status.Failure;

      const wSpell = spell.getSpell("Summon " + Settings.AfflictionPetType);
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
