import { Behavior, BehaviorContext } from '@/Core/Behavior';
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from '@/Core/Spell';
import Settings from '@/Core/Settings';
import { me } from '@/Core/ObjectManager';
import { defaultCombatTargeting as Combat } from '@/Targeting/CombatTargeting';
import { PowerType } from '@/Enums/PowerType';
import { DispelPriority } from '@/Data/Dispels';
import { WoWDispelType } from '@/Enums/Auras';

const auras = {
  metamorphosis: 162264,
  immolationAura: 258920,
  unboundChaos: 347462,
  exergy: 208628, // The Hunt and Vengeful Retreat increase damage by 5% for 20 sec
  essenceBreak: 320338,
  warbladesHunger: 442503,
  reaversGlaive: 444686, // Correct aura ID found!
  thrillOfTheFight: 427717,
  glaiveFlurry: 442435,
  rendingStrike: 389978,
  initiative: 391215,
  blur: 212800,
  darkness: 209426,
  vengefulRetreat: 198793,
  felRush: 195072,
  sigilOfFlame: 204596,
  artOfTheGlaive: 444661,
  netherwalk: 196555,
};

export class DemonhunterHavocPvP extends Behavior {
  name = 'Demonhunter (Havoc) PvP';
  context = BehaviorContext.Any;
  specialization = Specialization.DemonHunter.Havoc;
  version = wow.GameVersion.Retail;

  static settings = [
    {
      header: 'Havoc PvP Settings',
      options: [
        {type: 'checkbox', uid: 'DHHavocUseOffensiveCooldown', text: 'Use Offensive Cooldowns', default: true},
        {type: 'checkbox', uid: 'DHHavocUseDefensiveCooldown', text: 'Use Defensive Cooldowns', default: true},
        {type: 'slider', uid: 'DHHavocBlurThreshold', text: 'Blur HP Threshold', default: 65, min: 1, max: 100},
        {type: 'slider', uid: 'DHHavocDarknessThreshold', text: 'Darkness HP Threshold', default: 35, min: 1, max: 100},
        {
          type: 'slider',
          uid: 'DHHavocNetherwalkThreshold',
          text: 'Netherwalk HP Threshold',
          default: 20,
          min: 1,
          max: 100
        }
      ]
    }
  ];

    build() {
      return new bt.Selector(
        common.waitForNotMounted(),
        common.waitForNotSitting(),
        common.waitForCastOrChannel(),

        // Interrupts (outside GCD)
        spell.interrupt('Disrupt', true),

        // CC abilities (outside GCD)
        spell.cast("Fel Eruption", on => this.felEruptionTarget(), ret => me.target && me.target.effectiveHealthPercent < 87 && this.felEruptionTarget() !== undefined),
        spell.cast("Imprison", on => this.imprisonTarget(), ret => me.target && me.target.effectiveHealthPercent < 75 && this.imprisonTarget() !== undefined),
        spell.cast("Sigil of Misery", on => this.sigilOfMiseryTarget(), ret => this.sigilOfMiseryTarget() !== undefined),

        common.waitForTarget(),
        common.waitForFacing(),

        new bt.Decorator(
          ret => !spell.isGlobalCooldown(),
          new bt.Selector(
            // Defensive cooldowns (highest priority)
            this.defensiveCooldowns(),
            // Offensive dispels
            this.offensiveDispels(),
            // PvP burst or sustained damage
            new bt.Decorator(
              ret => Combat.burstToggle && me.target,
              this.burstDamage()
            ),
            this.sustainedDamage()
          )
        )
      );
    }


  offensiveDispels() {
    return new bt.Selector(
      // Consume Magic for enemy buffs (high priority)
      spell.dispel("Consume Magic", false, DispelPriority.Low, true, WoWDispelType.Magic),
      // Reverse Magic for friendly debuffs (medium priority)
      // spell.dispel("Reverse Magic", true, DispelPriority.Medium, true, WoWDispelType.Magic)
    );
  }

