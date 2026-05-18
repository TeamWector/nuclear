import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import { PowerType } from "@/Enums/PowerType";
import { WoWDispelType, WoWAuraFlags } from "@/Enums/Auras";
import { Classification } from "@/Enums/UnitEnums";
import Settings from '@/Core/Settings';

const rtbBuffs = ["Broadside", "Buried Treasure", "Grand Melee", "Ruthless Precision", "Skull and Crossbones", "True Bearing"];

export class RogueOutlawBehavior extends Behavior {
  name = "[Rejiko] Outlaw Rogue";
  context = BehaviorContext.Any;
  specialization = Specialization.Rogue.Combat;
  static settings = [
    {
      header: "Finishers",
      options: [
        { type: "checkbox", uid: "RogueOutlawUseEviscerate", text: "Use Dispatch", default: true },
        { type: "slider", uid: "RogueOutlawEviscerateComboPoints", text: "Finisher combo points (Dispatch / BtE)", min: 1, max: 6, default: 6 },
      ]
    },
    {
      header: "Cooldowns",
      options: [
        { type: "checkbox", uid: "RogueOutlawUseAdrenalineRush", text: "Use Adrenaline Rush", default: true },
        { type: "checkbox", uid: "RogueOutlawUseTricksOfTheTrade", text: "Use Tricks of the Trade (tank)", default: true },
      ]
    },
    {
      header: "AoE",
      options: [
        { type: "checkbox", uid: "RogueOutlawUseBladeFlurry", text: "Use Blade Flurry", default: true },
        { type: "slider", uid: "RogueOutlawBladeFlurryTargets", text: "Blade Flurry min targets", min: 2, max: 5, default: 2 },
      ]
    },
    {
      header: "Utility",
      options: [
        { type: "checkbox", uid: "RogueOutlawAutoStealth", text: "Auto-Stealth out of combat", default: true },
      ]
    },
    {
      header: "Defensives",
      options: [
        { type: "checkbox", uid: "RogueOutlawUseCrimsonVial", text: "Use Crimson Vial", default: true },
        { type: "slider", uid: "RogueOutlawCrimsonVialHP", text: "Crimson Vial (HP %)", min: 1, max: 100, default: 70 },
        { type: "checkbox", uid: "RogueOutlawUseCloakOfShadows", text: "Use Cloak of Shadows", default: true },
        { type: "checkbox", uid: "RogueOutlawUseEvasion", text: "Use Evasion (tanking 3+ or boss)", default: true },
      ]
    }
  ];

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      common.waitForCastOrChannel(),
      spell.interrupt("Kick"),
      spell.cast("Crimson Vial", on => me, req =>
        Settings.RogueOutlawUseCrimsonVial && me.pctHealth <= Settings.RogueOutlawCrimsonVialHP
      ),
      spell.cast("Cloak of Shadows", on => me, req =>
        Settings.RogueOutlawUseCloakOfShadows &&
        !me.hasVisibleAura("Stealth") &&
        me.auras.some(a =>
          a.dispelType === WoWDispelType.Magic &&
          (a.flags & WoWAuraFlags.Negative)
        )
      ),
      spell.cast("Evasion", on => me, req => {
        if (!Settings.RogueOutlawUseEvasion) return false;
        if (me.hasVisibleAura("Evasion")) return false;
        const tankedInMelee = combat.targets.filter(t => t.isTanking() && me.isWithinMeleeRange(t));
        if (tankedInMelee.length >= 3) return true;
        return tankedInMelee.some(t => t.classification === Classification.Boss);
      }),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Instant Poison", on => me, req => !me.inCombat() && !me.hasVisibleAura("Instant Poison")),
          spell.cast("Stealth", on => me, req =>
            Settings.RogueOutlawAutoStealth &&
            !me.inCombat() &&
            !me.hasVisibleAura("Stealth")
          ),
          common.waitForTarget(),
          common.waitForFacing(),
          new bt.Decorator(
            () => !me.hasVisibleAura("Stealth"),
            common.ensureAutoAttack()
          ),
          spell.cast("Tricks of the Trade", on => {
            const tank = me.currentParty?.members.find(m => m.isTank())?.guid.toUnit();
            return tank && !tank.deadOrGhost ? tank : null;
          }, req => Settings.RogueOutlawUseTricksOfTheTrade && me.inCombat()),
          spell.cast("Ambush", on => combat.bestTarget, req =>
            me.hasVisibleAura("Stealth") ||
            me.hasAura("Audacity") ||
            me.hasAura("Subterfuge")
          ),
          spell.cast("Roll the Bones", on => me, req => {
            if (me.hasVisibleAura("Stealth")) return false;
            if (!combat.targets.some(t => me.isWithinMeleeRange(t))) return false;
            if (me.hasAura("Loaded Dice")) return true;
            return rtbBuffs.every(b => !me.hasAura(b));
          }),
          spell.cast("Adrenaline Rush", on => me, req =>
            Settings.RogueOutlawUseAdrenalineRush &&
            !me.hasVisibleAura("Stealth") &&
            !me.hasVisibleAura("Adrenaline Rush") &&
            combat.targets.some(t => me.isWithinMeleeRange(t))
          ),
          spell.cast("Blade Rush", on => combat.bestTarget, req =>
            !me.hasVisibleAura("Stealth") &&
            me.powerByType(PowerType.ComboPoints) <= 5
          ),
          spell.cast("Blade Flurry", on => me, req =>
            Settings.RogueOutlawUseBladeFlurry &&
            !me.hasVisibleAura("Stealth") &&
            !me.hasVisibleAura("Blade Flurry") &&
            combat.targets.filter(t => me.isWithinMeleeRange(t)).length >= Settings.RogueOutlawBladeFlurryTargets
          ),
          spell.cast("Slice and Dice", on => me, req => {
            if (me.hasVisibleAura("Stealth")) return false;
            if (me.powerByType(PowerType.ComboPoints) < 1) return false;
            const sd = me.getAura("Slice and Dice");
            return !sd || sd.remaining <= sd.duration * 0.3;
          }),
          spell.cast("Between the Eyes", on => combat.bestTarget, req =>
            !me.hasVisibleAura("Stealth") &&
            me.powerByType(PowerType.ComboPoints) >= Settings.RogueOutlawEviscerateComboPoints
          ),
          spell.cast("Dispatch", on => combat.bestTarget, req =>
            !me.hasVisibleAura("Stealth") &&
            Settings.RogueOutlawUseEviscerate &&
            me.powerByType(PowerType.ComboPoints) >= Settings.RogueOutlawEviscerateComboPoints
          ),
          spell.cast("Pistol Shot", on => combat.bestTarget, req =>
            !me.hasVisibleAura("Stealth") &&
            me.hasVisibleAura("Opportunity") &&
            me.powerByType(PowerType.ComboPoints) <= 3
          ),
          spell.cast("Shiv", on => combat.bestTarget, req => !me.hasVisibleAura("Stealth")),
          spell.cast("Sinister Strike", on => combat.bestTarget, req => !me.hasVisibleAura("Stealth"))
        )
      )
    );
  }
}
