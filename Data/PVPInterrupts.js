// PvP Interrupt/Kick spells with cooldowns
// Used to track enemy interrupt availability for safe casting decisions
// THIS IS PVP ONLY - primarily for arenas

import { me } from '@/Core/ObjectManager';

// Spell IDs for interrupts by class
export const pvpInterruptSpells = {
  // Death Knight
  47528: { name: "Mind Freeze", cooldown: 15000, class: "Death Knight", type: "kick" },
  91802: { name: "Shambling Rush", cooldown: 15000, class: "Death Knight", type: "kick" },

  // Warrior
  6552: { name: "Pummel", cooldown: 15000, class: "Warrior", type: "kick" },

  // Rogue
  1766: { name: "Kick", cooldown: 15000, class: "Rogue", type: "kick" },

  // Mage
  2139: { name: "Counterspell", cooldown: 24000, class: "Mage", type: "kick" },

  // Warlock
  19647: { name: "Spell Lock", cooldown: 24000, class: "Warlock", type: "kick" },
  132409: { name: "Spell Lock", cooldown: 24000, class: "Warlock", type: "kick" },
  119910: { name: "Spell Lock (Pet)", cooldown: 24000, class: "Warlock Pet", type: "kick" },
  89766: { name: "Axe Toss", cooldown: 30000, class: "Warlock Pet", type: "kick" },
  115781: { name: "Optical Blast", cooldown: 24000, class: "Warlock", type: "kick" },
  171138: { name: "Shadow Lock", cooldown: 24000, class: "Warlock", type: "kick" },
  212619: { name: "Call Felhunter", cooldown: 24000, class: "Warlock", type: "kick" },

  // Shaman
  57994: { name: "Wind Shear", cooldown: 12000, class: "Shaman", type: "kick" },

  // Paladin
  96231: { name: "Rebuke", cooldown: 15000, class: "Paladin", type: "kick" },
  231665: { name: "Avenger's Shield", cooldown: 15000, class: "Paladin", type: "kick" },

  // Druid
  106839: { name: "Skull Bash", cooldown: 15000, class: "Druid", type: "kick" },

  // Hunter
  147362: { name: "Counter Shot", cooldown: 15000, class: "Hunter", type: "kick" },
  187707: { name: "Muzzle", cooldown: 15000, class: "Hunter", type: "kick" },

  // Monk
  116705: { name: "Spear Hand Strike", cooldown: 15000, class: "Monk", type: "kick" },

  // Priest
  15487: { name: "Silence", cooldown: 15000, class: "Priest", type: "silence" },

  // Demon Hunter
  183752: { name: "Consume Magic", cooldown: 15000, class: "Demon Hunter", type: "kick" },

  // Evoker
  351338: { name: "Quell", cooldown: 15000, class: "Evoker", type: "kick" },

  // Druid Balance (Solar Beam)
  97547: { name: "Solar Beam", cooldown: 15000, class: "Druid", type: "kick" },
  78675: { name: "Solar Beam", cooldown: 15000, class: "Druid", type: "kick" },
};

// Quick lookup for just spell IDs
export const pvpInterruptSpellIds = Object.keys(pvpInterruptSpells).map(Number);

// Interrupt tracker state
class InterruptTracker {
  constructor() {
    this.reset();
  }

  reset() {
    // Map of enemy guid -> { spellId: { castTime, cooldown, name } }
    this.enemyInterrupts = new Map();
  }

  /**
   * Record that an enemy used an interrupt ability
   * @param {string} enemyGuid - The enemy's GUID string
   * @param {number} spellId - The interrupt spell ID used
   */
  recordInterrupt(enemyGuid, spellId) {
    if (!pvpInterruptSpells[spellId]) return;

    // Don't track our own interrupts
    if (me && enemyGuid === me.guid.toString()) return;

    if (!this.enemyInterrupts.has(enemyGuid)) {
      this.enemyInterrupts.set(enemyGuid, new Map());
    }

    const enemyMap = this.enemyInterrupts.get(enemyGuid);
    const interruptInfo = pvpInterruptSpells[spellId];
    enemyMap.set(spellId, {
      castTime: Date.now(),
      cooldown: interruptInfo.cooldown,
      name: interruptInfo.name
    });
  }

  /**
   * Get time remaining until enemy's interrupt is off cooldown
   * @param {string} enemyGuid - The enemy's GUID string
   * @param {number} spellId - Optional specific spell ID
   * @returns {number} - Milliseconds remaining, or 0 if off cooldown, or -1 if unknown
   */
  getInterruptCooldownRemaining(enemyGuid, spellId = null) {
    const enemyMap = this.enemyInterrupts.get(enemyGuid);
    if (!enemyMap || enemyMap.size === 0) return -1;

    if (spellId) {
      // Check specific spell
      const castData = enemyMap.get(spellId);
      if (!castData) return -1;

      const endTime = castData.castTime + castData.cooldown;
      return Math.max(0, endTime - Date.now());
    } else {
      // Check all interrupts for this enemy
      let earliestEndTime = 0;

      enemyMap.forEach((castData) => {
        const endTime = castData.castTime + castData.cooldown;
        if (endTime > Date.now()) {
          // Still on cooldown
          if (earliestEndTime === 0 || endTime < earliestEndTime) {
            earliestEndTime = endTime;
          }
        }
      });

      if (earliestEndTime > 0) {
        return earliestEndTime - Date.now();
      }
      // If we got here, all interrupts are ready
      return 0;
    }
  }