  defensiveCooldowns() {
    return new bt.Selector(
      // Blur
      spell.cast('Blur', on => me, () =>
        me.effectiveHealthPercent <= Settings.DHHavocBlurThreshold &&
        Settings.DHHavocUseDefensiveCooldown),

      // Darkness
      spell.cast('Darkness', on => me, () =>
        me.effectiveHealthPercent <= Settings.DHHavocDarknessThreshold &&
        Settings.DHHavocUseDefensiveCooldown),

      // Netherwalk (emergency defensive)
      spell.cast('Netherwalk', on => me, () =>
        me.effectiveHealthPercent <= Settings.DHHavocNetherwalkThreshold &&
        Settings.DHHavocUseDefensiveCooldown)
    );
  }

  // PvP Burst Damage Sequence
  burstDamage() {
    return new bt.Decorator(
      ret => {
        // Burst when we have major cooldowns OR already in meta OR have decent fury
        const huntReady = spell.getCooldown('The Hunt').ready;
        const metaReady = spell.getCooldown('Metamorphosis').ready;
        const eyeBeamReady = spell.getCooldown('Eye Beam').ready;
        const fury = this.getFury();
        const metaActive = me.hasAura(auras.metamorphosis);

        return huntReady || metaReady || metaActive || eyeBeamReady || fury > 60;
      },
      this.burstSequence()
    );
  }

  burstSequence() {
    return new bt.Selector(
      // Burst sequence - tree will traverse down when spells are on cooldown
      // Throw glaive
      spell.cast("Throw Glaive", on => me.target, ret => me.hasAura(auras.reaversGlaive)),
      // The Hunt to proc Reaver's Glaive and Exergy buff - check for root status
      spell.cast("The Hunt", on => me.target, ret => !me.isRooted()),
      // Eye Beam to enter Demon Form (prioritize when we have Reaver's Glaive)
      spell.cast("Eye Beam", on => me.target, ret => me.isWithinMeleeRange(me.target)),
      // Chaos Strike when empowered by warbladesHunger
      spell.cast("Chaos Strike", on => me.target, ret => me.hasAura(auras.warbladesHunger)),
      // Felblade for fury and positioning
      spell.cast("Felblade", on => me.target, ret => true),
      // Essence Break to empower abilities
      spell.cast("Essence Break", on => me.target, ret => me.isWithinMeleeRange(me.target)),
      // Blade Dance within Essence Break window
      spell.cast("Blade Dance", on => me.target, ret => me.isWithinMeleeRange(me.target) && this.getDebuffRemainingTime("Essence Break") > 0),
      // Metamorphosis if not already active
      spell.cast("Metamorphosis", on => me.target, ret => Settings.DHHavocUseOffensiveCooldown && !me.hasAura(auras.metamorphosis)),
      // Immolation Aura when fury is low
      spell.cast("Immolation Aura", on => me, ret => this.getFury() < 60),
      // Blade Dance (bot handles Death Sweep upgrade during meta)
      spell.cast("Blade Dance", on => me.target, ret => me.isWithinMeleeRange(me.target)),
      // Chaos Strike (bot handles Annihilation upgrade during meta)
      spell.cast("Chaos Strike", on => me.target),
      // Sigil of Spite for soul generation when we need it
      spell.cast("Sigil of Spite", on => me.target, ret => this.getSoulFragments() < 3)
    );
  }

