import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";

const auras = {
  flameShock: 188389,
  ghostWolf: 2645,
  lightningShield: 192106,
};

export class ShamanInitialBehavior extends Behavior {
  name = "Shaman [Initial]";
  context = BehaviorContext.Any;
  specialization = Specialization.Shaman.Initial;
  static settings = [];

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      common.waitForCastOrChannel(),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Ghost Wolf", on => me, req =>
            me.isMoving() && !me.inCombat() && !me.hasAura(auras.ghostWolf)
          ),
          spell.cast("Lightning Shield", on => me, req =>
            !me.hasAuraByMe(auras.lightningShield) && !me.hasAura(auras.ghostWolf)
          ),
          common.waitForTarget(),
          common.waitForFacing(),
          common.ensureAutoAttack(),
          spell.cast("Flame Shock", on => this.flameShockTarget(), req => this.flameShockTarget() !== null),
          spell.cast("Lightning Bolt", on => combat.bestTarget)
        )
      )
    );
  }

  flameShockTarget() {
    for (const t of combat.targets) {
      const dot = t.getAuraByMe(auras.flameShock);
      if (!dot || dot.remaining <= dot.duration * 0.3) {
        return t;
      }
    }
    return null;
  }
}
