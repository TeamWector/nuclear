import Settings from '@/Core/Settings';
import objMgr, { me } from "@/Core/ObjectManager";
import { ShapeshiftForm } from '@/Enums/UnitEnums';
import { UnitFlags } from '@/Enums/Flags';
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";

class Autolooter {
  static options = [
    { type: "checkbox", uid: "ExtraAutoloot", text: "Enable Autoloot", default: false },
    { type: "checkbox", uid: "ExtraSkinning", text: "Enable Skinning", default: false },
    { type: "checkbox", uid: "ExtraBreakStealth", text: "Break Stealth", default: false },
    { type: "checkbox", uid: "ExtraIgnoreEnemies", text: "Loot in proximity", default: false },
    { type: "slider", uid: "LootCacheReset", text: wow.isClassic ? "Cache Reset (MS)" : "Pulse Time (MS)", default: 1500, min: 0, max: 10000 }
  ];

  static tabName = "Autoloot";

  static renderOptions(renderFunction) {
    renderFunction([{ header: "Autoloot Settings", options: this.options }]);
  }

  static looted = new Set();
  static lastLoot = 0;

  static isInStealth() {
    return me.shapeshiftForm === ShapeshiftForm.Stealth ||
      (me.shapeshiftForm === ShapeshiftForm.Cat && me.hasAura("Prowl"));
  }

  static getLootableUnit() {
    let lootableUnit = null;
    objMgr.objects.forEach((obj) => {
      if (obj instanceof wow.CGUnit && obj.dead) {
        const inRange = me.isWithinMeleeRange(obj) || me.distanceTo(obj.position) < 6;
        const isLootable = obj.isLootable;
        const isSkinnable = Settings.ExtraSkinning && (obj.unitFlags & UnitFlags.SKINNABLE) > 0;

        if (inRange && (isLootable || isSkinnable)) {
          lootableUnit = obj;
          return;
        }
      }
    });
    return lootableUnit;
  }

  static shouldLoot() {
    if (Settings.ExtraAutoloot === false) return false;
    if (Settings.ExtraBreakStealth === false && this.isInStealth()) return false;
    if (me.isMoving() || me.isCastingOrChanneling || me.isMounted) return false;

    if (Settings.ExtraIgnoreEnemies === true) return true;

    if (me.inCombat()) return false;

    if (!combat.targets || combat.targets.length === 0) return true;

    return combat.getUnitsAroundUnit(me, 12).length === 0;
  }

  static autoloot() {
    if (!this.shouldLoot()) return;

    const currentTime = wow.frameTime;
    const timeSinceLastLoot = currentTime - this.lastLoot;

    if (timeSinceLastLoot > Settings.LootCacheReset && this.looted.size > 0) {
      this.looted.clear();
      this.lastLoot = currentTime;
    }

    this.performAutoloot();
  }

  static performAutoloot() {
    const lootUnit = this.getLootableUnit();
    if (lootUnit && wow.frameTime > this.lastLoot) {
      lootUnit.interact();
      this.lastLoot = wow.frameTime + Settings.LootCacheReset;
    }
  }

  static tick() {
    this.autoloot();
  }
}

export default Autolooter;
