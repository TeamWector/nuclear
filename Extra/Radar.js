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

  static getFilteredAndSortedObjects(filterCondition) {
    const validObjects = [];
    objMgr.objects.forEach(obj => {
      if (filterCondition(obj) && this.withinDistance(obj) && obj.isInteractable) {
        validObjects.push(obj);
      }
    });
    return validObjects.sort((a, b) => me.distanceTo(a.position) - me.distanceTo(b.position));
  }

  static drawObjects(objects, color, drawLinesSetting) {
    const canvas = imgui.getBackgroundDrawList();
    const mePos = wow.WorldFrame.getScreenCoordinates(me.position);

    objects.forEach(obj => {
      const objPos = wow.WorldFrame.getScreenCoordinates(obj.position);
      if (objPos != undefined && objPos.x !== -1) {
        // On-screen object
        if (Settings[drawLinesSetting]) {
          canvas.addLine(mePos, objPos, color, 1);
        }
        this.drawObjectText(obj, objPos);
      }
    });
  }

  static drawOffScreenObjects(objects) {
    const canvas = imgui.getBackgroundDrawList();
    const maxLines = 5;
    const headerText = "OFF SCREEN";

    const headerColor = colors.white;
    const separatorColor = colors.white;

    const offScreenObjects = objects.filter(obj => wow.WorldFrame.getScreenCoordinates(obj.position).x === -1);

    if (offScreenObjects.length > 0) {
      const headerWorldPos = new Vector3(me.position.x, me.position.y, me.position.z + me.displayHeight + 1);
      const headerScreenPos = wow.WorldFrame.getScreenCoordinates(headerWorldPos);

      const uniqueObjects = new Map();
      offScreenObjects.forEach(obj => {
        const key = `${obj.name}-${obj.entryId}`;
        if (!uniqueObjects.has(key) || me.distanceTo(obj.position) < me.distanceTo(uniqueObjects.get(key).position)) {
          uniqueObjects.set(key, obj);
        }
      });

      const sortedObjects = Array.from(uniqueObjects.values())
        .sort((a, b) => me.distanceTo(a.position) - me.distanceTo(b.position))
        .slice(0, maxLines);

      let text = `${headerText}\n${'_'.repeat(20)}\n`;
      sortedObjects.forEach(obj => {
        const distance = Math.round(me.distanceTo(obj.position));
        text += `${obj.name} (${distance}y)\n`;
      });

      if (uniqueObjects.size > maxLines) {
        text += `... and ${uniqueObjects.size - maxLines} more`;
      }

      canvas.addText(text, headerScreenPos, headerColor);
    }
  }

  static drawObjectText(obj, objPos) {
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
      const distance = Math.round(me.distanceTo2D(obj.position));
      text += ` (${distance}y)`;
    }
    if (Settings.ExtraRadarDrawDebug) {
      text += ` [ID: ${obj.entryId}]`;
    }

    const canvas = imgui.getBackgroundDrawList();
    const adjustedObjPos = new Vector3(obj.position.x, obj.position.y, obj.position.z + obj.displayHeight + 0.1);
    const screenPos = wow.WorldFrame.getScreenCoordinates(adjustedObjPos);

    if (prefix) {
      canvas.addText(prefix, screenPos, prefixColor);
      screenPos.x += imgui.calcTextSize(prefix).x;
    }
    canvas.addText(text, screenPos, colors.white);
  }

  static withinDistance(obj) {
    return me.distanceTo2D(obj.position) <= Settings.ExtraRadarLoadDistance;
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

    const trackedObjects = new Set();
    let closestTrackedObject = null;
    let closestDistance = Infinity;

    const categories = [
      {
        filter: obj =>
          (obj instanceof wow.CGUnit && obj.isRelatedToActiveQuest) ||
          (obj instanceof wow.CGGameObject && obj.isLootable),
        type: 'quests',
        track: "ExtraRadarTrackQuests",
        draw: "ExtraRadarDrawLinesQuests"
      },
      { filter: obj => obj instanceof wow.CGGameObject && Gatherables.herb[obj.entryId], type: 'herbs', track: "ExtraRadarTrackHerbs", draw: "ExtraRadarDrawLinesHerbs" },
      { filter: obj => obj instanceof wow.CGGameObject && Gatherables.ore[obj.entryId], type: 'ores', track: "ExtraRadarTrackOres", draw: "ExtraRadarDrawLinesOres" },
      {
        filter: obj => obj instanceof wow.CGGameObject && Gatherables.treasure[obj.entryId],
        type: 'treasures',
        track: "ExtraRadarTrackTreasures",
        draw: "ExtraRadarDrawLinesTreasures"
      },
      {
        filter: obj => obj instanceof wow.CGUnit && obj.classification == Classification.Rare && !obj.deadOrGhost,
        type: 'rares',
        track: "ExtraRadarTrackRares",
        draw: "ExtraRadarDrawLinesRares"
      },
    ];

    categories.forEach(cat => {
      if (Settings[cat.track]) {
        const objects = this.getFilteredAndSortedObjects(cat.filter);
        objects.forEach(obj => trackedObjects.add(obj));
        this.drawObjects(objects, objectColors[cat.type], cat.draw);

        // Update closest object if lines are being drawn for this category
        if (Settings[cat.draw] && objects.length > 0) {
          const distance = me.distanceTo(objects[0].position);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestTrackedObject = objects[0];
          }
        }
      }
    });

    if (Settings.ExtraRadarTrackEverything) {
      const everythingObjects = this.getFilteredAndSortedObjects(obj => obj instanceof wow.CGObject && obj !== me);
      const newObjects = everythingObjects.filter(obj => !trackedObjects.has(obj));
      newObjects.forEach(obj => trackedObjects.add(obj));
      this.drawObjects(newObjects, objectColors.default, "ExtraRadarDrawLinesEverything");

      // Update closest object if lines are being drawn for everything
      if (Settings.ExtraRadarDrawLinesEverything && newObjects.length > 0) {
        const distance = me.distanceTo(newObjects[0].position);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestTrackedObject = newObjects[0];
        }
      }
    }

    const allObjectsArray = Array.from(trackedObjects);

    if (Settings.ExtraRadarDrawOffScreenObjects) {
      this.drawOffScreenObjects(allObjectsArray);
    }

    // Draw line to the closest tracked object
    if (Settings.ExtraRadarDrawLinesClosest && closestTrackedObject) {
      const canvas = imgui.getBackgroundDrawList();
      const mePos = wow.WorldFrame.getScreenCoordinates(me.position);
      const closestPos = wow.WorldFrame.getScreenCoordinates(closestTrackedObject.position);
      if (closestPos && closestPos.x !== -1) {
        canvas.addLine(mePos, closestPos, objectColors.default, 2);
      }
    }

    if (Settings.ExtraRadarInteractTracked && !me.currentCastOrChannel) {
      for (const obj of trackedObjects) {
        if (me.withinInteractRange(obj) && !me.isMoving()) {
          obj.interact();
          break;
        }
      }
    }
  }
}

export default Radar;
