import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import Settings from '@/Core/Settings';
import { CombatLogEventTypes } from '@/Enums/CombatLogEvents';

const auras = {
  demonSpikes: 203819,
  soulFragments: 203981,
  fieryBrand: 207771,
};

const DAMAGE_EVENT_TYPES = new Set([
  CombatLogEventTypes.SWING_DAMAGE,
  CombatLogEventTypes.SWING_DAMAGE_LANDED,
  CombatLogEventTypes.RANGE_DAMAGE,
  CombatLogEventTypes.SPELL_DAMAGE,
  CombatLogEventTypes.SPELL_PERIODIC_DAMAGE,
  CombatLogEventTypes.SPELL_BUILDING_DAMAGE,
  CombatLogEventTypes.ENVIRONMENTAL_DAMAGE,
  CombatLogEventTypes.DAMAGE_SHIELD,
  CombatLogEventTypes.DAMAGE_SPLIT,
]);

export class DemonHunterVengeanceBehavior extends Behavior {
  name = "Demon Hunter [Vengeance]";
  context = BehaviorContext.Any;
  specialization = Specialization.DemonHunter.Vengeance;

  static settings = [
    {
      header: "Defensives",
      options: [
        { type: "slider", uid: "VengeanceDefWindowMs", text: "Damage window (ms)", min: 1000, max: 8000, default: 4000 },
        { type: "slider", uid: "VengeanceDemonSpikesPct", text: "Demon Spikes: % HP lost in window", min: 5, max: 60, default: 20 },
        { type: "slider", uid: "VengeancePanicHpPct", text: "Panic HP% (force Demon Spikes)", min: 10, max: 80, default: 50 },
      ]
    },
    {
      header: "Rotation",
      options: [
        { type: "slider", uid: "VengeanceSpiritBombSoulsST", text: "Spirit Bomb min fragments (single target)", min: 3, max: 6, default: 5 },
        { type: "slider", uid: "VengeanceSpiritBombSoulsAoE", text: "Spirit Bomb min fragments (AoE)", min: 3, max: 6, default: 4 },
        { type: "slider", uid: "VengeanceFelDevastationFury", text: "Fel Devastation min Fury", min: 30, max: 60, default: 50 },
        { type: "slider", uid: "VengeanceFelbladeFuryMax", text: "Felblade max Fury", min: 30, max: 90, default: 80 },
        { type: "slider", uid: "VengeanceSigilOfSpiteMaxSouls", text: "Sigil of Spite max fragments", min: 0, max: 4, default: 2 },
      ]
    }
  ];

  constructor() {
    super();
    this._damageEvents = [];
    this._lastHp = null;

    this._listener = new wow.EventListener();
    this._listener.onEvent = (event) => this.onCombatLogEvent(event);
  }

  onCombatLogEvent(event) {
    if (event.name !== "COMBAT_LOG_EVENT_UNFILTERED") return;
    const eventData = event.args?.[0];
    if (!eventData) return;
    if (!DAMAGE_EVENT_TYPES.has(eventData.eventType)) return;

    const destGuid = eventData.destination?.guid;
    if (!destGuid || !me?.guid?.equals(destGuid)) return;

    const hp = me.health;
    if (this._lastHp === null) {
      this._lastHp = hp;
      return;
    }
    const drop = this._lastHp - hp;
    this._lastHp = hp;
    if (drop <= 0) return;

    this._damageEvents.push({ t: wow.frameTime, amount: drop });
  }

  pruneDamageEvents() {
    const windowMs = Settings.VengeanceDefWindowMs ?? 4000;
    const cutoff = wow.frameTime - windowMs;
    while (this._damageEvents.length && this._damageEvents[0].t < cutoff) {
      this._damageEvents.shift();
    }
  }

  damageTakenPctInWindow() {
    const maxHp = me.maxHealth;
    if (!maxHp) return 0;
    let total = 0;
    for (const hit of this._damageEvents) total += hit.amount;
    return (total / maxHp) * 100;
  }

