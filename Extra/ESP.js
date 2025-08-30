import Settings from '@/Core/Settings';
import objMgr, { me } from '@/Core/ObjectManager';
import colors from '@/Enums/Colors';
import spell from '@/Core/Spell';

// Common area trigger spell names (for spells we don't know)
const commonAreaTriggerSpells = {
  // Death Knight
  43265: "Death and Decay",
  188290: "Death and Decay",
  
  // Demon Hunter
  258920: "Immolation Aura",
  
  // Druid
  102793: "Ursol's Vortex",
  
  // Hunter
  162488: "Steel Trap",
  13809: "Ice Trap",
  1499: "Freezing Trap",
  
  // Mage
  84721: "Frozen Orb",
  12654: "Ignite",
  190336: "Conjure Refreshment",
  
  // Monk
  116847: "Rushing Jade Wind",
  261715: "Jade Wind",
  
  // Paladin
  26573: "Consecration",
  204019: "Blessed Hammer",
  
  // Priest
  34861: "Circle of Healing",
  64843: "Divine Hymn",
  
  // Rogue
  185565: "Poisoned Knife",
  
  // Shaman
  61882: "Earthquake",
  73920: "Healing Rain",
  192222: "Liquid Magma Totem",
  
  // Warlock
  5740: "Rain of Fire",
  42223: "Rain of Fire",
  
  // Warrior
  118000: "Dragon Roar",
  
  // Generic/Common
  26364: "Lightning Shield",
  61295: "Riptide"
};
import { damageBuffs, pvpImmunityBuffs } from '@/Data/PVPData';

class ESP {
  static tabName = "ESP";
  
  // Track area trigger creation times for countdown
  static areaTriggerTimestamps = new Map();
  
  // Cache spell names to avoid repeated lookups
  static spellNameCache = new Map();

  // Helper method to safely validate area trigger objects
  static isValidAreaTrigger(areaTrigger) {
    if (!areaTrigger || !(areaTrigger instanceof wow.CGAreaTrigger)) {
      return false;
    }
    
    try {
      // Try to access basic properties to verify object is still valid
      const _ = areaTrigger.guid;
      const __ = areaTrigger.spellId;
      return true;
    } catch (error) {
      return false;
    }
  }

  static options = [
    // Main toggles
    { type: "checkbox", uid: "ESPEnabled", text: "Enable ESP", default: false },
    { type: "checkbox", uid: "ESPShowFriends", text: "Show Friends", default: true },
    { type: "checkbox", uid: "ESPShowEnemies", text: "Show Enemies", default: true },
    
    // Target type filters
    { type: "checkbox", uid: "ESPShowPlayers", text: "Show Players", default: true },
    { type: "checkbox", uid: "ESPShowNPCs", text: "Show NPCs", default: false },
    { type: "checkbox", uid: "ESPShowPets", text: "Show Pets/Minions", default: false },
    { type: "checkbox", uid: "ESPShowGameObjects", text: "Show Game Objects", default: false },
    { type: "checkbox", uid: "ESPShowDynamicObjects", text: "Show Dynamic Objects", default: false },
    { type: "checkbox", uid: "ESPShowAreaTriggers", text: "Show Area Triggers", default: false },
    
    // Area trigger filters
    { type: "checkbox", uid: "ESPShowOwnAreaTriggers", text: "Show Own Area Triggers", default: true },
    { type: "checkbox", uid: "ESPShowEnemyAreaTriggers", text: "Show Enemy Area Triggers", default: true },
    { type: "checkbox", uid: "ESPShowFriendlyAreaTriggers", text: "Show Friendly Area Triggers", default: true },
    { type: "checkbox", uid: "ESPShowNeutralAreaTriggers", text: "Show Neutral Area Triggers", default: false },
    
    // Area trigger display options
    { type: "checkbox", uid: "ESPShowAreaTriggerNames", text: "Show Area Trigger Names", default: true },
    { type: "checkbox", uid: "ESPShowAreaTriggerDuration", text: "Show Area Trigger Duration", default: true },
    { type: "checkbox", uid: "ESPShowAreaTriggerPlayerCount", text: "Show Area Trigger Player Count", default: true },
    
    // Line settings
    { type: "checkbox", uid: "ESPDrawLines", text: "Draw Lines to Targets", default: true },
    { type: "slider", uid: "ESPLineThickness", text: "Line Thickness", min: 1, max: 10, default: 3 },
    { type: "slider", uid: "ESPLineOpacity", text: "Line Opacity (%)", min: 10, max: 100, default: 25 },
    
    // Circle settings
    { type: "checkbox", uid: "ESPDrawCircles", text: "Draw Circles Around Targets", default: true },
    { type: "slider", uid: "ESPCircleRadius", text: "Circle Radius (yards)", min: 1, max: 10, default: 4 },
    { type: "slider", uid: "ESPCircleSegments", text: "Circle Segments (quality)", min: 12, max: 72, default: 60 },
    { type: "slider", uid: "ESPCircleThickness", text: "Circle Line Thickness", min: 1, max: 8, default: 3 },
    { type: "slider", uid: "ESPCircleOpacity", text: "Circle Opacity (%)", min: 10, max: 100, default: 25 },
    { type: "checkbox", uid: "ESPUseEntitySize", text: "Use Entity Size for Circle Radius", default: true },
    { type: "checkbox", uid: "ESPCircleGradient", text: "Enable Circle Glow Effect", default: true },
    { type: "slider", uid: "ESPGlowLayers", text: "Glow Layers (quality)", min: 10, max: 20, default: 10 },
    
    // Color settings
    { type: "combobox", uid: "ESPFriendColor", text: "Friend Color", options: ["green", "blue", "lightblue", "aqua"], default: "green" },
    { type: "combobox", uid: "ESPEnemyColor", text: "Enemy Color", options: ["red", "orange", "yellow", "hotpink"], default: "red" },
    { type: "combobox", uid: "ESPTargetColor", text: "Current Target Color", options: ["yellow", "white", "orange", "coral"], default: "yellow" },
    { type: "combobox", uid: "ESPNPCColor", text: "NPC Color", options: ["gray", "lightgrey", "silver", "tan"], default: "gray" },
    { type: "combobox", uid: "ESPPetColor", text: "Pet/Minion Color", options: ["purple", "plum", "lavender", "pink"], default: "purple" },
    { type: "combobox", uid: "ESPGameObjectColor", text: "Game Object Color", options: ["turquoise", "teal", "aqua", "skyblue"], default: "turquoise" },
    { type: "combobox", uid: "ESPDynamicObjectColor", text: "Dynamic Object Color", options: ["cyan", "lightcyan", "paleturquoise", "mediumturquoise"], default: "cyan" },
    { type: "combobox", uid: "ESPAreaTriggerColor", text: "Area Trigger Color", options: ["magenta", "violet", "fuchsia", "mediumorchid"], default: "magenta" },
    { type: "combobox", uid: "ESPLOSColor", text: "Line of Sight Border Color", options: ["white", "silver", "lightgrey"], default: "white" },
    
    // LOS Settings
    { type: "checkbox", uid: "ESPDrawLOSBorders", text: "Draw LOS Borders on Lines/Circles", default: true },
    { type: "slider", uid: "ESPLOSThickness", text: "LOS Border Thickness", min: 1, max: 8, default: 8 },
    { type: "checkbox", uid: "ESPLOSGlow", text: "Enable LOS Border Glow Effect", default: true },
    { type: "slider", uid: "ESPLOSOpacity", text: "LOS Border Opacity (%)", min: 10, max: 100, default: 20 },
    { type: "slider", uid: "ESPLOSGlowLayers", text: "LOS Glow Layers", min: 1, max: 20, default: 1 },
    
    // Target Highlighting
    { type: "checkbox", uid: "ESPDrawTargetCircle", text: "Draw Separate Target Circle", default: true },
    { type: "slider", uid: "ESPTargetCircleSize", text: "Target Circle Size Multiplier (%)", min: 110, max: 200, default: 110 },
    { type: "checkbox", uid: "ESPTargetGlow", text: "Enable Target Circle Glow", default: true },
    
    // Information Display
    { type: "checkbox", uid: "ESPShowNames", text: "Show Unit Names", default: false },
    { type: "checkbox", uid: "ESPShowHealth", text: "Show Health Percentage", default: false },
    { type: "checkbox", uid: "ESPShowCooldowns", text: "Show Major Cooldowns", default: false },

    // Range and filters
    { type: "slider", uid: "ESPMaxRange", text: "Max Range (yards)", min: 10, max: 100, default: 40 },
    { type: "slider", uid: "ESPMaxTargets", text: "Max Targets to Display", min: 1, max: 50, default: 10 },
    { type: "checkbox", uid: "ESPOnlyInCombat", text: "Only Show in Combat", default: false },
    
    // Performance
    { type: "slider", uid: "ESPUpdateRate", text: "Update Rate (ms)", min: 2, max: 100, default: 15 },
  ];

