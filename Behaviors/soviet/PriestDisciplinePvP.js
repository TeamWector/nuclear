import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { defaultHealTargeting as h } from "@/Targeting/HealTargeting";
import { DispelPriority } from "@/Data/Dispels";
import { WoWDispelType } from "@/Enums/Auras";
import spellBlacklist from "@/Data/PVPData";

const auras = {
  painSuppression: 33206,
  powerOfTheDarkSide: 198068,
  shadowWordPain: 589,
  powerWordShield: 17,
  atonement: 194384,
  surgeOfLight: 114255,
  premonitionPiety: 428930,
  premonitionSolace: 428934,
  premonitionInsight: 428933,
};

export class PriestDisciplinePvP extends Behavior {
  name = "Priest (Discipline) PVP";
  context = BehaviorContext.Any;
  specialization = Specialization.Priest.Discipline;

  // Define healTarget as a class property
  healTarget = null;

  build() {
    return new bt.Decorator(
      ret => !spell.isGlobalCooldown(),
      new bt.Selector(
        common.waitForNotWaitingForArenaToStart(),
        common.waitForNotSitting(),
        common.waitForNotMounted(),
        common.waitForCastOrChannel(),
        this.waitForNotJustCastPenitence(),
        this.healRotation(),
        this.applyAtonement(),
        common.waitForTarget(),
        common.waitForFacing(),
        this.damageRotation()
      )
    );
  }

  waitForNotJustCastPenitence() {
    return new bt.Action(() => {
      let lastCastPenitence = spell.getTimeSinceLastCast("Ultimate Penitence");
      if (lastCastPenitence < 400) {
        return bt.Status.Success;
      }
      return bt.Status.Failure;
    });
  }

  applyAtonement() {
    return new bt.Selector(
      spell.cast("Power Word: Shield", on => this.findFriendWithoutAtonement(), ret => this.findFriendWithoutAtonement() !== undefined),
      spell.cast("Renew", on => this.findFriendWithoutAtonement(), ret => this.findFriendWithoutAtonement() !== undefined)
    );
  }

  healRotation() {
    return new bt.Selector(
      new bt.Action(() => {
        this.healTarget = h.getPriorityPVPHealTarget();
        return bt.Status.Failure; // Proceed to next child
      }),
      spell.cast("Power Word: Life", on => this.healTarget, ret => this.healTarget?.effectiveHealthPercent < 50),
      spell.cast("Desperate Prayer", on => me, ret => me.effectiveHealthPercent < 40),
      spell.cast("Pain Suppression", on => this.healTarget, ret => this.shouldCastWithHealthAndNotPainSupp(this.healTarget, 34)),
      spell.cast("Void Shift", on => this.healTarget, ret => this.shouldCastWithHealthAndNotPainSupp(this.healTarget, 24)),
      spell.cast("Mass Dispel", on => this.findMassDispelTarget(), ret => this.findMassDispelTarget() !== undefined),
      spell.cast("Premonition", on => me, ret => this.shouldCastPremonition(this.healTarget)),
      spell.cast("Evangelism", on => me, ret => me.inCombat() && (
        (this.getAtonementCount() > 3 && this.minAtonementDuration() < 4000)
        || (this.healTarget && this.healTarget.effectiveHealthPercent < 40))
      ),
      spell.cast("Shadow Word: Death", on => this.findDeathThePolyTarget(), ret => this.findDeathThePolyTarget() !== undefined),
      spell.cast("Power Word: Barrier", on => this.healTarget, ret => this.shouldCastWithHealthAndNotPainSupp(this.healTarget, 45)),
      spell.cast("Power Word: Shield", on => this.healTarget, ret => this.healTarget?.effectiveHealthPercent < 89 && !this.hasShield(this.healTarget)),
      spell.cast("Power Word: Radiance", on => this.healTarget, ret => this.shouldCastRadiance(this.healTarget, 2)),
      spell.cast("Flash Heal", on => this.healTarget, ret => this.healTarget?.effectiveHealthPercent < 85 && me.hasAura(auras.surgeOfLight)),
      spell.dispel("Purify", true, DispelPriority.High, true, WoWDispelType.Magic),
      spell.dispel("Dispel Magic", false, DispelPriority.High, true, WoWDispelType.Magic),
      spell.cast("Penance", on => this.healTarget, ret => this.healTarget?.effectiveHealthPercent < 69),
      spell.cast("Power Word: Radiance", on => this.healTarget, ret => this.shouldCastRadiance(this.healTarget, 1)),
      spell.cast("Penance", on => this.healTarget, ret => this.healTarget?.effectiveHealthPercent < 79),
      spell.cast("Flash Heal", on => this.healTarget, ret => this.healTarget?.effectiveHealthPercent < 55),
      spell.dispel("Purify", true, DispelPriority.Medium, true, WoWDispelType.Magic),
      spell.dispel("Dispel Magic", false, DispelPriority.Medium, true, WoWDispelType.Magic)
    );
  }

