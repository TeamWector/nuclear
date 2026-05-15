import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { DispelPriority } from "@/Data/Dispels";
import { WoWDispelType } from "@/Enums/Auras";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import { defaultHealTargeting as heal } from "@/Targeting/HealTargeting";
import Settings from "@/Core/Settings";

const auras = {
  renewingMist: 119611,
  envelopingMist: 124682,
  manaTea: 115867,
  thunderFocusTea: 116680,
  instantVivify: 392883,
  teachingsOfTheMonastery: 202090,
  lifeCocoon: 116849,
  mysticTouch: 113746,
  heartOfTheJadeSerpentA: 395153,
  heartOfTheJadeSerpentB: 395154,
  chijiBuff: 343820,
};

const spells = {
  manaTeaChannel: 115294,
};

export class MonkMistweaverBehavior extends Behavior {
  name = "Monk [Mistweaver]";
  context = BehaviorContext.Any;
  specialization = Specialization.Monk.Mistweaver;

  static settings = [
    {
      header: "General",
      options: [
        { type: "slider", uid: "MonkMWManaTeaFloorPct", text: "Mana Tea — drink below mana % (when stacks available)", min: 30, max: 100, default: 88 },
        { type: "slider", uid: "MonkMWManaTeaMinStacks", text: "Mana Tea — min stacks to drink (below mana floor)", min: 1, max: 20, default: 6 },
        { type: "checkbox", uid: "MonkMWUseRevival", text: "Use Revival / Restoral", default: true },
        { type: "checkbox", uid: "MonkMWUseChiJi", text: "Use Invoke Chi-Ji, the Red Crane", default: true },
        { type: "checkbox", uid: "MonkMWUseYulon", text: "Use Invoke Yu'lon, the Jade Serpent", default: true },
        { type: "checkbox", uid: "MonkMWUseCelestialConduit", text: "Use Celestial Conduit", default: true },
      ]
    },
    {
      header: "Triage",
      options: [
        { type: "slider", uid: "MonkMWEmergencyPct", text: "Emergency — Sheilun's / spot heals (%)", min: 1, max: 50, default: 22 },
        { type: "slider", uid: "MonkMWLifeCocoonPct", text: "Life Cocoon (%)", min: 5, max: 80, default: 45 },
        { type: "slider", uid: "MonkMWRevivalCount", text: "Revival — min injured allies", min: 1, max: 10, default: 4 },
        { type: "slider", uid: "MonkMWRevivalPct", text: "Revival — ally health below (%)", min: 10, max: 100, default: 55 },
        { type: "slider", uid: "MonkMWSheilunCount", text: "Sheilun's Gift — min injured allies (AoE mode)", min: 1, max: 8, default: 3 },
        { type: "slider", uid: "MonkMWSheilunPct", text: "Sheilun's Gift — ally health below (%)", min: 10, max: 100, default: 68 },
        { type: "slider", uid: "MonkMWEnvelopPct", text: "Enveloping Mist — filler threshold (%)", min: 40, max: 100, default: 72 },
        { type: "slider", uid: "MonkMWVivifyPct", text: "Vivify — instant / Zen Pulse spend (%)", min: 30, max: 100, default: 78 },
        { type: "slider", uid: "MonkMWZenPulseSpendAllies", text: "Spend Zen Pulse — min injured allies", min: 1, max: 5, default: 2 },
      ]
    }
  ];

