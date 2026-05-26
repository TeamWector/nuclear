import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import objMgr, { me } from "@/Core/ObjectManager";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import Pet from "@/Core/Pet";
import Settings from "@/Core/Settings";
import KeyBinding from "@/Core/KeyBinding";
import colors from "@/Enums/Colors";
import { PowerType } from "@/Enums/PowerType";

const PULL_TOGGLE_KEY = "warlockDemoPullToggle";
KeyBinding.setDefault(PULL_TOGGLE_KEY, imgui.Key.T);
let pullModeEnabled = false;

const auras = {
  burningRush: 111400,
  felDomination: 333889,
  demonicCore: 264173,
  infernalBeneficiary: 1265810,
  curseOfWeakness: 702,
};

const PULL_RANGE_YDS = 40;

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
let cachedPullTarget = undefined;

function refreshFrameCache() {
  if (cacheFrame === wow.frameTime) return;
  cacheFrame = wow.frameTime;
  cachedImpStats = undefined;
  cachedImplosionTarget = undefined;
  cachedPullTarget = undefined;
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

function drawPullModeIndicator() {
  const drawList = imgui.getBackgroundDrawList();
  if (!drawList) return;
  const viewport = imgui.getMainViewport();
  const text = "PULL MODE ENABLED";
  const textSize = imgui.calcTextSize(text);
  const pos = {
    x: viewport.workPos.x + (viewport.workSize.x - textSize.x) / 2,
    y: viewport.workPos.y + viewport.workSize.y / 2,
  };
  drawList.addText(text, pos, colors.orange);
}

function pullModeTick() {
  return new bt.Action(() => {
    if (!KeyBinding.isBinding() && KeyBinding.isPressed(PULL_TOGGLE_KEY)) {
      pullModeEnabled = !pullModeEnabled;
      console.info(`Pull mode ${pullModeEnabled ? 'Enabled' : 'Disabled'}`);
    }
    if (pullModeEnabled) drawPullModeIndicator();
    return bt.Status.Failure;
  });
}

function findPullTarget() {
  refreshFrameCache();
  if (cachedPullTarget !== undefined) return cachedPullTarget;

  const pet = Pet.current;
  const party = wow.Party.currentParty;
  let best = null;
  let bestDist = Infinity;

  objMgr.objects.forEach(obj => {
    if (!(obj instanceof wow.CGUnit)) return;
    if (obj === me) return;
    if (!obj.isAttackable) return;
    if (obj.deadOrGhost || obj.health <= 1) return;
    if (obj.isImmune && obj.isImmune()) return;
    if (!obj.isRelatedToActiveQuest) return;
    if (obj.inCombatWithMe) return;
    if (pet && obj.inCombatWith(pet)) return;
    if (party && party.isUnitInCombatWithParty(obj)) return;
    if (obj.hasAuraByMe(auras.curseOfWeakness)) return;
    const d = obj.distanceTo(me);
    if (d > PULL_RANGE_YDS) return;
    if (d < bestDist) {
      bestDist = d;
      best = obj;
    }
  });

  cachedPullTarget = best;
  return best;
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

const BURNING_RUSH_MOVE_THRESHOLD_MS = 1000;
let moveStartFrameTime = 0;
let lastMoveSampleFrame = -1;

function sampleMovement() {
  if (lastMoveSampleFrame === wow.frameTime) return;
  lastMoveSampleFrame = wow.frameTime;
  if (!me.isMoving()) {
    moveStartFrameTime = 0;
  } else if (moveStartFrameTime === 0) {
    moveStartFrameTime = wow.frameTime;
  }
}

function hasBeenMovingFor(ms) {
  sampleMovement();
  return moveStartFrameTime !== 0 && (wow.frameTime - moveStartFrameTime) >= ms;
}

function stopCastingWhen(condition) {
  return new bt.Decorator(condition, new bt.Action(() => {
    me.stopCasting();
    return bt.Status.Success;
  }));
}

function cancelAuraWhen(condition, auraId) {
  return new bt.Decorator(condition, new bt.Action(() => {
    me.cancelAura(auraId);
    return bt.Status.Success;
  }));
}

function shouldStopDrainLife() {
  if (me.spellInfo?.spellChannelId !== spells.drainLife) return false;
  if (me.pctHealth < 100) return false;
  if (!me.hasAura(auras.infernalBeneficiary)) return true;
  const pet = Pet.current;
  return !pet || !Pet.isAlive() || pet.pctHealth >= 100;
}

function shouldStopRedundantPetSummon() {
  return Pet.isAlive() && me.spellInfo?.cast === spells.summons[Settings.DemoPetType];
}

function shouldCancelBurningRush() {
  return me.hasAura(auras.burningRush) && (me.pctHealth < 50 || !me.isMoving());
}

function shouldCastBurningRush() {
  return hasBeenMovingFor(BURNING_RUSH_MOVE_THRESHOLD_MS)
    && me.pctHealth > 50
    && !me.hasAura(auras.burningRush);
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
      pullModeTick(),
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      spell.interrupt("Axe Toss"),
      stopCastingWhen(shouldStopDrainLife),
      stopCastingWhen(shouldStopRedundantPetSummon),
      cancelAuraWhen(shouldCancelBurningRush, auras.burningRush),
      spell.cast("Fel Domination", on => me, req =>
        me.inCombat() && !Pet.isAlive() && !me.hasAura(auras.felDomination)
      ),
      common.waitForCastOrChannel(),
      this.summonSelectedPet(),
      this.petAttackMyAttacker(),
      Pet.follow(() => !me.targetUnit && !me.inCombat() && !combat.bestTarget),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        spell.cast("Burning Rush", on => me, req => shouldCastBurningRush())
      ),
      new bt.Decorator(
        ret => pullModeEnabled && !spell.isGlobalCooldown() && findPullTarget() !== null,
        spell.cast("Curse of Weakness", on => findPullTarget(), req => findPullTarget() !== null)
      ),
      common.waitForTarget(),
      common.waitForFacing(),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Drain Life", on => this.getTarget(), req => {
            if (me.pctHealth < 50) return true;
            if (!me.hasAura(auras.infernalBeneficiary)) return false;
            const pet = Pet.current;
            return pet && Pet.isAlive() && pet.pctHealth < 50;
          }),
          spell.cast("Implosion", on => implosionTarget(), req => implosionTarget() !== null),
          spell.cast("Summon Demonic Tyrant", on => me, req => combat.burstToggle && me.inCombat()),
          spell.cast("Call Fel Lord", on => this.getTarget(), req => me.inCombat()),
          spell.cast("Call Dreadstalkers", on => this.getTarget(), req => me.powerByType(PowerType.SoulShards) >= 2),
          spell.cast("Demonbolt", on => this.getTarget(), req => me.hasAura(auras.demonicCore) && me.powerByType(PowerType.SoulShards) <= 3),
          spell.cast("Hand of Gul'dan", on => this.getTarget(), req => me.powerByType(PowerType.SoulShards) >= 3),
          spell.cast("Shadow Bolt", on => this.getTarget())
        )
      )
    );
  }

  getTarget(distance = 40) {
    const inRange = t => me.distanceTo(t) <= distance;
    const best = combat.bestTarget;
    if (best && me.isFacing(best) && inRange(best)) {
      return best;
    }
    const reachable = combat.targets.find(t => me.isFacing(t) && inRange(t));
    return reachable || best;
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