  damageRotation() {
    return new bt.Selector(
      spell.cast("Shadow Word: Death", on => this.findShadowWordDeathTarget(), ret => this.findShadowWordDeathTarget() !== undefined),
      spell.cast("Shadow Word: Pain", ret => me.targetUnit && !this.hasShadowWordPain(me.targetUnit)),
      spell.cast("Mindgames", on => me.targetUnit, ret => me.targetUnit?.effectiveHealthPercent < 50),
      spell.cast("Penance", on => me.targetUnit, ret => me.hasAura(auras.powerOfTheDarkSide)),
      spell.cast("Mind Blast", on => me.targetUnit, ret => true),
      spell.cast("Smite", ret => true)
    );
  }

  findFriendWithoutAtonement() {
    const friends = me.getFriends();
    for (const friend of friends) {
      if (this.isNotDeadAndInLineOfSight(friend) && !this.hasAtonement(friend)) {
        return friend;
      }
    }
    return undefined;
  }

  findMassDispelTarget() {
    const enemies = me.getEnemies();
    for (const enemy of enemies) {
      if (enemy.hasAura("Ice Block") || enemy.hasAura("Divine Shield")) {
        return enemy;
      }
    }
    return undefined;
  }

  findShadowWordDeathTarget() {
    const enemies = me.getEnemies();
    for (const enemy of enemies) {
      if (enemy.effectiveHealthPercent < 20) {
        return enemy;
      }
    }
    return undefined;
  }

  findDeathThePolyTarget() {
    const enemies = me.getEnemies();
    for (const enemy of enemies) {
      if (enemy.isCastingOrChanneling && enemy.isPlayer()) {
        const spellInfo = enemy.spellInfo;
        const target = spellInfo ? spellInfo.spellTargetGuid : null;
        if (enemy.spellInfo) {
          const onBlacklist = spellBlacklist[enemy.spellInfo.spellCastId];
          const castRemains = enemy.spellInfo.castEnd - wow.frameTime;
          if (target && target.equals(me.guid) && onBlacklist && castRemains < 1000) {
            return enemy;
          }
        }
      }
    }
    return undefined;
  }

  shouldCastPremonition(target) {
    if (!target) {
      return false;
    }
    if (me.hasAura(auras.premonitionInsight) || me.hasAura(auras.premonitionSolace) || me.hasAura(auras.premonitionPiety)) {
      return false;
    }
    return target.effectiveHealthPercent < 50 || target.timeToDeath() < 3;
  }

  hasAtonement(target) {
    return target?.hasAuraByMe(auras.atonement) || false;
  }

  hasShield(target) {
    return target?.hasAuraByMe(auras.powerWordShield) || false;
  }

  hasShadowWordPain(target) {
    return target?.hasAura(auras.shadowWordPain) || false;
  }

  shouldCastWithHealthAndNotPainSupp(target, health) {
    if (!target) {
      return false;
    }
    if (target.hasAura("Ice Block") || target.hasAura("Divine Shield")) {
      return false;
    }
    return (target.effectiveHealthPercent < health || target.timeToDeath() < 3) && !target.hasAuraByMe(auras.painSuppression);
  }

  shouldCastRadiance(target, charges) {
    if (!target) {
      return false;
    }
    return target.effectiveHealthPercent < 75 && spell.getCharges("Power Word: Radiance") === charges;
  }

  isNotDeadAndInLineOfSight(friend) {
    return friend && !friend.deadOrGhost && me.withinLineOfSight(friend);
  }

  getAtonementCount() {
    return h.friends.All.filter(friend => this.hasAtonement(friend)).length;
  }

  minAtonementDuration() {
    let minDuration = Infinity;
    for (const friend of h.friends.All) {
      if (this.hasAtonement(friend)) {
        const duration = friend.getAuraByMe(auras.atonement).remaining;
        if (duration < minDuration) {
          minDuration = duration;
        }
      }
    }
    return minDuration === Infinity ? 0 : minDuration;
  }
}

