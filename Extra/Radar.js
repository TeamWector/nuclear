import Settings from '@/Core/Settings';
import Gatherables from '@/Data/Gatherables';
import objMgr from '@/Core/ObjectManager';
import { me } from '@/Core/ObjectManager';
import colors from '@/Enums/Colors';
import { Classification } from '@/Enums/UnitEnums';
import { UnitFlags, UnitFlags2, UnitFlags3, NpcFlags, DynamicFlags } from '@/Enums/Flags';

const objectColors = {
  herbs: colors.green,
  ores: colors.orange,
  treasures: colors.silver,
  quests: colors.yellow,
  rares: colors.purple,
  default: colors.white
};

const CATEGORY_TRACK = {
  quests: "ExtraRadarTrackQuests",
  herbs: "ExtraRadarTrackHerbs",
  ores: "ExtraRadarTrackOres",
  treasures: "ExtraRadarTrackTreasures",
  rares: "ExtraRadarTrackRares",
  everything: "ExtraRadarTrackEverything",
};

const CATEGORY_DRAW = {
  quests: "ExtraRadarDrawLinesQuests",
  herbs: "ExtraRadarDrawLinesHerbs",
  ores: "ExtraRadarDrawLinesOres",
  treasures: "ExtraRadarDrawLinesTreasures",
  rares: "ExtraRadarDrawLinesRares",
  everything: "ExtraRadarDrawLinesEverything",
};

const CATEGORY_ORDER = ['quests', 'herbs', 'ores', 'treasures', 'rares'];

const cmpDist = (a, b) => a.distSqr - b.distSqr;

class Radar {
  static options = [
    { type: "checkbox", uid: "ExtraRadar", text: "Enable Radar", default: false },
    { type: "checkbox", uid: "ExtraRadarDrawOffScreenObjects", text: "Draw Off-Screen Objects", default: false },

    { header: "Tracking Options" },
    { type: "checkbox", uid: "ExtraRadarTrackHerbs", text: "Track Herbs", default: false },
    { type: "checkbox", uid: "ExtraRadarTrackOres", text: "Track Ores", default: false },
    { type: "checkbox", uid: "ExtraRadarTrackTreasures", text: "Track Treasures", default: false },
    { type: "checkbox", uid: "ExtraRadarTrackQuests", text: "Track Quest Objectives", default: false },
    { type: "checkbox", uid: "ExtraRadarTrackRares", text: "Track Rares", default: false },
    { type: "checkbox", uid: "ExtraRadarTrackEverything", text: "Track Everything", default: false },

    { header: "Line Drawing Options" },
    { type: "checkbox", uid: "ExtraRadarDrawLinesClosest", text: "Draw Line to Closest Object", default: false },
    { type: "checkbox", uid: "ExtraRadarDrawLinesHerbs", text: "Draw Lines to Herbs", default: false },
    { type: "checkbox", uid: "ExtraRadarDrawLinesOres", text: "Draw Lines to Ores", default: false },
    { type: "checkbox", uid: "ExtraRadarDrawLinesTreasures", text: "Draw Lines to Treasures", default: false },
    { type: "checkbox", uid: "ExtraRadarDrawLinesQuests", text: "Draw Lines to Quest Objectives", default: false },
    { type: "checkbox", uid: "ExtraRadarDrawLinesRares", text: "Draw Lines to Rares", default: false },
    { type: "checkbox", uid: "ExtraRadarDrawLinesEverything", text: "Draw Lines to Everything (When Tracked)", default: false },

    { header: "Debug Options" },
    { type: "checkbox", uid: "ExtraRadarDrawDistance", text: "Draw Distance", default: false },
    { type: "checkbox", uid: "ExtraRadarDrawDebug", text: "Draw Debug Info", default: false },
    { type: "checkbox", uid: "ExtraRadarInteractTracked", text: "Interact Tracked", default: false },
    { type: "checkbox", uid: "ExtraRadarMouseoverDebug", text: "Mouseover Debug (Flags)", default: false },
    { type: "slider", uid: "ExtraRadarLoadDistance", text: "Radar Load Distance", default: 200, min: 1, max: 500 }
  ];

