import { Behavior, BehaviorContext } from "../../../../Core/Behavior";
import * as bt from '../../../../Core/BehaviorTree';
import Specialization from '../../../../Enums/Specialization';
import common from '../../../../Core/Common';
import spell from "../../../../Core/Spell";
import { me } from "../../../../Core/ObjectManager";

export class WarriorFuryBehavior extends Behavior {
  context = BehaviorContext.Any;
  specialization = Specialization.Warrior.Fury;
  version = wow.GameVersion.Retail;

  build() {
    return new bt.Decorator(
      ret => !spell.isGlobalCooldown() && !me.isMounted,
      new bt.Selector(
        common.waitForNotMounted(),
        common.waitForTarget(),
        common.waitForCastOrChannel(),
        common.waitForFacing(),

        spell.cast("Battle Shout", on => me, req => !me.hasAuraByMe("Battle Shout")),

        spell.cast("Victory Rush", ret => me.pctHealth < 70),
        this.singleTargetRotation(),
      )
    );
  }

  singleTargetRotation() {
    return new bt.Selector(
      new bt.Decorator(
        req => this.wantCooldowns(),
        new bt.Selector(
          spell.cast("Thunder Clap", on => me, this.haveThunderBlast),
          spell.cast("Avatar", on => me),
          spell.cast("Recklessness", on => me),
          spell.cast("Blood Fury", on => me),
          spell.cast("Thunderous Roar", on => me),
          spell.cast("Odyn's Fury", on => me),
          spell.cast("Bladestorm", on => me),
        )
      ),
      spell.cast("Rampage", ret => !this.isEnraged()),
      spell.cast("Thunder Clap", on => me, this.isEnraged),
      spell.cast("Crushing Blow"),
      spell.cast("Bloodthirst", this.haveBloodbath),
      spell.cast("Raging Blow", ret => this.isEnraged() || me.power < 110),
      spell.cast("Rampage"),
      spell.cast("Execute", ret => me.hasAuraByMe("Sudden Death")),
      spell.cast("Bloodthirst"),
      spell.cast("Thunder Clap", req => me.isWithinMeleeRange(me.target)),
      spell.cast("Whirlwind", req => me.isWithinMeleeRange(me.target)),
    );
  }

  wantCooldowns() {
    return this.isEnraged() && me.isWithinMeleeRange(me.target) && me.target && me.target.timeToDeath() !== 9999 && me.target.timeToDeath() > 10;
  }

  isEnraged() {
    const enrage = me.auras.find(aura => aura.dispelType === 9);
    return enrage !== undefined && enrage.remaining > 600;
  }

  haveBloodbath() {
    const bloodbath = me.auras.find(aura => aura.name.includes("Bloodbath"));
    return bloodbath !== undefined && bloodbath.remaining > 600;
  }

  haveThunderBlast() {
    const thunderBlast = me.auras.find(aura => aura.name.includes("Thunder Blast"));
    return thunderBlast !== undefined && thunderBlast.remaining > 600;
  }
}