  /**
   * Check if enemy has ANY interrupt ready
   * @param {string} enemyGuid - The enemy's GUID string
   * @returns {boolean} - True if at least one interrupt is ready
   */
  hasInterruptReady(enemyGuid) {
    return this.getInterruptCooldownRemaining(enemyGuid) === 0;
  }

  /**
   * Check if all nearby enemies have their interrupts on cooldown
   * @param {Array} enemies - Array of enemy unit objects
   * @param {number} safetyMarginMs - Extra buffer in ms (default 500ms)
   * @returns {boolean} - True if safe to cast (all interrupts on CD or none known)
   */
  areAllEnemyInterruptsOnCooldown(enemies, safetyMarginMs = 500) {
    if (!enemies || enemies.length === 0) return true;

    for (const enemy of enemies) {
      if (!enemy || !enemy.guid) continue;

      const guidStr = enemy.guid.toString();
      const remaining = this.getInterruptCooldownRemaining(guidStr);

      // If remaining > safetyMargin, interrupt is still on CD (safe)
      // If remaining <= safetyMargin or === 0, interrupt is ready (NOT safe)
      // If remaining === -1, we don't know about this enemy (assume safe to be conservative)
      if (remaining === 0 || (remaining > 0 && remaining <= safetyMarginMs)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get list of enemies that currently have interrupt ready
   * @param {Array} enemies - Array of enemy unit objects
   * @returns {Array} - Array of { enemy, spellId, name } for enemies with ready interrupts
   */
  getEnemiesWithReadyInterrupts(enemies) {
    if (!enemies || enemies.length === 0) return [];

    const ready = [];

    for (const enemy of enemies) {
      if (!enemy || !enemy.guid) continue;

      const guidStr = enemy.guid.toString();
      const enemyMap = this.enemyInterrupts.get(guidStr);
      if (!enemyMap) continue;

      enemyMap.forEach((castData, spellId) => {
        const remaining = this.getInterruptCooldownRemaining(guidStr, spellId);
        if (remaining === 0) {
          ready.push({
            enemy,
            spellId,
            name: castData.name
          });
        }
      });
    }

    return ready;
  }

  /**
   * Clean up old entries (call periodically via heartbeat)
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 120000; // Remove entries older than 2 minutes

    this.enemyInterrupts.forEach((enemyMap, enemyGuid) => {
      enemyMap.forEach((castData, spellId) => {
        if (now - castData.castTime > maxAge) {
          enemyMap.delete(spellId);
        }
      });

      if (enemyMap.size === 0) {
        this.enemyInterrupts.delete(enemyGuid);
      }
    });
  }
}

export const interruptTracker = new InterruptTracker();

// Combat log event handler to track enemy interrupts
export class InterruptEventHandler extends wow.EventListener {
  onEvent(event) {
    if (event.name !== "COMBAT_LOG_EVENT_UNFILTERED") return;

    const [eventData] = event.args;

    // Only track SPELL_CAST_SUCCESS events (event type 6)
    if (eventData.eventType !== 6) return;

    // Get source GUID
    const sourceGuid = eventData.source?.guid;
    if (!sourceGuid) return;

    // Don't track our own casts
    if (me && sourceGuid.equals(me.guid)) return;

    // Get spell ID
    const spellId = eventData.args ? eventData.args[0] : undefined;
    if (!spellId) return;

    // Check if this is an interrupt spell
    if (pvpInterruptSpells[spellId]) {
      interruptTracker.recordInterrupt(sourceGuid.toString(), spellId);
    }
  }
}

// Export the instance for use in behaviors (lazy - created on first access)
let _interruptEventHandler = null;

export function getInterruptEventHandler() {
  if (!_interruptEventHandler) {
    _interruptEventHandler = new InterruptEventHandler();
  }
  return _interruptEventHandler;
}

// Backwards compatibility - behaviors can still import the lazy instance directly
export { _interruptEventHandler as interruptEventHandler };

// Helper functions for behaviors to use
export const pvpInterruptHelpers = {
  /**
   * Check if we can safely cast (no ready interrupts from enemies)
   * @param {Array} enemies - Array of nearby enemy units
   * @param {number} safetyMarginMs - Safety buffer in ms
   * @returns {boolean} - True if safe to cast
   */
  canSafelyCast(enemies, safetyMarginMs = 500) {
    return interruptTracker.areAllEnemyInterruptsOnCooldown(enemies, safetyMarginMs);
  },

  /**
   * Get enemies that have ready interrupts
   * @param {Array} enemies - Array of nearby enemy units
   * @returns {Array} - Array of { enemy, spellId, name }
   */
  getThreats(enemies) {
    return interruptTracker.getEnemiesWithReadyInterrupts(enemies);
  },

  /**
   * Check if a specific enemy has interrupt ready
   * @param {object} enemy - Enemy unit object
   * @returns {boolean} - True if enemy has ready interrupt
   */
  enemyHasInterruptReady(enemy) {
    if (!enemy || !enemy.guid) return false;
    return interruptTracker.hasInterruptReady(enemy.guid.toString());
  },

  /**
   * Get time until enemy's interrupt is ready
   * @param {object} enemy - Enemy unit object
   * @returns {number} - Milliseconds remaining, 0 if ready, -1 if unknown
   */
  getEnemyInterruptTimeRemaining(enemy) {
    if (!enemy || !enemy.guid) return -1;
    return interruptTracker.getInterruptCooldownRemaining(enemy.guid.toString());
  },

  /**
   * Run cleanup on the interrupt tracker
   */
  cleanup() {
    interruptTracker.cleanup();
  }
};

export default {
  pvpInterruptSpells,
  pvpInterruptSpellIds,
  interruptTracker,
  interruptEventHandler,
  pvpInterruptHelpers
};