  static tabName = "Radar";

  static renderOptions(renderFunction) {
    renderFunction([
      { header: "General Radar Settings", options: this.options.slice(0, 2) },
      { header: "Tracking Options", collapsible: true, options: this.options.slice(3, 9) },
      { header: "Line Drawing Options", collapsible: true, options: this.options.slice(9, 16) },
      { header: "Debug Options", collapsible: true, options: this.options.slice(17) }
    ]);
  }

  static collectAndClassify() {
    const loadDistance = Settings.ExtraRadarLoadDistance;
    const loadDistanceSqr = loadDistance * loadDistance;
    const mePos = me.position;
    const meX = mePos.x, meY = mePos.y, meZ = mePos.z;

    const buckets = {
      quests: [], herbs: [], ores: [], treasures: [], rares: [], everything: []
    };

    objMgr.objects.forEach(obj => {
      if (obj === me) return;
      if (!obj.isInteractable) return;

      const p = obj.position;
      if (!p) return;
      const dx = p.x - meX;
      const dy = p.y - meY;
      const distSqr2D = dx * dx + dy * dy;
      if (distSqr2D > loadDistanceSqr) return;
      const dz = p.z - meZ;
      const distSqr = distSqr2D + dz * dz;

      const entry = { obj, distSqr, distSqr2D, screenPos: null, isOffScreen: false, drawn: false };

      if (obj instanceof wow.CGUnit) {
        if (obj.isRelatedToActiveQuest) buckets.quests.push(entry);
        else if (obj.classification == Classification.Rare && !obj.deadOrGhost) buckets.rares.push(entry);
        else buckets.everything.push(entry);
      } else if (obj instanceof wow.CGGameObject) {
        if (Gatherables.herb[obj.entryId]) buckets.herbs.push(entry);
        else if (Gatherables.ore[obj.entryId]) buckets.ores.push(entry);
        else if (Gatherables.treasure[obj.entryId]) buckets.treasures.push(entry);
        else if (obj.isLootable) buckets.quests.push(entry);
        else buckets.everything.push(entry);
      } else if (obj instanceof wow.CGObject) {
        buckets.everything.push(entry);
      }
    });

    return buckets;
  }

  static drawObjects(entries, color, drawLinesSetting) {
    if (entries.length === 0) return;
    const canvas = imgui.getBackgroundDrawList();
    const mePos = wow.WorldFrame.getScreenCoordinates(me.position);
    const drawLines = Settings[drawLinesSetting];

    for (const entry of entries) {
      const obj = entry.obj;
      const op = obj.position;
      const adjustedPos = new Vector3(op.x, op.y, op.z + obj.displayHeight + 0.1);
      const screenPos = wow.WorldFrame.getScreenCoordinates(adjustedPos);
      entry.drawn = true;
      if (screenPos === undefined || screenPos.x === -1) {
        entry.isOffScreen = true;
        continue;
      }
      entry.screenPos = screenPos;
      if (drawLines) {
        canvas.addLine(mePos, screenPos, color, 1);
      }
      this.drawObjectText(entry, screenPos);
    }
  }

  static drawObjectText(entry, screenPos) {
    const obj = entry.obj;
    let prefix = '';
    let prefixColor = colors.white;
    if (obj instanceof wow.CGGameObject) {
      if (Gatherables.herb[obj.entryId]) {
        prefix = '[H] ';
        prefixColor = colors.green;
      } else if (Gatherables.ore[obj.entryId]) {
        prefix = '[V] ';
        prefixColor = colors.orange;
      } else if (Gatherables.treasure[obj.entryId]) {
        prefix = '[T] ';
        prefixColor = colors.silver;
      } else if (obj.isLootable) {
        prefix = '[Q] ';
        prefixColor = colors.yellow;
      }
    } else if (obj instanceof wow.CGObject && obj.isRelatedToActiveQuest) {
      prefix = '[Q] ';
      prefixColor = colors.yellow;
    } else if (obj instanceof wow.CGUnit && obj.classification == Classification.Rare && !obj.deadOrGhost) {
      prefix = '[R] ';
      prefixColor = colors.purple;
    } else if (obj instanceof wow.CGAreaTrigger) {
      prefix = '[AT] ';
      prefixColor = colors.purple;
    }

    let text = `${obj.name}`;
    if (Settings.ExtraRadarDrawDistance) {
      text += ` (${Math.round(Math.sqrt(entry.distSqr2D))}y)`;
    }
    if (Settings.ExtraRadarDrawDebug) {
      text += ` [ID: ${obj.entryId}]`;
    }

    const canvas = imgui.getBackgroundDrawList();
    const pos = { x: screenPos.x, y: screenPos.y };
    if (prefix) {
      canvas.addText(prefix, pos, prefixColor);
      pos.x += imgui.calcTextSize(prefix).x;
    }
    canvas.addText(text, pos, colors.white);
  }

