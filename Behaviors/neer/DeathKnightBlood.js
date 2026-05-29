import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import Settings from "@/Core/Settings";
import { PowerType } from "@/Enums/PowerType";
import { UnitFlags } from "@/Enums/Flags";
import { Classification } from "@/Enums/UnitEnums";

const auras = {
  bloodPlague: 55078,
  boneShield: 195181,
  deathAndDecay: 188290,
  crimsonScourge: 81141,
  dancingRuneWeapon: 81256,
};

const UNIT_FLAG_POSSESSED = 0x01000000;

const spells = {
};

export class DeathKnightBloodBehavior extends Behavior {
  name = "Death Knight [Blood]";
  context = BehaviorContext.Any;
  specialization = Specialization.DeathKnight.Blood;
  static settings = [
  ];

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      spell.interrupt("Mind Freeze", false),
      common.waitForCastOrChannel(),
      spell.cast("Vampiric Blood", on => me, req => me.pctHealth < 30),
      spell.cast("Lichborne", on => me, req => this.needLichborne()),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Death Grip", on => this.findGripTarget()),
          spell.cast("Dark Command", on => this.findTauntTarget()),
          common.waitForTarget(),
          common.waitForFacing(),
          common.ensureAutoAttack(),
          spell.cast("Reaper's Mark", on => this.getTarget(30), req =>
            combat.burstToggle &&
            spell.isSpellKnown("Reaper's Mark") &&
            !!this.getTarget(30)
          ),
          spell.cast("Dancing Rune Weapon", on => me, req => combat.burstToggle && combat.targets.length > 0),
          spell.cast("Death and Decay", on => me, req => {
            const t = this.getTarget();
            return me.hasAura(auras.crimsonScourge) && t && !t.isMoving();
          }),
          spell.cast("Death Strike", on => this.getTarget(), req =>
            me.pctHealth < 60 || me.powerByType(PowerType.RunicPower) > 75
          ),
          spell.cast("Blood Boil", on => me, req => this.bloodBoilNeeded()),
          spell.cast("Death Chain", on => this.findDeathChainTarget(), req => !!this.findDeathChainTarget()),
          spell.cast("Marrowrend", on => this.getTarget(), req => this.needMarrowrend()),
          spell.cast("Death's Caress", on => this.getTarget(30), req => {
            const t = this.getTarget(30);
            return this.boneShieldExpiring() && t && !me.isWithinMeleeRange(t);
          }),
          spell.cast("Heart Strike", on => this.getTarget(), req => me.powerByType(PowerType.Runes) >= 2),
          spell.cast("Blood Boil", on => me, req =>
            spell.getCharges("Blood Boil") >= 1 &&
            combat.targets.some(t => me.distanceTo(t) <= 10)
          )
        )
      )
    );
  }

  _cacheFrame = -1;
  _cachedTargetMelee = undefined;
  _cachedTarget30 = undefined;
  _cachedTargetsIn10 = undefined;
  _cachedBoneShield = undefined;
  _cachedBloodBoilNeeded = undefined;
  _cachedDeathChain = undefined;
  _cachedTaunt = undefined;
  _cachedGrip = undefined;

  _refreshCache() {
    if (this._cacheFrame === wow.frameTime) return;
    this._cacheFrame = wow.frameTime;
    this._cachedTargetMelee = undefined;
    this._cachedTarget30 = undefined;
    this._cachedTargetsIn10 = undefined;
    this._cachedBoneShield = undefined;
    this._cachedBloodBoilNeeded = undefined;
    this._cachedDeathChain = undefined;
    this._cachedTaunt = undefined;
    this._cachedGrip = undefined;
  }

  _computeTarget(distance) {
    const inRange = distance === undefined
      ? (t => me.isWithinMeleeRange(t))
      : (t => me.distanceTo(t) <= distance);
    const best = combat.bestTarget;
    if (best && me.isFacing(best) && inRange(best)) return best;
    const reachable = combat.targets.find(t => me.isFacing(t) && inRange(t));
    return reachable || best || null;
  }

  getTarget(distance) {
    this._refreshCache();
    if (distance === undefined) {
      if (this._cachedTargetMelee === undefined) {
        this._cachedTargetMelee = this._computeTarget(undefined);
      }
      return this._cachedTargetMelee;
    }
    if (distance === 30) {
      if (this._cachedTarget30 === undefined) {
        this._cachedTarget30 = this._computeTarget(30);
      }
      return this._cachedTarget30;
    }
    return this._computeTarget(distance);
  }

  _targetsIn10() {
    this._refreshCache();
    if (this._cachedTargetsIn10 === undefined) {
      this._cachedTargetsIn10 = combat.targets.filter(t => me.distanceTo(t) <= 10);
    }
    return this._cachedTargetsIn10;
  }

  _boneShield() {
    this._refreshCache();
    if (this._cachedBoneShield === undefined) {
      this._cachedBoneShield = me.getAura(auras.boneShield) || null;
    }
    return this._cachedBoneShield;
  }

  bloodBoilNeeded() {
    this._refreshCache();
    if (this._cachedBloodBoilNeeded !== undefined) return this._cachedBloodBoilNeeded;
    this._cachedBloodBoilNeeded = this._computeBloodBoilNeeded();
    return this._cachedBloodBoilNeeded;
  }

  _computeBloodBoilNeeded() {
    const inRange = this._targetsIn10();
    if (inRange.length === 0) return false;

    // Under Dancing Rune Weapon, the shadow copies each apply their own Blood
    // Plague instance — stack 3 separate auras per nearby target regardless of
    // Blood Boil charge count.
    if (me.hasAura(auras.dancingRuneWeapon)) {
      if (inRange.some(t => t.auras.filter(a => a.spellId === auras.bloodPlague).length < 3)) {
        return true;
      }
    }

    if (inRange.some(t => !t.getAuraByMe(auras.bloodPlague))) return true;
    if (spell.getChargesFractional("Blood Boil") >= 1.7) return true;
    return false;
  }

  needMarrowrend() {
    const bs = this._boneShield();
    if (!bs) return true;
    return bs.stacks <= 6 || bs.remaining < 6000;
  }

  boneShieldExpiring() {
    const bs = this._boneShield();
    if (!bs) return true;
    return bs.remaining < 6000;
  }

  findDeathChainTarget() {
    this._refreshCache();
    if (this._cachedDeathChain !== undefined) return this._cachedDeathChain;
    this._cachedDeathChain = combat.targets.find(t =>
      me.distanceTo(t) <= 30 &&
      me.isFacing(t) &&
      combat.targets.filter(other => other !== t && other.distanceTo(t) <= 8).length >= 2
    ) || null;
    return this._cachedDeathChain;
  }

  findTauntTarget() {
    this._refreshCache();
    if (this._cachedTaunt !== undefined) return this._cachedTaunt;
    this._cachedTaunt = combat.targets.find(t => t.target && !t.isTanking()) || null;
    return this._cachedTaunt;
  }

  findGripTarget() {
    this._refreshCache();
    if (this._cachedGrip !== undefined) return this._cachedGrip;
    this._cachedGrip = combat.targets.find(t =>
      t.isCastingOrChanneling &&
      t.classification !== Classification.Boss &&
      me.distanceTo(t) > 10 &&
      me.distanceTo(t) <= 30 &&
      me.isFacing(t)
    ) || null;
    return this._cachedGrip;
  }

  needLichborne() {
    const f = me.unitFlags;
    if (me.isFeared()) return true;
    if ((f & UnitFlags.CONFUSED) !== 0) return true;
    if ((f & UNIT_FLAG_POSSESSED) !== 0) return true;
    return false;
  }
}
