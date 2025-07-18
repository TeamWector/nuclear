/**
 * Offensive Cooldown Database for PvP Tracking
 * Based on GladiatorLossa2 spell lists and categorized for automation
 */

// Cooldown categories for strategic decision making
export const CooldownCategories = {
  MAGIC_BURST: 'Magic Burst',
  PHYSICAL_BURST: 'Physical Burst',
  DOT_AMPLIFICATION: 'DoT Amplification',
  MAJOR_OFFENSIVE: 'Major Offensive',
  EXECUTE_FINISHER: 'Execute/Finisher',
  AREA_DAMAGE: 'Area Damage',
  PET_SUMMON_BURST: 'Pet/Summon Burst',
  MOBILITY_OFFENSIVE: 'Mobility + Damage',
  STEALTH_POSITIONING: 'Stealth/Positioning',
  CC_SETUP: 'Crowd Control Setup',
  MAJOR_DEFENSIVE: 'Major Defensive',
  IMMUNITY: 'Immunity',
  TRINKET_RACIAL: 'Trinket/Racial'
};

// Offensive cooldown database - extracted from GladiatorLossa2 castSuccess events
export const offensiveCooldowns = {
  // === DEATH KNIGHT ===
  // Major Offensive
  49206: { name: "Summon Gargoyle", category: CooldownCategories.PET_SUMMON_BURST, duration: 25000, cooldown: 180000 },
  207349: { name: "Dark Arbiter", category: CooldownCategories.PET_SUMMON_BURST, duration: 8000, cooldown: 120000 },
  275699: { name: "Apocalypse", category: CooldownCategories.MAJOR_OFFENSIVE, duration: 0, cooldown: 90000 },
  343294: { name: "Soul Reaper", category: CooldownCategories.EXECUTE_FINISHER, duration: 5000, cooldown: 6000 },

  // Burst Windows
  47568: { name: "Empowered Rune Weapon", category: CooldownCategories.PHYSICAL_BURST, duration: 20000, cooldown: 120000 },
  207127: { name: "Hungering Rune Weapon", category: CooldownCategories.PHYSICAL_BURST, duration: 12000, cooldown: 120000 },
  49028: { name: "Dancing Rune Weapon", category: CooldownCategories.PHYSICAL_BURST, duration: 16000, cooldown: 120000 },

  // Area Damage
  152280: { name: "Defile", category: CooldownCategories.AREA_DAMAGE, duration: 30000, cooldown: 30000 },
  279302: { name: "Frostwyrm's Fury", category: CooldownCategories.AREA_DAMAGE, duration: 0, cooldown: 300000 },

  // === DEMON HUNTER ===
  // Major Offensive
  198013: { name: "Eye Beam", category: CooldownCategories.MAJOR_OFFENSIVE, duration: 2000, cooldown: 45000 },
  323639: { name: "The Hunt", category: CooldownCategories.MOBILITY_OFFENSIVE, duration: 0, cooldown: 90000 },
  370965: { name: "The Hunt (Talent)", category: CooldownCategories.MOBILITY_OFFENSIVE, duration: 0, cooldown: 90000 },

  // Area Damage
  179057: { name: "Chaos Nova", category: CooldownCategories.AREA_DAMAGE, duration: 0, cooldown: 60000 },
  258925: { name: "Fel Barrage", category: CooldownCategories.AREA_DAMAGE, duration: 8000, cooldown: 60000 },

  // === DRUID ===
  // Major Offensive
  740: { name: "Tranquility", category: CooldownCategories.MAJOR_OFFENSIVE, duration: 8000, cooldown: 180000 },
  323764: { name: "Convoke the Spirits", category: CooldownCategories.DOT_AMPLIFICATION, duration: 4000, cooldown: 120000 },
  393414: { name: "Convoke the Spirits (Resto)", category: CooldownCategories.DOT_AMPLIFICATION, duration: 4000, cooldown: 120000 },
  391528: { name: "Convoke the Spirits (Feral/Balance)", category: CooldownCategories.DOT_AMPLIFICATION, duration: 4000, cooldown: 120000 },

  // Burst Windows
  274837: { name: "Feral Frenzy", category: CooldownCategories.PHYSICAL_BURST, duration: 6000, cooldown: 45000 },

  // Area Damage
  61391: { name: "Typhoon", category: CooldownCategories.AREA_DAMAGE, duration: 0, cooldown: 30000 },
  132469: { name: "Typhoon", category: CooldownCategories.AREA_DAMAGE, duration: 0, cooldown: 30000 },

  // === EVOKER ===
  // Major Offensive
  357210: { name: "Deep Breath", category: CooldownCategories.MAJOR_OFFENSIVE, duration: 6000, cooldown: 120000 },
  403631: { name: "Breath of Eons", category: CooldownCategories.MAJOR_OFFENSIVE, duration: 8000, cooldown: 120000 },

  // Burst Windows
  365350: { name: "Arcane Surge", category: CooldownCategories.MAGIC_BURST, duration: 15000, cooldown: 90000 },

  // === HUNTER ===
  // Major Offensive
  19574: { name: "Bestial Wrath", category: CooldownCategories.PHYSICAL_BURST, duration: 15000, cooldown: 90000 },
  131894: { name: "A Murder of Crows", category: CooldownCategories.DOT_AMPLIFICATION, duration: 15000, cooldown: 60000 },
  359844: { name: "Call of the Wild", category: CooldownCategories.PET_SUMMON_BURST, duration: 20000, cooldown: 180000 },

  // Area Damage
  121818: { name: "Stampede", category: CooldownCategories.AREA_DAMAGE, duration: 5000, cooldown: 180000 },
  201430: { name: "Stampede", category: CooldownCategories.AREA_DAMAGE, duration: 5000, cooldown: 180000 },
  212431: { name: "Explosive Shot", category: CooldownCategories.AREA_DAMAGE, duration: 0, cooldown: 30000 },

  // === MAGE ===
  // Magic Burst
  190319: { name: "Combustion", category: CooldownCategories.MAGIC_BURST, duration: 12000, cooldown: 120000 },
  12472: { name: "Icy Veins", category: CooldownCategories.MAGIC_BURST, duration: 25000, cooldown: 180000 },
  321507: { name: "Touch of the Magi", category: CooldownCategories.MAGIC_BURST, duration: 10000, cooldown: 45000 },

  // Major Offensive
  153561: { name: "Meteor", category: CooldownCategories.MAJOR_OFFENSIVE, duration: 0, cooldown: 45000 },
  203286: { name: "Greater Pyroblast", category: CooldownCategories.MAJOR_OFFENSIVE, duration: 4500, cooldown: 0 },
  199786: { name: "Glacial Spike", category: CooldownCategories.MAJOR_OFFENSIVE, duration: 3000, cooldown: 0 },

  // Area Damage
  157981: { name: "Blast Wave", category: CooldownCategories.AREA_DAMAGE, duration: 0, cooldown: 25000 },

  // Stealth/Positioning
  66: { name: "Invisibility", category: CooldownCategories.STEALTH_POSITIONING, duration: 20000, cooldown: 300000 },
  110959: { name: "Greater Invisibility", category: CooldownCategories.STEALTH_POSITIONING, duration: 20000, cooldown: 120000 },

  // === MONK ===
  // Major Offensive
  115080: { name: "Touch of Death", category: CooldownCategories.EXECUTE_FINISHER, duration: 0, cooldown: 180000 },
  322109: { name: "Touch of Death", category: CooldownCategories.EXECUTE_FINISHER, duration: 0, cooldown: 180000 },
  113656: { name: "Fists of Fury", category: CooldownCategories.MAJOR_OFFENSIVE, duration: 4000, cooldown: 24000 },
  392983: { name: "Strike of the Windlord", category: CooldownCategories.MAJOR_OFFENSIVE, duration: 0, cooldown: 40000 },

  // Pet/Summon
  123904: { name: "Invoke Xuen", category: CooldownCategories.PET_SUMMON_BURST, duration: 20000, cooldown: 120000 },
  132578: { name: "Invoke Niuzao", category: CooldownCategories.PET_SUMMON_BURST, duration: 25000, cooldown: 180000 },

  // === PALADIN ===
  // Physical Burst
  31884: { name: "Avenging Wrath", category: CooldownCategories.PHYSICAL_BURST, duration: 25000, cooldown: 120000 },
  231895: { name: "Crusade", category: CooldownCategories.PHYSICAL_BURST, duration: 30000, cooldown: 120000 },
  255937: { name: "Wake of Ashes", category: CooldownCategories.MAJOR_OFFENSIVE, duration: 0, cooldown: 45000 },

  // Major Offensive
  343527: { name: "Execution Sentence", category: CooldownCategories.EXECUTE_FINISHER, duration: 8000, cooldown: 60000 },
  343721: { name: "Final Reckoning", category: CooldownCategories.AREA_DAMAGE, duration: 0, cooldown: 120000 },
  427453: { name: "Hammer of Light", category: CooldownCategories.MAJOR_OFFENSIVE, duration: 0, cooldown: 60000 },

  // === PRIEST ===
  // Major Offensive
  34433: { name: "Shadowfiend", category: CooldownCategories.PET_SUMMON_BURST, duration: 15000, cooldown: 180000 },
  451235: { name: "Shadowfiend", category: CooldownCategories.PET_SUMMON_BURST, duration: 15000, cooldown: 180000 },
  123040: { name: "Mindbender", category: CooldownCategories.PET_SUMMON_BURST, duration: 15000, cooldown: 60000 },

  // Magic Burst
  319952: { name: "Surrender to Madness", category: CooldownCategories.MAGIC_BURST, duration: 25000, cooldown: 300000 },
  228260: { name: "Voidform", category: CooldownCategories.MAGIC_BURST, duration: 15000, cooldown: 90000 },

  // Execute/Finisher
  32379: { name: "Shadow Word: Death", category: CooldownCategories.EXECUTE_FINISHER, duration: 0, cooldown: 10000 },

  // === ROGUE ===
  // Physical Burst
  79140: { name: "Vendetta", category: CooldownCategories.DOT_AMPLIFICATION, duration: 20000, cooldown: 120000 },
  360194: { name: "Deathmark", category: CooldownCategories.DOT_AMPLIFICATION, duration: 6000, cooldown: 45000 },
  13750: { name: "Adrenaline Rush", category: CooldownCategories.PHYSICAL_BURST, duration: 20000, cooldown: 180000 },

  // Major Offensive
  385627: { name: "Kingsbane", category: CooldownCategories.DOT_AMPLIFICATION, duration: 14000, cooldown: 60000 },
  280719: { name: "Secret Technique", category: CooldownCategories.MAJOR_OFFENSIVE, duration: 0, cooldown: 45000 },

  // Stealth/Positioning
  1856: { name: "Vanish", category: CooldownCategories.STEALTH_POSITIONING, duration: 10000, cooldown: 90000 },
  1784: { name: "Stealth", category: CooldownCategories.STEALTH_POSITIONING, duration: 10000, cooldown: 2000 },
  115191: { name: "Stealth", category: CooldownCategories.STEALTH_POSITIONING, duration: 10000, cooldown: 2000 },

  // === SHAMAN ===
  // Major Offensive
  198067: { name: "Fire Elemental", category: CooldownCategories.PET_SUMMON_BURST, duration: 30000, cooldown: 150000 },
  198103: { name: "Earth Elemental", category: CooldownCategories.PET_SUMMON_BURST, duration: 60000, cooldown: 300000 },
  192249: { name: "Storm Elemental", category: CooldownCategories.PET_SUMMON_BURST, duration: 30000, cooldown: 150000 },

  // Burst Windows
  114050: { name: "Ascendance (Elemental)", category: CooldownCategories.MAGIC_BURST, duration: 15000, cooldown: 180000 },
  114051: { name: "Ascendance (Enhancement)", category: CooldownCategories.PHYSICAL_BURST, duration: 15000, cooldown: 180000 },
  114052: { name: "Ascendance (Restoration)", category: CooldownCategories.MAGIC_BURST, duration: 15000, cooldown: 180000 },

  // === WARLOCK ===
  // Magic Burst
  113860: { name: "Dark Soul: Misery", category: CooldownCategories.MAGIC_BURST, duration: 20000, cooldown: 120000 },
  113858: { name: "Dark Soul: Instability", category: CooldownCategories.MAGIC_BURST, duration: 20000, cooldown: 120000 },

  // Major Offensive
  1122: { name: "Summon Infernal", category: CooldownCategories.PET_SUMMON_BURST, duration: 30000, cooldown: 180000 },
  265187: { name: "Summon Demonic Tyrant", category: CooldownCategories.PET_SUMMON_BURST, duration: 15000, cooldown: 90000 },
  205179: { name: "Phantom Singularity", category: CooldownCategories.DOT_AMPLIFICATION, duration: 16000, cooldown: 45000 },

  // Area Damage
  152108: { name: "Cataclysm", category: CooldownCategories.AREA_DAMAGE, duration: 0, cooldown: 30000 },

  // === WARRIOR ===
  // Physical Burst
  107574: { name: "Avatar", category: CooldownCategories.PHYSICAL_BURST, duration: 20000, cooldown: 90000 },
  1719: { name: "Recklessness", category: CooldownCategories.PHYSICAL_BURST, duration: 15000, cooldown: 90000 },
  262228: { name: "Deadly Calm", category: CooldownCategories.PHYSICAL_BURST, duration: 20000, cooldown: 60000 },

  // Area Damage
  46924: { name: "Bladestorm", category: CooldownCategories.AREA_DAMAGE, duration: 6000, cooldown: 90000 },
  227847: { name: "Bladestorm", category: CooldownCategories.AREA_DAMAGE, duration: 6000, cooldown: 90000 },
  228920: { name: "Ravager", category: CooldownCategories.AREA_DAMAGE, duration: 12000, cooldown: 45000 },

  // Major Offensive
  167105: { name: "Colossus Smash", category: CooldownCategories.MAJOR_OFFENSIVE, duration: 10000, cooldown: 45000 },
  262161: { name: "Warbreaker", category: CooldownCategories.MAJOR_OFFENSIVE, duration: 10000, cooldown: 45000 },
  385059: { name: "Odyn's Fury", category: CooldownCategories.MAJOR_OFFENSIVE, duration: 0, cooldown: 45000 },

  // === TRINKETS & RACIALS ===
  // PvP Trinkets
  208683: { name: "Gladiator's Medallion", category: CooldownCategories.TRINKET_RACIAL, duration: 0, cooldown: 120000 },
  195710: { name: "Honorable Medallion", category: CooldownCategories.TRINKET_RACIAL, duration: 0, cooldown: 120000 },
  336126: { name: "Gladiator's Medallion", category: CooldownCategories.TRINKET_RACIAL, duration: 0, cooldown: 120000 },
  42292: { name: "PvP Trinket", category: CooldownCategories.TRINKET_RACIAL, duration: 0, cooldown: 120000 },

  // Racial Abilities
  28730: { name: "Arcane Torrent", category: CooldownCategories.TRINKET_RACIAL, duration: 0, cooldown: 120000 },
  20594: { name: "Stoneform", category: CooldownCategories.TRINKET_RACIAL, duration: 8000, cooldown: 120000 },
  58984: { name: "Shadowmeld", category: CooldownCategories.STEALTH_POSITIONING, duration: 0, cooldown: 120000 },
  265221: { name: "Fireblood", category: CooldownCategories.TRINKET_RACIAL, duration: 8000, cooldown: 120000 },

  // === MAJOR DEFENSIVES (for offensive timing) ===
  // Ice Block, Divine Shield, etc.
  45438: { name: "Ice Block", category: CooldownCategories.IMMUNITY, duration: 10000, cooldown: 240000 },
  642: { name: "Divine Shield", category: CooldownCategories.IMMUNITY, duration: 8000, cooldown: 300000 },
  31224: { name: "Cloak of Shadows", category: CooldownCategories.IMMUNITY, duration: 5000, cooldown: 90000 },
  198589: { name: "Blur", category: CooldownCategories.MAJOR_DEFENSIVE, duration: 10000, cooldown: 60000 },
  212800: { name: "Blur", category: CooldownCategories.MAJOR_DEFENSIVE, duration: 10000, cooldown: 60000 },
};

