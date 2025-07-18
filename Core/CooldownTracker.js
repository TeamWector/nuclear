import objMgr, { me } from './ObjectManager';
import { offensiveCooldowns, cooldownHelpers, CooldownCategories } from '../Data/OffensiveCooldowns';
import { CombatLogEventTypes, getEventTypeName } from '../Enums/CombatLogEvents';
import Settings from './Settings';
import colors from '../Enums/Colors';

/**
 * Offensive Cooldown Tracker for PvP
 * Tracks enemy offensive cooldowns using combat log events for strategic automation
 */
class CooldownTracker extends wow.EventListener {
  constructor() {
    super();
    this.enabled = true;
    this.visualThreats = true; // Enable visual threat lines by default
    this.cooldowns = new Map(); // unitGuid.hash -> { spellId -> { category, lastUsed, estimatedAvailable, priority } }
    this.recentCasts = new Map(); // unitGuid.hash -> { spellId -> timestamp } for duplicate filtering
    this.activeThreatLines = new Map(); // unitGuid.hash -> { unit, endTime, spellName, category }
    this.castThrottleTime = 1000; // 1 second throttle for duplicate casts
    this.maxTrackingDistance = 40; // yards
    this.arenaOnly = true; // Start with arena only for performance
    this.debugLogs = false;
  }

  /**
   * Initialize the cooldown tracker
   */
  initialize() {
    console.log('Cooldown Tracker initialized');
    this.debugLogs = Settings.CooldownTrackerDebugLogs || false;
  }

  /**
   * Handle combat log events
   */
  onEvent(event) {
    if (!this.enabled) return;

    if (event.name === "COMBAT_LOG_EVENT_UNFILTERED") {
      this.processCombatLogEvent(event);
    }
  }

  /**
   * Process combat log events for cooldown tracking
   */
  processCombatLogEvent(event) {
    // Extract event data - following same pattern as DRTracker
    const eventData = event.args?.[0] || event;
    const eventType = eventData.eventType;
    const spellId = eventData.args?.[0] || eventData.spellId;
    const sourceGuid = eventData.source?.guid || eventData.sourceGuid;
    const sourceName = eventData.source?.unsafeName || eventData.sourceName;

    // Only track hostile players
    if (!sourceGuid || !this.isHostilePlayer(sourceGuid)) return;

    // Check if we should track this spell
    const cooldownInfo = cooldownHelpers.getCooldownBySpellID(spellId);
    if (!cooldownInfo) return;

    // Check zone restrictions - safely check if me exists and has inArena method
    if (this.arenaOnly && (!me || !me.inArena || !me.inArena())) return;

    // Check distance (if unit is available and me exists)
    if (!me || !this.isWithinTrackingRange(sourceGuid)) return;

    const currentTime = Date.now();
    const eventTypeName = getEventTypeName(eventType);

    // Handle relevant events for cooldown tracking
    switch (eventType) {
      case CombatLogEventTypes.SPELL_CAST_SUCCESS:
      case CombatLogEventTypes.SPELL_AURA_APPLIED:
      case CombatLogEventTypes.SPELL_SUMMON:
        // Throttle duplicate casts
        if (this.isRecentCast(sourceGuid, spellId, currentTime)) return;

        if (this.debugLogs) {
          console.info(`[Cooldown] ${eventTypeName} - ${sourceName}: ${cooldownInfo.name} (${cooldownInfo.category})`);
        }

        this.recordCooldownUsage(sourceGuid, spellId, cooldownInfo, currentTime);
        break;
    }
  }

  /**
   * Check if source is a hostile player - following DRTracker pattern
   */
  isHostilePlayer(sourceGuid) {
    const unit = objMgr.findObject(sourceGuid);
    if (!unit || !(unit instanceof wow.CGUnit)) return false;

    if (!unit.isPlayer()) return false;

    // Check if hostile to us using the isEnemy property
    return unit.isEnemy;
  }

  /**
   * Check if unit is within tracking range
   */
  isWithinTrackingRange(unitGuid) {
    if (!me) return false;

    const unit = objMgr.findObject(unitGuid);
    if (!unit || !(unit instanceof wow.CGUnit)) return false;

    const distance = me.distanceTo(unit);
    return distance <= this.maxTrackingDistance;
  }

