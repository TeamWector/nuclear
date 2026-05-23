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

const auras = {
  bloodPlague: 55078,
  boneShield: 195181,
  deathAndDecay: 188290,
  crimsonScourge: 81141,
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
          spell.cast("Dark Command", on => this.findTauntTarget()),
          common.waitForTarget(),
          common.waitForFacing(),
          common.ensureAutoAttack(),
          spell.cast("Death and Decay", on => me, req => {
            const t = this.getTarget();
            return me.hasAura(auras.crimsonScourge) && t && !t.isMoving();
          }),
          spell.cast("Death Strike", on => this.getTarget(), req =>
            me.pctHealth < 60 || me.powerByType(PowerType.RunicPower) > 75
          ),
          spell.cast("Blood Boil", on => me, req => this.bloodBoilNeeded()),
          spell.cast("Dancing Rune Weapon", on => me, req => combat.targets.length > 0),
          spell.cast("Death Chain", on => this.findDeathChainTarget(), req => this.findDeathChainTarget() !== undefined),
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

  getTarget(distance) {
    const inRange = distance === undefined
      ? (t => me.isWithinMeleeRange(t))
      : (t => me.distanceTo(t) <= distance);
    const best = combat.bestTarget;
    if (best && me.isFacing(best) && inRange(best)) {
      return best;
    }
    const reachable = combat.targets.find(t => me.isFacing(t) && inRange(t));
    return reachable || best;
  }

  bloodBoilNeeded() {
    const missingPlague = combat.targets.find(t => me.distanceTo(t) <= 10 && !t.getAuraByMe(auras.bloodPlague));
    if (missingPlague) return true;
    if (spell.getChargesFractional("Blood Boil") >= 1.7) {
      return combat.targets.some(t => me.distanceTo(t) <= 10);
    }
    return false;
  }

  needMarrowrend() {
    const bs = me.getAura(auras.boneShield);
    if (!bs) return true;
    return bs.stacks <= 6 || bs.remaining < 6000;
  }

  boneShieldExpiring() {
    const bs = me.getAura(auras.boneShield);
    if (!bs) return true;
    return bs.remaining < 6000;
  }

  findDeathChainTarget() {
    return combat.targets.find(t =>
      me.distanceTo(t) <= 30 &&
      me.isFacing(t) &&
      combat.targets.filter(other => other !== t && other.distanceTo(t) <= 8).length >= 2
    );
  }

  findTauntTarget() {
    return combat.targets.find(t => t.target && !t.isTanking());
  }

  needLichborne() {
    const f = me.unitFlags;
    if (me.isFeared()) return true;
    if ((f & UnitFlags.CONFUSED) !== 0) return true;
    if ((f & UNIT_FLAG_POSSESSED) !== 0) return true;
    return false;
  }
}
