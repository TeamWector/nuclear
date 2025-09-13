// Dispel priorities enumeration
export const DispelPriority = {
  None: 0,
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

// Dispels mapping
export const dispels = {
  // Ahn'kahet: The Old Kingdom
  56728: DispelPriority.Low, // Eye in the Dark (OK)
  59108: DispelPriority.Low, // Glutinous Poison (OK)
  56708: DispelPriority.Low, // Contagion of Rot (OK)
  59467: DispelPriority.Low, // Disease shit
  57061: DispelPriority.Low, // Poison Shit

  // Halls of Stone
  50761: DispelPriority.Low, // Pillar of Woe (HOS)

  // The Nexus
  56860: DispelPriority.Low, // Magic burn
  47731: DispelPriority.Low, // Polymorph
  57063: DispelPriority.Low, // Arcane attraction
  57050: DispelPriority.Low, // Crystal Chains
  48179: DispelPriority.Low, // Crystalize
  57091: DispelPriority.Low, // Crystalfire Breath

  // The Oculus
  59261: DispelPriority.Low, // Water Tomb
  59371: DispelPriority.Low, // Amp Magic

  // Pit Of Saron
  69603: DispelPriority.Low, // Blight
  34779: DispelPriority.Low, // Freezing Circle

  // Forge of souls
  69131: DispelPriority.Low, // Lethargy

  // Unsorted
  59168: DispelPriority.Low,  // Light shock
  59178: DispelPriority.Low,  // Poison Spear in HOL
  58967: DispelPriority.Low,  // Poison Spear
  13323: DispelPriority.Low,  // Polymorph
  59237: DispelPriority.Low,  // Hunter's mark
  59271: DispelPriority.Low,  // Poison breath
  59334: DispelPriority.Low,  // Poison Spear
  49106: DispelPriority.Low,  // Fear
  59300: DispelPriority.Low,  // Fetid Rot
  67710: DispelPriority.Low,  // Poison
  34942: DispelPriority.Low,  // SWP
  66619: DispelPriority.Low,  // Shadows of the Past
  66538: DispelPriority.Low,  // Holy fire
  59348: DispelPriority.Low,  // Physical 50%
  59417: DispelPriority.Low,  // Leech
  59352: DispelPriority.Low,  // Giga magic amp
  59397: DispelPriority.Low,  // Ex
  42702: DispelPriority.Low,  // Ex
  72171: DispelPriority.Low,  // Trap
  70176: DispelPriority.Low,  // Damage +20%
  54462: DispelPriority.Low,  // Screech
  59374: DispelPriority.Low,  // Ex
  59281: DispelPriority.Low,  // Ex
  56777: DispelPriority.Low,  // Silence
  47779: DispelPriority.Low,  // Silence
  30849: DispelPriority.Low,  // Ex
  30633: DispelPriority.Low,  // Thunderclap
  56776: DispelPriority.Low,  // Ex
  69527: DispelPriority.Low,  // Breath
  69581: DispelPriority.Low,  // Poison shit
  69583: DispelPriority.Low,  // Fireball
  72318: DispelPriority.Low,  // SWP
  72422: DispelPriority.Low,  // Dodge chance shit
  59727: DispelPriority.Low,  // Sorrow
  59868: DispelPriority.Low,  // Ex
  59845: DispelPriority.Low,  // Elec
  59846: DispelPriority.Low,  // Elec
  59849: DispelPriority.Low,  // Debuff
  59470: DispelPriority.Low,  // Fire shit
  32330: DispelPriority.Low,  // Ex
  51240: DispelPriority.Low,  // Ex
  38047: DispelPriority.Low,  // Ex
  59364: DispelPriority.Low,  // Bite 30%
  394608: DispelPriority.Low, // Infect
  58782: DispelPriority.Low,  // HP drain
  58810: DispelPriority.Low,
  59019: DispelPriority.Low,  // Poison
  66863: DispelPriority.Low,  // Hammer
  66940: DispelPriority.Low,  // Another hammer
  59746: DispelPriority.Low,  // Heal debuff
  59359: DispelPriority.Low,  // Poison sit
  56785: DispelPriority.Low,  // Disease
  70426: DispelPriority.Low,  // Disease ICC
  70409: DispelPriority.Low,  // Fireball ICC
  70408: DispelPriority.Low,  // Amplify ICC

  // Dragonflight
  255814: DispelPriority.Low, // Rending Maul
  250096: DispelPriority.Low, // Wracking Pain
  250372: DispelPriority.Low, // Lingering Nausea
  253562: DispelPriority.Low, // Wildfire
  255371: DispelPriority.Low, // Terrifying Visage
  255041: DispelPriority.Low, // Terrifying Screech
  255582: DispelPriority.Low, // Molten Gold
  252687: DispelPriority.Low, // Venomfang Strike
  257483: DispelPriority.Low, // Pile Of Bones

  // TWW
  325224: DispelPriority.Low,  // Anima Injection
  431494: DispelPriority.Low,  // Black Edge
  324859: DispelPriority.Low,  // Bramblethorn Entanglement
  426735: DispelPriority.Low,  // Burning Shadows
  429545: DispelPriority.Low,  // Censoring Gear
  328664: DispelPriority.Low,  // Chilled
  464876: DispelPriority.Low,  // Concussive Smash
  //  461487: DispelPriority.Low,  // Cultivated Poisons
  450095: DispelPriority.Low,  // Curse of Entropy
  257168: DispelPriority.Low,  // Cursed Slash
  326092: DispelPriority.Low,  // Debilitating Poison
  321821: DispelPriority.Low,  // Disgusting Guts
  322968: DispelPriority.Low,  // Dying Breath
  431309: DispelPriority.Low,  // Ensnaring Shadows
  451224: DispelPriority.Low,  // Enveloping Shadowflame
  //  320788: DispelPriority.Low,  // Frozen Binds
  338353: DispelPriority.Low,  // Goresplatter
  425974: DispelPriority.Low,  // Ground Pound
  320596: DispelPriority.Low,  // Heaving Retch
  449455: DispelPriority.Low,  // Howling Fear
  440238: DispelPriority.Low,  // Ice Sickles
  340283: DispelPriority.Low,  // Poisonous Discharge
  //  275014: DispelPriority.Low,  // Putrid Waters
  448248: DispelPriority.Low,  // Revolting Volley
  272588: DispelPriority.Low,  // Rotting Wounds
  //  424889: DispelPriority.Low,  // Seismic Reverberation
  448561: DispelPriority.Low,  // Shadows of Doubt
  443437: DispelPriority.Low,  // Shadows of Doubt
  322557: DispelPriority.Low,  // Soul Split
  275836: DispelPriority.Low,  // Stinging Venom
  454440: DispelPriority.Low,  // Stinky Vomit
  432448: DispelPriority.Low,  // Stygian Seed
  340288: DispelPriority.Low,  // Triple Bite
  443401: DispelPriority.Low,  // Venom Strike
  433841: DispelPriority.Low,  // Venom Volley
  438618: DispelPriority.Low,  // Venomous Spit
  461630: DispelPriority.Low,  // Venomous Spray
  426308: DispelPriority.Low,  // Void Infection
  440313: DispelPriority.High,  // Void Infection

  // S3
  1213805: DispelPriority.Low, // Nailgun
  1214523: DispelPriority.Low, // Feasting Void
  1215600: DispelPriority.Low, // Withering Touch
  1217821: DispelPriority.Low, // Fiery Jaws
  1219535: DispelPriority.Low, // Rift Claws
  1220390: DispelPriority.Low, // Warp Strike
  1221190: DispelPriority.Low, // Gluttonous Miasma
  1221483: DispelPriority.Low, // Arcing Energy
  1222341: DispelPriority.Low, // Gloom Bite
  1225175: DispelPriority.Low, // Ceremonial Dagger
  1226444: DispelPriority.Low, // Wounded Fate
  1227745: DispelPriority.Low, // Toxic Regurgitation
  1229474: DispelPriority.Low, // Gorge
  1231497: DispelPriority.Low, // Overgorged
  1235060: DispelPriority.Low, // Anima Tainted Armor
  1235245: DispelPriority.Low, // Ankle Bite
  1235368: DispelPriority.Low, // Arcane Slash
  1235762: DispelPriority.Low, // Turn to Stone
  1235766: DispelPriority.Low, // Mortal Strike
  1236126: DispelPriority.Low, // Binding Javelin
  1236513: DispelPriority.Low, // Unstable Anima
  1236614: DispelPriority.Low, // Display of Power
  1237220: DispelPriority.Low, // Stinging Sandstorm
  1237602: DispelPriority.Low, // Gushing Wound
  1240097: DispelPriority.Low, // Time Bomb
  1240912: DispelPriority.Low, // Pierce
  1241785: DispelPriority.Low, // Tainted Blood
  1242678: DispelPriority.Low, // Shadowblades
  1248209: DispelPriority.Low, // Phase Slash
  262268: DispelPriority.Low, // Caustic Compound
  262270: DispelPriority.Low, // Caustic Compound
  268797: DispelPriority.Low, // Transmute: Enemy to Goo
  269302: DispelPriority.Low, // Toxic Blades
  285460: DispelPriority.Low, // Discom-BOMB-ulator
  294195: DispelPriority.Low, // Arcing Zap
  294929: DispelPriority.Low, // Blazing Chomp
  319603: DispelPriority.Low, // Flesh to Stone
  319941: DispelPriority.Low, // Stone Shattering Leap
  321039: DispelPriority.Low, // Disgusting Burst
  322486: DispelPriority.Low, // Overgrowth
  323437: DispelPriority.Low, // Stigma of Pride
  323825: DispelPriority.Low, // Grasping Rift
  324485: DispelPriority.Low, // Harpoon
  325876: DispelPriority.Low, // Mark of Obliteration
  328791: DispelPriority.Low, // Ritual of Woe
  330614: DispelPriority.Low, // Vile Eruption
  330697: DispelPriority.Low, // Decaying Strike
  330700: DispelPriority.Low, // Decaying Blight
  330703: DispelPriority.Low, // Decaying Filth
  330725: DispelPriority.Low, // Shadow Vulnerability
  333299: DispelPriority.Low, // Curse of Desolation
  339237: DispelPriority.Low, // Sinlight Visions
  340300: DispelPriority.Low, // Tongue Lashing
  341902: DispelPriority.Low, // Unholy Fervor
  341949: DispelPriority.Low, // Withering Blight
  341969: DispelPriority.Low, // Withering Discharge
  345598: DispelPriority.Low, // Interrogation
  346006: DispelPriority.Low, // Impound Contraband
  346844: DispelPriority.Low, // Alchemical Residue
  347149: DispelPriority.Low, // Infinite Breath
  347481: DispelPriority.Low, // Shuri
  347716: DispelPriority.Low, // Letter Opener
  349627: DispelPriority.Low, // Gluttony
  349954: DispelPriority.Low, // Purification Protocol
  349987: DispelPriority.Low, // Venting Protocol
  350101: DispelPriority.Low, // Chains of Damnation
  350799: DispelPriority.Low, // Collapsing Star
  350885: DispelPriority.Low, // Hyperlight Jolt
  351096: DispelPriority.Low, // Energy Fragmentation
  351119: DispelPriority.Low, // Shuriken Blitz
  352345: DispelPriority.Low, // Anchor Shot
  355473: DispelPriority.Low, // Shock Mines
  355479: DispelPriority.Low, // Lethal Force
  355641: DispelPriority.Low, // Scintillate
  355830: DispelPriority.Low, // Quickblade
  355915: DispelPriority.Low, // Glyph of Restraint
  356001: DispelPriority.Low, // Beam Splicer
  356324: DispelPriority.Low, // Empowered Glyph of Restraint
  356407: DispelPriority.Low, // Ancient Dread
  356548: DispelPriority.Low, // Radiant Pulse
  356929: DispelPriority.Low, // Chain of Custody
  356943: DispelPriority.Low, // Lockdown
  357029: DispelPriority.Low, // Hyperlight Bomb
  357188: DispelPriority.Low, // Double Technique
  357512: DispelPriority.Low, // Frenzied Charge
  357827: DispelPriority.Low, // Frantic Rip
  358919: DispelPriority.Low, // Static Mace
  424414: DispelPriority.Low, // Pierce Armor
  424420: DispelPriority.Low, // Cinderblast
  424426: DispelPriority.Low, // Lunging Strike
  424621: DispelPriority.Low, // Brutal Smash
  426145: DispelPriority.Low, // Paranoid Mind
  426295: DispelPriority.Low, // Flaming Tether
  426734: DispelPriority.Low, // Burning Shadows
  427621: DispelPriority.Low, // Impale
  427897: DispelPriority.Low, // Heat Wave
  427929: DispelPriority.Low, // Nasty Nibble
  428019: DispelPriority.Low, // Flashpoint
  428161: DispelPriority.Low, // Molten Metal
  428169: DispelPriority.Low, // Blinding Light
  429487: DispelPriority.Low, // Unleash Corruption
  429493: DispelPriority.Low, // Unstable Corruption
  430179: DispelPriority.Low, // Seeping Corruption
  431491: DispelPriority.Low, // Tainted Slash
  432117: DispelPriority.Low, // Cosmic Singularity
  433740: DispelPriority.Low, // Infestation
  433785: DispelPriority.Low, // Grasping Slash
  434083: DispelPriority.Low, // Ambush
  434655: DispelPriority.Low, // Arathi Bombs
  434722: DispelPriority.Low, // Subjugate
  434802: DispelPriority.Low, // Horrifying Shrill
  435165: DispelPriority.Low, // Blazing Strike
  436322: DispelPriority.Low, // Poison Bolt
  436637: DispelPriority.Low, // Burning Ricochet
  437956: DispelPriority.Low, // Erupting Inferno
  438471: DispelPriority.Low, // Voracious Bite
  438599: DispelPriority.Low, // Bleeding Jab
  439202: DispelPriority.Low, // Burning Fermentation
  439324: DispelPriority.Low, // Umbral Weave
  439325: DispelPriority.Low, // Burning Fermentation
  439784: DispelPriority.Low, // Spinneret's Strands
  439790: DispelPriority.Low, // Rolling Acid
  439792: DispelPriority.Low, // Tacky Burst
  441397: DispelPriority.Low, // Bee Venom
  441434: DispelPriority.Low, // Failed Batch
  443427: DispelPriority.Low, // Web Bolt
  443430: DispelPriority.Low, // Silk Binding
  446368: DispelPriority.Low, // Sacrificial Pyre
  446718: DispelPriority.Low, // Umbral Weave
  446776: DispelPriority.Low, // Pounce
  448215: DispelPriority.Low, // Expel Webs
  448492: DispelPriority.Low, // Thunderclap
  448515: DispelPriority.Low, // Divine Judgment
  448787: DispelPriority.Low, // Purification
  448888: DispelPriority.Low, // Erosive Spray
  451098: DispelPriority.Low, // Tacky Nova
  451107: DispelPriority.Low, // Bursting Cocoon
  451119: DispelPriority.Low, // Abyssal Blast
  451606: DispelPriority.Low, // Holy Flame
  451871: DispelPriority.Low, // Mass Tremor
  453345: DispelPriority.Low, // Abyssal Rot
  453461: DispelPriority.Low, // Caltrops
  456773: DispelPriority.Low, // Twilight Wind
  460867: DispelPriority.Low, // Big Bada BOOM!
  462735: DispelPriority.Low, // Blood-Infused Strikes
  462737: DispelPriority.Low, // Black Blood Wound
  463218: DispelPriority.Low, // Volatile Keg
  465813: DispelPriority.Low, // Lethargic Venom
  465820: DispelPriority.Low, // Vicious Chomp
  465827: DispelPriority.Low, // Warp Blood
  466190: DispelPriority.Low, // Thunder Punch
  468631: DispelPriority.Low, // Harpoon
  468672: DispelPriority.Low, // Pinch
  468680: DispelPriority.Low, // Crabsplosion
  468813: DispelPriority.Low, // Gigazap
  469478: DispelPriority.Low, // Sludge Claws
  469610: DispelPriority.Low, // Shadow Fang
  469620: DispelPriority.Low, // Creeping Shadow
  469721: DispelPriority.Low, // Backwash
  469799: DispelPriority.Low, // Overcharge
  470005: DispelPriority.Low, // Vicious Bite
  470038: DispelPriority.Low, // Razorchoke Vines
  473351: DispelPriority.Low, // Electrocrush
  // [473713] = true, Kinetic Explosive Gel

  // Halls of Reflection
  72333: DispelPriority.Low, // Envenom
  72426: DispelPriority.Low, // Lethargy
  72329: DispelPriority.Low, // Poison shit
  72321: DispelPriority.Low, // Cower

  // ***** MYTHIC+ Affix Stuff *****
  409465: DispelPriority.High, // Cursed Spirit
  409470: DispelPriority.High, // Poisoned Spirit
  409472: DispelPriority.High, // Diseased Spirit

  // ***** PVP *****
  1022: DispelPriority.High, // Paladin - Blessing of Protection
  1044: DispelPriority.Medium, // Paladin - Blessing of Freedom
  79206: DispelPriority.High, // Shaman - Spiritwalker's Grace
  190319: DispelPriority.High, // Mage - Combustion
  10060: DispelPriority.High, // Priest - Power Infusion
  12042: DispelPriority.High, // Mage - Arcane Power
  12472: DispelPriority.High, // Mage - Icy Veins
  213610: DispelPriority.High, // Paladin - Holy Ward
  198111: DispelPriority.High, // Mage - Temporal Shield
  210294: DispelPriority.High, // Paladin - Divine Favor
  212295: DispelPriority.High, // Warlock - Nether Ward
  271466: DispelPriority.High, // Priest - Luminous Barrier
  311203: DispelPriority.High, // Paladin - Moment of Glory
  383648: DispelPriority.High, // Shaman - Earth Shield
  21562: DispelPriority.Low, // Priest - Powerword Fortitude
  17: DispelPriority.Medium, // Priest - Powerword Shield
  11426: DispelPriority.High, // Mage - Ice Barrier
  358385: DispelPriority.Medium, // Evoker - Land Slide
  360806: DispelPriority.High, // Evoker - Sleep Walk
  217832: DispelPriority.High, // Demon Hunter - Imprison
  339: DispelPriority.Medium, // Druid - Entangling Roots
  2637: DispelPriority.High, // Druid - Hibernate
  102359: DispelPriority.High, // Druid - Mass Entanglement
  467: DispelPriority.High, // Druid - Thorns
  209790: DispelPriority.High, // Hunter - Freezing Arrow
  3355: DispelPriority.High, // Hunter - Freezing Trap
  19386: DispelPriority.High, // Hunter - Wyvern Sting
  342246: DispelPriority.High, // Mage - Alter Time
  31661: DispelPriority.Medium, // Mage - Dragon's Breath
  122: DispelPriority.Medium, // Mage - Frost Nova
  61305: DispelPriority.High, // Mage - Polymorph (Cat)
  161354: DispelPriority.High, // Mage - Polymorph (Monkey)
  161355: DispelPriority.High, // Mage - Polymorph (Penguin)
  28272: DispelPriority.High, // Mage - Polymorph (Pig)
  161353: DispelPriority.High, // Mage - Polymorph (Polar Bear)
  126819: DispelPriority.High, // Mage - Polymorph (Porcupine)
  61721: DispelPriority.High, // Mage - Polymorph (Rabbit)
  118: DispelPriority.High, // Mage - Polymorph (Sheep)
  61780: DispelPriority.High, // Mage - Polymorph (Turkey)
  28271: DispelPriority.High, // Mage - Polymorph (Turtle)
  20066: DispelPriority.High, // Paladin - Repentance
  853: DispelPriority.High, // Paladin - Hammer of Justice
  8122: DispelPriority.High, // Priest - Psychic Scream
  9484: DispelPriority.Medium, // Priest - Shackle Undead
  375901: DispelPriority.High, // Priest - Mindgames
  64695: DispelPriority.Medium, // Shaman - Earthgrab Totem
  211015: DispelPriority.High, // Shaman - Hex (Cockroach)
  210873: DispelPriority.High, // Shaman - Hex (Compy)
  51514: DispelPriority.High, // Shaman - Hex (Frog)
  211010: DispelPriority.High, // Shaman - Hex (Snake)
  211004: DispelPriority.High, // Shaman - Hex (Spider)
  196942: DispelPriority.High, // Shaman - Voodoo Totem: Hex
  118699: DispelPriority.High, // Warlock - Fear
  5484: DispelPriority.Medium, // Warlock - Howl of Terror
  710: DispelPriority.Medium, // Warlock - Banish
  378464: DispelPriority.Medium, // Evoker - Nullifying Shroud
  // 34914: DispelPriority.High, // Priest - Vampiric Touch - you dispel this, you get 4sec back lash silence, no DR. WHAT!?
  209749: DispelPriority.High // Druid - Faerie Swarm
};

