import Settings from '@/Core/Settings';
import Gatherables from '@/Data/Gatherables';
import objMgr from '@/Core/ObjectManager';
import { me } from '@/Core/ObjectManager';
import colors from '@/Enums/Colors';
import { Classification } from '@/Enums/UnitEnums';
import { UnitFlags, UnitFlags2, UnitFlags3, NpcFlags, DynamicFlags } from '@/Enums/Flags';
import { GameObjectType } from '@/Enums/GameObjectType';

// dynamicFlags bits (low word, GO-specific layout):
//   INTERACT_READY (0x0020) - server says "currently clickable for you"
//   NO_INTERACT    (0x0080) - hard "no, never clickable"
//   INTERACT_COND  (0x0200) - interaction is conditional. NOT a universal block
//     (lootable objects set it while clickable), but for a NON-lootable goober a
//     set bit means "not interactable" (Campfire / depleted Pedestal 0x8200).
//   ACTIVE         (0x8000) - object currently offers interaction; a chest/stash
//     clears it (dynF -> 0x0) when emptied (goUsable is unreliable — it flickers).
//
// goFlags bits (persistent GO state):
//   GO_FLAG_INTERACT_COND (0x0004) - "needs conditions met to interact" — set
//     on chests/objects gated by an active quest or other prerequisite.
//     Observed on non-interactable chests (e.g. Gnoll Orders goF=0x204004,
//     other goF=0x4); interactable treasures have this bit clear (e.g.
//     Silverbound Treasure Chest goF=0x0).
//
// Chests and Goobers both sit with goUsable=true before INTERACT_READY (0x0020)
// is set, and on this server that bit is unreliable — it appears only when very
// close (chests) or not at all (quest goobers). Requiring it hid distant
// treasures and left quest goobers permanently un-clickable, so we do NOT require
// INTERACT_READY. Interactability is gated by goUsable plus the real "blocked"
// signals (NO_INTERACT on dynamicFlags, INTERACT_COND on goFlags). Two flag-only
// "not usable" patterns, no bookkeeping: (1) USED/EMPTIED objects clear the ACTIVE
// 0x8000 bit (chest 0x8000 -> 0x0, used goober 0xc204 -> 0x200); (2) IDLE / not-
// currently-usable objects keep 0x8000 but set INTERACT_COND 0x0200 (Campfire /
// Catapult / idle Pedestal 0x8200 vs ready Druid Stone 0x8000). Lootable objects
// (loot=1, full Pedestal/Catapult 0xc204) are usable regardless. Net rule:
//   usable = goUsable AND ACTIVE set AND (isLootable OR INTERACT_COND clear).
const GO_DYNFLAG_LO_INTERACT_READY = 0x0020;
const GO_DYNFLAG_LO_NO_INTERACT = 0x0080;
const GO_DYNFLAG_LO_INTERACT_COND = 0x0200;
// ACTIVE: set while an object currently offers interaction; CLEARED once it's been
// used/emptied — a chest zeroes dynamicFlags (0x8000 -> 0x0) and a used goober
// drops the bit too (Ogre Runestone 0xc204 -> 0x200). goUsable is unreliable (it
// flickers back to 1 on a looted chest), so this is the signal for "already used".
const GO_DYNFLAG_LO_ACTIVE = 0x8000;
// NO_INTERACT is the only UNIVERSAL hard block. INTERACT_COND (0x0200) is excluded
// here because lootable objects set it while still clickable (e.g. a full Ritual
// Pedestal, 0xc204). It IS used goober-specifically as the "not interactable"
// signal for NON-lootable goobers — see isCurrentlyClickable.
const GO_DYNFLAG_LO_BLOCKED_MASK = GO_DYNFLAG_LO_NO_INTERACT;
const GO_FLAG_INTERACT_COND = 0x0004;
// NOT_SELECTABLE: the object can't be selected/clicked at all (rafts, vehicles,
// scenery). Genuine interactables never set it — observed on the Raft (goF=0x10),
// while every real clickable carried 0x40000 and no 0x10.
const GO_FLAG_NOT_SELECTABLE = 0x0010;