// Helper functions for cooldown management
export const cooldownHelpers = {
  /**
   * Get cooldown info by spell ID
   */
  getCooldownBySpellID(spellId) {
    return offensiveCooldowns[spellId] || null;
  },

  /**
   * Get all cooldowns by category
   */
  getCooldownsByCategory(category) {
    return Object.entries(offensiveCooldowns)
      .filter(([_, cooldown]) => cooldown.category === category)
      .reduce((acc, [spellId, cooldown]) => {
        acc[spellId] = cooldown;
        return acc;
      }, {});
  },

  /**
   * Check if spell ID is a tracked offensive cooldown
   */
  isOffensiveCooldown(spellId) {
    return spellId in offensiveCooldowns;
  },

  /**
   * Get category priority for threat assessment
   */
  getCategoryPriority(category) {
    const priorities = {
      [CooldownCategories.EXECUTE_FINISHER]: 10,
      [CooldownCategories.MAGIC_BURST]: 9,
      [CooldownCategories.PHYSICAL_BURST]: 9,
      [CooldownCategories.DOT_AMPLIFICATION]: 8,
      [CooldownCategories.MAJOR_OFFENSIVE]: 7,
      [CooldownCategories.PET_SUMMON_BURST]: 6,
      [CooldownCategories.AREA_DAMAGE]: 5,
      [CooldownCategories.MOBILITY_OFFENSIVE]: 4,
      [CooldownCategories.CC_SETUP]: 3,
      [CooldownCategories.STEALTH_POSITIONING]: 2,
      [CooldownCategories.IMMUNITY]: 8, // High priority for defensive timing
      [CooldownCategories.MAJOR_DEFENSIVE]: 7,
      [CooldownCategories.TRINKET_RACIAL]: 6,
    };
    return priorities[category] || 1;
  },

  /**
   * Estimate remaining cooldown time
   */
  estimateRemainingCooldown(spellId, lastUsedTime) {
    const cooldown = this.getCooldownBySpellID(spellId);
    if (!cooldown) return 0;

    const elapsed = Date.now() - lastUsedTime;
    const remaining = cooldown.cooldown - elapsed;
    return Math.max(0, remaining);
  }
};

export default offensiveCooldowns;