  static lastUpdate = 0;
  static cachedTargets = [];

  static renderOptions(renderFunction) {
    renderFunction([
      { header: "Main Settings", options: this.options.slice(0, 3) },
      { header: "Target Type Filters", options: this.options.slice(3, 9) },
      { header: "Area Trigger Filters", options: this.options.slice(9, 13) },
      { header: "Area Trigger Display", options: this.options.slice(13, 16) },
      { header: "Line Settings", options: this.options.slice(16, 19) },
      { header: "Circle Settings", options: this.options.slice(19, 27) },
      { header: "Colors", options: this.options.slice(27, 36) },
      { header: "LOS Settings", options: this.options.slice(36, 41) },
      { header: "Target Highlighting", options: this.options.slice(41, 44) },
      { header: "Information Display", options: this.options.slice(44, 47) },
      { header: "Filters & Range", options: this.options.slice(47, 50) },
      { header: "Performance", options: this.options.slice(50) },
    ]);
  }

  static tick() {
    if (!Settings.ESPEnabled || !me) return;

    const currentTime = wow.frameTime;
    
    // Cleanup expired area trigger timestamps
    for (const [guid, triggerData] of this.areaTriggerTimestamps) {
      const elapsed = currentTime - triggerData.firstSeen;
      if (elapsed >= triggerData.totalDuration) {
        this.areaTriggerTimestamps.delete(guid);
      }
    }
    
    // Update rate throttling
    if (currentTime - this.lastUpdate < Settings.ESPUpdateRate) {
      this.render(); // Still render with cached data
      return;
    }
    
    this.lastUpdate = currentTime;
    this.updateTargets();
    this.render();
  }