  build() {
    return new bt.Selector(
      new bt.Action(() => { this.pruneDamageEvents(); return bt.Status.Failure; }),
      common.waitForNotSitting(),
      common.waitForNotMounted(),
      common.waitForCastOrChannel(),
      new bt.Action(() => me.deadOrGhost ? bt.Status.Success : bt.Status.Failure),

      spell.cast("Torment", on => combat.targets.find(t => t.target && !t.isTanking())),
      spell.interrupt("Disrupt"),
      spell.cast("Demon Spikes", on => me, req => this.shouldUseDemonSpikes()),

      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          common.waitForTarget(),
          common.waitForFacing(),
          common.ensureAutoAttack(),

          // Reactive silence — drop on a nearby interruptible caster
          spell.cast("Sigil of Silence", on => this.castingEnemyInRange(8)),

          // Fiery Brand — apply if missing on best target, or about to cap charges
          spell.cast("Fiery Brand", on => combat.bestTarget, req => this.shouldFieryBrand()),

          // Fel Devastation — AoE damage + self heal, channel only when stationary and facing
          spell.cast("Fel Devastation", on => me, req => this.shouldFelDevastation()),

          // Sigil of Flame — drop on the tightest enemy cluster (8yd radius)
          spell.cast("Sigil of Flame", on => this.bestAoeTarget(8) ?? combat.bestTarget, req => !me.isMoving()),

          // Sigil of Spite — major fragment generator, drop on cluster when not capped on souls
          spell.cast("Sigil of Spite", on => this.bestAoeTarget(8) ?? combat.bestTarget, req => this.shouldSigilOfSpite()),

          spell.cast("Immolation Aura", on => me),

          // Spirit Bomb — soul spender, hard priority over Soul Cleave when fragments allow
          spell.cast("Spirit Bomb", on => me, req => this.shouldSpiritBomb()),

          // Felblade — Fury generator + gap closer when below Fury cap
          spell.cast("Felblade", on => combat.bestTarget, req => me.power <= (Settings.VengeanceFelbladeFuryMax ?? 80)),

          // Soul Cleave — spend Fury when Spirit Bomb isn't pressable
          spell.cast("Soul Cleave", on => combat.bestTarget, req => me.power >= 30),

          // Builders
          spell.cast("Fracture", on => combat.bestTarget),
          spell.cast("Shear", on => combat.bestTarget),
          spell.cast("Throw Glaive", on => combat.bestTarget),
        )
      )
    );
  }

  soulFragments() {
    const aura = me.getAura(auras.soulFragments);
    return aura ? aura.stacks : 0;
  }

  meleeTargetCount() {
    return combat.targets.filter(t => me.isWithinMeleeRange(t)).length;
  }

  bestAoeTarget(radius) {
    let best = null;
    let bestCount = 0;
    for (const t of combat.targets) {
      const count = combat.getUnitsAroundUnit(t, radius).length;
      if (count > bestCount) {
        bestCount = count;
        best = t;
      }
    }
    return best;
  }

  castingEnemyInRange(range) {
    return combat.targets.find(t =>
      t.isCastingOrChanneling && t.isInterruptible && me.distanceTo(t) <= range
    );
  }

  shouldFieryBrand() {
    const target = combat.bestTarget;
    if (!target) return false;
    if (target.hasAuraByMe(auras.fieryBrand)) return false;
    if (!me.isWithinMeleeRange(target)) return false;
    return true;
  }

  shouldFelDevastation() {
    if (me.power < (Settings.VengeanceFelDevastationFury ?? 50)) return false;
    if (me.isMoving()) return false;
    return combat.targets.some(t => me.isFacing(t, 90) && me.isWithinMeleeRange(t));
  }

  shouldSigilOfSpite() {
    if (me.isMoving()) return false;
    if (!combat.bestTarget) return false;
    const maxSouls = Settings.VengeanceSigilOfSpiteMaxSouls ?? 2;
    return this.soulFragments() <= maxSouls;
  }

  shouldSpiritBomb() {
    const souls = this.soulFragments();
    const meleeCount = this.meleeTargetCount();
    const minST = Settings.VengeanceSpiritBombSoulsST ?? 5;
    const minAoE = Settings.VengeanceSpiritBombSoulsAoE ?? 4;
    if (meleeCount >= 2) return souls >= minAoE;
    return souls >= minST;
  }

  shouldUseDemonSpikes() {
    if (!me.inCombat()) return false;
    if (!combat.targets.some(t => me.isWithinMeleeRange(t))) return false;

    const ds = me.getAura(auras.demonSpikes);
    const refreshable = !ds || ds.remaining < 2000;
    if (!refreshable) return false;

    const dmgPct = this.damageTakenPctInWindow();
    const threshold = Settings.VengeanceDemonSpikesPct ?? 20;
    const panicHp = Settings.VengeancePanicHpPct ?? 50;
    return dmgPct >= threshold || me.pctHealth <= panicHp;
  }
}
