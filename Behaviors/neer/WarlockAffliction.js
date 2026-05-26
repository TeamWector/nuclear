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

const auras = {
  burningRush: 111400,
  felDomination: 333889,
  agony: 980,
  corruption: 146739,
  unstableAffliction: 1259790,
  haunt: 48181,
  seedOfCorruption: 27243,
  absoluteCorruption: 196103,
  nightfall: 264571,
  soulSwap: 399680,
};

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

function drawQuestDotIndicator() {
  const drawList = imgui.getBackgroundDrawList();
  if (!drawList) return;
  const viewport = imgui.getMainViewport();
  const text = "QUEST DOT MODE ENABLED";
  const textSize = imgui.calcTextSize(text);
  const pos = {
    x: viewport.workPos.x + (viewport.workSize.x - textSize.x) / 2,
    y: viewport.workPos.y + viewport.workSize.y / 2,
  };
  drawList.addText(text, pos, colors.orange);
}

const spells = {
  drainLife: 234153,
  summons: {
    Imp: 688,
    Voidwalker: 697,
    Felhunter: 691,
    Succubus: 712,
  },
};

export class WarlockAfflictionBehavior extends Behavior {
  name = "Warlock [Affliction]";
  context = BehaviorContext.Any;
  specialization = Specialization.Warlock.Affliction;

  static settings = [
    {
      header: "Pet",
      options: [
        {
          type: "combobox",
          uid: "AfflictionPetType",
          text: "Pet to summon",
          values: ["Imp", "Voidwalker", "Felhunter", "Succubus"],
          default: "Voidwalker"
        }
      ]
    },
    {
      header: "Quest Dot Mode",
      options: [
        { type: "hotkey", uid: "AfflictionQuestDotKey", text: "Quest Dot Toggle Key", default: imgui.Key.X },
        { type: "slider", uid: "AfflictionQuestDotRange", text: "Quest Dot Range (yards)", min: 10, max: 40, default: 40 }
      ]
    },
    {
      header: "Self Healing",
      options: [
        { type: "slider", uid: "AfflictionDrainLifeHp", text: "Drain Life HP %", min: 1, max: 100, default: 80 },
        { type: "slider", uid: "AfflictionPetDrainLifeHp", text: "Drain Life Pet HP %", min: 0, max: 100, default: 50 }
      ]
    }
  ];

  constructor() {
    super();
    KeyBinding.setDefault("AfflictionQuestDotKey", imgui.Key.X);
    this.questDotMode = false;
  }

