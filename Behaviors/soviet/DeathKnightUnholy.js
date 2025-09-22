import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import spell from "@/Core/Spell";
import objMgr, { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as Combat } from "@/Targeting/CombatTargeting";
import Specialization from "@/Enums/Specialization";
import common from "@/Core/Common";
import Pet from "@/Core/Pet";
import Settings from "@/Core/Settings";
import { PowerType } from "@/Enums/PowerType";
import { RaceType } from "@/Enums/UnitEnums";

const auras = {
  darkSuccor: 101568,
  chainsOfIce: 45524,
  festeringWound: 194310,
  deathAndDecay: 188290,
  suddenDoom: 81340,
  plagueBringer: 390178,
  frostFever: 55095,
  bloodPlague: 55078,
  virulentPlague: 191587,
  deathRot: 377540,
  trollbaneChainsOfIce: 444826,
  festeringScythe: 458123,
  legionOfSouls: 383269,
  rottenTouch: 390275,
  unholyAssault: 207289,
}

export class DeathKnightUnholy extends Behavior {
  name = "Death Knight (Unholy) PVE";
  context = BehaviorContext.Any; // PvP or PvE
  specialization = Specialization.DeathKnight.Unholy
  static settings = [
  ];

  build() {
    return new bt.Selector(
      common.waitForNotSitting(),
      common.waitForNotMounted(),
      common.waitForCastOrChannel(),
      common.waitForTarget(),
      common.waitForFacing(),
      spell.cast("Raise Ally", on => objMgr.objects.get(wow.GameUI.mouseoverGuid), req => this.mouseoverIsDeadFriend()),
      spell.cast("Raise Dead", on => me, req => !Pet.current),
      spell.interrupt("Mind Freeze"),
      spell.cast("Claw", on => me.target),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          common.waitForNotSitting(),
          common.waitForNotMounted(),
          common.waitForCastOrChannel(),
          spell.cast("Death Strike", ret => me.pctHealth < 95 && me.hasAura(auras.darkSuccor)),
          spell.cast("Death Strike", ret => me.pctHealth < 45 && me.power > 55),
          new bt.Decorator(
            ret => me.target && me.isWithinMeleeRange(me.target) && me.getEnemies(12).length >= 2,
            this.aoeDamage()
          ),
          this.singleTargetDamage()
        )
      )
    );
  }

  // CD Priority - Cooldown usage priority
  cooldownPriority() {
    return new bt.Selector(
      this.useRacials(),
      // Cast Legion of Souls
      spell.cast("Army of the Dead", ret => true),
      // Cast Rune Strike if we have fewer than 4 festering wounds after Legion of Souls during burst
      spell.cast("Rune Strike", on => me.target, ret => me.target && me.targetUnit.getAuraStacks(auras.festeringWound) < 4),
      // Cast Apocalypse - moved from rotation priorities
      spell.cast("Apocalypse", on => me.target, ret => me.target && me.targetUnit.getAuraStacks(auras.festeringWound) >= 4),
      // Cast Apocalypse the target with the lowest Festering Wounds (AoE)
      spell.cast("Apocalypse", on => this.findTargetWithLeastWounds(), ret => this.findTargetWithLeastWounds() !== undefined),
      // Cast Unholy Assault
      this.useTrinkets(),
      spell.cast("Unholy Assault", ret => true),
    );
  }

  // Racial abilities
  useRacials() {
    return new bt.Selector(
      spell.cast("Blood Fury", on => me, ret => me.race === RaceType.Orc),
    );
  }

  // Base Priority - Single Target Damage rotation
  singleTargetDamage() {
    return new bt.Selector(
      // Follow the cooldown priority below if any of your cooldowns are ready
      new bt.Decorator(
        ret => this.hasCooldownsReady(),
        this.cooldownPriority()
      ),
      // Maintain Virulent Plague on our target (basic maintenance)
      spell.cast("Outbreak", on => me.target, ret => this.shouldCastOutbreak()),
      // Maintain at least 1 Festering Wound - Cast Rune Strike if <1 Festering Wounds
      spell.cast("Rune Strike", on => me.target, ret => me.target && me.targetUnit.getAuraStacks(auras.festeringWound) < 1),
      // 2. Cast Festering Scythe if it is available
      spell.cast("Festering Scythe", on => me.target, ret => me.hasAura(auras.festeringScythe)),
      // 3. Cast Soul Reaper if the enemy is below 35% health or will be when this expires
      spell.cast("Soul Reaper", on => me.target, ret => me.target && me.targetUnit.pctHealth <= 35),
      // 4. Cast Death Coil when you have more than 80 Runic Power or when Sudden Doom is active
      spell.cast("Death Coil", on => me.target, ret => me.power > 80 || me.hasAura(auras.suddenDoom)),
      // 5. Cast Scourge Strike (Clawing Shadows) when you have 1 or more Festering Wounds and Rotten Touch is on the target
      spell.cast("Scourge Strike", on => me.target, ret => me.target && me.targetUnit.getAuraStacks(auras.festeringWound) >= 1 && me.targetUnit.hasAuraByMe(auras.rottenTouch)),
      // 6. Cast Rune Strike (Festering Strike) when you have 2 or less Festering Wounds (but only at 0 wounds during Army of the Dead)
      spell.cast("Rune Strike", on => me.target, ret => this.shouldCastFesteringStrike()),
      // Maintain Plaguebringer with Scourge Strike
      spell.cast("Scourge Strike", on => me.target, ret => me.target && this.isPlaguebringerAboutToExpire()),
      // 8. Cast Death Coil if Death Rot is about to fall off
      spell.cast("Death Coil", on => me.target, ret => this.isDeathRotAboutToExpire()),
      // Prevent Runic Power overcap with Death Coil
      spell.cast("Death Coil", on => me.target, ret => me.power > 90),
      // 9. Cast Scourge Strike (Clawing Shadows) when you have 3 or more Festering Wounds
      spell.cast("Scourge Strike", on => me.target, ret => me.target && me.targetUnit.getAuraStacks(auras.festeringWound) >= 3),
      // 10. Cast Death Coil
      spell.cast("Death Coil", on => me.target, ret => me.power >= 40),
    );
  }

  // AoE Damage - Based on provided priority list
  aoeDamage() {
    return new bt.Selector(
      // Follow the cooldown priority if any cooldowns are ready
      new bt.Decorator(
        ret => this.hasCooldownsReady(),
        this.cooldownPriority()
      ),
      // Maintain Virulent Plague on our target (basic maintenance)
      spell.cast("Outbreak", on => me.target, ret => this.shouldCastOutbreak()),
      // Maintain at least 1 Festering Wound - Cast Rune Strike if <1 Festering Wounds
      spell.cast("Rune Strike", on => me.target, ret => me.target && me.targetUnit.getAuraStacks(auras.festeringWound) < 1),
      // 1. Cast Festering Scythe if it is available (spread Festering Wounds)
      spell.cast("Festering Scythe", on => me.target, ret => me.hasAura(auras.festeringScythe)),
      // Cast Death and Decay if not already active (don't overlap with Legion of Souls buff)
      spell.cast("Death and Decay", ret => this.shouldCastDeathAndDecay()),
      // 3. Cast Scourge Strike (Clawing Shadows) if Plaguebringer is not active (maintain Plaguebringer)
      spell.cast("Scourge Strike", on => me.target, ret => !me.hasAura(auras.plagueBringer)),
      // 4. Cast Outbreak if Virulent Plague is missing and Apocalypse and either Virulent Plague or Frost Fever are missing on any target
      spell.cast("Outbreak", on => me.target, ret => this.shouldCastOutbreakAoE()),
      // Prevent Runic Power overcap with Epidemic
      spell.cast("Epidemic", ret => me.power > 90 && this.shouldUseEpidemic()),
      // 6. Cast Epidemic if Sudden Doom is active
      spell.cast("Epidemic", ret => me.hasAura(auras.suddenDoom)),
      // 7. Cast Scourge Strike (Clawing Shadows) if any target has a Festering Wound
      spell.cast("Scourge Strike", on => this.findTargetWithFesteringWounds(), ret => this.findTargetWithFesteringWounds() !== undefined),
      // 8. Cast Epidemic if no targets have Festering Wounds
      spell.cast("Epidemic", ret => this.shouldUseEpidemicNoWounds()),
      // 9. Cast Scourge Strike (Clawing Shadows)
      spell.cast("Scourge Strike", on => me.target, ret => me.target && me.targetUnit.getAuraStacks(auras.festeringWound) >= 1),
      // 10. Cast Epidemic
      spell.cast("Epidemic", ret => this.shouldUseEpidemic()),
    );
  }

  mouseoverIsDeadFriend() {
    const mouseover = objMgr.objects.get(wow.GameUI.mouseoverGuid);
    if (mouseover && mouseover instanceof wow.CGUnit) {
      return mouseover.deadOrGhost &&
        !mouseover.canAttack &&
        mouseover.guid !== me.guid &&
        me.withinLineOfSight(mouseover);
    }
    return false;
  }


  findTargetWithTrollbaneChainsOfIce() {
    const enemies = me.getEnemies(8);

    for (const enemy of enemies) {
      const chainsOfIce = enemy.getAuraByMe(auras.trollbaneChainsOfIce);
      if (me.isFacing(enemy) && chainsOfIce) {
        return enemy;
      }
    }

    return undefined
  }

  enemiesWithFesteringWoundsCount() {
    const enemies = me.getEnemies(8);
    let count = 0;

    for (const enemy of enemies) {
      const festeringWounds = enemy.getAuraByMe(auras.festeringWound);
      if (me.isFacing(enemy) && festeringWounds && festeringWounds.stacks > 0) {
        count++;
      }
    }

    return count;
  }

  useTrinkets() {
    return new bt.Selector(
      common.useEquippedItemByName("Cursed Stone Idol"),
    );
  }

  shouldCastOutbreak() {
    if (!me.target) {
      return false;
    }
    // Only check for Virulent Plague - the main DoT applied by Outbreak in current patch
    return !me.targetUnit.hasAuraByMe(auras.virulentPlague);
  }

  shouldCastOutbreakForApocalypse() {
    if (!me.target) {
      return false;
    }
    // Cast Outbreak if Apocalypse has >7s left on its CD and Virulent Plague is not up
    return spell.isOnCooldown("Apocalypse") && !me.targetUnit.hasAuraByMe(auras.virulentPlague);
  }

  shouldCastOutbreakForPriority() {
    if (!me.target) {
      return false;
    }
    // Cast Outbreak if Virulent Plague is missing and Apocalypse or Army of the Dead have more than 7 seconds remaining on their cooldown
    const apocalypseCooldown = spell.getCooldown("Apocalypse");
    const armyOfTheDeadCooldown = spell.getCooldown("Army of the Dead");
    const hasVirulentPlague = me.targetUnit.hasAuraByMe(auras.virulentPlague);

    return !hasVirulentPlague &&
           (apocalypseCooldown > 5000 || armyOfTheDeadCooldown > 5000);
  }

  shouldCastFesteringStrike() {
    if (!me.target) {
      return false;
    }

    const festeringWounds = me.targetUnit.getAuraStacks(auras.festeringWound);
    const hasArmyOfTheDead = me.hasAura(auras.legionOfSouls); // Army of the Dead gives Legion of Souls buff

    // While Army of the Dead (Legion of Souls) is active, only cast when you are at 0 Festering Wounds
    if (hasArmyOfTheDead) {
      return festeringWounds === 0;
    }

    // Otherwise, cast when you have 2 or less Festering Wounds
    return festeringWounds <= 2;
  }

  hasCooldownsReady() {
    // Check if any major cooldowns are ready and burst toggle is enabled
    return Combat.burstToggle && (
      !spell.isOnCooldown("Army of the Dead") ||
      !spell.isOnCooldown("Apocalypse") ||
      !spell.isOnCooldown("Unholy Assault")
    );
  }

  isDeathRotAboutToExpire() {
    if (!me.target) {
      return false;
    }

    const deathRot = me.target.getAuraByMe(auras.deathRot);
    return !!(deathRot && deathRot.remaining < 2000);
  }

  shouldUseBurstPriority() {
    // Follow the Burst priority if Death and Decay or Army of the Dead is active
    return me.hasAura(auras.deathAndDecay) || me.hasAura(auras.legionOfSouls);
  }

  // Consolidated target finding method
  findTargetByWoundCriteria(criteria) {
    const enemies = me.getEnemies(8);
    let bestTarget = undefined;
    let bestValue = criteria === 'most' ? 0 : 999;

    for (const enemy of enemies) {
      if (!me.isFacing(enemy)) continue;

      const festeringWounds = enemy.getAuraByMe(auras.festeringWound);
      const woundCount = festeringWounds ? festeringWounds.stacks : 0;
      const chainsOfIce = enemy.getAuraByMe(auras.trollbaneChainsOfIce);

      switch (criteria) {
        case 'most':
          if (woundCount > bestValue) {
            bestTarget = enemy;
            bestValue = woundCount;
          }
          break;
        case 'least':
          if (woundCount < bestValue) {
            bestTarget = enemy;
            bestValue = woundCount;
          }
          break;
        case 'trollbane':
          if (chainsOfIce) return enemy;
          break;
        case 'any_wounds':
          if (woundCount > 0) return enemy;
          break;
      }
    }

    return bestTarget;
  }

  findTargetWithLeastWounds() {
    return this.findTargetByWoundCriteria('least');
  }

  findTargetWithFesteringWounds() {
    return this.findTargetByWoundCriteria('any_wounds');
  }

  isPlaguebringerAboutToExpire() {
    const plaguebringer = me.getAura(auras.plagueBringer);
    return !!(plaguebringer && plaguebringer.remaining < 3000);
  }

  shouldUseEpidemic() {
    if (!me.target || !me.targetUnit.hasAuraByMe(auras.virulentPlague)) {
      return false;
    }

    const enemyCount = me.getEnemies(15).length;
    const hasImprovedDeathCoil = me.hasVisibleAura(377580); // Improved Death Coil talent aura ID

    // Use Epidemic at 4+ targets with Improved Death Coil, 3+ targets without it
    const targetThreshold = hasImprovedDeathCoil ? 4 : 3;
    return enemyCount >= targetThreshold;
  }

  shouldCastOutbreakAoE() {
    if (!me.target) {
      return false;
    }

    // Cast Outbreak if Virulent Plague is missing and Apocalypse and either Virulent Plague or Frost Fever are missing on any target
    const hasVirulentPlague = me.targetUnit.hasAuraByMe(auras.virulentPlague);
    const hasFrostFever = me.targetUnit.hasAuraByMe(auras.frostFever);
    const apocalypseOnCooldown = spell.isOnCooldown("Apocalypse");

    return !hasVirulentPlague && apocalypseOnCooldown && (!hasVirulentPlague || !hasFrostFever);
  }

  shouldUseEpidemicNoWounds() {
    if (!me.target || !me.targetUnit.hasAuraByMe(auras.virulentPlague)) {
      return false;
    }

    // Check if no targets have Festering Wounds
    const enemies = me.getEnemies(15);
    const hasWoundedTargets = enemies.some(enemy => enemy.getAuraStacks(auras.festeringWound) > 0);

    return !hasWoundedTargets && enemies.length >= 2;
  }

  shouldCastDeathAndDecay() {
    // Don't cast Death and Decay if we already have the buff (from Legion of Souls or previous cast)
    // Legion of Souls gives Death and Decay buff for full 14 seconds, so don't overlap
    return !me.hasAura(auras.deathAndDecay);
  }
}
