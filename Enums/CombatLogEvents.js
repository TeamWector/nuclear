/**
 * Combat Log Event Type Enums
 * Maps numeric event types to their string representations
 */

export const CombatLogEventTypes = {
  ENVIRONMENTAL_DAMAGE: 0,
  SWING_DAMAGE: 1,
  SWING_MISSED: 2,
  RANGE_DAMAGE: 3,
  RANGE_MISSED: 4,
  SPELL_CAST_START: 5,
  SPELL_CAST_SUCCESS: 6,
  SPELL_CAST_FAILED: 7,
  SPELL_MISSED: 8,
  SPELL_DAMAGE: 9,
  SPELL_HEAL: 10,
  SPELL_ENERGIZE: 11,
  SPELL_DRAIN: 12,
  SPELL_LEECH: 13,
  SPELL_INSTAKILL: 14,
  SPELL_SUMMON: 15,
  SPELL_CREATE: 16,
  SPELL_INTERRUPT: 17,
  SPELL_EXTRA_ATTACKS: 18,
  SPELL_DURABILITY_DAMAGE: 19,
  SPELL_DURABILITY_DAMAGE_ALL: 20,
  SPELL_AURA_APPLIED: 21,
  SPELL_AURA_APPLIED_DOSE: 22,
  SPELL_AURA_REMOVED_DOSE: 23,
  SPELL_AURA_REMOVED: 24,
  SPELL_AURA_REFRESH: 25,
  SPELL_DISPEL: 26,
  SPELL_STOLEN: 27,
  SPELL_AURA_BROKEN: 28,
  SPELL_AURA_BROKEN_SPELL: 29,
  DAMAGE_AURA_BROKEN: 30,
  ENCHANT_APPLIED: 31,
  ENCHANT_REMOVED: 32,
  SPELL_PERIODIC_MISSED: 33,
  SPELL_PERIODIC_DAMAGE: 34,
  SPELL_PERIODIC_HEAL: 35,
  SPELL_PERIODIC_ENERGIZE: 36,
  SPELL_PERIODIC_DRAIN: 37,
  SPELL_PERIODIC_LEECH: 38,
  SPELL_DISPEL_FAILED: 39,
  DAMAGE_SHIELD: 40,
  DAMAGE_SHIELD_MISSED: 41,
  DAMAGE_SPLIT: 42,
  PARTY_KILL: 43,
  UNIT_DIED: 44,
  UNIT_DESTROYED: 45,
  SPELL_RESURRECT: 46,
  SPELL_BUILDING_DAMAGE: 47,
  SPELL_BUILDING_HEAL: 48,
  UNIT_DISSIPATES: 49,
  SWING_DAMAGE_LANDED: 50,
  SPELL_ABSORBED: 51,
  SPELL_HEAL_ABSORBED: 52,
  SPELL_EMPOWER_START: 53,
  SPELL_EMPOWER_END: 54,
  SPELL_EMPOWER_INTERRUPT: 55
};

/**
 * Reverse mapping from numeric values to string names
 */
export const CombatLogEventTypesMap = {
  0: "ENVIRONMENTAL_DAMAGE",
  1: "SWING_DAMAGE",
  2: "SWING_MISSED",
  3: "RANGE_DAMAGE",
  4: "RANGE_MISSED",
  5: "SPELL_CAST_START",
  6: "SPELL_CAST_SUCCESS",
  7: "SPELL_CAST_FAILED",
  8: "SPELL_MISSED",
  9: "SPELL_DAMAGE",
  10: "SPELL_HEAL",
  11: "SPELL_ENERGIZE",
  12: "SPELL_DRAIN",
  13: "SPELL_LEECH",
  14: "SPELL_INSTAKILL",
  15: "SPELL_SUMMON",
  16: "SPELL_CREATE",
  17: "SPELL_INTERRUPT",
  18: "SPELL_EXTRA_ATTACKS",
  19: "SPELL_DURABILITY_DAMAGE",
  20: "SPELL_DURABILITY_DAMAGE_ALL",
  21: "SPELL_AURA_APPLIED",
  22: "SPELL_AURA_APPLIED_DOSE",
  23: "SPELL_AURA_REMOVED_DOSE",
  24: "SPELL_AURA_REMOVED",
  25: "SPELL_AURA_REFRESH",
  26: "SPELL_DISPEL",
  27: "SPELL_STOLEN",
  28: "SPELL_AURA_BROKEN",
  29: "SPELL_AURA_BROKEN_SPELL",
  30: "DAMAGE_AURA_BROKEN",
  31: "ENCHANT_APPLIED",
  32: "ENCHANT_REMOVED",
  33: "SPELL_PERIODIC_MISSED",
  34: "SPELL_PERIODIC_DAMAGE",
  35: "SPELL_PERIODIC_HEAL",
  36: "SPELL_PERIODIC_ENERGIZE",
  37: "SPELL_PERIODIC_DRAIN",
  38: "SPELL_PERIODIC_LEECH",
  39: "SPELL_DISPEL_FAILED",
  40: "DAMAGE_SHIELD",
  41: "DAMAGE_SHIELD_MISSED",
  42: "DAMAGE_SPLIT",
  43: "PARTY_KILL",
  44: "UNIT_DIED",
  45: "UNIT_DESTROYED",
  46: "SPELL_RESURRECT",
  47: "SPELL_BUILDING_DAMAGE",
  48: "SPELL_BUILDING_HEAL",
  49: "UNIT_DISSIPATES",
  50: "SWING_DAMAGE_LANDED",
  51: "SPELL_ABSORBED",
  52: "SPELL_HEAL_ABSORBED",
  53: "SPELL_EMPOWER_START",
  54: "SPELL_EMPOWER_END",
  55: "SPELL_EMPOWER_INTERRUPT"
};

/**
 * Get event type name from numeric value
 * @param {number} eventType - The numeric event type
 * @returns {string|undefined} - The event type name or undefined if not found
 */
export function getEventTypeName(eventType) {
  return CombatLogEventTypesMap[eventType];
}

/**
 * Check if an event type is a spell aura event
 * @param {number} eventType - The numeric event type
 * @returns {boolean} - True if it's an aura-related event
 */
export function isAuraEvent(eventType) {
  return eventType >= CombatLogEventTypes.SPELL_AURA_APPLIED &&
         eventType <= CombatLogEventTypes.SPELL_AURA_REFRESH;
}

/**
 * Check if an event type is a spell cast event
 * @param {number} eventType - The numeric event type
 * @returns {boolean} - True if it's a cast-related event
 */
export function isCastEvent(eventType) {
  return eventType >= CombatLogEventTypes.SPELL_CAST_START &&
         eventType <= CombatLogEventTypes.SPELL_CAST_FAILED;
}