  build() {
    return new bt.Selector(
      this.cancelManaTea(),
      common.waitForNotSitting(),
      common.waitForNotMounted(),
      common.waitForCastOrChannel(),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          common.waitForCombat(),
          new bt.Action(() => {
            this._healTarget = heal.getPriorityTarget();
            this._envelopProcTarget = this.computeEnvelopingProcTarget();
            return bt.Status.Failure;
          }),
          this.rotation()
        )
      )
    );
  }

  rotation() {
    return new bt.Selector(
      spell.cast("Fortifying Brew", on => me, ret =>
        spell.isSpellKnown("Fortifying Brew")
        && me.inCombat() && me.effectiveHealthPercent < 40),

      common.ensureAutoAttack(),

      this.majorRaidCooldowns(),

      spell.dispel("Detox", true, DispelPriority.Low, false, WoWDispelType.Magic, WoWDispelType.Poison, WoWDispelType.Disease),

      spell.cast("Sheilun's Gift", on => this._healTarget, ret =>
        spell.isSpellKnown("Sheilun's Gift")
        && this._healTarget
        && this._healTarget.effectiveHealthPercent <= Settings.MonkMWEmergencyPct),

      this.mysticTouchTigerPalm(),

      this.thunderFocusSequences(),

      spell.cast("Enveloping Mist", on => this._healTarget, ret =>
        me.hasAura(auras.thunderFocusTea)
        && this._healTarget
        && !this._healTarget.hasAuraByMe(auras.envelopingMist)
        && this._healTarget.effectiveHealthPercent < 92),

      spell.cast("Life Cocoon", on => this.findLifeCocoonTarget(), ret => this.findLifeCocoonTarget() !== undefined),

      spell.cast("Renewing Mist", on => this.remTargetPreferCharges(), ret =>
        this.remCharges() >= 3 && this.remTargetPreferCharges() !== undefined),

      spell.cast("Mana Tea", on => me, ret => this.shouldManaTeaTwentyStacks()),

      this.risingWindKick(),

      this.invokeCelestials(),

      spell.cast("Celestial Conduit", on => me, ret =>
        Settings.MonkMWUseCelestialConduit
        && spell.isSpellKnown("Celestial Conduit")
        && !this.recentMajorHealCd()
        && this.countAlliesBelow(Settings.MonkMWRevivalPct) >= Settings.MonkMWRevivalCount),

      this.chijiEnvelopingMist(),

      spell.cast("Enveloping Mist", on => this._envelopProcTarget, ret => !!this._envelopProcTarget),

      spell.cast("Renewing Mist", on => this.remTargetPreferSpread(), ret =>
        this.remTargetPreferSpread() !== undefined && this.remRenewingReady()),

      spell.cast("Enveloping Mist", on => this._healTarget, ret =>
        this._healTarget
        && this._healTarget.effectiveHealthPercent <= Settings.MonkMWEnvelopPct
        && (me.hasAura("Strength of the Black Ox") || me.hasAura(auras.thunderFocusTea))),

      spell.cast("Spinning Crane Kick", on => me, ret =>
        this.meleeEnemy() !== undefined && this.enemiesInMeleeCount() >= 3),

      spell.cast("Vivify", on => this._healTarget, ret =>
        this._healTarget
        && this._healTarget.effectiveHealthPercent <= Settings.MonkMWVivifyPct
        && (me.hasAura(auras.instantVivify) || me.hasAura("Vivacious Vivification") || this.shouldSpendZenPulse())),

      spell.cast("Sheilun's Gift", on => this._healTarget, ret =>
        spell.isSpellKnown("Sheilun's Gift")
        && this._healTarget
        && this.countAlliesBelow(Settings.MonkMWSheilunPct) >= Settings.MonkMWSheilunCount),

      spell.cast("Mana Tea", on => me, ret => this.shouldManaTeaForMana()),

      spell.cast("Blackout Kick", on => this.meleeEnemy(), ret => {
        const t = this.meleeEnemy();
        return t && me.getAuraStacks(auras.teachingsOfTheMonastery) >= 3;
      }),

      spell.cast("Tiger Palm", on => this.meleeEnemy(), ret => this.meleeEnemy() !== undefined),
    );
  }

  majorRaidCooldowns() {
    return new bt.Selector(
      spell.cast("Restoral", on => me, ret =>
        Settings.MonkMWUseRevival
        && spell.isSpellKnown("Restoral")
        && !this.recentMajorHealCd()
        && this.countAlliesBelow(Settings.MonkMWRevivalPct) >= Settings.MonkMWRevivalCount),
      spell.cast("Revival", on => me, ret =>
        Settings.MonkMWUseRevival
        && spell.isSpellKnown("Revival")
        && !spell.isSpellKnown("Restoral")
        && !this.recentMajorHealCd()
        && this.countAlliesBelow(Settings.MonkMWRevivalPct) >= Settings.MonkMWRevivalCount),
    );
  }

  invokeCelestials() {
    return new bt.Selector(
      spell.cast("Invoke Chi-Ji, the Red Crane", on => me, ret =>
        Settings.MonkMWUseChiJi
        && spell.isSpellKnown("Invoke Chi-Ji, the Red Crane")
        && !this.recentMajorHealCd()
        && this.countAlliesBelow(Settings.MonkMWRevivalPct) >= Math.min(3, Settings.MonkMWRevivalCount)),
      spell.cast("Invoke Yu'lon, the Jade Serpent", on => me, ret =>
        Settings.MonkMWUseYulon
        && spell.isSpellKnown("Invoke Yu'lon, the Jade Serpent")
        && !spell.isSpellKnown("Invoke Chi-Ji, the Red Crane")
        && !this.recentMajorHealCd()
        && this.countAlliesBelow(Settings.MonkMWRevivalPct) >= Math.min(3, Settings.MonkMWRevivalCount)),
    );
  }

  thunderFocusSequences() {
    return new bt.Selector(
      new bt.Sequence(
        spell.cast("Thunder Focus Tea", on => me, ret =>
          !me.hasAura(auras.thunderFocusTea) && this.shouldTftIntoEnveloping()),
        spell.cast("Enveloping Mist", on => this._tftEnvelopTarget, ret => !!this._tftEnvelopTarget),
        new bt.Action(() => {
          this._tftEnvelopTarget = undefined;
          return bt.Status.Success;
        })
      ),
      new bt.Sequence(
        new bt.Action(() => {
          this._tftRemTarget = this.remTargetPreferCharges() || this.remTargetPreferSpread();
          return this._tftRemTarget ? bt.Status.Success : bt.Status.Failure;
        }),
        spell.cast("Thunder Focus Tea", on => me, ret =>
          !me.hasAura(auras.thunderFocusTea) && this.shouldTftIntoRenewingMist()),
        spell.cast("Renewing Mist", on => this._tftRemTarget),
        new bt.Action(() => {
          this._tftRemTarget = undefined;
          return bt.Status.Success;
        })
      ),
    );
  }

  shouldTftIntoEnveloping() {
    if (!spell.isSpellKnown("Thunder Focus Tea")) return false;
    if (me.hasAura(auras.thunderFocusTea)) return false;
    const stacks = me.getAuraStacks("Spiritfont");
    if (stacks >= 2) {
      this._tftEnvelopTarget = heal.priorityList.find(p =>
        p.effectiveHealthPercent <= Settings.MonkMWEnvelopPct && !p.hasAuraByMe(auras.envelopingMist));
      return !!this._tftEnvelopTarget;
    }
    if (me.hasAura("Strength of the Black Ox")) {
      this._tftEnvelopTarget = heal.priorityList.find(p =>
        p.effectiveHealthPercent <= 92 && !p.hasAuraByMe(auras.envelopingMist));
      return !!this._tftEnvelopTarget;
    }
    if (this._healTarget && this._healTarget.effectiveHealthPercent <= Settings.MonkMWEmergencyPct + 8) {
      this._tftEnvelopTarget = this._healTarget;
      return !this._healTarget.hasAuraByMe(auras.envelopingMist);
    }
    return false;
  }

  shouldTftIntoRenewingMist() {
    if (!spell.isSpellKnown("Thunder Focus Tea")) return false;
    if (this.remCharges() >= 2 || this.hasHeartOfTheJadeSerpent()) {
      return !!this._tftRemTarget;
    }
    return false;
  }

  computeEnvelopingProcTarget() {
    if (me.getAuraStacks("Spiritfont") >= 2) {
      return heal.priorityList.find(p =>
        p.effectiveHealthPercent <= 94 && !p.hasAuraByMe(auras.envelopingMist));
    }
    if (me.hasAura("Strength of the Black Ox")) {
      return heal.priorityList.find(p =>
        p.effectiveHealthPercent <= 96 && !p.hasAuraByMe(auras.envelopingMist));
    }
    return undefined;
  }

  chijiEnvelopingMist() {
    return new bt.Decorator(
      ret => me.getAuraStacks(auras.chijiBuff) >= 3 && this.hasChiji(),
      spell.cast("Enveloping Mist", on => heal.priorityList.find(p => !p.hasAuraByMe(auras.envelopingMist)), ret =>
        !!heal.priorityList.find(p => !p.hasAuraByMe(auras.envelopingMist)))
    );
  }

  risingWindKick() {
    return new bt.Selector(
      spell.cast("Rushing Wind Kick", on => this.meleeEnemy(), ret => {
        const t = this.meleeEnemy();
        return t && spell.isSpellKnown("Rushing Wind Kick");
      }),
      spell.cast("Rising Sun Kick", on => this.meleeEnemy(), ret => {
        const t = this.meleeEnemy();
        return t && spell.isSpellKnown("Rising Sun Kick");
      }),
    );
  }

  mysticTouchTigerPalm() {
    return spell.cast("Tiger Palm", on => this.meleeEnemy(), ret => {
      const t = this.meleeEnemy();
      return t && !t.hasAuraByMe(auras.mysticTouch) && me.isWithinMeleeRange(t);
    });
  }

  remCharges() {
    if (!spell.isSpellKnown("Renewing Mist")) return 0;
    const c = spell.getCharges("Renewing Mist");
    return typeof c === "number" ? c : 0;
  }

  remTargetPreferCharges() {
    return heal.priorityList.find(p => !p.hasAuraByMe(auras.renewingMist))
      || heal.priorityList[0];
  }

  remTargetPreferSpread() {
    return heal.priorityList.find(p => !p.hasAuraByMe(auras.renewingMist));
  }

  remRenewingReady() {
    if (!spell.isSpellKnown("Renewing Mist")) return false;
    const cd = spell.getCooldown("Renewing Mist");
    return !!(cd && cd.ready);
  }

  findLifeCocoonTarget() {
    return heal.priorityList.find(p =>
      p.effectiveHealthPercent <= Settings.MonkMWLifeCocoonPct
      && !p.hasAura(auras.lifeCocoon));
  }

  meleeEnemy() {
    if (combat.bestTarget && me.isWithinMeleeRange(combat.bestTarget)) {
      return combat.bestTarget;
    }
    return combat.targets.find(u => me.isWithinMeleeRange(u));
  }

  enemiesInMeleeCount() {
    return combat.targets.filter(u => me.isWithinMeleeRange(u)).length;
  }

  countAlliesBelow(pct) {
    return heal.priorityList.filter(p => p.effectiveHealthPercent > 0 && p.effectiveHealthPercent < pct).length;
  }

  hasHeartOfTheJadeSerpent() {
    return me.hasAura(auras.heartOfTheJadeSerpentA) || me.hasAura(auras.heartOfTheJadeSerpentB) || me.hasAura("Heart of the Jade Serpent");
  }

  shouldSpendZenPulse() {
    const stacks = me.getAuraStacks("Zen Pulse");
    if (stacks < 1) return false;
    return this.countAlliesBelow(Settings.MonkMWVivifyPct) >= Settings.MonkMWZenPulseSpendAllies
      || stacks >= 2;
  }

  recentMajorHealCd() {
    const window = 4500;
    return spell.getTimeSinceLastCast("Revival") < window
      || spell.getTimeSinceLastCast("Restoral") < window
      || spell.getTimeSinceLastCast("Celestial Conduit") < window
      || spell.getTimeSinceLastCast("Invoke Chi-Ji, the Red Crane") < window
      || spell.getTimeSinceLastCast("Invoke Yu'lon, the Jade Serpent") < window;
  }

  shouldManaTeaTwentyStacks() {
    const stacks = me.getAuraStacks(auras.manaTea);
    return stacks >= 20 && me.pctPower < 100;
  }

  shouldManaTeaForMana() {
    const stacks = me.getAuraStacks(auras.manaTea);
    if (stacks === 0) return false;
    if (this.shouldManaTeaTwentyStacks()) return false;
    if (me.pctPower >= Settings.MonkMWManaTeaFloorPct) return false;
    return stacks >= Settings.MonkMWManaTeaMinStacks;
  }

  cancelManaTea() {
    return new bt.Decorator(
      ret => me.pctPower >= 100 && me.isCastingOrChanneling && this.isCastingManaTea(),
      new bt.Action(_ => {
        me.stopCasting();
        return bt.Status.Success;
      })
    );
  }

  isCastingManaTea() {
    if (!me.isCastingOrChanneling) return false;
    return me.spellInfo.spellChannelId === spells.manaTeaChannel;
  }

  hasChiji() {
    const totem = wow.GameUI.totemInfo[0];
    return totem && totem.name === "Chi-Ji";
  }
}
