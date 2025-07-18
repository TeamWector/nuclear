export const WoWAuraFlags = {
  NoCaster: 0x0001,
  Positive: 0x0002,
  Duration: 0x0004,
  Scalable: 0x0008,
  Negative: 0x0010,
};

export const WoWDispelType = {
  None: 0,
  Magic: 1,
  Curse: 2,
  Disease: 3,
  Poison: 4,
  Stealth: 5,
  Invisibility: 6,
  All: 7,
  Enrage: 9
};

export const HealImmune = {
  Insanity : 57512,
  BigBoyICC: 70405,
  SpiritFormHoly: 27827,

  // PVP
  Cyclone: 33786,

}

export const PVPImmuneToCC = {
  // Priest
  PhaseShift: 408558, // Priest - Phase Shift
  SpiritOfRedemption: 215769, // Priest - Spirit of Redemption
  UltimatePenitence: 421453, // Ultimate Penitence
  HolyWard: 213610,
  // Druid
  Cyclone: 33786, // Cyclone (already in HealImmune but also CC immune)
  AncientOfLore: 473909, // Ancient of Lore
  // Rogue
  SmokeScreen: 76577, // Smoke Bomb (creates area effect)
  // Paladin
  BlessingOfSpellWarden: 204018, // Spell warden
  DivineShield: 642, // Divine Shield
  BlessingOfProtection: 1022, // BoP
  // Mage
  IceBlock: 45438, // Ice Block
  // Evoker
  NullifyingShroud: 378464, // Dragon - Nullifying Shroud
  EmeraldCommunion: 370960, // Emerald Communion (Dragon talent)
  // Death Knight
  AntiMagicShell: 48707, // AMS (magic cc immune - poly, clone, etc)
  AntiMagicShell2: 410358, // AMS (magic cc immune - poly, clone, etc)
  IceboundFortitude: 48792, // icebound why not
  // Shaman
  GroundingTotem: 8178, // Grounding Totem (grounds magic spells)
  Burrow: 409293, // Shaman - Burrow
  // Monk
  Revival: 115310, // Monk - Revival
  // Mage (Precognition)
  Precognition2: 377362, // Precognition (variant)
  // Warrior
  Bladestorm: 46924, // Warrior - Bladestorm
  // Warlock
  NetherWard: 212295, // Warlock - nether ward
  // Demon hunter
  NetherWalk: 196555, // Netherwalk
}


export const SpecialHealImmune = {
  // PVP
  ShadowyDuelRogue: 207736,
}
