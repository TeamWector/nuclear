import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import Settings from "@/Core/Settings";
import { PowerType } from "@/Enums/PowerType";
import Pet from "@/Core/Pet";

const auras = {
  darkSuccor: 101568,
  virulentPlague: 191587,
  lesserGhoul: 1254252,
  suddenDoom: 81340,
  festeringScythe: 458123,
  darkTransformation: 1233448,
};

const spells = {
};

export class DeathKnightUnholyBehavior extends Behavior {
  name = "Death Knight [Unholy]";
  context = BehaviorContext.Any;
  specialization = Specialization.DeathKnight.Unholy;
  static settings = [
  ];

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      spell.interrupt("Mind Freeze", false),
      new bt.Decorator(
        ret => Pet.current && Pet.current.hasAuraByMe(auras.darkTransformation),
        spell.interrupt("Leap", false)
      ),
      this.gnawInterrupt(),
      common.waitForCastOrChannel(),
      spell.cast("Icebound Fortitude", on => me, req => combat.targets.length > 0 && me.pctHealth < 70),
      spell.cast("Claw", on => this.getTarget(), req => Pet.current && combat.targets.length > 0),
      spell.cast("Huddle", on => me, req =>
        Pet.current &&
        Pet.current.hasAuraByMe(auras.darkTransformation) &&
        spell.getTimeSinceLastCast("Dark Transformation") < 5000 &&
        me.pctHealth < 60
      ),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Death Grip", on => this.findGripTarget()),
          spell.cast("Raise Dead", on => me, req => !Pet.current && combat.targets.length > 0),
          common.waitForTarget(),
          common.waitForFacing(),
          common.ensureAutoAttack(),
          spell.cast("Death Strike", on => this.getTarget(), req => me.pctHealth < 60 || me.hasAura(auras.darkSuccor)),
          spell.cast("Army of the Dead", on => me, req => combat.targets.length > 0),
          spell.cast("Dark Transformation", on => me, req => combat.targets.length > 0),
          spell.cast("Outbreak", on => this.getTarget(30), req => {
            const t = this.getTarget(30);
            return t && !t.getAuraByMe(auras.virulentPlague);
          }),
          spell.cast("Putrefy", on => this.getTarget()),
          spell.cast("Festering Scythe", on => this.getTarget(), req => me.hasAura(auras.festeringScythe)),
          spell.cast("Epidemic", on => this.getTarget(30), req =>
            this.runicPower() >= 30 && this.enemiesInRange(30) >= 3
          ),
          spell.cast("Death Coil", on => this.getTarget(30), req =>
            (this.runicPower() >= 30 || me.hasAura(auras.suddenDoom)) && this.enemiesInRange(30) < 3
          ),
          spell.cast("Scourge Strike", on => this.getTarget(), req => this.lesserGhoulStacks() >= 1),
          spell.cast("Festering Strike", on => this.getTarget(), req => this.lesserGhoulStacks() < 3)
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

  lesserGhoulStacks() {
    return me.getAuraStacks(auras.lesserGhoul);
  }

  gnawInterrupt() {
    return new bt.Sequence(
      new bt.Action(() => {
        if (!Pet.current) return bt.Status.Failure;
        const gnaw = spell.getSpell("Gnaw");
        if (!gnaw || !gnaw.cooldown.ready) return bt.Status.Failure;
        for (const unit of combat.targets) {
          if (me.distanceTo(unit) > 15) continue;
          if (!unit.isCastingOrChanneling || !unit.isInterruptible) continue;
          if (!me.isFacing(unit) || !me.withinLineOfSight(unit)) continue;
          if (gnaw.cast(unit)) return bt.Status.Success;
        }
        return bt.Status.Failure;
      })
    );
  }
}
