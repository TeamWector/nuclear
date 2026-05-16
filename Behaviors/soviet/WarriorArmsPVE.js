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
          this.mainRotation()
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
      spell.cast("Ravager", on => me.target, ret => spell.isSpellKnown("Ravager") && this.shouldCastRavager()),
      spell.cast("Avatar", ret => this.shouldCastAvatar()),
      spell.cast("Colossus Smash", on => me.target, ret => this.shouldCastColossusSmash()),
      spell.cast("Bladestorm", on => me.target, ret => spell.isSpellKnown("Bladestorm")),
    );
  }

  mainRotation() {
    const enemyCount = this.getEnemiesInRange(8);

    // 3+ targets: Cleave-focused AoE rotation
    if (enemyCount >= 3) {
      return this.aoeCleaveRotation();
    }

    // 2 targets: Sweeping Strikes + single target rotation
    if (enemyCount === 2) {
      return this.sweepingStrikesRotation();
    }

    // Single target
    if (this.isExecutePhase()) {
      return this.executeRotation();
    }
    return this.normalRotation();
  }

  normalRotation() {
    return new bt.Selector(
      // Rend upkeep - refresh when < 4 seconds remaining
      spell.cast("Rend", on => me.target, ret => this.shouldCastRend()),

      // Demolish during Colossus Smash (Colossus build)
      spell.cast("Demolish", on => me.target, ret => this.shouldCastDemolishSingle()),

      // Heroic Strike
      spell.cast("Heroic Strike", on => me.target, ret => this.hasHeroicStrikeProc()),

      // Mortal Strike - keep on cooldown
      spell.cast("Mortal Strike", on => me.target, ret => this.isColossusBuild()),

      // Overpower
      spell.cast("Overpower", on => me.target, ret => this.shouldCastOverpower()),

      // Mortal Strike fallback
      spell.cast("Mortal Strike", on => me.target),

      // Execute during Sudden Death
      spell.cast("Execute", on => me.target, ret => this.hasSuddenDeath()),

      // Slam to fill
      spell.cast("Slam", on => me.target, ret => this.shouldSlam())
    );
  }

  executeRotation() {
    return new bt.Selector(
      // Rend upkeep
      spell.cast("Rend", on => me.target, ret => this.shouldCastRend()),

      // Demolish during Colossus Smash with 10 stacks
      spell.cast("Demolish", on => me.target, ret => this.shouldCastDemolishExecute()),

      // Heroic Strike
      spell.cast("Heroic Strike", on => me.target, ret => this.hasHeroicStrikeProc()),

      // Mortal Strike
      spell.cast("Mortal Strike", on => me.target, ret => this.isColossusBuild()),

      // Execute during Sudden Death
      spell.cast("Execute", on => me.target, ret => this.hasSuddenDeath()),

      // Execute
      spell.cast("Execute", on => me.target, ret => this.shouldExecute()),

      // Overpower
      spell.cast("Overpower", on => me.target, ret => this.shouldCastOverpower()),

      // Execute if Deep Wounds talented (Deep Wounds deals extra execute damage)
      spell.cast("Execute", on => me.target, ret => this.hasTalent("Deep Wounds")),

      // Slam to fill
      spell.cast("Slam", on => me.target, ret => this.shouldSlam())
    );
  }

  // 2 targets: Sweeping Strikes + single target rotation
  sweepingStrikesRotation() {
    return new bt.Selector(
      // Apply/refresh Rend on target
      spell.cast("Rend", on => me.target, ret => this.shouldCastRend()),

      // Cast Sweeping Strikes if not active
      spell.cast("Sweeping Strikes", ret => this.shouldCastSweepingStrikes()),

      // Burst cooldowns
      spell.cast("Ravager", on => me.target, ret => spell.isSpellKnown("Ravager") && this.shouldCastRavager()),
      spell.cast("Avatar", ret => this.shouldCastAvatar()),
      spell.cast("Colossus Smash", on => me.target, ret => this.shouldCastColossusSmash()),
      spell.cast("Bladestorm", on => me.target, ret => spell.isSpellKnown("Bladestorm")),

      // Demolish during Colossus Smash
      spell.cast("Demolish", on => me.target, ret => this.shouldCastDemolishSingle()),

      // Heroic Strike
      spell.cast("Heroic Strike", on => me.target, ret => this.hasHeroicStrikeProc()),

      // Mortal Strike - cleaves to second target via Sweeping Strikes
      spell.cast("Mortal Strike", on => me.target, ret => this.isColossusBuild()),

      // Overpower
      spell.cast("Overpower", on => me.target, ret => this.shouldCastOverpower()),

      // Mortal Strike fallback
      spell.cast("Mortal Strike", on => me.target),

      // Execute during Sudden Death
      spell.cast("Execute", on => me.target, ret => this.hasSuddenDeath()),

      // Slam to fill
      spell.cast("Slam", on => me.target, ret => this.shouldSlam())
    );
  }

  // 3+ targets: Cleave-focused AoE rotation
  aoeCleaveRotation() {
    return new bt.Selector(
      // Apply/refresh Rend
      spell.cast("Rend", on => me.target, ret => this.shouldCastRend()),

      // Cast Sweeping Strikes if not active
      spell.cast("Sweeping Strikes", ret => this.shouldCastSweepingStrikes()),

      // Burst cooldowns
      spell.cast("Ravager", on => me.target, ret => spell.isSpellKnown("Ravager") && this.shouldCastRavagerAoE()),
      spell.cast("Avatar", ret => this.shouldCastAvatar()),
      spell.cast("Colossus Smash", on => me.target, ret => this.shouldCastColossusSmash()),
      spell.cast("Bladestorm", on => me.target, ret => spell.isSpellKnown("Bladestorm")),

      // Collateral Damage buff: prioritize Cleave (75% increased damage)
      spell.cast("Cleave", on => me.target, ret => this.hasCollateralDamage() && this.shouldCastCleave()),
      spell.cast("Whirlwind", on => me.target, ret => this.hasCollateralDamage() && spell.isSpellKnown("Whirlwind")),

      // Demolish
      spell.cast("Demolish", on => me.target, ret => this.shouldCastDemolishAoE()),

      // Cleave - main focus for 3+ targets
      spell.cast("Cleave", on => me.target, ret => this.shouldCastCleave()),

      // Mortal Strike
      spell.cast("Mortal Strike", on => me.target, ret => this.isColossusBuild()),

      // Overpower
      spell.cast("Overpower", on => me.target, ret => this.shouldCastOverpower()),

      // Execute during Sudden Death
      spell.cast("Execute", on => me.target, ret => this.hasSuddenDeath()),

      // Thunder Clap filler
      spell.cast("Thunder Clap", on => me.target, ret => this.shouldCastThunderClap())
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

  hasTalent(talentName) {
    return me.hasAura(talentName);
  }

  isColossusBuild() {
    return spell.isSpellKnown("Demolish");
  }

  colossalMightStacks() {
    const n = me.getAuraStacks(auras.colossalMight);
    return typeof n === "number" ? n : 0;
  }

  hasSmashDebuff() {
    if (!me.target) return false;
    return me.target.hasAuraByMe("Colossus Smash") || me.target.hasAuraByMe("Warbreaker");
  }

  hasSuddenDeath() {
    return Boolean(me.getAura(auras.suddenDeath));
  }

  hasHeroicStrikeProc() {
    if (!spell.isSpellKnown("Heroic Strike")) return false;
    return me.hasAura("Heroic Strike") || me.hasAura("Improved Heroic Strike");
  }

  shouldCastRend() {
    if (!spell.isSpellKnown("Rend")) return false;
    if (!me.target) return false;
    const rendAura = me.target.getAuraByMe(auras.rend);
    // Cast if no Rend or less than 4 seconds remaining
    if (!rendAura) return true;
    return rendAura.remaining < 4000;
  }

  shouldCastRendAoE() {
    if (!spell.isSpellKnown("Rend")) return false;
    if (!me.target) return false;
    const rendAura = me.target.getAuraByMe(auras.rend);
    // In AoE, refresh Rend when < 4 seconds remaining
    if (!rendAura) return true;
    return rendAura.remaining < 4000;
  }

  shouldCastRavager() {
    // Ravager before Colossus Smash
    if (!spell.isOnCooldown("Colossus Smash") && spell.isSpellKnown("Colossus Smash")) return true;
    return !spell.isOnCooldown("Ravager");
  }

  shouldCastRavagerAoE() {
    // In AoE, just use Ravager off cooldown
    return true;
  }

  shouldCastAvatar() {
    if (!spell.isSpellKnown("Avatar")) return false;
    if (spell.isOnCooldown("Avatar")) return false;
    // Use Avatar before/with Colossus Smash
    if (!spell.isOnCooldown("Colossus Smash") && spell.isSpellKnown("Colossus Smash")) return true;
    return true;
  }

  shouldCastColossusSmash() {
    if (!spell.isSpellKnown("Colossus Smash")) return false;
    if (spell.isOnCooldown("Colossus Smash")) return false;
    return true;
  }

  shouldCastDemolishSingle() {
    if (!spell.isSpellKnown("Demolish") || !this.isColossusBuild()) return false;
    if (!me.target) return false;
    // Cast Demolish during Colossus Smash
    if (this.hasSmashDebuff()) return true;
    return false;
  }

  shouldCastDemolishExecute() {
    if (!spell.isSpellKnown("Demolish") || !this.isColossusBuild()) return false;
    if (!me.target) return false;
    // Cast Demolish during Colossus Smash and 10 stacks of Colossal Might
    if (this.hasSmashDebuff() && this.colossalMightStacks() >= 10) return true;
    return false;
  }

  shouldCastDemolishAoE() {
    if (!spell.isSpellKnown("Demolish") || !this.isColossusBuild()) return false;
    if (!me.target) return false;
    // Cast during Colossus Smash
    if (this.hasSmashDebuff()) return true;
    return false;
  }

  shouldCastOverpower() {
    if (!spell.isSpellKnown("Overpower")) return false;
    if (spell.isOnCooldown("Overpower")) return false;
    return true;
  }

  shouldCastSweepingStrikes() {
    if (!spell.isSpellKnown("Sweeping Strikes")) return false;
    if (me.hasAura(auras.sweepingStrikes)) return false;
    return this.getEnemiesInRange(8) >= 2;
  }

  shouldCastCleave() {
    if (!spell.isSpellKnown("Cleave")) return false;
    return this.getEnemiesInRange(8) >= 3;
  }

  shouldCastThunderClap() {
    if (!spell.isSpellKnown("Thunder Clap")) return false;
    return this.getEnemiesInRange(8) >= 3;
  }

  hasCollateralDamage() {
    return me.getAuraStacks(auras.collateralDamage) >= 3;
  }

  hasCollateralDamageStacks() {
    return me.getAuraStacks(auras.collateralDamage);
  }

  shouldExecute() {
    if (!me.target) return false;
    return me.target.pctHealth < 20;
  }

  shouldSlam() {
    if (!spell.isSpellKnown("Slam")) return false;
    // Slam as filler, don't waste if we have better options
    return me.powerByType(PowerType.Rage) >= 30;
  }

  hasCooldownsReady() {
    return Combat.burstToggle && me.target && me.isWithinMeleeRange(me.target);
  }

  getEnemiesInRange(range) {
    return me.getUnitsAroundCount(range);
  }

  getCurrentTarget() {
    const targetPredicate = unit => common.validTarget(unit) && me.isWithinMeleeRange(unit) && me.isFacing(unit);
    const target = me.target;
    if (target !== null && targetPredicate(target)) {
      return target;
    }
    return Combat.targets.find(targetPredicate) || null;
  }
}