  /**
   * Check if this is a recent duplicate cast
   */
  isRecentCast(unitGuid, spellId, currentTime) {
    const guidHash = unitGuid.hash;

    if (!this.recentCasts.has(guidHash)) {
      this.recentCasts.set(guidHash, {});
    }

    const unitCasts = this.recentCasts.get(guidHash);
    const lastCast = unitCasts[spellId];

    if (lastCast && (currentTime - lastCast) < this.castThrottleTime) {
      return true; // Too recent, ignore
    }

    // Update last cast time
    unitCasts[spellId] = currentTime;
    return false;
  }

  /**
   * Record cooldown usage
   */
  recordCooldownUsage(unitGuid, spellId, cooldownInfo, currentTime) {
    const guidHash = unitGuid.hash;

    if (!this.cooldowns.has(guidHash)) {
      this.cooldowns.set(guidHash, {});
    }

    const unitCooldowns = this.cooldowns.get(guidHash);
    const estimatedAvailable = currentTime + cooldownInfo.cooldown;

    unitCooldowns[spellId] = {
      name: cooldownInfo.name,
      category: cooldownInfo.category,
      lastUsed: currentTime,
      estimatedAvailable: estimatedAvailable,
      priority: cooldownHelpers.getCategoryPriority(cooldownInfo.category),
      cooldownDuration: cooldownInfo.cooldown,
      effectDuration: cooldownInfo.duration
    };

    // Add visual threat line if enabled and spell has a duration
    if (this.visualThreats && cooldownInfo.duration > 0) {
      const unit = objMgr.findObject(unitGuid);
      if (unit) {
        this.activeThreatLines.set(guidHash, {
          unit: unit,
          endTime: currentTime + cooldownInfo.duration,
          spellName: cooldownInfo.name,
          category: cooldownInfo.category,
          spellId: spellId
        });
      }
    }

    if (this.debugLogs) {
      const unitName = this.getUnitName(unitGuid);
      console.log(`Cooldown Recorded: ${unitName} used ${cooldownInfo.name} - Available in ${Math.round(cooldownInfo.cooldown / 1000)}s`);
    }
  }

  /**
   * Get unit name by GUID - following DRTracker pattern
   */
  getUnitName(unitGuid) {
    const unit = objMgr.findObject(unitGuid);
    return unit ? unit.unsafeName : 'Unknown';
  }

  /**
   * Find unit by GUID hash - using similar pattern to Spell.js interrupt logic
   */
  findUnitByHash(guidHash) {
    if (!me) return null;

    // Search through nearby enemy players using similar pattern to interrupt logic
    try {
      // Use getPlayerEnemies if available (from Extensions)
      if (me.getPlayerEnemies) {
        const enemies = me.getPlayerEnemies(this.maxTrackingDistance);
        return enemies.find(unit => unit.guid.hash === guidHash) || null;
      }

      // Fallback: search through object manager like interrupt logic does
      for (const [hash, obj] of objMgr.objects) {
        if (obj instanceof wow.CGUnit &&
            obj.guid.hash === guidHash &&
            obj.type === 6 &&
            obj.isEnemy &&
            me.distanceTo(obj) <= this.maxTrackingDistance) {
          return obj;
        }
      }
      return null;
    } catch (e) {
      // If all else fails, return null
      return null;
    }
  }

  /**
   * Main update loop - clean up expired data and render visual threats
   */
  update() {
    if (!this.enabled || !me) return;

    const currentTime = Date.now();

    // Clean up old cast records
    for (const [guidHash, unitCasts] of this.recentCasts) {
      for (const [spellId, timestamp] of Object.entries(unitCasts)) {
        if (currentTime - timestamp > this.castThrottleTime * 5) {
          delete unitCasts[spellId];
        }
      }

      if (Object.keys(unitCasts).length === 0) {
        this.recentCasts.delete(guidHash);
      }
    }

    // Clean up cooldown data for units that are no longer relevant
    for (const [guidHash, unitCooldowns] of this.cooldowns) {
      const unit = this.findUnitByHash(guidHash);

      // Remove if unit no longer exists or is too far away
      if (!unit || !this.isWithinTrackingRange(unit.guid)) {
        this.cooldowns.delete(guidHash);
        continue;
      }

      // Clean up very old cooldown records (older than 10 minutes)
      for (const [spellId, cooldownData] of Object.entries(unitCooldowns)) {
        if (currentTime - cooldownData.lastUsed > 600000) { // 10 minutes
          delete unitCooldowns[spellId];
        }
      }

      if (Object.keys(unitCooldowns).length === 0) {
        this.cooldowns.delete(guidHash);
      }
    }

    // Clean up expired threat lines and render active ones
    this.updateVisualThreats(currentTime);
  }