function isCurrentlyClickable(obj) {
  if (obj.goUsable !== true) return false;
  // NOT_SELECTABLE => can't be clicked at all (rafts/vehicles/scenery, e.g. Raft
  // goF=0x10). Genuine interactables never set this.
  if ((obj.goFlags & GO_FLAG_NOT_SELECTABLE) !== 0) return false;
  if ((obj.dynamicFlags & GO_DYNFLAG_LO_BLOCKED_MASK) !== 0) return false;
  // Must currently be ACTIVE: set on ready objects, cleared once used/emptied
  // (chest dynF -> 0x0, used goober 0xc204 -> 0x200). goUsable flickers back to 1
  // on a looted chest, so this is what reliably drops finished objects.
  if ((obj.dynamicFlags & GO_DYNFLAG_LO_ACTIVE) === 0) return false;
  const interactReady = (obj.dynamicFlags & GO_DYNFLAG_LO_INTERACT_READY) !== 0;
  // INTERACT_READY is the server's runtime "clickable right now" signal and
  // overrides the persistent GO_FLAG_INTERACT_COND heuristic — observed on
  // quest chests with goF=0x4 + dynF having 0x20, which ARE openable.
  if (!interactReady && (obj.goFlags & GO_FLAG_INTERACT_COND) !== 0) return false;
  // Goobers: a NON-lootable goober is interactable only while dynamicFlags 0x0200
  // (INTERACT_COND) is CLEAR — clear = usable (Druid Stone 0x8000), set = not
  // (Campfire / depleted Ritual Pedestal 0x8200). Lootable goobers (loot=1, e.g. a
  // full Pedestal 0xc204) are usable regardless; the loot flag is their signal.
  if (obj.goType === GameObjectType.Goober
      && obj.isLootable !== true
      && (obj.dynamicFlags & GO_DYNFLAG_LO_INTERACT_COND) !== 0) return false;
  return true;
}

// DEBUG twin of isCurrentlyClickable + the interact-loop gates: returns the first
// reason the interact loop in tick() would skip this GO, or null if it would fire.
// Keep in sync with isCurrentlyClickable() and the loop below.
function interactSkipReason(obj) {
  if (!(obj instanceof wow.CGGameObject)) return "not a CGGameObject";
  if (!me.withinInteractRange(obj)) return "out of interact range";
  if (obj.goUsable !== true) return "goUsable != true";
  if ((obj.goFlags & GO_FLAG_NOT_SELECTABLE) !== 0) return "goFlags NOT_SELECTABLE (0x10) — not clickable";
  if ((obj.dynamicFlags & GO_DYNFLAG_LO_BLOCKED_MASK) !== 0) return "dynamicFlags NO_INTERACT (0x80)";
  if ((obj.dynamicFlags & GO_DYNFLAG_LO_ACTIVE) === 0) return "not ACTIVE (dynF 0x8000 clear — used/emptied)";
  const interactReady = (obj.dynamicFlags & GO_DYNFLAG_LO_INTERACT_READY) !== 0;
  if (!interactReady && (obj.goFlags & GO_FLAG_INTERACT_COND) !== 0) return "goFlags INTERACT_COND (0x4) & not ready";
  if (obj.goType === GameObjectType.Goober && obj.isLootable !== true
      && (obj.dynamicFlags & GO_DYNFLAG_LO_INTERACT_COND) !== 0) return "non-lootable goober, INTERACT_COND 0x200 set (not interactable)";
  return null;
}

// Resolve a spell id to its name for debug logging (safe if the id is bogus).
function radarSpellName(id) {
  try { return new wow.Spell(id)?.name ?? `${id}`; } catch { return `${id}`; }
}

