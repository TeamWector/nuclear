import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import objMgr, { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import Pet from "@/Core/Pet";
import Settings from "@/Core/Settings";
import { PowerType } from "@/Enums/PowerType";

const auras = {
  burningRush: 111400,
  felDomination: 333889,
  demonicCore: 264173,
  infernalBeneficiary: 1265810,
};

const WILD_IMP_ENTRY_ID = 55659;
const SUMMON_AFTER_DISMOUNT_DELAY_MS = 1000;

let lastMountDisplayChange = 0;

class WarlockDemoMountListener extends wow.EventListener {
  constructor() { super(); }
  onEvent(event) {
    if (event.name === "PLAYER_MOUNT_DISPLAY_CHANGED") {
      lastMountDisplayChange = wow.frameTime;
    }
  }
}

new WarlockDemoMountListener();

const spells = {
  drainLife: 234153,
  summons: {
    Imp: 688,
    Voidwalker: 697,
    Felhunter: 691,
    Succubus: 712,
    Felguard: 30146,
  },
};

let cacheFrame = -1;
let cachedImpStats = undefined;
let cachedImplosionTarget = undefined;

function refreshFrameCache() {
  if (cacheFrame === wow.frameTime) return;
  cacheFrame = wow.frameTime;
  cachedImpStats = undefined;
  cachedImplosionTarget = undefined;
}

function wildImpStats() {
  refreshFrameCache();
  if (cachedImpStats !== undefined) return cachedImpStats;
  let count = 0;
  let minPower = Infinity;
  objMgr.objects.forEach(obj => {
    if (!(obj instanceof wow.CGUnit)) return;
    if (obj.entryId !== WILD_IMP_ENTRY_ID) return;
    if (!obj.createdBy || !obj.createdBy.equals(me.guid)) return;
    count++;
    if (obj.power < minPower) minPower = obj.power;
  });
  cachedImpStats = { count, minPower: count > 0 ? minPower : 0 };
  return cachedImpStats;
}

function implosionTarget() {
  refreshFrameCache();
  if (cachedImplosionTarget !== undefined) return cachedImplosionTarget;

  const { count, minPower } = wildImpStats();
  if (count < (Settings.DemoImplosionMinImps ?? 3)) {
    cachedImplosionTarget = null;
    return null;
  }

  const powerThreshold = Settings.DemoImplosionMinPower ?? 20;
  const expiring = powerThreshold > 0 && minPower <= powerThreshold;

  const minCluster = expiring ? 1 : (Settings.DemoImplosionMinCluster ?? 5);
  let best = null;
  let bestNearby = minCluster - 1;
  for (const t of combat.targets) {
    const nearby = combat.getUnitsAroundUnit(t, 8).length;
    if (nearby > bestNearby) {
      bestNearby = nearby;
      best = t;
    }
  }
  if (!best && expiring) {
    best = combat.bestTarget ?? null;
  }
  cachedImplosionTarget = best;
  return best;
}

export class WarlockDemonologyBehavior extends Behavior {
  name = "Warlock [Demonology]";
  context = BehaviorContext.Any;
  specialization = Specialization.Warlock.Demonology;

  static settings = [
    {
      header: "Pet",
      options: [
        {
          type: "combobox",
          uid: "DemoPetType",
          text: "Pet to summon",
          values: ["Imp", "Voidwalker", "Felhunter", "Succubus", "Felguard"],
          default: "Felguard"
        }
      ]
    },
    {
      header: "Implosion",
      options: [
        { type: "slider", uid: "DemoImplosionMinImps", text: "Min Wild Imps", min: 1, max: 12, default: 3 },
        { type: "slider", uid: "DemoImplosionMinCluster", text: "Min Targets In Cluster", min: 2, max: 10, default: 5 },
        { type: "slider", uid: "DemoImplosionMinPower", text: "Force Implode If Imp Energy ≤", min: 0, max: 100, default: 20 }
      ]
    }
  ];

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      new bt.Decorator(
        () => {
          if (me.spellInfo?.spellChannelId !== spells.drainLife) return false;
          if (me.pctHealth < 100) return false;
          if (!me.hasAura(auras.infernalBeneficiary)) return true;
          const pet = Pet.current;
          return !pet || !Pet.isAlive() || pet.pctHealth >= 100;
        },
        new bt.Action(() => {
          me.stopCasting();
          return bt.Status.Success;
        })
      ),
      new bt.Decorator(
        () => Pet.isAlive() && me.spellInfo?.cast === spells.summons[Settings.DemoPetType],
        new bt.Action(() => {
          me.stopCasting();
          return bt.Status.Success;
        })
      ),
      new bt.Decorator(
        () => me.hasAura(auras.burningRush) && (me.pctHealth < 50 || !me.isMoving()),
        new bt.Action(() => {
          me.cancelAura(auras.burningRush);
          return bt.Status.Success;
        })
      ),
      spell.cast("Fel Domination", on => me, req =>
        me.inCombat() && !Pet.isAlive() && !me.hasAura(auras.felDomination)
      ),
      common.waitForCastOrChannel(),
      this.summonSelectedPet(),
      this.petAttackMyAttacker(),
      Pet.follow(() => !me.targetUnit && !me.inCombat() && !combat.bestTarget),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        spell.cast("Burning Rush", on => me, req => me.isMoving() && me.pctHealth > 50 && !me.hasAura(auras.burningRush))
      ),
      common.waitForTarget(),
      common.waitForFacing(),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Drain Life", on => combat.bestTarget, req => {
            if (me.pctHealth < 50) return true;
            if (!me.hasAura(auras.infernalBeneficiary)) return false;
            const pet = Pet.current;
            return pet && Pet.isAlive() && pet.pctHealth < 50;
          }),
          spell.cast("Implosion", on => implosionTarget(), req => implosionTarget() !== null),
          spell.cast("Call Dreadstalkers", on => combat.bestTarget, req => me.powerByType(PowerType.SoulShards) >= 2),
          spell.cast("Demonbolt", on => combat.bestTarget, req => me.hasAura(auras.demonicCore) && me.powerByType(PowerType.SoulShards) <= 3),
          spell.cast("Hand of Gul'dan", on => combat.bestTarget, req => me.powerByType(PowerType.SoulShards) >= 3),
          spell.cast("Shadow Bolt", on => combat.bestTarget)
        )
      )
    );
  }

  summonSelectedPet() {
    return new bt.Action(() => {
      if (Pet.isAlive()) return bt.Status.Failure;
      if (me.inCombat() && !me.hasAura(auras.felDomination)) return bt.Status.Failure;
      if (lastMountDisplayChange && wow.frameTime - lastMountDisplayChange < SUMMON_AFTER_DISMOUNT_DELAY_MS) {
        return bt.Status.Failure;
      }

      const wSpell = spell.getSpell("Summon " + Settings.DemoPetType);
      if (!spell.canCast(wSpell, me, {})) return bt.Status.Failure;

      return spell.castPrimitive(wSpell, me) ? bt.Status.Success : bt.Status.Failure;
    });
  }

  petAttackMyAttacker() {
    return new bt.Action(() => {
      const pet = Pet.current;
      if (!pet) return bt.Status.Failure;

      const attackerOnMe = combat.targets.find(t => t.target && t.target.equals(me.guid));
      const desired = attackerOnMe
        || (me.targetUnit && common.validTarget(me.targetUnit) ? me.targetUnit : null)
        || combat.bestTarget;

      if (!desired) return bt.Status.Failure;
      if (pet.target && pet.target.equals(desired.guid)) return bt.Status.Failure;

      wow.PetInfo.sendAction(wow.PetInfo.actions[0], desired.guid);
      return bt.Status.Failure;
    });
  }
}