  /**
   * Update and render visual threat lines
   */
  updateVisualThreats(currentTime) {
    if (!this.visualThreats) return;

    // Clean up expired threat lines
    for (const [guidHash, threatData] of this.activeThreatLines) {
      if (currentTime >= threatData.endTime) {
        this.activeThreatLines.delete(guidHash);
      }
    }

    // Render active threat lines
    this.renderThreatLines();
  }

  /**
   * Render red lines to enemies with active offensive cooldowns
   */
  renderThreatLines() {
    if (!this.visualThreats || !me) return;

    const canvas = imgui.getBackgroundDrawList();

    // Position line from middle of character (add half display height)
    const meCenter = new Vector3(me.position.x, me.position.y, me.position.z + (me.displayHeight / 2));
    const mePos = wow.WorldFrame.getScreenCoordinates(meCenter);

    for (const [guidHash, threatData] of this.activeThreatLines) {
      const unit = threatData.unit;

      // Check line of sight safely
      try {
        if (!unit || !me || !me.withinLineOfSight(unit)) continue;
      } catch (e) {
        // If line of sight check fails, skip this unit
        continue;
      }

      // Position line to middle of enemy unit as well
      const unitCenter = new Vector3(unit.position.x, unit.position.y, unit.position.z + (unit.displayHeight / 2));
      const unitPos = wow.WorldFrame.getScreenCoordinates(unitCenter);
      if (!unitPos || unitPos.x === -1) continue; // Off screen

      // Choose color based on threat category
      let lineColor = colors.red; // Default red for threats
      let lineWidth = 2;

      switch (threatData.category) {
        case CooldownCategories.EXECUTE_FINISHER:
          lineColor = colors.purple; // Purple for execute abilities
          lineWidth = 3;
          break;
        case CooldownCategories.MAGIC_BURST:
          lineColor = colors.blue; // Blue for magic burst
          break;
        case CooldownCategories.PHYSICAL_BURST:
          lineColor = colors.red; // Red for physical burst
          break;
        case CooldownCategories.MAJOR_OFFENSIVE:
          lineColor = colors.orange; // Orange for major offensive
          break;
        default:
          lineColor = colors.yellow; // Yellow for other threats
          break;
      }

      // Draw the threat line
      canvas.addLine(mePos, unitPos, lineColor, lineWidth);

      // Draw spell name above the unit
      const textPos = new Vector3(unit.position.x, unit.position.y, unit.position.z + unit.displayHeight + 1);
      const textScreenPos = wow.WorldFrame.getScreenCoordinates(textPos);
      if (textScreenPos && textScreenPos.x !== -1) {
        canvas.addText(`[${threatData.spellName}]`, textScreenPos, lineColor);
      }
    }
  }

  /**
   * Get all cooldowns for a specific unit
   */
  getUnitCooldowns(unitGuid) {
    const guidHash = unitGuid.hash;
    return this.cooldowns.get(guidHash) || {};
  }

  /**
   * Get cooldowns by category for a unit
   */
  getUnitCooldownsByCategory(unitGuid, category) {
    const unitCooldowns = this.getUnitCooldowns(unitGuid);
    return Object.entries(unitCooldowns)
      .filter(([_, cooldown]) => cooldown.category === category)
      .reduce((acc, [spellId, cooldown]) => {
        acc[spellId] = cooldown;
        return acc;
      }, {});
  }

  /**
   * Check if a specific cooldown is available for a unit
   */
  isCooldownAvailable(unitGuid, spellId) {
    const unitCooldowns = this.getUnitCooldowns(unitGuid);
    const cooldownData = unitCooldowns[spellId];

    if (!cooldownData) return true; // Never seen it used, assume available

    return Date.now() >= cooldownData.estimatedAvailable;
  }

