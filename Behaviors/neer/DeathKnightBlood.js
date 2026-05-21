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
};

// Per TrinityCore UnitDefines.h: 0x01000000 = UNIT_FLAG_POSSESSED (charm/MC).
// Flags.js mislabels this bit as PLAYER_CONTROLLED, so use the raw value.
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
          spell.cast("Death Strike", on => combat.bestTarget, req => me.pctHealth < 90),
          spell.cast("Marrowrend", on => combat.bestTarget, req => this.needMarrowrend()),
          spell.cast("Death and Decay", on => combat.bestTarget, req => combat.targets.length > 1),
          spell.cast("Blood Boil", on => combat.bestTarget, req => this.bloodBoilNeeded()),
          spell.cast("Death Coil", on => combat.bestTarget, req => me.pctPowerByType(PowerType.RunicPower) >= 40),
          spell.cast("Heart Strike", on => combat.bestTarget)
        )
      )
    );
  }

  bloodBoilNeeded() {
    const missingPlague = combat.targets.find(t => me.distanceTo(t) <= 10 && !t.getAuraByMe(auras.bloodPlague));
    if (missingPlague) return true;
    if (spell.getCharges("Blood Boil") >= 2) {
      return combat.targets.find(t => me.distanceTo(t) <= 10);
    }
    return false;
  }

  needMarrowrend() {
    const bs = me.getAura(auras.boneShield);
    if (!bs) return true;
    return bs.stacks < 5 || bs.remaining < 6000;
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
