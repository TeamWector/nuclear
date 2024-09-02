import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from "@/Enums/Specialization";
import common from '@/Core/Common';
import spell from '@/Core/Spell'
import { me } from "@/Core/ObjectManager";

const auras = {
  darkSuccor: 101568,
  killingMachine: 51124,
  rime: 59052,
  coldHeart: 281209,
  pillarOfFrost: 51271,
  deathAndDecay: 188290,
  icyTalons: 194879,
  unleashedFrenzy: 376907,
  razorice: 51714
}

export class DeathKnightFrostBehavior extends Behavior {
  name = "Frost DK PVE";
  context = BehaviorContext.Any; // PVP ?
  specialization = Specialization.DeathKnight.Frost;
  version = wow.GameVersion.Retail;

  build() {
    return new bt.Decorator(
      ret => !spell.isGlobalCooldown(),
      new bt.Selector(
        common.waitForNotSitting(),
        common.waitForNotMounted(),
        common.waitForTarget(),
        common.waitForCastOrChannel(),
        common.waitForFacing(),
        spell.interrupt("Mind Freeze"),
        spell.cast("Death Strike", ret => me.pctHealth < 95 && me.hasAura(auras.darkSuccor)),
        spell.cast("Death Strike", ret => me.pctHealth < 65 && me.power > 35),
        spell.cast("Frost Strike", ret => this.checkFrostStrikeKeepUpBuffs()),
        new bt.Decorator(
          req => this.wantCooldowns(),
          new bt.Selector(
            spell.cast("Pillar of Frost", on => me, ret => me.targetUnit && me.isWithinMeleeRange(me.targetUnit)),
            spell.cast("Abomination Limb", on => me, ret => me.targetUnit && me.isWithinMeleeRange(me.targetUnit)),
          )
        ),
        spell.cast("Remorseless Winter", on => me, ret => me.targetUnit && me.isWithinMeleeRange(me.targetUnit)),
        this.multiTargetRotation(),
        spell.cast("Rune Strike", ret => me.hasAura(auras.killingMachine)),
        spell.cast("Frost Strike", ret => me.targetUnit?.getAura(auras.razorice)?.stacks === 5),
        spell.cast("Howling Blast", ret => me.hasAura(auras.rime)),
        spell.cast("Chains of Ice", on => me.targetUnit, ret => {
          const coldHeart = me.getAura(auras.coldHeart);
          return !!(coldHeart && coldHeart.stacks === 20);
        }),
        spell.cast("Frost Strike", ret => me.power > 45),
        spell.cast("Rune Strike"),
        spell.cast("Horn of Winter", ret => me.targetUnit && me.power < 70),
      )
    );
  }

  wantCooldowns() {
    return me.isWithinMeleeRange(me.target) && me.target && me.target.timeToDeath() !== 9999 && me.target.timeToDeath() > 10;
  }

  multiTargetRotation() {
    return new bt.Selector(
      spell.cast("Frostscythe", on => me, ret => me.getUnitsAroundCount(8) >= 2 && me.targetUnit && me.isWithinMeleeRange(me.targetUnit) && me.isFacing(me.targetUnit) && !me.hasAura(auras.killingMachine)),
      spell.cast("Death and Decay", ret => me.getUnitsAroundCount(10) >= 2 && me.targetUnit && me.isWithinMeleeRange(me.targetUnit) && !me.hasAura(auras.deathAndDecay))
    );
  }

  checkFrostStrikeKeepUpBuffs() {
    if (me.targetUnit && me.isWithinMeleeRange(me.targetUnit)) {
      const icyTalons = me.getAura(auras.icyTalons);
      const unleashedFrenzy = me.getAura(auras.unleashedFrenzy);
      if (icyTalons && unleashedFrenzy && icyTalons.remaining > 2000 && unleashedFrenzy.remaining > 2000) {
        return false;
      }
    }
    return true;
  }
}
