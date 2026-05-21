import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import Settings from "@/Core/Settings";

const auras = {
  maelstromWeapon: 344179,
  overflowingMaelstrom: 410681,
  flameShock: 188389,
  lightningShield: 192106,
  earthShield: 974,
  earthShieldSelf: 383648,
  elementalOrbit: 383010,
  ghostWolf: 2645,
  crashLightning: 187878,
  windfuryWeapon: 319773,
  flametongueWeapon: 319778,
  skyfury: 462854,
};

export class ShamanEnhancementBehavior extends Behavior {
  name = "Shaman [Enhancement]";
  context = BehaviorContext.Any;
  specialization = Specialization.Shaman.Enhancement;
  static settings = [
    { type: "slider", uid: "NeerEnhanceMaelstromSpendThreshold", text: "Maelstrom Weapon Spend Threshold", min: 5, max: 10, default: 5 },
  ];

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      spell.interrupt("Wind Shear", false),
      common.waitForCastOrChannel(),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Ghost Wolf", on => me, req =>
            me.isMoving() && !me.inCombat() && !me.hasAura(auras.ghostWolf)
          ),
          spell.cast("Skyfury", on => me, req =>
            !me.hasAura(auras.skyfury) && !me.hasAura(auras.ghostWolf)
          ),
          spell.cast("Windfury Weapon", on => me, req =>
            !me.hasAura(auras.windfuryWeapon) && !me.hasAura(auras.ghostWolf)
          ),
          spell.cast("Flametongue Weapon", on => me, req =>
            !me.hasAura(auras.flametongueWeapon) && !me.hasAura(auras.ghostWolf)
          ),
          spell.cast("Lightning Shield", on => me, req =>
            !me.hasAuraByMe(auras.lightningShield) && !me.hasAura(auras.ghostWolf)
          ),
          spell.cast("Earth Shield", on => me, req =>
            me.hasAura(auras.elementalOrbit) && !this.hasEarthShield(me) && !me.hasAura(auras.ghostWolf)
          ),
          spell.cast("Healing Surge", on => me, req => {
            const stacks = me.getAuraStacks(auras.overflowingMaelstrom);
            return (stacks >= 10 && me.pctHealth < 60) ||
                   (stacks >= 20 && me.pctHealth < 90);
          }),
          common.waitForTarget(),
          common.waitForFacing(),
          common.ensureAutoAttack(),
          spell.cast("Voltaic Blaze", on => this.voltaicBlazeTarget(), req => this.voltaicBlazeTarget() !== null),
          spell.cast("Flame Shock", on => this.flameShockTarget(), req => {
            if (this.flameShockTarget() === null) return false;
            if (spell.getCooldown("Lava Lash")?.ready && this.lavaLashSpreadTarget() !== null) return false;
            return true;
          }),
          spell.cast("Crash Lightning", on => me, req =>
            this.isAoe() && !me.hasAura(auras.crashLightning)
          ),
          spell.cast("Lava Lash", on => this.lavaLashSpreadTarget(), req =>
            this.isAoe() && this.lavaLashSpreadTarget() !== null
          ),
          spell.cast("Chain Lightning", on => combat.bestTarget, req =>
            me.getAuraStacks(auras.maelstromWeapon) >= Settings.NeerEnhanceMaelstromSpendThreshold && this.isAoe()
          ),
          spell.cast("Lightning Bolt", on => combat.bestTarget, req =>
            me.getAuraStacks(auras.maelstromWeapon) >= Settings.NeerEnhanceMaelstromSpendThreshold
          ),
          spell.cast("Stormstrike", on => combat.bestTarget),
          spell.cast("Lava Lash", on => combat.bestTarget)
        )
      )
    );
  }

  _cacheFrame = -1;
  _cachedFlameShockTarget = undefined;
  _cachedLavaLashSpreadTarget = undefined;
  _cachedIsAoe = undefined;

  _refreshCache() {
    if (this._cacheFrame === wow.frameTime) return;
    this._cacheFrame = wow.frameTime;
    this._cachedFlameShockTarget = undefined;
    this._cachedLavaLashSpreadTarget = undefined;
    this._cachedIsAoe = undefined;
  }

  voltaicBlazeTarget() {
    return this.flameShockTarget() || combat.bestTarget || null;
  }

  flameShockTarget() {
    this._refreshCache();
    if (this._cachedFlameShockTarget !== undefined) return this._cachedFlameShockTarget;
    const needs = t => {
      if (!t || !me.isFacing(t)) return false;
      const dot = t.getAuraByMe(auras.flameShock);
      return !dot || dot.remaining <= dot.duration * 0.3;
    };
    let result = null;
    if (needs(combat.bestTarget)) {
      result = combat.bestTarget;
    } else {
      for (const t of combat.targets) {
        if (needs(t)) { result = t; break; }
      }
    }
    this._cachedFlameShockTarget = result;
    return result;
  }

  hasEarthShield(unit) {
    if (!unit) return false;
    return unit.hasAura(auras.earthShield) || unit.hasAura(auras.earthShieldSelf);
  }

  lavaLashSpreadTarget() {
    this._refreshCache();
    if (this._cachedLavaLashSpreadTarget !== undefined) return this._cachedLavaLashSpreadTarget;
    this._cachedLavaLashSpreadTarget = combat.targets.find(t =>
      me.isWithinMeleeRange(t) && t.hasAuraByMe(auras.flameShock)
    ) || null;
    return this._cachedLavaLashSpreadTarget;
  }

  isAoe() {
    this._refreshCache();
    if (this._cachedIsAoe !== undefined) return this._cachedIsAoe;
    this._cachedIsAoe = combat.targets.filter(t => me.distanceTo(t) <= 8).length >= 2;
    return this._cachedIsAoe;
  }
}