// Goobers (GO type 10) are quest-interactable props: clickable orbs, levers, switches, etc.
// They don't flag as isLootable, and goState varies widely across quest objects (observed 17
// and 209 on different quest props), so we rely on isCurrentlyClickable rather than pinning
// to a specific state value.
function isGooberQuestObjective(obj) {
  return obj.goType === GameObjectType.Goober && isCurrentlyClickable(obj);
}

// Clickable chests (GO type 3) split by name:
//   - Anything with "Chest" in its name → treasure (covers Small Treasure Chest,
//     Silverbound Treasure Chest, Iron-Bound Chest, etc.)
//   - Anything else → quest (campaign objectives, world-quest props, etc.)
function isTreasureNameChest(obj) {
  return obj.goType === GameObjectType.Chest
    && (obj.name || "").includes("Chest")
    && isCurrentlyClickable(obj);
}

function isInteractableQuestChest(obj) {
  return obj.goType === GameObjectType.Chest
    && !(obj.name || "").includes("Chest")
    && isCurrentlyClickable(obj);
}

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

// Safety timeout for silently-swallowed interacts (e.g. server rejects because
// you're in combat — no cast, no failure event). The timeout is suppressed
// while me.isCasting is true, so it only fires when nothing at all is happening.
const INTERACT_PENDING_TIMEOUT_MS = 750;