  build() {
    return new bt.Selector(
      new bt.Action(() => {
        if (!KeyBinding.isBinding() && KeyBinding.isPressed("AfflictionQuestDotKey")) {
          this.questDotMode = !this.questDotMode;
          console.info(`[Affliction] Quest Dot Mode ${this.questDotMode ? 'ENABLED' : 'DISABLED'}`);
        }
        if (this.questDotMode) drawQuestDotIndicator();
        return bt.Status.Failure;
      }),
      common.waitForNotMounted(),
      common.waitForNotSitting(),
      new bt.Decorator(
        () => this.shouldStopDrainLife(),
        new bt.Action(() => {
          me.stopCasting();
          return bt.Status.Success;
        })
      ),
      new bt.Decorator(
        () => Pet.isAlive() && me.spellInfo?.cast === spells.summons[Settings.AfflictionPetType],
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
        spell.cast("Burning Rush", on => me, req =>
          hasBeenMovingFor(BURNING_RUSH_MOVE_THRESHOLD_MS) && me.pctHealth > 50 && !me.hasAura(auras.burningRush)
        )
      ),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown() && this.shouldDrainLife(),
        spell.cast("Drain Life", on => me.targetUnit || combat.bestTarget, req =>
          !!(me.targetUnit || combat.bestTarget)
        )
      ),
      new bt.Decorator(
        ret => this.questDotMode && !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Agony", on => this.questDotAgonyTarget(), req => this.questDotAgonyTarget() !== null),
          spell.cast("Corruption", on => this.questDotCorruptionTarget(), req => this.questDotCorruptionTarget() !== null)
        )
      ),
      common.waitForTarget(),
      common.waitForFacing(),
      new bt.Decorator(
        ret => !spell.isGlobalCooldown(),
        new bt.Selector(
          spell.cast("Soul Swap", on => this.soulSwapApplyTarget(), req =>
            me.hasAura(auras.soulSwap) && this.soulSwapApplyTarget() !== null
          ),
          spell.cast("Seed of Corruption", on => this.seedTarget(), req =>
            combat.targets.length >= 3 && me.powerByType(PowerType.SoulShards) >= 1 && this.seedTarget() !== null
          ),
          spell.cast("Haunt", on => combat.bestTarget, req =>
            combat.bestTarget
            && me.powerByType(PowerType.SoulShards) >= 1
            && !combat.bestTarget.hasAuraByMe(auras.haunt)
          ),
          spell.cast("Agony", on => this.agonyTarget(), req => this.agonyTarget() !== null),
          spell.cast("Soul Swap", on => this.soulSwapCaptureTarget(), req =>
            !me.hasAura(auras.soulSwap) && this.soulSwapCaptureTarget() !== null
          ),
          spell.cast("Corruption", on => this.corruptionTarget(), req => this.corruptionTarget() !== null),
          spell.cast("Dark Harvest", on => combat.bestTarget, req =>
            combat.burstToggle && combat.bestTarget && me.powerByType(PowerType.SoulShards) <= 2
          ),
          spell.cast("Summon Darkglare", on => combat.bestTarget, req =>
            combat.burstToggle && combat.bestTarget && spell.getCooldown("Dark Harvest").timeleft > 0
          ),
          spell.cast("Malefic Grasp", on => combat.bestTarget, req =>
            combat.bestTarget && me.getAuraStacks(auras.nightfall) >= 2
          ),
          spell.cast("Drain Soul", on => combat.bestTarget, req =>
            combat.bestTarget && me.getAuraStacks(auras.nightfall) >= 2
          ),
          spell.cast("Shadow Bolt", on => combat.bestTarget, req =>
            combat.bestTarget && me.getAuraStacks(auras.nightfall) >= 2
          ),
          spell.cast("Unstable Affliction", on => this.unstableAfflictionTarget(), req =>
            this.unstableAfflictionTarget() !== null && me.powerByType(PowerType.SoulShards) >= 1
          ),
          spell.cast("Malefic Grasp", on => combat.bestTarget, req => combat.bestTarget),
          spell.cast("Drain Soul", on => combat.bestTarget, req => combat.bestTarget),
          spell.cast("Shadow Bolt", on => combat.bestTarget)
        )
      )
    );
  }

  agonyTarget() {
    for (const t of combat.targets) {
      const dot = t.getAuraByMe(auras.agony);
      if (!dot || dot.remaining <= dot.duration * 0.3) return t;
    }
    return null;
  }

  corruptionTarget() {
    const permanent = me.hasAura(auras.absoluteCorruption);
    for (const t of combat.targets) {
      const dot = t.getAuraByMe(auras.corruption);
      if (!dot) return t;
      if (permanent) continue;
      if (dot.remaining <= dot.duration * 0.3) return t;
    }
    return null;
  }

  unstableAfflictionTarget() {
    const minTtd = 5;
    const livesLongEnough = t => {
      const ttd = t.timeToDeath?.();
      return ttd === undefined || ttd >= minTtd;
    };
    const needsRefresh = combat.targets.find(t => {
      if (!livesLongEnough(t)) return false;
      const dot = t.getAuraByMe(auras.unstableAffliction);
      return !dot || dot.remaining <= dot.duration * 0.3;
    });
    if (needsRefresh) return needsRefresh;
    if (combat.bestTarget && livesLongEnough(combat.bestTarget)) return combat.bestTarget;
    return null;
  }

  seedTarget() {
    for (const t of combat.targets) {
      if (!t.hasAuraByMe(auras.seedOfCorruption) && !t.hasAuraByMe(auras.corruption)) return t;
    }
    return combat.bestTarget;
  }

  shouldDrainLife() {
    if (me.pctHealth < (Settings.AfflictionDrainLifeHp ?? 80)) return true;
    const pet = Pet.current;
    return !!(pet && Pet.isAlive() && pet.pctHealth < (Settings.AfflictionPetDrainLifeHp ?? 50));
  }

  shouldStopDrainLife() {
    if (me.spellInfo?.spellChannelId !== spells.drainLife) return false;
    if (me.pctHealth < 100) return false;
    const pet = Pet.current;
    if (pet && Pet.isAlive() && pet.pctHealth < 100) return false;
    return true;
  }

  hasAllDots(t) {
    return t.hasAuraByMe(auras.agony)
      && t.hasAuraByMe(auras.corruption)
      && t.hasAuraByMe(auras.unstableAffliction);
  }

  needsDots(t) {
    return !t.hasAuraByMe(auras.agony)
      || !t.hasAuraByMe(auras.corruption)
      || !t.hasAuraByMe(auras.unstableAffliction);
  }

  soulSwapApplyTarget() {
    if (combat.bestTarget && this.needsDots(combat.bestTarget)) return combat.bestTarget;
    return combat.targets.find(t => this.needsDots(t)) || null;
  }

  soulSwapCaptureTarget() {
    if (combat.targets.length < 2) return null;
    if (!this.soulSwapApplyTarget()) return null;
    if (combat.bestTarget && this.hasAllDots(combat.bestTarget)) return combat.bestTarget;
    return combat.targets.find(t => this.hasAllDots(t)) || null;
  }

  questDotCandidates() {
    const range = Settings.AfflictionQuestDotRange ?? 40;
    const results = [];
    objMgr.objects.forEach(obj => {
      if (!(obj instanceof wow.CGUnit)) return;
      if (obj instanceof wow.CGPlayer) return;
      if (obj === me) return;
      if (obj.deadOrGhost) return;
      if (!obj.isAttackable) return;
      if (!obj.isRelatedToActiveQuest) return;
      if (me.distanceTo(obj) > range) return;
      results.push(obj);
    });
    return results;
  }

  questDotAgonyTarget() {
    return this.questDotCandidates().find(t => {
      const dot = t.getAuraByMe(auras.agony);
      return !dot || dot.remaining <= dot.duration * 0.3;
    }) || null;
  }

  questDotCorruptionTarget() {
    const permanent = me.hasAura(auras.absoluteCorruption);
    return this.questDotCandidates().find(t => {
      const dot = t.getAuraByMe(auras.corruption);
      if (!dot) return true;
      if (permanent) return false;
      return dot.remaining <= dot.duration * 0.3;
    }) || null;
  }

  summonSelectedPet() {
    return new bt.Action(() => {
      if (Pet.isAlive()) return bt.Status.Failure;
      if (me.inCombat() && !me.hasAura(auras.felDomination)) return bt.Status.Failure;

      const wSpell = spell.getSpell("Summon " + Settings.AfflictionPetType);
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