  /**
   * Get remaining cooldown time for a specific spell
   */
  getRemainingCooldown(unitGuid, spellId) {
    const unitCooldowns = this.getUnitCooldowns(unitGuid);
    const cooldownData = unitCooldowns[spellId];

    if (!cooldownData) return 0; // Never seen it used

    const remaining = cooldownData.estimatedAvailable - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * Get the most threatening available cooldowns for a unit
   */
  getThreateningCooldowns(unitGuid, maxResults = 5) {
    const unitCooldowns = this.getUnitCooldowns(unitGuid);
    const currentTime = Date.now();

    return Object.entries(unitCooldowns)
      .filter(([_, cooldown]) => currentTime >= cooldown.estimatedAvailable) // Only available cooldowns
      .sort((a, b) => b[1].priority - a[1].priority) // Sort by priority (highest first)
      .slice(0, maxResults)
      .map(([spellId, cooldown]) => ({
        spellId: parseInt(spellId),
        ...cooldown
      }));
  }

  /**
   * Get all units with active cooldown tracking
   */
  getTrackedUnits() {
    const units = [];
    for (const [guidHash, unitCooldowns] of this.cooldowns) {
      const unit = this.findUnitByHash(guidHash);
      if (unit && Object.keys(unitCooldowns).length > 0) {
        units.push({
          guid: unit.guid,
          name: unit.unsafeName,
          cooldownCount: Object.keys(unitCooldowns).length
        });
      }
    }
    return units;
  }

  /**
   * Check if any enemy has a specific category of cooldown available
   */
  hasEnemyCooldownAvailable(category) {
    const currentTime = Date.now();

    for (const [guidHash, unitCooldowns] of this.cooldowns) {
      for (const [spellId, cooldown] of Object.entries(unitCooldowns)) {
        if (cooldown.category === category && currentTime >= cooldown.estimatedAvailable) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get threat level assessment for current situation
   */
  getThreatAssessment() {
    const threats = {
      immediate: [], // Available high-priority cooldowns
      incoming: [],  // High-priority cooldowns available soon (< 10s)
      defensive: []  // Defensive cooldowns that just ended
    };

    const currentTime = Date.now();
    const soonThreshold = 10000; // 10 seconds

    for (const [guidHash, unitCooldowns] of this.cooldowns) {
      const unit = this.findUnitByHash(guidHash);
      if (!unit) continue;

      for (const [spellId, cooldown] of Object.entries(unitCooldowns)) {
        const timeUntilAvailable = cooldown.estimatedAvailable - currentTime;

        if (cooldown.priority >= 7) { // High priority cooldowns
          if (timeUntilAvailable <= 0) {
            threats.immediate.push({
              unit: unit.unsafeName,
              spellId: parseInt(spellId),
              ...cooldown
            });
          } else if (timeUntilAvailable <= soonThreshold) {
            threats.incoming.push({
              unit: unit.unsafeName,
              spellId: parseInt(spellId),
              availableIn: timeUntilAvailable,
              ...cooldown
            });
          }
        }

        // Track defensive cooldowns that recently ended
        if ((cooldown.category === CooldownCategories.IMMUNITY ||
             cooldown.category === CooldownCategories.MAJOR_DEFENSIVE) &&
            timeUntilAvailable <= 0 &&
            (currentTime - cooldown.lastUsed) < 30000) { // Used within last 30s
          threats.defensive.push({
            unit: unit.unsafeName,
            spellId: parseInt(spellId),
            usedAgo: currentTime - cooldown.lastUsed,
            ...cooldown
          });
        }
      }
    }

    return threats;
  }

  /**
   * Get enemy burst windows - when enemies have multiple offensive cooldowns available
   */
  getEnemyBurstWindows() {
    const burstWindows = [];
    const currentTime = Date.now();

    for (const [guidHash, unitCooldowns] of this.cooldowns) {
      const unit = this.findUnitByHash(guidHash);
      if (!unit) continue;

      const availableBurst = [];
      const incomingBurst = [];

      for (const [spellId, cooldown] of Object.entries(unitCooldowns)) {
        const timeUntilAvailable = cooldown.estimatedAvailable - currentTime;

        // Check for burst categories
        if (cooldown.category === CooldownCategories.MAGIC_BURST ||
            cooldown.category === CooldownCategories.PHYSICAL_BURST ||
            cooldown.category === CooldownCategories.DOT_AMPLIFICATION ||
            cooldown.category === CooldownCategories.MAJOR_OFFENSIVE) {

          if (timeUntilAvailable <= 0) {
            availableBurst.push(cooldown);
          } else if (timeUntilAvailable <= 15000) { // Available within 15s
            incomingBurst.push({ ...cooldown, availableIn: timeUntilAvailable });
          }
        }
      }

      // If enemy has 2+ burst cooldowns available or coming soon, it's a burst window
      if (availableBurst.length >= 2 || (availableBurst.length >= 1 && incomingBurst.length >= 1)) {
        burstWindows.push({
          unit: unit.unsafeName,
          guid: unit.guid,
          available: availableBurst,
          incoming: incomingBurst,
          threatLevel: availableBurst.length * 2 + incomingBurst.length
        });
      }
    }

    // Sort by threat level (highest first)
    return burstWindows.sort((a, b) => b.threatLevel - a.threatLevel);
  }

  /**
   * Check if it's safe to use major cooldowns (no immediate enemy burst)
   */
  isSafeForMajorCooldowns() {
    const threats = this.getThreatAssessment();
    const burstWindows = this.getEnemyBurstWindows();

    // Not safe if there are immediate high-priority threats or active burst windows
    return threats.immediate.length === 0 && burstWindows.length === 0;
  }

  /**
   * Get recommended defensive actions based on current threats
   */
  getDefensiveRecommendations() {
    const threats = this.getThreatAssessment();
    const burstWindows = this.getEnemyBurstWindows();
    const recommendations = [];

    // Immediate threats
    if (threats.immediate.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        action: 'USE_MAJOR_DEFENSIVE',
        reason: `${threats.immediate.length} immediate high-priority cooldowns available`,
        threats: threats.immediate
      });
    }

    // Active burst windows
    if (burstWindows.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        action: 'USE_DEFENSIVE_COOLDOWNS',
        reason: `${burstWindows.length} enemy burst windows active`,
        burstWindows: burstWindows
      });
    }

    // Incoming threats
    if (threats.incoming.length > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'PREPARE_DEFENSIVES',
        reason: `${threats.incoming.length} high-priority cooldowns available soon`,
        threats: threats.incoming
      });
    }

    // Recently used defensives (opportunity windows)
    if (threats.defensive.length > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'OFFENSIVE_OPPORTUNITY',
        reason: `${threats.defensive.length} enemy defensives recently used`,
        opportunities: threats.defensive
      });
    }

    return recommendations;
  }

  /**
   * Enable/disable the tracker
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.cooldowns.clear();
      this.recentCasts.clear();
      this.activeThreatLines.clear();
    }
  }

  /**
   * Enable/disable visual threat lines
   */
  setVisualThreats(enabled) {
    this.visualThreats = enabled;
    if (!enabled) {
      this.activeThreatLines.clear();
    }
  }

  /**
   * Set arena-only mode
   */
  setArenaOnly(arenaOnly) {
    this.arenaOnly = arenaOnly;
  }

  /**
   * Set debug logging
   */
  setDebugLogs(enabled) {
    this.debugLogs = enabled;
  }

  /**
   * Reset all cooldown data
   */
  reset() {
    this.cooldowns.clear();
    this.recentCasts.clear();
    this.activeThreatLines.clear();
  }

  /**
   * Get the most threatened friendly unit based on enemy cooldowns
   * This is crucial for healers to know who to pre-cast defensives on
   */
  getMostThreatenedFriend() {
    if (!me || !me.getFriends) return null;

    const friends = me.getFriends(40);
    if (!friends || friends.length === 0) return null;

    let mostThreatened = null;
    let highestThreatScore = 0;

    for (const friend of friends) {
      const threatScore = this.calculateThreatScore(friend);
      if (threatScore > highestThreatScore) {
        highestThreatScore = threatScore;
        mostThreatened = friend;
      }
    }

    return mostThreatened;
  }

  /**
   * Calculate threat score for a friendly unit based on enemy targeting and available cooldowns
   */
  calculateThreatScore(friendlyUnit) {
    if (!friendlyUnit) return 0;

    let threatScore = 0;
    const currentTime = Date.now();

    // Check all tracked enemies
    for (const [guidHash, unitCooldowns] of this.cooldowns) {
      const enemy = this.findUnitByHash(guidHash);
      if (!enemy) continue;

      // Higher threat if enemy is targeting this friend
      const isTargeting = enemy.target && enemy.target.equals && enemy.target.equals(friendlyUnit.guid);
      const targetMultiplier = isTargeting ? 3 : 1;

      // Check distance - closer enemies are more threatening
      const distance = enemy.distanceTo(friendlyUnit);
      const distanceMultiplier = Math.max(0.1, (40 - distance) / 40);

      // Check available offensive cooldowns
      for (const [spellId, cooldown] of Object.entries(unitCooldowns)) {
        const timeUntilAvailable = cooldown.estimatedAvailable - currentTime;

        if (timeUntilAvailable <= 0) { // Available now
          threatScore += cooldown.priority * targetMultiplier * distanceMultiplier;
        } else if (timeUntilAvailable <= 5000) { // Available within 5 seconds
          threatScore += (cooldown.priority * 0.5) * targetMultiplier * distanceMultiplier;
        }
      }
    }

    // Factor in friend's current health - lower health = higher priority
    const healthMultiplier = Math.max(0.5, (100 - friendlyUnit.pctHealth) / 100 + 0.5);
    threatScore *= healthMultiplier;

    return threatScore;
  }

  /**
   * Get friends who need defensive cooldowns based on incoming threats
   */
  getFriendsNeedingDefensives() {
    if (!me || !me.getFriends) return [];

    const friends = me.getFriends(40);
    if (!friends || friends.length === 0) return [];

    const friendsNeedingHelp = [];

    for (const friend of friends) {
      const threatScore = this.calculateThreatScore(friend);
      const incomingThreats = this.getIncomingThreatsForUnit(friend);

      if (threatScore > 5 || incomingThreats.length > 0) {
        friendsNeedingHelp.push({
          unit: friend,
          threatScore: threatScore,
          incomingThreats: incomingThreats,
          priority: this.getDefensivePriority(friend, threatScore, incomingThreats)
        });
      }
    }

    // Sort by priority (highest first)
    return friendsNeedingHelp.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get incoming threats for a specific friendly unit
   */
  getIncomingThreatsForUnit(friendlyUnit) {
    const threats = [];
    const currentTime = Date.now();

    for (const [guidHash, unitCooldowns] of this.cooldowns) {
      const enemy = this.findUnitByHash(guidHash);
      if (!enemy) continue;

      // Check if enemy is targeting this friend or is close enough to threaten
      const isTargeting = enemy.target && enemy.target.equals && enemy.target.equals(friendlyUnit.guid);
      const distance = enemy.distanceTo(friendlyUnit);
      const isInRange = distance <= 30; // Most abilities have 30y range or less

      if (!isTargeting && !isInRange) continue;

      for (const [spellId, cooldown] of Object.entries(unitCooldowns)) {
        const timeUntilAvailable = cooldown.estimatedAvailable - currentTime;

        // Consider threats that are available now or very soon
        if (timeUntilAvailable <= 3000 && cooldown.priority >= 6) {
          threats.push({
            enemy: enemy.unsafeName,
            spellId: parseInt(spellId),
            spellName: cooldown.name,
            category: cooldown.category,
            priority: cooldown.priority,
            availableIn: Math.max(0, timeUntilAvailable),
            isTargeting: isTargeting,
            distance: distance
          });
        }
      }
    }

    return threats.sort((a, b) => a.availableIn - b.availableIn); // Sort by most immediate first
  }

  /**
   * Calculate defensive priority for a friendly unit
   */
  getDefensivePriority(friendlyUnit, threatScore, incomingThreats) {
    let priority = threatScore;

    // Higher priority for lower health
    priority += (100 - friendlyUnit.pctHealth) / 10;

    // Higher priority for immediate threats
    const immediateThreats = incomingThreats.filter(t => t.availableIn <= 1000);
    priority += immediateThreats.length * 10;

    // Higher priority if multiple enemies are threatening
    const uniqueEnemies = new Set(incomingThreats.map(t => t.enemy));
    priority += uniqueEnemies.size * 5;

    // Higher priority for high-priority spell categories
    const hasExecuteThreats = incomingThreats.some(t => t.category === CooldownCategories.EXECUTE_FINISHER);
    const hasBurstThreats = incomingThreats.some(t =>
      t.category === CooldownCategories.MAGIC_BURST ||
      t.category === CooldownCategories.PHYSICAL_BURST
    );

    if (hasExecuteThreats) priority += 20;
    if (hasBurstThreats) priority += 15;

    return priority;
  }

  /**
   * Check if a specific friend needs immediate defensive help
   */
  friendNeedsImmediateHelp(friendlyUnit, urgencyThreshold = 15) {
    if (!friendlyUnit) return false;

    const threatScore = this.calculateThreatScore(friendlyUnit);
    const incomingThreats = this.getIncomingThreatsForUnit(friendlyUnit);
    const priority = this.getDefensivePriority(friendlyUnit, threatScore, incomingThreats);

    return priority >= urgencyThreshold;
  }

  /**
   * Get recommended defensive spell for a friendly unit
   */
  getRecommendedDefensive(friendlyUnit, availableDefensives = []) {
    if (!friendlyUnit || availableDefensives.length === 0) return null;

    const incomingThreats = this.getIncomingThreatsForUnit(friendlyUnit);
    if (incomingThreats.length === 0) return null;

    // Analyze threat types to recommend appropriate defensive
    const hasPhysicalThreats = incomingThreats.some(t => t.category === CooldownCategories.PHYSICAL_BURST);
    const hasMagicThreats = incomingThreats.some(t => t.category === CooldownCategories.MAGIC_BURST);
    const hasExecuteThreats = incomingThreats.some(t => t.category === CooldownCategories.EXECUTE_FINISHER);
    const immediateThreats = incomingThreats.filter(t => t.availableIn <= 1000);

    // Defensive spell recommendations based on threat analysis
    const recommendations = [];

    for (const defensive of availableDefensives) {
      let score = 0;

      // Score based on defensive type and threat type
      if (defensive.type === 'immunity' && (hasPhysicalThreats || hasMagicThreats)) {
        score += 20;
      } else if (defensive.type === 'damage_reduction' && immediateThreats.length > 0) {
        score += 15;
      } else if (defensive.type === 'heal' && friendlyUnit.pctHealth < 50) {
        score += 10;
      } else if (defensive.type === 'shield' && immediateThreats.length > 0) {
        score += 12;
      }

      // Higher score for more urgent situations
      if (hasExecuteThreats) score += 10;
      if (immediateThreats.length >= 2) score += 8;

      recommendations.push({
        spell: defensive.spell,
        score: score,
        reason: this.getDefensiveReason(defensive, incomingThreats, friendlyUnit)
      });
    }

    // Return highest scoring defensive
    recommendations.sort((a, b) => b.score - a.score);
    return recommendations.length > 0 ? recommendations[0] : null;
  }

  /**
   * Get reason for defensive recommendation
   */
  getDefensiveReason(defensive, threats, friendlyUnit) {
    const immediateThreats = threats.filter(t => t.availableIn <= 1000);
    const threatNames = threats.map(t => t.spellName).join(', ');

    if (immediateThreats.length > 0) {
      return `Immediate threats: ${threatNames}`;
    } else if (friendlyUnit.pctHealth < 30) {
      return `Low health (${friendlyUnit.pctHealth.toFixed(0)}%) with incoming: ${threatNames}`;
    } else {
      return `Incoming threats: ${threatNames}`;
    }
  }

  /**
   * Get statistics about tracking
   */
  getStats() {
    return {
      trackedUnits: this.cooldowns.size,
      totalCooldowns: Array.from(this.cooldowns.values())
        .reduce((sum, unitCooldowns) => sum + Object.keys(unitCooldowns).length, 0),
      recentCasts: this.recentCasts.size,
      activeThreatLines: this.activeThreatLines.size,
      visualThreatsEnabled: this.visualThreats
    };
  }
}

// Create singleton instance
const cooldownTracker = new CooldownTracker();

export default cooldownTracker;