// Brief grace after our last interact() before we'll fire on the same GUID
// again. Covers the window where the server hasn't yet flipped the GO's
// dynamic flags after a completed loot (so the obj is briefly still in
// trackedEntries even though it's done), and prevents instant re-fire on the
// same target right after an interrupt.
const SAME_GUID_GRACE_MS = 500;

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

  // Bumped both when we send interact() AND when pending resolves, so the
  // SAME_GUID_GRACE_MS window measures "time since last activity on this GUID"
  // — meaning the grace starts at cast-end, not cast-start.
  static lastInteractAt = 0;
  // guid.hash (BigInt) of the GO we last called interact() on — used to
  // enforce SAME_GUID_GRACE_MS.
  static lastInteractedGuidHash = null;
  // Full guid of that GO, so cast events can be matched against the interact target.
  static lastInteractedGuid = null;
  // True between obj.interact() and the signal that resolves it (cast end,
  // LOOT_CLOSED, or safety timeout).
  static interactPending = false;
  // castGUID of the cast we triggered (captured on UNIT_SPELLCAST_START while
  // pending). Lets us ignore any other casts the player fires in the meantime.
  static pendingCastGUID = null;
  // Previous tick's me.isCasting, used to detect the T→F transition that
  // signals our cast has ended (success or interrupt).
  static wasCasting = false;
  // Throttle (ms timestamp) for the interact debug dump below.
  static _lastInteractDebugAt = 0;

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
        else if (Gatherables.treasure[obj.entryId] && isCurrentlyClickable(obj)) buckets.treasures.push(entry);
        else if (isTreasureNameChest(obj)) buckets.treasures.push(entry);
        else if (isInteractableQuestChest(obj)) buckets.quests.push(entry);
        else if (obj.isLootable) buckets.quests.push(entry);
        else if (isGooberQuestObjective(obj)) buckets.quests.push(entry);
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
      } else if ((Gatherables.treasure[obj.entryId] && isCurrentlyClickable(obj))
                 || isTreasureNameChest(obj)) {
        prefix = '[T] ';
        prefixColor = colors.silver;
      } else if (isInteractableQuestChest(obj) || obj.isLootable || isGooberQuestObjective(obj)) {
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
      if (obj instanceof wow.CGGameObject
        && (obj.goType === GameObjectType.Goober || obj.goType === GameObjectType.Chest)) {
        const hex = v => `0x${((v ?? 0) >>> 0).toString(16)}`;
        text += ` type=${obj.goType} state=${obj.goState} goF=${hex(obj.goFlags)} dynF=${hex(obj.dynamicFlags)} use=${obj.goUsable ? 1 : 0}`;
      }
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
      `dynamicFlags  = ${hex(obj.dynamicFlags)}`,
    ];

    if (obj instanceof wow.CGUnit) {
      lines.push(
        `--- CGUnit ---`,
        `dynamicFlags  = ${this.decodeFlags(obj.dynamicFlags, DynamicFlags)}`,
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

    // Cast ended (success or interrupt) — resolve pending immediately rather
    // than waiting for an event the SDK may or may not surface.
    if (this.interactPending && this.wasCasting && !me.isCasting) {
      console.info(`[Radar] pending cleared by isCasting T→F`);
      this.interactPending = false;
      this.pendingCastGUID = null;
      this.lastInteractAt = wow.frameTime;
    }
    this.wasCasting = me.isCasting;

    // Safety timeout only applies when nothing is happening — if we're still
    // casting, the interact obviously succeeded and the cast end will resolve.
    if (this.interactPending && !me.isCasting
        && wow.frameTime - this.lastInteractAt >= INTERACT_PENDING_TIMEOUT_MS) {
      console.info(`[Radar] interact pending timeout`);
      this.interactPending = false;
      this.pendingCastGUID = null;
      this.lastInteractAt = wow.frameTime;
    }

    // --- DEBUG: with "Interact Tracked" + "Draw Debug Info" both enabled, dump
    // (once per second) the outer gate state plus every nearby goober/chest with
    // the exact reason the interact loop would skip it. Remove once diagnosed.
    if (Settings.ExtraRadarInteractTracked && Settings.ExtraRadarDrawDebug
        && wow.frameTime - this._lastInteractDebugAt > 1000) {
      this._lastInteractDebugAt = wow.frameTime;
      console.info(`[Radar/dbg] gate casting=${me.isCasting ? 1 : 0} moving=${me.isMoving() ? 1 : 0} pending=${this.interactPending ? 1 : 0} sinceLast=${wow.frameTime - this.lastInteractAt}ms tracked=${trackedEntries.length}`);

      const trackedHashes = new Set();
      for (const e of trackedEntries) {
        const h = e.obj?.guid?.hash;
        if (h !== undefined) trackedHashes.add(h);
      }
      const hex = v => `0x${((v ?? 0) >>> 0).toString(16)}`;
      const mp = me.position;
      let printed = 0;
      objMgr.objects.forEach(obj => {
        if (printed >= 8) return;
        if (!(obj instanceof wow.CGGameObject)) return;
        if (obj.goType !== GameObjectType.Goober && obj.goType !== GameObjectType.Chest) return;
        const p = obj.position;
        if (!p) return;
        const dx = p.x - mp.x, dy = p.y - mp.y, dz = p.z - mp.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > 15) return;
        printed++;
        const h = obj.guid?.hash;
        const reason = interactSkipReason(obj);
        console.info(`[Radar/dbg] ${obj.name} id=${obj.entryId} d=${dist.toFixed(1)} goType=${obj.goType} use=${obj.goUsable ? 1 : 0} loot=${obj.isLootable ? 1 : 0} state=${obj.goState} dynF=${hex(obj.dynamicFlags)} goF=${hex(obj.goFlags)} flags=${hex(obj.flags)} typeF=${hex(obj.typeFlags)} goFac=${obj.goFactionTemplate} inRange=${me.withinInteractRange(obj) ? 1 : 0} tracked=${h !== undefined && trackedHashes.has(h) ? 1 : 0} -> ${reason ?? "WOULD INTERACT"}`);
      });
    }

    if (Settings.ExtraRadarInteractTracked && !me.isCasting && !me.isMoving() && !this.interactPending) {
      const now = wow.frameTime;
      for (const entry of trackedEntries) {
        const obj = entry.obj;
        if (!(obj instanceof wow.CGGameObject)) continue;
        if (!me.withinInteractRange(obj)) continue;
        if (!isCurrentlyClickable(obj)) continue;
        const hash = obj.guid?.hash;
        if (hash !== undefined && hash === this.lastInteractedGuidHash
            && now - this.lastInteractAt < SAME_GUID_GRACE_MS) continue;
        console.info(`[Radar] interact ${obj.name} [${hash?.toString(16)}]`);
        obj.interact();
        this.lastInteractAt = now;
        this.lastInteractedGuidHash = hash;
        this.lastInteractedGuid = obj.guid;
        this.interactPending = true;
        break;
      }
    }
  }
}