  static drawOffScreenObjects(allEntries) {
    const maxLines = 5;
    const uniqueObjects = new Map();
    for (const entry of allEntries) {
      if (!entry.isOffScreen) continue;
      const obj = entry.obj;
      const key = `${obj.name}-${obj.entryId}`;
      const existing = uniqueObjects.get(key);
      if (!existing || entry.distSqr < existing.distSqr) {
        uniqueObjects.set(key, entry);
      }
    }
    if (uniqueObjects.size === 0) return;

    const headerWorldPos = new Vector3(me.position.x, me.position.y, me.position.z + me.displayHeight + 1);
    const headerScreenPos = wow.WorldFrame.getScreenCoordinates(headerWorldPos);
    const canvas = imgui.getBackgroundDrawList();

    const sorted = Array.from(uniqueObjects.values()).sort(cmpDist).slice(0, maxLines);

    let text = `OFF SCREEN\n${'_'.repeat(20)}\n`;
    for (const entry of sorted) {
      text += `${entry.obj.name} (${Math.round(Math.sqrt(entry.distSqr))}y)\n`;
    }
    if (uniqueObjects.size > maxLines) {
      text += `... and ${uniqueObjects.size - maxLines} more`;
    }

    canvas.addText(text, headerScreenPos, colors.white);
  }

  static decodeFlags(value, flagsObj) {
    if (!value) return "0";
    const isBig = typeof value === "bigint";
    const names = [];
    for (const [name, bit] of Object.entries(flagsObj)) {
      if (bit === 0) continue;
      const bitVal = isBig ? BigInt(bit) : bit;
      if ((value & bitVal) === bitVal) names.push(name);
    }
    const hexStr = isBig ? value.toString(16) : (value >>> 0).toString(16);
    return `0x${hexStr}${names.length ? ` (${names.join(" | ")})` : ""}`;
  }

