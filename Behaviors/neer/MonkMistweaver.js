import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import { defaultHealTargeting as heal } from "@/Targeting/HealTargeting";
import Settings from "@/Core/Settings";
import { DispelPriority } from "@/Data/Dispels";
import { WoWDispelType } from "@/Enums/Auras";

const auras = {
  renewingMist: 119611,
  envelopingMist: 124682,
};

const spells = {
  soothingMist: 115175,
};

export class MonkMistweaverBehavior extends Behavior {
  name = "Monk [Mistweaver]";
  context = BehaviorContext.Any;
  specialization = Specialization.Monk.Mistweaver;

  static settings = [
    { type: "slider", uid: "NeerMWRenewingMistThreshold", text: "Renewing Mist Threshold (%)", min: 0, max: 100, default: 95 },
    { type: "slider", uid: "NeerMWVivifyThreshold", text: "Vivify Threshold (%)", min: 0, max: 100, default: 80 },
    { type: "slider", uid: "NeerMWSoothingMistThreshold", text: "Soothing Mist Threshold (%)", min: 0, max: 100, default: 95 },
    { type: "slider", uid: "NeerMWEnvelopHpPct", text: "Enveloping Mist HP threshold (%)", min: 0, max: 100, default: 70 },
  ];

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      spell.interrupt("Spear Hand Strike", false),
      new bt.Action(() => {
        if (!me.isCastingOrChanneling) return bt.Status.Failure;
        if (me.spellInfo?.spellChannelId === spells.soothingMist) return bt.Status.Failure;
        return bt.Status.Success;
      }),

      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Renewing Mist", on => this.getRenewingMistTankTarget(), req => this.getRenewingMistTankTarget() !== null),
          spell.cast("Renewing Mist", on => this.getRenewingMistTarget(), req => this.getRenewingMistTarget() !== null),
          spell.cast("Enveloping Mist", on => this.getEnvelopingMistTarget(), req => this.getEnvelopingMistTarget() !== null),
          spell.cast("Soothing Mist", on => this.getSoothingMistSpikeTarget(), req => this.getSoothingMistSpikeTarget() !== null),
          spell.cast("Vivify", on => this.getVivifyTarget(), req => this.getVivifyTarget() !== null),
          spell.cast("Soothing Mist", on => this.getSoothingMistTarget(), req => this.getSoothingMistTarget() !== null),
          common.waitForTarget(),
          common.waitForFacing(),
          common.waitForMelee(),
          spell.cast("Rising Sun Kick", on => combat.bestTarget),
          spell.cast("Blackout Kick", on => combat.bestTarget),
          spell.cast("Tiger Palm", on => combat.bestTarget)
        )
      )
    );
  }

  _cacheFrame = -1;
  _cachedAllies = null;
  _cachedLowestAlly = undefined;
  _cachedTank = undefined;
  _cachedTankSet = undefined;
  _cachedEnvelopCandidate = undefined;

  _refreshCache() {
    if (this._cacheFrame === wow.frameTime) return;
    this._cacheFrame = wow.frameTime;
    this._cachedAllies = null;
    this._cachedLowestAlly = undefined;
    this._cachedTank = undefined;
    this._cachedTankSet = undefined;
    this._cachedEnvelopCandidate = undefined;
  }

  isChannelingSoothingMist() {
    return me.spellInfo?.spellChannelId === spells.soothingMist;
  }

  getValidAllies() {
    this._refreshCache();
    if (this._cachedAllies !== null) return this._cachedAllies;
    this._cachedAllies = (heal.priorityList || []).filter(a =>
      a && a.effectiveHealthPercent > 0 && me.withinLineOfSight(a) && me.distanceTo(a) <= 40
    );
    return this._cachedAllies;
  }

  getLowestAlly() {
    this._refreshCache();
    if (this._cachedLowestAlly !== undefined) return this._cachedLowestAlly;
    const list = this.getValidAllies();
    this._cachedLowestAlly = list.length === 0
      ? null
      : list.reduce((lo, a) => (a.effectiveHealthPercent < lo.effectiveHealthPercent ? a : lo), list[0]);
    return this._cachedLowestAlly;
  }

  getTank() {
    this._refreshCache();
    if (this._cachedTank !== undefined) return this._cachedTank;
    const tanks = (heal.friends.Tanks || []).filter(t => t);
    const eligible = t => t && me.withinLineOfSight(t) && me.distanceTo(t) <= 40;
    this._cachedTank = tanks.find(t => eligible(t) && t.isTanking()) || tanks.find(eligible) || null;
    return this._cachedTank;
  }

  getTankGuids() {
    this._refreshCache();
    if (this._cachedTankSet !== undefined) return this._cachedTankSet;
    const set = new Set();
    for (const t of (heal.friends.Tanks || [])) {
      if (t?.guid) set.add(t.guid.hash);
    }
    this._cachedTankSet = set;
    return set;
  }

  getRenewingMistTankTarget() {
    if (spell.getCharges("Renewing Mist") < 2) return null;
    const tank = this.getTank();
    if (!tank) return null;
    return tank.hasAuraByMe(auras.renewingMist) ? null : tank;
  }

  getRenewingMistTarget() {
    const list = this.getValidAllies();
    return list.find(a =>
      a.effectiveHealthPercent <= Settings.NeerMWRenewingMistThreshold && !a.hasAuraByMe(auras.renewingMist)
    ) || null;
  }

  getEnvelopingMistCandidate() {
    this._refreshCache();
    if (this._cachedEnvelopCandidate !== undefined) return this._cachedEnvelopCandidate;
    const list = this.getValidAllies();
    const tanks = this.getTankGuids();
    const hpPct = Settings.NeerMWEnvelopHpPct ?? 70;

    const isTargetedByEnemy = (ally) =>
      ally.guid && combat.targets.some(e => e?.target && e.target.equals(ally.guid));

    let best = null;
    for (const a of list) {
      if (a.hasAuraByMe(auras.envelopingMist)) continue;
      const lowHp = a.effectiveHealthPercent <= hpPct;
      const nonTankUnderFire = a.guid && !tanks.has(a.guid.hash) && isTargetedByEnemy(a);
      if (!lowHp && !nonTankUnderFire) continue;
      if (!best || a.effectiveHealthPercent < best.effectiveHealthPercent) best = a;
    }
    this._cachedEnvelopCandidate = best;
    return best;
  }

  getEnvelopingMistTarget() {
    if (!this.isChannelingSoothingMist()) return null;
    return this.getEnvelopingMistCandidate();
  }

  getSoothingMistSpikeTarget() {
    if (this.isChannelingSoothingMist()) return null;
    return this.getEnvelopingMistCandidate();
  }

  getVivifyTarget() {
    const ally = this.getLowestAlly();
    if (!ally) return null;
    return ally.effectiveHealthPercent <= Settings.NeerMWVivifyThreshold ? ally : null;
  }

  getSoothingMistTarget() {
    const ally = this.getLowestAlly();
    if (!ally) return null;
    return ally.effectiveHealthPercent <= Settings.NeerMWSoothingMistThreshold ? ally : null;
  }
}