// Resolves Radar.interactPending based on the lifecycle of the interact we sent.
// We capture the castGUID from UNIT_SPELLCAST_START so subsequent SUCCEEDED /
// FAILED / INTERRUPTED events are only matched to OUR cast (other player spells
// have their own castGUID and are ignored). For chests/goobers that open loot
// directly without a cast, LOOT_CLOSED resolves it.
const resolvePending = (reason) => {
  Radar.interactPending = false;
  Radar.pendingCastGUID = null;
  Radar.lastInteractAt = wow.frameTime;
  console.info(`[Radar] pending cleared by ${reason}`);
};

// SDK quirks observed in the wild:
//   - args[0] is a Guid object for the caster (NOT the "player" unit token).
//   - castGUID (args[1]) is also a Guid — compare with .equals().
//   - The SDK occasionally emits stale UNIT_SPELLCAST_INTERRUPTED bursts for a
//     prior cast right after a new interact, so resolution events must be
//     filtered by castGUID match to the START we captured.
//   - LOOT_OPENED/LOOT_CLOSED do NOT fire for quest-objective interacts that
//     don't produce a loot window — for those we rely on the isCasting T→F
//     transition (handled in tick) and the FAILED/INTERRUPTED events here.
const radarInteractListener = new wow.EventListener();
radarInteractListener.onEvent = (event) => {
  if (!Radar.interactPending) return;
  if (event.name === "COMBAT_LOG_EVENT_UNFILTERED") return;

  if (event.name === "LOOT_CLOSED") {
    resolvePending("LOOT_CLOSED");
    return;
  }

  if (!event.name?.startsWith("UNIT_SPELLCAST_")) return;
  const [unitGuid, castGUID, spellID] = event.args ?? [];
  if (!unitGuid?.equals || !me.guid || !unitGuid.equals(me.guid)) return;

  // DEBUG: while an interact is pending, surface every player spellcast event with
  // its spell + target, so we can learn each GO's actual "use" spell and whether
  // it targets the object (channeled => has START; instant => SUCCEEDED, no START).
  if (Settings.ExtraRadarDrawDebug) {
    const tgt = me.spellInfo?.spellTargetGuid;
    const onObj = tgt?.equals?.(Radar.lastInteractedGuid) ? 1 : 0;
    const match = Radar.pendingCastGUID?.equals?.(castGUID) ? 1 : 0;
    console.info(`[Radar/cast] ${event.name} id=${spellID} name="${radarSpellName(spellID)}" target=${tgt?.toString?.() ?? "n/a"} onInteractedObj=${onObj} castGUIDmatch=${match}`);
  }

  if (event.name === "UNIT_SPELLCAST_START") {
    Radar.pendingCastGUID = castGUID;
    console.info(`[Radar] cast START id=${spellID}`);
    return;
  }

  // FAILED can fire before any START (server rejects the cast attempt outright),
  // so there's no castGUID to match — trust it.
  if (event.name === "UNIT_SPELLCAST_FAILED"
      || event.name === "UNIT_SPELLCAST_FAILED_QUIET") {
    resolvePending(`${event.name} id=${spellID}`);
    return;
  }

  // INTERRUPTED / SUCCEEDED always follow a START — require castGUID match to
  // avoid the stale-burst quirk noted above.
  if (event.name === "UNIT_SPELLCAST_INTERRUPTED"
      || event.name === "UNIT_SPELLCAST_SUCCEEDED") {
    if (!Radar.pendingCastGUID?.equals?.(castGUID)) return;
    resolvePending(`${event.name} id=${spellID}`);
  }
};

export default Radar;