  static drawMouseoverDebug() {
    if (!Settings.ExtraRadarMouseoverDebug) return;

    const guid = wow.GameUI.mouseOverGuid;
    if (!guid || guid.isNull) return;

    const obj = objMgr.findObject(guid);
    if (!obj) return;

    const drawList = imgui.getBackgroundDrawList();
    if (!drawList) return;

    const hex = v => {
      if (v === undefined || v === null) return "n/a";
      if (typeof v === "bigint") return `0x${v.toString(16)}`;
      return `0x${(v >>> 0).toString(16)}`;
    };
    const lines = [
      `${obj.name || "<no name>"}  [entryId: ${obj.entryId}]`,
      `type          = ${obj.type}  typeFlags = ${hex(obj.typeFlags)}`,
      `flags         = ${hex(obj.flags)}`,
      `dynamicFlags  = ${this.decodeFlags(obj.dynamicFlags, DynamicFlags)}`,
    ];

    if (obj instanceof wow.CGUnit) {
      lines.push(
        `--- CGUnit ---`,
        `unitFlags     = ${this.decodeFlags(obj.unitFlags, UnitFlags)}`,
        `unitFlags2    = ${this.decodeFlags(obj.unitFlags2, UnitFlags2)}`,
        `unitFlags3    = ${this.decodeFlags(obj.unitFlags3, UnitFlags3)}`,
        `npcFlags      = ${this.decodeFlags(obj.npcFlags, NpcFlags)}`,
        `classification= ${obj.classification}`,
        `factionTemplate= ${obj.factionTemplate}`,
        `isAttackable  = ${obj.isAttackable}`,
        `isEnemy       = ${obj.isEnemy}`,
        `isRelatedToActiveQuest = ${obj.isRelatedToActiveQuest}`,
      );
    } else if (obj instanceof wow.CGGameObject) {
      lines.push(
        `--- CGGameObject ---`,
        `goType        = ${obj.goType}`,
        `goState       = ${obj.goState}`,
        `goFlags       = ${hex(obj.goFlags)}`,
        `goFactionTemplate = ${obj.goFactionTemplate}`,
        `goUsable      = ${obj.goUsable}`,
        `isLootable    = ${obj.isLootable}`,
      );
    } else if (obj instanceof wow.CGAreaTrigger) {
      lines.push(
        `--- CGAreaTrigger ---`,
        `spellId       = ${obj.spellId}`,
        `caster        = ${obj.caster}`,
        `duration      = ${obj.duration}`,
        `numUnitsInside= ${obj.numUnitsInside}`,
        `numPlayersInside= ${obj.numPlayersInside}`,
      );
    } else if (obj instanceof wow.CGItem) {
      lines.push(
        `--- CGItem ---`,
        `itemFlags     = ${hex(obj.itemFlags)}`,
        `itemDynamicFlags= ${hex(obj.itemDynamicFlags)}`,
      );
    } else {
      lines.push(`--- ${obj.constructor.name} ---`);
    }

    const mouse = imgui.getMousePos();
    const startPos = { x: mouse.x + 16, y: mouse.y + 16 };
    const lineHeight = 16;

    lines.forEach((line, i) => {
      drawList.addText(line, { x: startPos.x, y: startPos.y + i * lineHeight }, colors.yellow);
    });
  }

  static tick() {
    this.drawMouseoverDebug();

    if (!Settings.ExtraRadar) return;

    const buckets = this.collectAndClassify();
    const everythingEnabled = Settings.ExtraRadarTrackEverything;

    const everythingBucket = buckets.everything;
    const trackedEntries = [];
    let closest = null;

    for (const cat of CATEGORY_ORDER) {
      const entries = buckets[cat];
      if (entries.length === 0) continue;
      if (Settings[CATEGORY_TRACK[cat]]) {
        entries.sort(cmpDist);
        this.drawObjects(entries, objectColors[cat], CATEGORY_DRAW[cat]);
        for (const e of entries) trackedEntries.push(e);
        if (!closest || entries[0].distSqr < closest.distSqr) closest = entries[0];
      } else if (everythingEnabled) {
        for (const e of entries) everythingBucket.push(e);
      }
    }

    if (everythingEnabled && everythingBucket.length > 0) {
      everythingBucket.sort(cmpDist);
      this.drawObjects(everythingBucket, objectColors.default, CATEGORY_DRAW.everything);
      for (const e of everythingBucket) trackedEntries.push(e);
      if (!closest || everythingBucket[0].distSqr < closest.distSqr) closest = everythingBucket[0];
    }

    if (Settings.ExtraRadarDrawOffScreenObjects && trackedEntries.length > 0) {
      this.drawOffScreenObjects(trackedEntries);
    }

    if (Settings.ExtraRadarDrawLinesClosest && closest && closest.screenPos && closest.screenPos.x !== -1) {
      const canvas = imgui.getBackgroundDrawList();
      const mePos = wow.WorldFrame.getScreenCoordinates(me.position);
      canvas.addLine(mePos, closest.screenPos, objectColors.default, 2);
    }

    if (Settings.ExtraRadarInteractTracked && !me.currentCastOrChannel && !me.isMoving()) {
      for (const entry of trackedEntries) {
        const obj = entry.obj;
        if (!(obj instanceof wow.CGGameObject)) continue;
        if (me.withinInteractRange(obj)) {
          obj.interact();
          break;
        }
      }
    }
  }
}

export default Radar;
