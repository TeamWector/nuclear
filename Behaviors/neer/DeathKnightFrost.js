import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import Settings from "@/Core/Settings";
import { PowerType } from "@/Enums/PowerType";

const auras = {
  rime: 59052,
  killingMachine: 51124,
  frostFever: 55095,
  darkSuccor: 101568,
};

const spells = {
};

export class DeathKnightFrostBehavior extends Behavior {
  name = "Death Knight [Frost]";
  context = BehaviorContext.Any;
  specialization = Specialization.DeathKnight.Frost;
  static settings = [
  ];

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      spell.interrupt("Mind Freeze", false),
      common.waitForCastOrChannel(),
      spell.cast("Icebound Fortitude", on => me, req => combat.targets.length > 0 && me.pctHealth < 70),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Death Grip", on => this.findGripTarget()),
          spell.cast("Raise Dead", on => me, req => combat.targets.length > 0),
          common.waitForTarget(),
          common.waitForFacing(),
          common.ensureAutoAttack(),
          spell.cast("Death Strike", on => this.getTarget(), req => me.pctHealth < 60 || me.hasAura(auras.darkSuccor)),
          spell.cast("Pillar of Frost", on => me, req => combat.targets.length > 0),
          spell.cast("Empower Rune Weapon", on => me),
          spell.cast("Remorseless Winter", on => me, req => this.enemiesInRange(8) >= 3),
          spell.cast("Howling Blast", on => this.getTarget(30), req => me.hasAura(auras.rime)),
          spell.cast("Frostscythe", on => this.getTarget(), req =>
            this.enemiesInRange(8) >= 3 && me.hasAura(auras.killingMachine)
          ),
          spell.cast("Obliterate", on => this.getTarget(), req =>
            this.enemiesInRange(8) < 3 && me.hasAura(auras.killingMachine)
          ),
          spell.cast("Glacial Advance", on => me, req =>
            this.runicPower() >= 30 && this.enemiesInFront(20) >= 3
          ),
          spell.cast("Frost Strike", on => this.getTarget(), req =>
            this.runicPower() >= 30 && this.enemiesInRange(30) < 3
          ),
          spell.cast("Howling Blast", on => this.getTarget(30), req => {
            const t = this.getTarget(30);
            return t && !t.getAuraByMe(auras.frostFever);
          }),
          spell.cast("Frostscythe", on => this.getTarget(), req => this.enemiesInRange(8) >= 3),
          spell.cast("Obliterate", on => this.getTarget())
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

  enemiesInRange(distance) {
    return combat.targets.filter(t => me.distanceTo(t) <= distance).length;
  }

  enemiesInFront(distance) {
    return combat.targets.filter(t => me.distanceTo(t) <= distance && me.isFacing(t)).length;
  }

  findGripTarget() {
    return combat.targets.find(t =>
      me.isFacing(t) &&
      !me.isWithinMeleeRange(t) &&
      me.distanceTo(t) <= 30 &&
      t.isCastingOrChanneling
    );
  }

  runicPower() {
    return me.powerByType(PowerType.RunicPower);
  }
}
