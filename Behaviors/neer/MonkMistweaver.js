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
import { PowerType } from "@/Enums/PowerType";

const auras = {
  renewingMist: 119611,
  envelopingMist: 124682,
  vivaciousVivification: 392883,
  invokeChiJi: 325197,
  danceOfChiJi: 438443,
};

const spells = {
  soothingMist: 115175,
  manaTea: 115294,
  celestialConduit: 443028,
};

export class MonkMistweaverBehavior extends Behavior {
  name = "Monk [Mistweaver]";
  context = BehaviorContext.Any;
  specialization = Specialization.Monk.Mistweaver;

  static settings = [
    {
      header: "Single-Target Healing",
      options: [
        { type: "slider", uid: "NeerMWRenewingMistThreshold", text: "Renewing Mist Threshold (%)", min: 0, max: 100, default: 95 },
        { type: "slider", uid: "NeerMWVivifyThreshold", text: "Vivify Threshold (%)", min: 0, max: 100, default: 80 },
        { type: "slider", uid: "NeerMWEnvelopHpPct", text: "Enveloping Mist HP threshold (%)", min: 0, max: 100, default: 70 },
        { type: "slider", uid: "NeerMWEnvelopHeavyDamagePct", text: "Enveloping Mist heavy damage % within window", min: 5, max: 80, default: 25 },
        { type: "slider", uid: "NeerMWEnvelopHeavyDamageWindowMs", text: "Enveloping Mist heavy damage window (ms)", min: 500, max: 5000, default: 2000 },
        { type: "slider", uid: "NeerMWLifeCocoonHp", text: "Life Cocoon HP threshold (%)", min: 0, max: 100, default: 25 },
      ],
    },
    {
      header: "Raid Cooldowns",
      options: [
        { type: "slider", uid: "NeerMWRevivalHp", text: "Revival HP threshold (%)", min: 0, max: 100, default: 70 },
        { type: "slider", uid: "NeerMWRevivalCount", text: "Revival min injured allies", min: 1, max: 20, default: 5 },
        { type: "slider", uid: "NeerMWChiJiHp", text: "Chi-Ji HP threshold (%)", min: 0, max: 100, default: 80 },
        { type: "slider", uid: "NeerMWChiJiCount", text: "Chi-Ji min injured allies", min: 1, max: 20, default: 3 },
        { type: "checkbox", uid: "NeerMWUseCelestialConduit", text: "Use Celestial Conduit", default: true },
        { type: "slider", uid: "NeerMWCelestialConduitHp", text: "Celestial Conduit HP threshold (%)", min: 0, max: 100, default: 85 },
        { type: "slider", uid: "NeerMWCelestialConduitCount", text: "Celestial Conduit min injured allies", min: 1, max: 20, default: 3 },
      ],
    },
    {
      header: "Mana",
      options: [
        { type: "slider", uid: "NeerMWManaTeaMana", text: "Mana Tea Cast Below Mana (%)", min: 0, max: 100, default: 70 },
        { type: "slider", uid: "NeerMWManaTeaSafeHp", text: "Mana Tea Skip If Ally Below HP (%)", min: 0, max: 100, default: 50 },
      ],
    },
    {
      header: "Defensives",
      options: [
        { type: "checkbox", uid: "NeerMWUseFortifyingBrew", text: "Use Fortifying Brew on heavy self damage", default: true },
        { type: "slider", uid: "NeerMWFortifyingBrewDropPct", text: "Fortifying Brew HP loss threshold (%)", min: 5, max: 80, default: 20 },
        { type: "slider", uid: "NeerMWFortifyingBrewWindowMs", text: "Fortifying Brew window (ms)", min: 1000, max: 10000, default: 4000 },
      ],
    },
    {
      header: "Crowd Control",
      options: [
        { type: "checkbox", uid: "NeerMWUseRingOfPeace", text: "Use Ring of Peace", default: true },
        { type: "checkbox", uid: "NeerMWRingOfPeaceCasters", text: "Ring of Peace on clustered casters (when Leg Sweep on CD)", default: true },
        { type: "checkbox", uid: "NeerMWRingOfPeaceMelee", text: "Ring of Peace on self vs melee swarm", default: true },
        { type: "slider", uid: "NeerMWRingOfPeaceMeleeCount", text: "Ring of Peace min melee attackers on me", min: 1, max: 10, default: 2 },
      ],
    },
  ];

