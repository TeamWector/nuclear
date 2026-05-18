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
    // 3+ targets: AoE rotation
    if (this.isAoE()) {
      return this.aoeRotation();
    }
    // Execute phase
    if (this.isExecutePhase()) {
      return this.executeRotation();
    }
    // Single target
    return this.normalRotation();
  }

  normalRotation() {
    return new bt.Selector(
      // Sweeping Strikes (2 targets)
      spell.cast("Sweeping Strikes", ret => me.getEnemies(8).length === 2),
      // Rend upkeep - refresh when < 4 seconds remaining
      spell.cast("Rend", on => me.target, ret => this.shouldCastRend()),

      // Avatar (per method.gg - timing is critical)
      spell.cast("Avatar", ret => this.shouldCastAvatar()),

      // Colossus Smash
      spell.cast("Colossus Smash", on => me.target, ret => this.shouldCastColossusSmash()),

      // Demolish during Colossus Smash (Colossus build)
      spell.cast("Demolish", on => me.target, ret => this.shouldCastDemolishSingle()),

      // Heroic Strike (Apex proc) - high priority
      spell.cast("Heroic Strike", on => me.target, ret => this.hasHeroicStrikeProc()),

      // Execute during Sudden Death - before Mortal Strike
      spell.cast("Execute", on => me.target, ret => this.hasSuddenDeath()),

      // Mortal Strike - keep on cooldown
      spell.cast("Mortal Strike", on => me.target, ret => this.isColossusBuild()),

      // Overpower
      spell.cast("Overpower", on => me.target, ret => this.shouldCastOverpower()),

      // Mortal Strike fallback
      spell.cast("Mortal Strike", on => me.target),

      // Slam to fill - only at high rage
      spell.cast("Slam", on => me.target, ret => this.shouldSlam())
    );
  }

  executeRotation() {
    return new bt.Selector(
      // Sweeping Strikes (2 targets)
      spell.cast("Sweeping Strikes", ret => me.getEnemies(8).length === 2),
      // Rend upkeep
      spell.cast("Rend", on => me.target, ret => this.shouldCastRend()),

      // Heroic Strike (Apex proc) - top priority in execute
      spell.cast("Heroic Strike", on => me.target, ret => this.hasHeroicStrikeProc()),

      // Demolish during Colossus Smash with 10 stacks
      spell.cast("Demolish", on => me.target, ret => this.shouldCastDemolishExecute()),

      // Execute during Sudden Death
      spell.cast("Execute", on => me.target, ret => this.hasSuddenDeath()),

      // Mortal Strike (at 2 stacks Executioner's Precision)
      spell.cast("Mortal Strike", on => me.target, ret => this.getExecutionersPrecisionStacks() === 2),

      // Execute (when rage > 70 or no Executioner's Precision stacks)
      spell.cast("Execute", on => me.target, ret => this.shouldExecute() && (me.powerByType(PowerType.Rage) >= 70 || this.getExecutionersPrecisionStacks() < 2)),

      // Overpower (when rage < 70)
      spell.cast("Overpower", on => me.target, ret => this.shouldCastOverpower() && me.powerByType(PowerType.Rage) < 70),

      // Mortal Strike
      spell.cast("Mortal Strike", on => me.target, ret => this.isColossusBuild()),

      // Execute (fallback)
      spell.cast("Execute", on => me.target, ret => this.shouldExecute()),

      // Slam to fill - only at high rage
      spell.cast("Slam", on => me.target, ret => this.shouldSlam())
    );
  }

  // 2+ targets: AoE rotation with SS + optional Cleave spam
  aoeRotation() {
    return new bt.Selector(
      // Sweeping Strikes (only 2 targets)
      spell.cast("Sweeping Strikes", ret => me.getEnemies(8).length === 2),

      // Apply/refresh Rend
      spell.cast("Rend", on => me.target, ret => this.shouldCastRend()),

      // Burst cooldowns
      spell.cast("Ravager", on => me.target, ret => spell.isSpellKnown("Ravager") && this.shouldCastRavager()),
      spell.cast("Avatar", ret => this.shouldCastAvatar()),
      spell.cast("Colossus Smash", on => me.target, ret => this.shouldCastColossusSmash()),
      spell.cast("Bladestorm", on => me.target, ret => spell.isSpellKnown("Bladestorm")),

      // Demolish during Colossus Smash - HIGH priority
      spell.cast("Demolish", on => me.target, ret => this.shouldCastDemolishAoE()),

      // Heroic Strike (Master of Warfare) - MoW makes Slam become HS
      spell.cast("Heroic Strike", on => me.target, ret => this.hasHeroicStrikeProc()),

      // Collateral Damage buff: prioritize Cleave (75% increased damage at 3 stacks)
      spell.cast("Cleave", on => me.target, ret => this.hasCollateralDamage() && me.getEnemies(8).length >= 3),
      spell.cast("Whirlwind", on => me.target, ret => this.hasCollateralDamage() && me.getEnemies(8).length >= 3 && spell.isSpellKnown("Whirlwind")),

      // Cleave - main AoE spam for 3+ targets
      spell.cast("Cleave", on => me.target, ret => me.getEnemies(8).length >= 3),

      // Mortal Strike (Mortal Wounds now triggers from Mortal Strike and Slam per 12.0.5)
      spell.cast("Mortal Strike", on => me.target, ret => this.isColossusBuild()),

      // Overpower
      spell.cast("Overpower", on => me.target, ret => this.shouldCastOverpower()),

      // Execute during Sudden Death
      spell.cast("Execute", on => me.target, ret => this.hasSuddenDeath()),

      // Slam filler (also triggers Mortal Wounds per 12.0.5)
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
    return me.hasAura(auras.masterOfWarfare);
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
    if (me.hasAura(auras.sweepingStrikes)) return false;
    return this.isAoE();
  }

  shouldCastCleave() {
    return this.isAoE();
  }

  hasCollateralDamage() {
    return me.getAuraStacks(auras.collateralDamage) >= 3;
  }

  getExecutionersPrecisionStacks() {
    return me.getAuraStacks(auras.executionersPrecision);
  }

  shouldExecute() {
    if (!me.target) return false;
    return me.target.pctHealth < 20;
  }

  shouldSlam() {
    // Slam as filler - only when we have excess rage
    // Note: Master of Warfare makes Slam become Heroic Strike automatically
    return me.powerByType(PowerType.Rage) >= 60;
  }

  hasCooldownsReady() {
    return Combat.burstToggle && me.target && me.isWithinMeleeRange(me.target);
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
