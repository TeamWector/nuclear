import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import spell from "@/Core/Spell";
import objMgr, { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as Combat } from "@/Targeting/CombatTargeting";
import Specialization from "@/Enums/Specialization";
import common from "@/Core/Common";
import Settings from "@/Core/Settings";
import { PowerType } from "@/Enums/PowerType";
import { RaceType } from "@/Enums/UnitEnums";

const auras = {
  battleShout: 6673,
  suddenDeath: 52437,
  colossalMight: 440989,
  rend: 388539,
  deepWounds: 262115,
  sweepingStrikes: 260708,
  avatar: 107574,
  mortalWounds: 115804,
  collateralDamage: 334783,
  executionersPrecision: 386633,
  masterOfWarfare: 1269394,
};

const spells = {
};

export class WarriorArmsPVE extends Behavior {
  name = "Warrior (Arms) PVE";
  context = BehaviorContext.Any;
  specialization = Specialization.Warrior.Arms;

  static settings = [
  ];

  build() {
    return new bt.Selector(
      common.waitForNotSitting(),
      common.waitForNotMounted(),
      common.waitForCastOrChannel(),
      common.waitForTarget(),
      common.waitForFacing(),
      common.waitForCombat(),
      spell.interrupt("Pummel"),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          this.battleShout(),
          new bt.Decorator(
            ret => this.hasCooldownsReady(),
            this.burstCooldowns()
          ),
          new bt.Decorator(
            ret => this.isAoE(),
            this.aoeRotation()
          ),
          this.singleTargetRotation()
        )
      )
    );
  }

  battleShout() {
    return spell.cast("Battle Shout", ret => !me.hasAura(auras.battleShout));
  }

  burstCooldowns() {
    return new bt.Selector(
      this.useRacials(),
      this.useTrinkets(),
      spell.cast("Ravager", on => me.target, ret => spell.isSpellKnown("Ravager")),
      spell.cast("Avatar", ret => this.shouldCastAvatar()),
      spell.cast("Colossus Smash", on => me.target, ret => this.shouldCastColossusSmash()),
      spell.cast("Bladestorm", on => me.target, ret => spell.isSpellKnown("Bladestorm")),
    );
  }

  singleTargetRotation() {
    return new bt.Selector(
      // Sweeping Strikes (2 targets)
      spell.cast("Sweeping Strikes", ret => me.getEnemies(8).length === 2),

      // Rend upkeep
      spell.cast("Rend", on => me.target, ret => this.shouldCastRend()),

      // Avatar
      spell.cast("Avatar", ret => this.shouldCastAvatar()),

      // Colossus Smash
      spell.cast("Colossus Smash", on => me.target, ret => this.shouldCastColossusSmash()),

      // Demolish - during Smash (Colossus build)
      spell.cast("Demolish", on => me.target, ret => this.isColossusBuild() && this.hasSmashDebuff()),

      // Heroic Strike (Master of Warfare)
      spell.cast("Heroic Strike", on => me.target, ret => this.hasHeroicStrikeProc()),

      // Execute Sudden Death
      spell.cast("Execute", on => me.target, ret => this.hasSuddenDeath()),

      // Execute phase priority
      new bt.Decorator(
        ret => this.isExecutePhase(),
        new bt.Selector(
          spell.cast("Mortal Strike", on => me.target, ret => this.getExecutionersPrecisionStacks() === 2),
          spell.cast("Execute", on => me.target, ret => this.shouldExecute() && (me.powerByType(PowerType.Rage) >= 70 || this.getExecutionersPrecisionStacks() < 2)),
          spell.cast("Overpower", on => me.target, ret => this.shouldCastOverpower() && me.powerByType(PowerType.Rage) < 70),
          spell.cast("Execute", on => me.target, ret => this.shouldExecute()),
        )
      ),

      // Mortal Strike (Colossus build)
      spell.cast("Mortal Strike", on => me.target, ret => this.isColossusBuild()),

      // Overpower
      spell.cast("Overpower", on => me.target, ret => this.shouldCastOverpower()),

      // Mortal Strike fallback
      spell.cast("Mortal Strike", on => me.target),

      // Slam filler
      spell.cast("Slam", on => me.target, ret => this.shouldSlam())
    );
  }

  aoeRotation() {
    return new bt.Selector(
      // Sweeping Strikes (2 targets in AOE)
      spell.cast("Sweeping Strikes", ret => me.getEnemies(8).length === 2),

      // Rend upkeep
      spell.cast("Rend", on => me.target, ret => this.shouldCastRend()),

      // Avatar
      spell.cast("Avatar", ret => this.shouldCastAvatar()),

      // Colossus Smash
      spell.cast("Colossus Smash", on => me.target, ret => this.shouldCastColossusSmash()),

      // Demolish - during Smash (Colossus build)
      spell.cast("Demolish", on => me.target, ret => this.isColossusBuild() && this.hasSmashDebuff()),

      // Heroic Strike (Master of Warfare)
      spell.cast("Heroic Strike", on => me.target, ret => this.hasHeroicStrikeProc()),

      // Execute Sudden Death
      spell.cast("Execute", on => me.target, ret => this.hasSuddenDeath()),

      // Collateral Damage Cleave
      spell.cast("Cleave", on => me.target, ret => this.hasCollateralDamage()),
      spell.cast("Whirlwind", on => me.target, ret => this.hasCollateralDamage() && spell.isSpellKnown("Whirlwind")),

      // Cleave spam
      spell.cast("Cleave", on => me.target),

      // Mortal Strike (Colossus build)
      spell.cast("Mortal Strike", on => me.target, ret => this.isColossusBuild()),

      // Overpower
      spell.cast("Overpower", on => me.target, ret => this.shouldCastOverpower()),

      // Slam filler
      spell.cast("Slam", on => me.target, ret => this.shouldSlam())
    );
  }

  useRacials() {
    return new bt.Selector(
      spell.cast("Blood Fury", on => me, ret => me.race === RaceType.Orc),
      spell.cast("Berserking", on => me, ret => me.race === RaceType.Troll),
      spell.cast("Fireblood", on => me, ret => me.race === RaceType.DarkIronDwarf),
      spell.cast("Ancestral Call", on => me, ret => me.race === RaceType.MagharOrc),
    );
  }

  useTrinkets() {
    return new bt.Selector(
    );
  }

  // Helper methods

  isAoE() {
    return me.getEnemies(8).length >= 3;
  }

  isExecutePhase() {
    if (!me.target) return false;
    return me.target.pctHealth < 20;
  }

  isColossusBuild() {
    return spell.isSpellKnown("Demolish");
  }

  hasSmashDebuff() {
    if (!me.target) return false;
    return me.target.hasAuraByMe("Colossus Smash") || me.target.hasAuraByMe("Warbreaker");
  }

  hasSuddenDeath() {
    return Boolean(me.getAura(auras.suddenDeath));
  }

  hasHeroicStrikeProc() {
    return me.hasAura(auras.masterOfWarfare);
  }

  shouldCastRend() {
    if (!spell.isSpellKnown("Rend")) return false;
    if (!me.target) return false;
    const rendAura = me.target.getAuraByMe(auras.rend);
    if (!rendAura) return true;
    return rendAura.remaining < 4000;
  }

  shouldCastAvatar() {
    return spell.isSpellKnown("Avatar") && !spell.isOnCooldown("Avatar");
  }

  shouldCastColossusSmash() {
    return spell.isSpellKnown("Colossus Smash") && !spell.isOnCooldown("Colossus Smash");
  }

  shouldCastOverpower() {
    return spell.isSpellKnown("Overpower") && !spell.isOnCooldown("Overpower");
  }

  shouldSlam() {
    return me.powerByType(PowerType.Rage) >= 60;
  }

  shouldExecute() {
    if (!me.target) return false;
    return me.target.pctHealth < 20;
  }

  colossalMightStacks() {
    const n = me.getAuraStacks(auras.colossalMight);
    return typeof n === "number" ? n : 0;
  }

  hasCollateralDamage() {
    return me.getAuraStacks(auras.collateralDamage) >= 3;
  }

  getExecutionersPrecisionStacks() {
    return me.getAuraStacks(auras.executionersPrecision);
  }

  hasCooldownsReady() {
    return Combat.burstToggle && me.target && me.isWithinMeleeRange(me.target);
  }
}