  build() {
    return new bt.Selector(
      new bt.Action(() => {
        if (me.isChanneling
            && me.spellInfo?.spellChannelId === spells.manaTea
            && me.pctPowerByType(PowerType.Mana) >= 100) {
          me.stopCasting();
          return bt.Status.Success;
        }
        return bt.Status.Failure;
      }),
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      spell.interrupt("Spear Hand Strike", false),
      spell.cast("Shadowmeld", on => me, req => this.shouldShadowmeld()),
      spell.cast("Fortifying Brew", on => me, req => this.shouldFortifyingBrew()),
      new bt.Action(() => {
        if (!me.isCastingOrChanneling) return bt.Status.Failure;
        if (me.isChanneling && me.spellInfo?.spellChannelId === spells.soothingMist) {
          return bt.Status.Failure;
        }
        if (me.isChanneling && me.spellInfo?.spellChannelId === spells.manaTea) {
          return bt.Status.Failure;
        }
        return bt.Status.Success;
      }),

      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Spinning Crane Kick", on => me, req => this.shouldEmergencySpinningCraneKick()),
          spell.dispel("Detox", true, DispelPriority.Low, false, WoWDispelType.Magic, WoWDispelType.Poison, WoWDispelType.Disease),
          spell.cast("Life Cocoon", on => this.getLifeCocoonTarget(), req => this.getLifeCocoonTarget() !== null),
          spell.cast("Revival", on => me, req => this.shouldRevival()),
          spell.cast("Celestial Conduit", on => me, req => this.shouldCelestialConduit()),
          spell.cast("Invoke Chi-Ji, the Red Crane", on => me, req => this.shouldInvokeChiJi()),
          spell.cast("Leg Sweep", on => me, req => this.shouldLegSweep()),
          spell.cast("Ring of Peace", on => this.getRingOfPeaceTarget(), req => !!this.getRingOfPeaceTarget()),
          spell.cast("Spinning Crane Kick", on => me, req => this.shouldSpinningCraneKickDance()),
          spell.cast("Mana Tea", req => this.shouldCastManaTea()),
          spell.cast("Enveloping Mist", on => this.getEnvelopingMistTarget(), req => this.getEnvelopingMistTarget() !== null, { skipMovingCheck: true }),
          spell.cast("Soothing Mist", on => this.getSoothingMistSpikeTarget(), req => this.getSoothingMistSpikeTarget() !== null),
          spell.cast("Sheilun's Gift", on => this.getVivifyTarget(), req => this.getVivifyTarget() !== null, { skipMovingCheck: true }),
          spell.cast("Renewing Mist", on => this.getRenewingMistTankTarget(), req => this.getRenewingMistTankTarget() !== null),
          spell.cast("Renewing Mist", on => this.getRenewingMistTarget(), req => this.getRenewingMistTarget() !== null),
          new bt.Action(() => {
            const target = this.getMeleeTarget();
            if (target && me.isWithinMeleeRange(target)) {
              const aa = spell.getSpell("Auto Attack");
              if (aa && !aa.isActive) me.startAttack();
            }
            return bt.Status.Failure;
          }),
          spell.cast("Spinning Crane Kick", on => me, req => this.shouldSpinningCraneKick()),
          new bt.Action(() => {
            const target = this.getMeleeTarget();
            if (!target) return bt.Status.Failure;
            if (!me.isWithinMeleeRange(target) || !me.isFacing(target)) return bt.Status.Failure;
            const rsk = spell.getSpell("Rising Sun Kick");
            if (!rsk || !rsk.cooldown.ready) return bt.Status.Failure;

            const tft = spell.getSpell("Thunder Focus Tea");
            if (tft && tft.cooldown.ready) tft.cast(me);
            return rsk.cast(target) ? bt.Status.Success : bt.Status.Failure;
          }),
          spell.cast("Blackout Kick", on => this.getMeleeTarget()),
          spell.cast("Tiger Palm", on => this.getMeleeTarget())
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
  _cachedMeleeTarget = undefined;
  _lastHpByAlly = new Map();
  _damageEventsByAlly = new Map();
  _lastHpSnapshotFrame = -1;
  _selfHpEvents = [];
  _lastSelfHp = undefined;
  _lastSelfHpFrame = -1;

  _refreshCache() {
    if (this._cacheFrame === wow.frameTime) return;
    this._cacheFrame = wow.frameTime;
    this._cachedAllies = null;
    this._cachedLowestAlly = undefined;
    this._cachedTank = undefined;
    this._cachedTankSet = undefined;
    this._cachedEnvelopCandidate = undefined;
    this._cachedMeleeTarget = undefined;
  }

  getMeleeTarget() {
    this._refreshCache();
    if (this._cachedMeleeTarget !== undefined) return this._cachedMeleeTarget;
    const best = combat.bestTarget;
    if (best && me.isFacing(best) && me.isWithinMeleeRange(best)) {
      this._cachedMeleeTarget = best;
      return best;
    }
    const reachable = combat.targets.find(t => me.isFacing(t) && me.isWithinMeleeRange(t));
    this._cachedMeleeTarget = reachable || best || null;
    return this._cachedMeleeTarget;
  }

  _snapshotDamage() {
    if (this._lastHpSnapshotFrame === wow.frameTime) return;
    this._lastHpSnapshotFrame = wow.frameTime;
    const now = wow.frameTime;
    const windowMs = 5000;
    for (const a of this.getValidAllies()) {
      if (!a.guid) continue;
      const key = a.guid.hash;
      const hpPct = a.effectiveHealthPercent;
      const lastHp = this._lastHpByAlly.get(key);
      if (lastHp !== undefined) {
        const drop = lastHp - hpPct;
        if (drop > 0) {
          let events = this._damageEventsByAlly.get(key);
          if (!events) { events = []; this._damageEventsByAlly.set(key, events); }
          events.push({ t: now, dropPct: drop });
          while (events.length && now - events[0].t > windowMs) events.shift();
        }
      }
      this._lastHpByAlly.set(key, hpPct);
    }
  }

  isTakingHeavyDamage(ally) {
    this._snapshotDamage();
    if (!ally.guid) return false;
    const events = this._damageEventsByAlly.get(ally.guid.hash);
    if (!events) return false;
    const cutoff = wow.frameTime - Settings.NeerMWEnvelopHeavyDamageWindowMs;
    let total = 0;
    for (const e of events) {
      if (e.t >= cutoff) total += e.dropPct;
    }
    return total >= Settings.NeerMWEnvelopHeavyDamagePct;
  }

  isUnderIncomingCast(ally) {
    if (!ally.guid) return false;
    return combat.targets.some(e =>
      e?.isCasting && e.target && e.target.equals(ally.guid)
    );
  }

  isChannelingSoothingMist() {
    return me.isChanneling
      && me.spellInfo?.spellChannelId === spells.soothingMist;
  }

  getChannelTargetAlly() {
    if (!this.isChannelingSoothingMist()) return null;
    const targetGuid = me.spellInfo?.spellTargetGuid;
    if (!targetGuid || targetGuid.isNull) return null;
    return this.getValidAllies().find(a => a.guid?.equals(targetGuid)) || null;
  }

  shouldCastManaTea() {
    if (me.pctPowerByType(PowerType.Mana) >= Settings.NeerMWManaTeaMana) return false;
    return !this.getValidAllies().some(a => a.effectiveHealthPercent < Settings.NeerMWManaTeaSafeHp);
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

    const smTarget = this.getChannelTargetAlly();
    if (smTarget && !smTarget.hasAuraByMe(auras.envelopingMist)
        && smTarget.effectiveHealthPercent < 100) {
      this._cachedEnvelopCandidate = smTarget;
      return smTarget;
    }

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
      const takingHeavy = this.isTakingHeavyDamage(a);
      const incomingCast = this.isUnderIncomingCast(a);
      if (!lowHp && !nonTankUnderFire && !takingHeavy && !incomingCast) continue;
      if (!best || a.effectiveHealthPercent < best.effectiveHealthPercent) best = a;
    }
    this._cachedEnvelopCandidate = best;
    return best;
  }

  getEnvelopingMistTarget() {
    if (!this.isChannelingSoothingMist() && !me.hasAura(auras.invokeChiJi)) return null;
    return this.getEnvelopingMistCandidate();
  }

  getSoothingMistSpikeTarget() {
    if (this.isChannelingSoothingMist()) return null;
    const envelope = this.getEnvelopingMistCandidate();
    if (envelope && !me.hasAura(auras.invokeChiJi)) return envelope;
    if (me.hasAura(auras.vivaciousVivification)) return null;
    return this.getVivifyTarget();
  }

  shouldSpinningCraneKickDance() {
    if (!me.hasAura(auras.danceOfChiJi)) return false;
    for (const t of combat.targets) {
      if (me.distanceTo(t) <= 10) return true;
    }
    return false;
  }

  shouldSpinningCraneKick() {
    let count = 0;
    for (const t of combat.targets) {
      if (me.distanceTo(t) <= 10) {
        count++;
        if (count >= 5) return true;
      }
    }
    return false;
  }

  shouldEmergencySpinningCraneKick() {
    let count = 0;
    for (const t of combat.targets) {
      if (me.distanceTo(t) <= 10) {
        count++;
        if (count >= 8) break;
      }
    }
    if (count < 8) return false;
    return this.getValidAllies().some(a => a.effectiveHealthPercent < 80);
  }

  _snapshotSelfDamage() {
    if (this._lastSelfHpFrame === wow.frameTime) return;
    this._lastSelfHpFrame = wow.frameTime;
    const now = wow.frameTime;
    const hpPct = me.effectiveHealthPercent;
    if (this._lastSelfHp !== undefined) {
      const drop = this._lastSelfHp - hpPct;
      if (drop > 0) this._selfHpEvents.push({ t: now, dropPct: drop });
      const horizon = 10000;
      while (this._selfHpEvents.length && now - this._selfHpEvents[0].t > horizon) {
        this._selfHpEvents.shift();
      }
    }
    this._lastSelfHp = hpPct;
  }

  shouldFortifyingBrew() {
    if (!Settings.NeerMWUseFortifyingBrew) return false;
    this._snapshotSelfDamage();
    const cutoff = wow.frameTime - Settings.NeerMWFortifyingBrewWindowMs;
    let total = 0;
    for (const e of this._selfHpEvents) {
      if (e.t >= cutoff) total += e.dropPct;
    }
    return total >= Settings.NeerMWFortifyingBrewDropPct;
  }

  shouldShadowmeld() {
    if (!me.guid) return false;
    const now = wow.frameTime;
    return combat.targets.find(e => {
      if (!e?.isCasting) return false;
      if (!e.spellInfo?.spellTargetGuid?.equals(me.guid)) return false;
      const remaining = e.spellInfo.castEnd - now;
      return remaining > 0 && remaining < 500;
    });
  }

  shouldLegSweep() {
    let count = 0;
    for (const t of combat.targets) {
      if (t?.isCasting && me.distanceTo(t) <= 10) {
        count++;
        if (count > 1) return true;
      }
    }
    return false;
  }

  getRingOfPeaceTarget() {
    if (!Settings.NeerMWUseRingOfPeace) return null;
    if (Settings.NeerMWRingOfPeaceCasters && spell.isOnCooldown("Leg Sweep")) {
      const caster = combat.targets.find(t => {
        if (!t?.isCasting || me.distanceTo(t) > 40) return false;
        return combat.targets.some(o =>
          o !== t && o?.isCasting && t.distanceTo(o) <= 6
        );
      });
      if (caster) return caster;
    }
    if (Settings.NeerMWRingOfPeaceMelee) {
      const need = Settings.NeerMWRingOfPeaceMeleeCount;
      let meleeCount = 0;
      for (const t of combat.targets) {
        if (t?.target?.equals(me.guid) && me.isWithinMeleeRange(t)) {
          meleeCount++;
          if (meleeCount >= need) return me;
        }
      }
    }
    return null;
  }

  shouldRevival() {
    const hp = Settings.NeerMWRevivalHp;
    const need = Settings.NeerMWRevivalCount;
    let count = 0;
    for (const a of this.getValidAllies()) {
      if (a.effectiveHealthPercent <= hp) {
        count++;
        if (count >= need) return true;
      }
    }
    return false;
  }

  shouldCelestialConduit() {
    if (!Settings.NeerMWUseCelestialConduit) return false;
    const hp = Settings.NeerMWCelestialConduitHp;
    const need = Settings.NeerMWCelestialConduitCount;
    let count = 0;
    for (const a of this.getValidAllies()) {
      if (me.distanceTo(a) <= 20 && a.effectiveHealthPercent <= hp) {
        count++;
        if (count >= need) return true;
      }
    }
    return false;
  }

  shouldInvokeChiJi() {
    const hp = Settings.NeerMWChiJiHp;
    const need = Settings.NeerMWChiJiCount;
    let count = 0;
    for (const a of this.getValidAllies()) {
      if (a.effectiveHealthPercent <= hp) {
        count++;
        if (count >= need) return true;
      }
    }
    return false;
  }

  getLifeCocoonTarget() {
    const threshold = Settings.NeerMWLifeCocoonHp;
    return this.getValidAllies().find(a =>
      a.effectiveHealthPercent <= threshold
      && a.guid
      && combat.targets.some(e => e?.target && e.target.equals(a.guid))
    ) || null;
  }

  getVivifyTarget() {
    const ally = this.getLowestAlly();
    if (!ally) return null;
    return ally.effectiveHealthPercent <= Settings.NeerMWVivifyThreshold ? ally : null;
  }

}