  // Sustained Damage - priorities from the guide, behavior tree will traverse when spells fail
  sustainedDamage() {
    return new bt.Selector(
      // Throw Glaive when empowered by Reaver's Glaive - highest priority
      spell.cast("Throw Glaive", on => me.target, ret => me.hasAura(auras.reaversGlaive)),
      // Felblade to catch up to target when out of melee but within 15 yards
      spell.cast("Felblade", on => me.target, ret => !me.isWithinMeleeRange(me.target) && me.target.distanceTo(me) <= 15),
      // Ranged abilities when not in melee and too far for Felblade
      new bt.Decorator(ret => !me.isWithinMeleeRange(me.target) && me.isFacing(me.target),
        new bt.Selector(spell.cast("Throw Glaive", on => me.target))),
      // Melee rotation - sustained damage priorities from guide
      new bt.Decorator(ret => me.isWithinMeleeRange(me.target) && me.isFacing(me.target),
        new bt.Selector(
          // Blade Dance - highest priority (empowered by Reaver's Glaive when available)
          spell.cast("Blade Dance", on => me.target, ret => me.isWithinMeleeRange(me.target)),
          // Chaos Strike if we have Fury (empowered by Reaver's Glaive when available)
          spell.cast("Chaos Strike", on => me.target, ret => this.getFury() >= 40),
          // Felblade for Fury generation - use as often as possible for Army Unto Oneself uptime
          spell.cast("Felblade", on => me.target, ret => this.getFury() < 90),
          // Immolation Aura - lowest priority generator
          spell.cast("Immolation Aura", on => me),
          // Sigil of Spite for soul generation when we need it
          spell.cast("Sigil of Spite", on => me.target, ret => this.getSoulFragments() < 3),
          // Throw Glaive as a slow when target isn't slowed
          spell.cast("Throw Glaive", on => me.target, ret => me.target && (me.target.isRooted() || !me.target.isMoving())),
          // Demon's Bite as absolute filler
          spell.cast("Demon's Bite", on => me.target)
        ))
    );
  }

  getFury() {
    return me.powerByType(PowerType.Fury);
  }

  getSoulFragments() {
    return me.soulFragments || 0;
  }

  getDebuffRemainingTime(debuffName) {
    if (!me.target) return 0;
    const debuff = me.target.getAura(debuffName);
    return debuff ? debuff.remaining : 0;
  }

  getAuraRemainingTime(auraName) {
    const aura = me.getAura(auraName);
    return aura ? aura.remaining : 0;
  }

  // Enhanced burst conditions
  shouldStartFullBurst() {
    return me.target &&
      spell.getCooldown('The Hunt').ready &&
      spell.getCooldown('Metamorphosis').ready &&
      spell.getCooldown('Eye Beam').ready &&
      this.getFury() > 50;
  }

  shouldStartMiniBurst() {
    return me.target &&
      (spell.getCooldown('Eye Beam').ready || spell.getCooldown('Essence Break').ready) &&
      this.getFury() > 30;
  }

  // CC targeting methods
  felEruptionTarget() {
    // Get all enemy players within 30 yards and find the first valid healer target for stun
    const nearbyEnemies = me.getPlayerEnemies(20);

    for (const unit of nearbyEnemies) {
      if (unit.isHealer() && me.isFacing(unit) && !unit.isCCd() && unit.canCC() && unit.getDR("stun") === 0) {
        return unit;
      }
    }

    return undefined;
  }

  imprisonTarget() {
    // Get all enemy players within 30 yards and find the first valid healer target for incapacitate
    const nearbyEnemies = me.getPlayerEnemies(20);

    for (const unit of nearbyEnemies) {
      if (unit !== me.target && unit.isHealer() && me.isFacing(unit) && !unit.isCCd() && unit.canCC() && unit.getDR("incapacitate") === 0) {
        return unit;
      }
    }

    return undefined;
  }

  sigilOfMiseryTarget() {
    // Get all enemy players within 20 yards and find healers that are stunned/rooted with 0 disorient DR
    const nearbyEnemies = me.getPlayerEnemies(30);

    for (const unit of nearbyEnemies) {
      if (unit.isHealer() && (unit.isStunned() || unit.isRooted()) && unit.canCC() && unit.getDR("disorient") === 0) {
        return unit;
      }
    }

    return undefined;
  }
}