  static updateTargets() {
    this.cachedTargets = [];
    const maxRange = Settings.ESPMaxRange;
    const maxTargets = Settings.ESPMaxTargets || 10;

    // Only show in combat check
    if (Settings.ESPOnlyInCombat && !me.inCombat()) {
      return;
    }

    // Collect all valid targets with their distances and priorities
    const allTargets = [];
    
    objMgr.objects.forEach((obj) => {
      if (obj === me) return; // Skip self

      const distance = me.distanceTo(obj);
      if (distance > maxRange) return;

      // Check object type and filters
      const objectType = this.getObjectType(obj);
      if (!this.shouldShowObjectType(objectType, obj)) return;
      
      // Additional validation for area triggers
      if (objectType === 'areatrigger' && !this.isValidAreaTrigger(obj)) {
        return; // Skip invalid area triggers
      }

      // Skip dead objects (only applies to units)
      if (obj instanceof wow.CGUnit && obj.deadOrGhost) return;

      const targetInfo = this.analyzeTarget(obj, objectType);
      if (targetInfo.shouldShow) {
        // Assign priority based on strategic importance for PVP
        const priority = this.calculateTargetPriority(obj, targetInfo);
        allTargets.push({
          ...targetInfo,
          distance: distance,
          priority: priority
        });
      }
    });

    // Sort by priority (1 = players first), then by distance (nearest first)
    allTargets.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority; // Lower priority number = higher priority
      }
      return a.distance - b.distance; // Closer = higher priority
    });

    // Take only the top N targets
    this.cachedTargets = allTargets.slice(0, maxTargets);
  }

  static analyzeTarget(obj, objectType) {
    let isFriend = false;
    let isEnemy = false;
    let isCurrentTarget = false;
    let hasLOS = false;
    let shouldShow = false;

    // For units, check friend/enemy status
    if (obj instanceof wow.CGUnit) {
      isFriend = me.canAttack && !me.canAttack(obj);
      isEnemy = me.canAttack && me.canAttack(obj);
      isCurrentTarget = me.target && me.target.equals && me.target.equals(obj.guid);
      hasLOS = me.withinLineOfSight && me.withinLineOfSight(obj);
      
      shouldShow = (isFriend && Settings.ESPShowFriends) || 
                   (isEnemy && Settings.ESPShowEnemies);
    } else {
      // For non-units (game objects), always show them if the type is enabled
      shouldShow = true;
      hasLOS = true; // Assume game objects are always visible
    }

    return {
      unit: obj,
      objectType,
      isFriend,
      isEnemy,
      isCurrentTarget,
      hasLOS,
      shouldShow,
      screenPos: wow.WorldFrame.getScreenCoordinates(obj.position),
      distance: me.distanceTo(obj)
    };
  }

  static getObjectType(obj) {
    if (obj instanceof wow.CGUnit) {
      if (obj.isPlayer && obj.isPlayer()) {
        return 'player';
      } else if (this.isPetOrMinion(obj)) {
        return 'pet';
      } else {
        return 'npc';
      }
    } else if (obj instanceof wow.CGGameObject) {
      return 'gameobject';
    } else if (obj instanceof wow.CGDynamicObject) {
      return 'dynamicobject';
    } else if (obj instanceof wow.CGAreaTrigger) {
      return 'areatrigger';
    } else {
      return 'other';
    }
  }

  static shouldShowObjectType(objectType, obj = null) {
    switch (objectType) {
      case 'player':
        return Settings.ESPShowPlayers;
      case 'npc':
        return Settings.ESPShowNPCs;
      case 'pet':
        return Settings.ESPShowPets;
      case 'gameobject':
        return Settings.ESPShowGameObjects;
      case 'dynamicobject':
        return Settings.ESPShowDynamicObjects;
      case 'areatrigger':
        return Settings.ESPShowAreaTriggers && this.shouldShowAreaTrigger(obj);
      default:
        return false;
    }
  }

  static shouldShowAreaTrigger(areaTrigger) {
    if (!this.isValidAreaTrigger(areaTrigger)) {
      return false;
    }
    
    // Check caster relationship and corresponding setting
    try {
      // Safely access caster property
      const caster = areaTrigger.caster ? areaTrigger.caster.toUnit() : null;
      
      if (!caster) {
        // Unknown caster - treat as neutral
        return Settings.ESPShowNeutralAreaTriggers;
      }
      
      // Check relationship to player
      if (caster.guid && caster.guid.equals(me.guid)) {
        // Player's own area trigger
        return Settings.ESPShowOwnAreaTriggers;
      } else if (me.canAttack(caster)) {
        // Enemy area trigger
        return Settings.ESPShowEnemyAreaTriggers;
      } else if (caster.inMyGroup && caster.inMyGroup()) {
        // Friendly party/raid member area trigger
        return Settings.ESPShowFriendlyAreaTriggers;
      } else {
        // Neutral/other friendly area trigger
        return Settings.ESPShowNeutralAreaTriggers;
      }
    } catch (error) {
      // Object became invalid or caster lookup failed
      console.log(`ESP: Error checking area trigger caster relationship: ${error.message}`);
      return false; // Don't show invalid objects
    }
  }

  static isPetOrMinion(unit) {
    if (!unit || !(unit instanceof wow.CGUnit)) return false;

    // Check if it has ownership properties (summoned/created by a player)
    if (unit.summonedBy && !unit.summonedBy.isNull) return true;
    if (unit.createdBy && !unit.createdBy.isNull) return true;
    if (unit.charmedBy && !unit.charmedBy.isNull) return true;
    if (unit.demonCreator && !unit.demonCreator.isNull) return true;

    // Check if it has a pet number
    if (unit.petNumber && unit.petNumber > 0) return true;

    // Check creature type/family for typical pets
    const petLikeCreatureTypes = [1, 3, 4, 6, 9, 11]; // Beast, Demon, Elemental, Undead, Mechanical, Totem
    if (unit.creatureType !== undefined && petLikeCreatureTypes.includes(unit.creatureType)) {
      return true;
    }

    return false;
  }

  static render() {
    if (!this.cachedTargets.length) return;

    const canvas = imgui.getBackgroundDrawList();
    const viewport = imgui.getMainViewport();
    if (!viewport) return;

    // Get player's feet position on screen
    const playerFeetWorldPos = {
      x: me.position.x,
      y: me.position.y, 
      z: me.position.z
    };
    const playerFeetScreenPos = wow.WorldFrame.getScreenCoordinates(playerFeetWorldPos);

    for (const target of this.cachedTargets) {
      if (!target.screenPos || target.screenPos.x === -1) continue;
      
      // Validate target object is still valid before rendering
      if (!target.unit) continue;
      
      try {
        // Quick validation for area triggers
        if (target.unit instanceof wow.CGAreaTrigger) {
          const _ = target.unit.position;
          const __ = target.unit.guid;
        }
      } catch (error) {
        // Object became invalid, skip this target entirely
        continue;
      }

      const baseColor = this.getTargetColor(target);
      const lineColor = this.applyOpacity(baseColor, Settings.ESPLineOpacity / 100);
      const circleColor = this.applyOpacity(baseColor, Settings.ESPCircleOpacity / 100);

      // Draw line from player's feet to target
      if (Settings.ESPDrawLines && playerFeetScreenPos && playerFeetScreenPos.x !== -1) {
        let lineEndPos = target.screenPos;
        
        // If circles are being drawn, calculate line end at circle edge
        if (Settings.ESPDrawCircles) {
          const worldRadius = this.getEntityRadius(target);
          const screenRadius = this.worldDistanceToScreenDistance(target, worldRadius);
          
          // Calculate direction vector from player to target
          const deltaX = target.screenPos.x - playerFeetScreenPos.x;
          const deltaY = target.screenPos.y - playerFeetScreenPos.y;
          const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          
          if (distance > screenRadius) {
            // Normalize direction and move back by circle radius
            const normalizedX = deltaX / distance;
            const normalizedY = deltaY / distance;
            
            lineEndPos = {
              x: target.screenPos.x - (normalizedX * screenRadius),
              y: target.screenPos.y - (normalizedY * screenRadius)
            };
          }
        }
        
        canvas.addLine(
          playerFeetScreenPos,
          lineEndPos,
          lineColor,
          Settings.ESPLineThickness
        );
        
        // Draw LOS border on line if enabled and target has LOS
        if (target.hasLOS && Settings.ESPDrawLOSBorders) {
          this.drawLOSLineBorder(canvas, playerFeetScreenPos, lineEndPos);
        }
      }

      // Draw circle around target
      if (Settings.ESPDrawCircles) {
        this.drawTargetCircle(canvas, target, circleColor);
        
        // Draw LOS border on circle if enabled and target has LOS
        if (target.hasLOS && Settings.ESPDrawLOSBorders) {
          this.drawLOSCircleBorder(canvas, target);
        }
      }

      // Draw separate pulsating cooldown circle if unit has major cooldowns
      // Only check for cooldowns on players to reduce performance impact
      if (target.unit && target.unit.isPlayer && target.unit.isPlayer()) {
        const activeCooldowns = this.getActiveMajorCooldowns(target.unit);
        if (activeCooldowns.length > 0) {
          this.drawCooldownPulseCircle(canvas, target, activeCooldowns);
        }
      }

      // Draw separate target highlighting circle if this is the current target
      if (target.isCurrentTarget && Settings.ESPDrawTargetCircle) {
        this.drawTargetHighlight(canvas, target);
      }

      // Draw information text
      this.drawTargetInformation(canvas, target);
    }
  }

  static getTargetColor(target) {
    // Current target gets priority
    if (target.isCurrentTarget) {
      return colors[Settings.ESPTargetColor] || colors.yellow;
    }
    
    // Special handling for area triggers based on caster relationship
    if (target.unit instanceof wow.CGAreaTrigger) {
      return this.getAreaTriggerCircleColor(target.unit);
    }
    
    // For units, check friend/enemy status first
    if (target.unit instanceof wow.CGUnit) {
      if (target.isFriend) {
        return colors[Settings.ESPFriendColor] || colors.green;
      } else if (target.isEnemy) {
        return colors[Settings.ESPEnemyColor] || colors.red;
      }
    }
    
    // Object type colors for neutral units and objects
    switch (target.objectType) {
      case 'player':
        // Neutral players (shouldn't happen much but fallback)
        return colors[Settings.ESPFriendColor] || colors.green;
      case 'npc':
        return colors[Settings.ESPNPCColor] || colors.gray;
      case 'pet':
        return colors[Settings.ESPPetColor] || colors.purple;
      case 'gameobject':
        return colors[Settings.ESPGameObjectColor] || colors.turquoise;
      case 'dynamicobject':
        return colors[Settings.ESPDynamicObjectColor] || colors.cyan;
      case 'areatrigger':
        return colors[Settings.ESPAreaTriggerColor] || colors.magenta;
      default:
        return colors.white; // Fallback
    }
  }

  static drawTargetCircle(canvas, target, color) {
    const baseRadius = this.getEntityRadius(target);
    const segments = Settings.ESPCircleSegments;
    const thickness = Settings.ESPCircleThickness;
    
    // Draw the circle with glow effect if enabled
    if (Settings.ESPCircleGradient) {
      this.drawGlowCircle(canvas, target, baseRadius, color, segments, thickness);
    } else {
      this.drawSimpleCircle(canvas, target, baseRadius, color, segments, thickness);
    }
  }

    static drawSimpleCircle(canvas, target, radius, color, segments, thickness) {
    // Validate target object before drawing
    if (!target || !target.unit) return;
    
    try {
      // Validate object still exists
      const _ = target.unit.position;
    } catch (error) {
      // Object became invalid, skip drawing
      return;
    }
    
    const step = (2 * Math.PI) / segments;
    const points = [];

    try {
      // Generate circle points in 3D world space
      for (let i = 0; i < segments; i++) {
        const angle = step * i;
        const worldPoint = new Vector3(
          target.unit.position.x + radius * Math.cos(angle),
          target.unit.position.y + radius * Math.sin(angle),
          target.unit.position.z
        );

        const screenPoint = wow.WorldFrame.getScreenCoordinates(worldPoint);
        if (screenPoint && screenPoint.x !== -1) {
          points.push(screenPoint);
        }
      }

      // Draw the circle segments normally
      for (let i = 0; i < points.length; i++) {
        const start = points[i];
        const end = points[(i + 1) % points.length];
        canvas.addLine(start, end, color, thickness);
      }
    } catch (positionError) {
      // Object position became invalid during circle generation
      return;
    }
  }

  static drawGlowCircle(canvas, target, baseRadius, baseColor, segments, thickness) {
    // Validate target object before drawing
    if (!target || !target.unit) return;
    
    try {
      // Validate object still exists
      const _ = target.unit.position;
    } catch (error) {
      // Object became invalid, skip drawing
      return;
    }
    
    const glowLayers = Settings.ESPGlowLayers;
    const step = (2 * Math.PI) / segments;
    
    // Draw multiple concentric circles with decreasing opacity for glow effect
    for (let layer = glowLayers; layer >= 1; layer--) {
      const layerRadius = baseRadius * (0.5 + (layer / glowLayers) * 0.5); // 50% to 100% of base radius
      const layerOpacity = (layer / glowLayers) * 0.8; // Fade from center to edge
      const layerThickness = Math.max(1, thickness * (layer / glowLayers)); // Thicker lines toward edge
      
      // Apply the layer opacity while respecting the base opacity setting
      const currentOpacity = Settings.ESPCircleOpacity / 100; // Convert percentage to decimal
      const finalOpacity = currentOpacity * layerOpacity;
      const layerColor = this.applyOpacity(baseColor, finalOpacity);
      
      const points = [];
      
      try {
        // Generate circle points for this layer
        for (let i = 0; i < segments; i++) {
          const angle = step * i;
          const worldPoint = new Vector3(
            target.unit.position.x + layerRadius * Math.cos(angle),
            target.unit.position.y + layerRadius * Math.sin(angle),
            target.unit.position.z
          );
        
          const screenPoint = wow.WorldFrame.getScreenCoordinates(worldPoint);
          if (screenPoint && screenPoint.x !== -1) {
            points.push(screenPoint);
          }
        }
        
        // Draw this layer of the glow
        for (let i = 0; i < points.length; i++) {
          const start = points[i];
          const end = points[(i + 1) % points.length];
          canvas.addLine(start, end, layerColor, layerThickness);
        }
      } catch (positionError) {
        // Object position became invalid during circle generation, skip this layer
        break;
      }
    }
  }

  static getEntityRadius(target) {
    if (!Settings.ESPUseEntitySize) {
      return Settings.ESPCircleRadius;
    }

    let radius = Settings.ESPCircleRadius;

    try {
      // Handle area triggers - use their boundingRadius
      if (target.unit instanceof wow.CGAreaTrigger) {
        if (target.unit.boundingRadius && target.unit.boundingRadius > 0) {
          radius = Math.max(target.unit.boundingRadius, 1.5); // Minimum 1.5 yards
        }
      }
      // Handle units - use their boundingRadius  
      else if (target.unit instanceof wow.CGUnit) {
        if (target.unit.boundingRadius && target.unit.boundingRadius > 0) {
          radius = Math.max(target.unit.boundingRadius, 1.5); // Minimum 1.5 yards
        }
        
        // Scale by displayScale if available and reasonable (for units only)
        if (target.unit.displayScale && target.unit.displayScale > 0.1 && target.unit.displayScale < 5.0) {
          radius *= target.unit.displayScale;
        }
      }
    } catch (error) {
      // Object became invalid while accessing properties
      console.log(`ESP: Error getting entity radius: ${error.message}`);
      // Use default radius if object access fails
      radius = Settings.ESPCircleRadius;
    }

    // Clamp radius to reasonable bounds
    return Math.min(Math.max(radius, 1), 15);
  }

  static drawLOSLineBorder(canvas, startPos, endPos) {
    const losColor = colors[Settings.ESPLOSColor] || colors.white;
    const baseOpacity = Settings.ESPLOSOpacity / 100;
    
    if (Settings.ESPLOSGlow) {
      const glowLayers = Settings.ESPLOSGlowLayers;
      
      // Draw multiple parallel lines with decreasing opacity for glow effect
      for (let layer = glowLayers; layer >= 1; layer--) {
        const layerOpacity = baseOpacity * (layer / glowLayers) * 0.8;
        const layerColor = this.applyOpacity(losColor, layerOpacity);
        const offset = layer; // Pixel offset for glow layers
        
        // Draw offset lines to create glow effect
        const offsetStart = { x: startPos.x + offset, y: startPos.y };
        const offsetEnd = { x: endPos.x + offset, y: endPos.y };
        canvas.addLine(offsetStart, offsetEnd, layerColor, Settings.ESPLOSThickness);
        
        if (offset > 1) {
          const offsetStart2 = { x: startPos.x - offset, y: startPos.y };
          const offsetEnd2 = { x: endPos.x - offset, y: endPos.y };
          canvas.addLine(offsetStart2, offsetEnd2, layerColor, Settings.ESPLOSThickness);
        }
      }
    } else {
      // Simple border line
      const borderColor = this.applyOpacity(losColor, baseOpacity);
      canvas.addLine(startPos, endPos, borderColor, Settings.ESPLOSThickness);
    }
  }

  static drawLOSCircleBorder(canvas, target) {
    const losColor = colors[Settings.ESPLOSColor] || colors.white;
    const baseRadius = this.getEntityRadius(target);
    const radius = baseRadius + 0.3; // Slightly larger than main circle
    const segments = Settings.ESPCircleSegments;
    const baseOpacity = Settings.ESPLOSOpacity / 100;
    
    if (Settings.ESPLOSGlow) {
      // Use glow effect for LOS circle border
      const glowLayers = Settings.ESPLOSGlowLayers;
      const step = (2 * Math.PI) / segments;
      
      for (let layer = glowLayers; layer >= 1; layer--) {
        const layerRadius = radius + (layer * 0.2); // Slightly expanding radius for glow
        const layerOpacity = baseOpacity * (layer / glowLayers) * 0.7;
        const layerColor = this.applyOpacity(losColor, layerOpacity);
        
        const points = [];
        
        for (let i = 0; i < segments; i++) {
          const angle = step * i;
          const worldPoint = new Vector3(
            target.unit.position.x + layerRadius * Math.cos(angle),
            target.unit.position.y + layerRadius * Math.sin(angle),
            target.unit.position.z
          );
          
          const screenPoint = wow.WorldFrame.getScreenCoordinates(worldPoint);
          if (screenPoint && screenPoint.x !== -1) {
            points.push(screenPoint);
          }
        }
        
        for (let i = 0; i < points.length; i++) {
          const start = points[i];
          const end = points[(i + 1) % points.length];
          canvas.addLine(start, end, layerColor, Settings.ESPLOSThickness);
        }
      }
    } else {
      // Simple LOS border circle
      this.drawSimpleCircle(canvas, target, radius, this.applyOpacity(losColor, baseOpacity), segments, Settings.ESPLOSThickness);
    }
  }

  static drawTargetHighlight(canvas, target) {
    const targetColor = colors[Settings.ESPTargetColor] || colors.yellow;
    const baseRadius = this.getEntityRadius(target);
    const highlightRadius = baseRadius * (Settings.ESPTargetCircleSize / 100);
    const segments = Settings.ESPCircleSegments;
    const thickness = Math.max(2, Settings.ESPCircleThickness + 1);
    
    if (Settings.ESPTargetGlow) {
      // Use glow effect for target highlight
      this.drawGlowCircle(canvas, target, highlightRadius, targetColor, segments, thickness);
    } else {
      // Simple target highlight circle
      this.drawSimpleCircle(canvas, target, highlightRadius, targetColor, segments, thickness);
    }
  }

  static drawCooldownPulseCircle(canvas, target, activeCooldowns) {
    const currentTime = wow.frameTime / 1000; // Convert milliseconds to seconds
    const pulseSpeed = 2.0; // 2 pulses per second
    const minRadius = 2.0; // Minimum radius
    const maxRadius = 4.0; // Maximum radius
    
    // Calculate pulsating radius using a more extreme approach
    const sineWave = Math.sin(currentTime * pulseSpeed * 2 * Math.PI);
    const pulseRadius = minRadius + ((sineWave + 1) / 2) * (maxRadius - minRadius);
    
    // // Debug logging to see if this is working
    // if (Math.floor(currentTime * 4) % 8 === 0) { // Log every 0.25 seconds
    //   console.log(`Pulse Debug: radius=${pulseRadius.toFixed(2)}, sine=${sineWave.toFixed(2)}, time=${currentTime.toFixed(2)}`);
    // }
    
    // Helper function to convert RGB to color format
    const convertRGBToColor = (r, g, b, a = 255) => {
      return (
        ((a & 0xFF) << 24) |  // Alpha
        ((b & 0xFF) << 16) |  // Blue
        ((g & 0xFF) << 8) |   // Green
        (r & 0xFF)            // Red
      ) >>> 0;
    };
    
    // Determine color based on friend/enemy status
    let pulseColor;
    if (target.isFriend) {
      // Greenish colors for friends
      if (activeCooldowns[0].includes("Immunity")) {
        pulseColor = convertRGBToColor(0, 255, 127); // Bright green for friendly immunity
      } else {
        pulseColor = convertRGBToColor(50, 205, 50); // Lime green for friendly cooldowns
      }
    } else if (target.isEnemy) {
      // Reddish colors for enemies
      if (activeCooldowns[0].includes("Immunity")) {
        pulseColor = convertRGBToColor(255, 69, 0); // Orange-red for enemy immunity
      } else {
        pulseColor = convertRGBToColor(220, 20, 60); // Crimson for enemy cooldowns
      }
    } else {
      // Neutral units - use yellow
      pulseColor = convertRGBToColor(255, 215, 0); // Gold for neutral
    }
    
    // Draw the pulsating circle with high visibility
    const segments = 60; // Higher quality for smoother pulsing
    const thickness = 4; // Thicker for better visibility
    
    // Always draw with glow effect for maximum visibility
    this.drawGlowCircle(canvas, target, pulseRadius, pulseColor, segments, thickness);
  }

  static applyOpacity(color, opacity) {
    // Extract RGBA components
    const r = (color) & 0xFF;
    const g = (color >> 8) & 0xFF;
    const b = (color >> 16) & 0xFF;
    const a = Math.floor(opacity * 255);
    
    // Reconstruct color with new alpha
    return (a << 24) | (b << 16) | (g << 8) | r;
  }

  static drawTargetInformation(canvas, target) {
    // Validate target object exists and is still valid
    if (!target || !target.unit) return;
    
    try {
      // Quick validation - try to access a basic property
      const _ = target.unit.guid;
    } catch (error) {
      // Object is invalid, skip rendering
      return;
    }
    
    let yOffset = 5; // Start slightly below the unit
    
    // Show unit name
    if (Settings.ESPShowNames && target.unit) {
      try {
        let unitName;
        
        // Special handling for area triggers - use spell name from spellId
        if (target.unit instanceof wow.CGAreaTrigger) {
          // Double-check validity before processing
          if (!this.isValidAreaTrigger(target.unit)) {
            unitName = "Invalid Area Trigger";
          } else {
            try {
              let spellName = "";
              
              // Get spell name if enabled
              if (Settings.ESPShowAreaTriggerNames) {
                spellName = `Spell ${target.unit.spellId || 0}`;
                
                // Safely get spell ID
                const targetSpellId = target.unit.spellId;
                if (targetSpellId) {
                  // Check cache first to avoid repeated lookups
                  if (this.spellNameCache.has(targetSpellId)) {
                    spellName = this.spellNameCache.get(targetSpellId);
                  } else {
                    try {
                      // Try direct spell object creation (bypasses isKnown check)
                      const directSpell = new wow.Spell(targetSpellId);
                      if (directSpell && directSpell.name) {
                        spellName = directSpell.name;
                        this.spellNameCache.set(targetSpellId, spellName);
                        console.log(`ESP: Found spell name via direct lookup for ID ${targetSpellId}: ${directSpell.name}`);
                      } else {
                        // Try the spell system (works for known spells)
                        const spellObject = spell.getSpell(targetSpellId);
                        if (spellObject && spellObject.name) {
                          spellName = spellObject.name;
                          this.spellNameCache.set(targetSpellId, spellName);
                          console.log(`ESP: Found spell name via spell system for ID ${targetSpellId}: ${spellObject.name}`);
                        } else {
                          // Fallback to common area trigger spell database
                          if (commonAreaTriggerSpells[targetSpellId]) {
                            spellName = commonAreaTriggerSpells[targetSpellId];
                            this.spellNameCache.set(targetSpellId, spellName);
                            console.log(`ESP: Using fallback name for ID ${targetSpellId}: ${spellName}`);
                          } else {
                            // Cache the fallback and log unknown spell IDs
                            this.spellNameCache.set(targetSpellId, spellName);
                            console.log(`ESP: Unknown area trigger spell ID ${targetSpellId} - add to database`);
                          }
                        }
                      }
                    } catch (spellError) {
                      console.log(`ESP: Error looking up spell ${targetSpellId}: ${spellError.message}`);
                      this.spellNameCache.set(targetSpellId, spellName); // Cache the fallback
                    }
                  }
                }
              }
              
              // Add duration info if enabled
              let durationText = "";
              if (Settings.ESPShowAreaTriggerDuration) {
                try {
                  if (target.unit.duration && target.unit.duration > 0) {
                    const guid = target.unit.guid ? target.unit.guid.hash : null;
                    
                    if (guid) {
                      // Track when we first see this area trigger
                      if (!this.areaTriggerTimestamps.has(guid)) {
                        this.areaTriggerTimestamps.set(guid, {
                          firstSeen: wow.frameTime,
                          totalDuration: target.unit.duration
                        });
                      }
                      
                      // Calculate remaining time based on when we first saw it
                      const triggerData = this.areaTriggerTimestamps.get(guid);
                      const elapsed = wow.frameTime - triggerData.firstSeen;
                      const remaining = Math.max(0, triggerData.totalDuration - elapsed);
                      const remainingSeconds = Math.ceil(remaining / 1000);
                      
                      if (remainingSeconds > 0) {
                        durationText = ` (${remainingSeconds}s)`;
                      }
                    }
                  }
                } catch (durationError) {
                  // Duration calculation failed, skip duration display
                }
              }
              
              // Add player count info if enabled
              let playerCountText = "";
              if (Settings.ESPShowAreaTriggerPlayerCount) {
                try {
                  if (target.unit.numPlayersInside !== undefined && target.unit.numPlayersInside > 0) {
                    playerCountText = ` [${target.unit.numPlayersInside}p]`;
                  }
                } catch (playerCountError) {
                  // Player count failed, skip player count display
                }
              }
              
              // Combine all parts
              unitName = spellName + durationText + playerCountText;
              
              // If no information is enabled, show minimal info
              if (!Settings.ESPShowAreaTriggerNames && !Settings.ESPShowAreaTriggerDuration && !Settings.ESPShowAreaTriggerPlayerCount) {
                unitName = "Area Trigger";
              }
            } catch (areaTriggerError) {
              // Area trigger object became invalid, use fallback
              console.log(`ESP: Area trigger object became invalid: ${areaTriggerError.message}`);
              unitName = "Invalid Area Trigger";
            }
          }
        } else {
          unitName = target.unit.unsafeName || target.unit.name;
        }
        
        if (unitName && typeof unitName === 'string' && unitName.trim() !== '') {
          const trimmedName = unitName.trim();
          const { color: textColor, hasShadow } = this.getDisplayColor(target.unit);
          
          // Calculate text width to center it
          const textSize = imgui.calcTextSize(trimmedName);
          const centeredX = target.screenPos.x - (textSize.x / 2);
          
          // Draw shadow effect for class names
          if (hasShadow) {
            canvas.addText(
              trimmedName,
              { x: centeredX + 1, y: target.screenPos.y + yOffset + 1 },
              colors.black || 0xFF000000, // Black shadow using colors.black
              null,
              12
            );
          }
          
          // Draw main text
          canvas.addText(
            trimmedName,
            { x: centeredX, y: target.screenPos.y + yOffset },
            textColor,
            null,
            12
          );
          yOffset += 15;
        }
      } catch (error) {
        console.log(`Error displaying unit name: ${error.message}`);
      }
    }
    
    // Show health percentage
    if (Settings.ESPShowHealth && target.unit && typeof target.unit.pctHealth === 'number' && !isNaN(target.unit.pctHealth)) {
      try {
        const healthText = `${target.unit.pctHealth.toFixed(0)}%`;
        const healthColor = target.unit.pctHealth > 50 ? (colors.green || 0xFF00FF00) : 
                           target.unit.pctHealth > 25 ? (colors.yellow || 0xFFFFFF00) : (colors.red || 0xFFFF0000);
        
        // Calculate text width to center it
        const textSize = imgui.calcTextSize(healthText);
        const centeredX = target.screenPos.x - (textSize.x / 2);
        
        canvas.addText(
          healthText,
          { x: centeredX, y: target.screenPos.y + yOffset },
          healthColor,
          null,
          12
        );
        yOffset += 15;
      } catch (error) {
        console.log(`Error displaying health: ${error.message}`);
      }
    }
    
    // Show major cooldowns
    if (Settings.ESPShowCooldowns && target.unit) {
      try {
        const activeCooldowns = this.getActiveMajorCooldowns(target.unit);
        for (const cooldown of activeCooldowns) {
          if (cooldown && typeof cooldown === 'string' && cooldown.trim() !== '') {
            const cooldownColor = colors.orange || 0xFFFFA500;
            const trimmedCooldown = cooldown.trim();
            
            // Calculate text width to center it
            const textSize = imgui.calcTextSize(trimmedCooldown);
            const centeredX = target.screenPos.x - (textSize.x / 2);
            
            canvas.addText(
              trimmedCooldown,
              { x: centeredX, y: target.screenPos.y + yOffset },
              cooldownColor,
              null,
              11
            );
            yOffset += 12;
          }
        }
      } catch (error) {
        console.log(`Error displaying cooldowns: ${error.message}`);
      }
    }
  }

  static getActiveMajorCooldowns(unit) {
    if (!unit || !unit.auras) return [];
    
    const activeCooldowns = [];
    
    // Use existing PVPData lists but skip minimum duration checks
    for (const aura of unit.auras) {
      if (aura && aura.spellId) {
        // Check damage buffs from PVPData
        if (damageBuffs[aura.spellId]) {
          const remainingSeconds = Math.ceil(aura.remaining / 1000);
          let displayName = damageBuffs[aura.spellId].name;
          if (remainingSeconds > 0) {
            displayName += ` (${remainingSeconds}s)`;
          }
          activeCooldowns.push(displayName);
        }
        // Check immunity buffs from PVPData
        else if (pvpImmunityBuffs[aura.spellId]) {
          const remainingSeconds = Math.ceil(aura.remaining / 1000);
          let displayName = pvpImmunityBuffs[aura.spellId];
          if (remainingSeconds > 0) {
            displayName += ` (${remainingSeconds}s)`;
          }
          activeCooldowns.push(displayName);
        }
      }
    }
    
    return activeCooldowns.slice(0, 3); // Limit to 3 cooldowns to avoid screen clutter
  }

  static calculateTargetPriority(obj, targetInfo) {
    // Priority hierarchy (lower number = higher priority):
    // 1. Enemy players (highest priority)
    // 2. Current target (regardless of type)
    // 3. Enemies targeting me
    // 4. All other players (friends/neutral)
    // 5. My pets
    // 6. Everything else (lowest priority)

    const isPlayer = obj instanceof wow.CGUnit && obj.isPlayer && obj.isPlayer();
    const isCurrentTarget = targetInfo.isCurrentTarget;
    const isTargetingMe = obj instanceof wow.CGUnit && obj.target && obj.target.equals && obj.target.equals(me.guid);
    const isMyPet = this.isMyPet(obj);

    // 1. Enemy players get highest priority
    if (isPlayer && targetInfo.isEnemy) {
      return 1;
    }

    // 2. Current target gets second priority (regardless of what it is)
    if (isCurrentTarget) {
      return 2;
    }

    // 3. Enemies targeting me get third priority
    if (isTargetingMe && targetInfo.isEnemy) {
      return 3;
    }

    // 4. All other players (friends/neutral) get fourth priority
    if (isPlayer) {
      return 4;
    }

    // 5. My pets get fifth priority
    if (isMyPet) {
      return 5;
    }

    // 6. Everything else gets lowest priority
    return 6;
  }

  static isMyPet(obj) {
    if (!(obj instanceof wow.CGUnit)) return false;
    
    // Check if unit is summoned/created by me
    return (obj.summonedBy && obj.summonedBy.equals && obj.summonedBy.equals(me.guid)) ||
           (obj.createdBy && obj.createdBy.equals && obj.createdBy.equals(me.guid)) ||
           (obj.charmedBy && obj.charmedBy.equals && obj.charmedBy.equals(me.guid));
  }

  static worldDistanceToScreenDistance(target, worldDistance) {
    // Calculate screen distance by projecting two points in world space
    const targetWorldPos = target.unit.position;
    
    // Create a reference point at the target's position plus the world distance in X direction
    const refWorldPos = {
      x: targetWorldPos.x + worldDistance,
      y: targetWorldPos.y,
      z: targetWorldPos.z
    };
    
    // Convert both points to screen coordinates
    const targetScreenPos = wow.WorldFrame.getScreenCoordinates(targetWorldPos);
    const refScreenPos = wow.WorldFrame.getScreenCoordinates(refWorldPos);
    
    // Calculate screen distance between the two projected points
    if (targetScreenPos && refScreenPos && targetScreenPos.x !== -1 && refScreenPos.x !== -1) {
      const deltaX = refScreenPos.x - targetScreenPos.x;
      const deltaY = refScreenPos.y - targetScreenPos.y;
      return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    }
    
    // Fallback to rough estimation if projection fails
    return worldDistance * 20;
  }

  static getDisplayColor(unit) {
    // Handle area triggers based on caster relationship
    if (unit instanceof wow.CGAreaTrigger) {
      return this.getAreaTriggerColor(unit);
    }
    
    // Handle regular units
    return this.getNameColor(unit);
  }

  static getAreaTriggerColor(areaTrigger) {
    if (!this.isValidAreaTrigger(areaTrigger)) {
      return { color: colors.white || 0xFFFFFFFF, hasShadow: false };
    }
    
    try {
      // Find the caster unit
      const caster = areaTrigger.caster ? areaTrigger.caster.toUnit() : null;
      
      if (!caster) {
        return { color: colors.gray || 0xFF808080, hasShadow: false };
      }
      
      // Check relationship to player
      if (caster.guid.equals(me.guid)) {
        // Player's own area trigger
        return { color: colors.lightblue || 0xFFADD8E6, hasShadow: false };
      } else if (me.canAttack(caster)) {
        // Enemy area trigger
        return { color: colors.red || 0xFFFF0000, hasShadow: false };
      } else if (caster.inMyGroup && caster.inMyGroup()) {
        // Friendly party/raid member area trigger
        return { color: colors.green || 0xFF00FF00, hasShadow: false };
      } else {
        // Neutral/other friendly area trigger
        return { color: colors.yellow || 0xFFFFFF00, hasShadow: false };
      }
    } catch (error) {
      // Fallback if caster lookup fails
      return { color: colors.gray || 0xFF808080, hasShadow: false };
    }
  }

  static getAreaTriggerCircleColor(areaTrigger) {
    if (!this.isValidAreaTrigger(areaTrigger)) {
      return colors.gray || 0xFF808080;
    }
    
    try {
      // Safely check if object still exists and has caster
      if (!areaTrigger.caster) {
        return colors.gray || 0xFF808080;
      }
      
      // Find the caster unit
      const caster = areaTrigger.caster.toUnit();
      
      if (!caster || !caster.guid) {
        return colors.gray || 0xFF808080;
      }
      
      // Check relationship to player for circle colors
      if (caster.guid.equals(me.guid)) {
        // Player's own area trigger - blue
        return colors.lightblue || 0xFFADD8E6;
      } else if (me.canAttack(caster)) {
        // Enemy area trigger - red
        return colors.red || 0xFFFF0000;
      } else if (caster.inMyGroup && caster.inMyGroup()) {
        // Friendly party/raid member area trigger - green
        return colors.green || 0xFF00FF00;
      } else {
        // Neutral/other friendly area trigger - yellow
        return colors.yellow || 0xFFFFFF00;
      }
    } catch (error) {
      // Object became invalid, use gray
      console.log(`ESP: Area trigger circle color lookup failed: ${error.message}`);
      return colors.gray || 0xFF808080;
    }
  }

  static getNameColor(unit) {
    if (!unit || !unit.hasAura) {
      return { color: colors.white || 0xFFFFFFFF, hasShadow: false };
    }

    // Helper function to convert RGB hex to the same format as Colors.js (ABGR)
    const convertRGBToColor = (r, g, b, a = 255) => {
      return (
        ((a & 0xFF) << 24) |  // Alpha
        ((b & 0xFF) << 16) |  // Blue
        ((g & 0xFF) << 8) |   // Green
        (r & 0xFF)            // Red
      ) >>> 0;
    };

    // Class color mappings using RGB values from hex colors
    const classColors = {
      "Rogue": convertRGBToColor(0xE0, 0xD7, 0x5C),        // #E0D75C
      "Hunter": convertRGBToColor(0xA7, 0xCF, 0x71),       // #A7CF71
      "Shaman": convertRGBToColor(0x02, 0x73, 0xE3),       // #0273E3
      "Paladin": convertRGBToColor(0xF2, 0x8B, 0xBA),      // #F28BBA
      "Warlock": convertRGBToColor(0x86, 0x87, 0xEB),      // #8687EB
      "Druid": convertRGBToColor(0xED, 0x74, 0x09),        // #ED7409
      "Evoker": convertRGBToColor(0x46, 0xCC, 0xB1),       // #46CCB1
      "Warrior": convertRGBToColor(0xE0, 0xB1, 0x7D),      // #E0B17D
      "Mage": convertRGBToColor(0x3E, 0xC6, 0xE8),         // #3EC6E8
      "Demon Hunter": convertRGBToColor(0xB8, 0x36, 0xE3), // #B836E3
      "Death Knight": convertRGBToColor(0xE8, 0x23, 0x44), // #E82344
      "Monk": convertRGBToColor(0x00, 0xD1, 0x7E),         // #00D17E
      "Priest": convertRGBToColor(0xD4, 0xD4, 0xD4)        // #D4D4D4
    };

    // Check for class auras
    for (const [className, color] of Object.entries(classColors)) {
      if (unit.hasAura(className)) {
        return { color: color, hasShadow: true };
      }
    }

    // Default to white with no shadow for non-class units
    return { color: colors.white || 0xFFFFFFFF, hasShadow: false };
  }


}

export default ESP;

