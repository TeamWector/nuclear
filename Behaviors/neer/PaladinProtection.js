import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { MovementFlags } from "@/Enums/Flags";
import { DispelPriority } from "@/Data/Dispels";
import { WoWDispelType } from "@/Enums/Auras";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import { defaultHealTargeting as heal } from "@/Targeting/HealTargeting";
import Settings from "@/Core/Settings";

const auras = {
  consecration: 188370,
  shininglight: 327510,
  avengingwrath: 31884,
  judgment: 197277,
  holybulwark: 432496,
}

export class PaladinProtectionBehavior extends Behavior {
  name = "Paladin [Protection]";
  context = BehaviorContext.Any;
  specialization = Specialization.Paladin.Protection;
  static settings = [
    { type: "slider", uid: "ProtectionPaladinWoGPercent", text: "Word of Glory Percent", min: 0, max: 100, default: 70 },
    { type: "slider", uid: "ProtectionPaladinArdentADPercent", text: "Ardent Defender Percent", min: 0, max: 100, default: 25 }
  ];

  build() {
    return new bt.Selector(
      spell.interrupt("Rebuke"),
      spell.cast("Shield of the Righteous", () => {
        const shieldSpell = spell.getSpell("Shield of the Righteous");
        return combat.targets.find(unit => shieldSpell.inRange(unit) && me.isFacing(unit, 30));
      }),
      spell.cast("Hand of Reckoning", on => combat.targets.find(unit => unit.inCombat && unit.target && !unit.isTanking())),
      new bt.Decorator(
        common.waitForTarget(),
        common.ensureAutoAttack()
      ),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          common.waitForNotMounted(),
          common.waitForCastOrChannel(),
          spell.cast("Ardent Defender", req => me.pctHealth < Settings.ProtectionPaladinArdentADPercent && combat.targets.find(unit => unit.isTanking())),
          spell.cast("Devotion Aura", req => !me.hasAura("Devotion Aura")),
          new bt.Decorator(
            req => combat.targets.filter(unit =>
              unit.isCastingOrChanneling && unit.isInterruptible
            ).length > 2,
            new bt.Sequence(
              spell.cast("Sentinel"),
              spell.cast("Divine Toll")
            )
          ),
          spell.cast("Consecration", () => {
            const consecrationAura = me.auras.find(aura => aura.spellId === auras.consecration);
            const auraExpiring = !consecrationAura || (consecrationAura.remaining < 1500 && consecrationAura.remaining !== 0);
            const targetInRange = combat.targets.find(unit => me.isWithinMeleeRange(unit) || unit.distanceTo(me) < 14);
            return auraExpiring && targetInRange;
          }),
          spell.cast("Word of Glory", on => heal.friends.All.find(unit => unit.pctHealth < Settings.ProtectionPaladinWoGPercent), req => me.hasAura(auras.shininglight)),
          spell.cast("Lay on Hands", on => heal.friends.All.find(unit => unit.pctHealth < 20)),
          spell.cast("Blessing of Protection", on => heal.friends.All.find(unit =>
            unit.pctHealth < 50 &&
            unit.guid !== me.guid &&
            combat.targets.find(enemy =>
              enemy.targetUnit &&
              enemy.targetUnit.guid === unit.guid &&
              enemy.isWithinMeleeRange(unit)
            )
          )),
          spell.cast("Blessing of Freedom", on => heal.friends.All.find(unit => unit.isRooted() || unit.isSlowed())),
          spell.cast("Avenger's Shield", on => combat.targets
            .filter(unit => unit.isCastingOrChanneling && unit.isInterruptible && me.isFacing(unit))
            .sort((a, b) => b.distanceTo(me) - a.distanceTo(me))[0]),
          spell.cast("Hammer of Wrath",
            on => combat.targets.find(unit =>
              (unit.pctHealth < 20 || me.hasAura(auras.avengingwrath)) &&
              me.isFacing(unit)
            ),
            { skipUsableCheck: true }
          ),
          spell.cast("Avenger's Shield", on => combat.targets.find(unit => me.isFacing(unit) && !unit.isTanking())),
          spell.cast("Holy Bulwark", req => !me.hasAura(auras.holybulwark) && combat.burstToggle),
          spell.cast("Judgment", on => combat.targets.find(unit => me.isFacing(unit) && !unit.isTanking())),
          spell.cast("Judgment", on => {
            const target = combat.targets.find(target => !target.hasAura(auras.judgment));
            return target || combat.bestTarget;
          }),
          spell.cast("Avenger's Shield", on => combat.bestTarget),
          spell.cast("Blessed Hammer", req => combat.targets.find(unit => me.isWithinMeleeRange(unit))),
          spell.cast("Consecration", req => combat.targets.find(unit => me.isWithinMeleeRange(unit))),
        )
      )
    );
  }
}
