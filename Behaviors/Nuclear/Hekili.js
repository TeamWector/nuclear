import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '../../Core/BehaviorTree';
import Specialization from '../../Enums/Specialization';
import common from '../../Core/Common';
import spell from "../../Core/Spell";
import { me } from "../../Core/ObjectManager";
import Settings from "../../Core/Settings";

export class HekiliBehavior extends Behavior {
  name = "Nuclear Hekili Integration";
  context = BehaviorContext.Any;
  specialization = Specialization.All;
  version = 1;

  static lastCastTime = 0;
  static lastRecommendation = null;

  static settings = [
    {
      header: "Hekili Integration",
      options: [
        { type: "checkbox", uid: "HekiliDebugMode", text: "Debug Mode (show recommendations)", default: true },
        { type: "slider", uid: "HekiliCastDelay", text: "Cast delay (ms)", min: 100, max: 2000, default: 500 },
        { type: "checkbox", uid: "HekiliOnlyInCombat", text: "Only cast in combat", default: true },
        { type: "checkbox", uid: "HekiliRequireTarget", text: "Require valid target", default: true }
      ]
    }
  ];

  constructor() {
    super();
    // The event listener is a static instance, no need to create it here
  }

  build() {
    return new bt.Selector(
      common.waitForNotMounted(),
      new bt.Action(() => {
        // Render overlay
        this.renderOverlay();
        
        // Early exit if no target and target is required
        if (Settings.HekiliRequireTarget && !me.targetUnit) {
          return bt.Status.Success;
        }
        return bt.Status.Failure;
      }),
      new bt.Action(() => {
        // Early exit if not in combat and combat is required
        if (Settings.HekiliOnlyInCombat && !me.inCombat()) {
          return bt.Status.Success;
        }
        return bt.Status.Failure;
      }),
      common.waitForCastOrChannel(),
      
      // Main Hekili integration logic
      new bt.Action(() => {
        this.processHekiliRecommendation();
        return bt.Status.Failure; // Always continue
      })
    );
  }
  
  renderOverlay() {
    if (!me) return;

    const viewport = imgui.getMainViewport();
    if (!viewport) return;
    
    const workPos = viewport.workPos;
    const workSize = viewport.workSize;
    
    const overlaySize = { x: 300, y: 200 };
    const overlayPos = { 
      x: workPos.x + workSize.x - overlaySize.x - 20, 
      y: workPos.y + 20 
    };

    imgui.setNextWindowPos(overlayPos, imgui.Cond.FirstUseEver);
    imgui.setNextWindowSize(overlaySize, imgui.Cond.FirstUseEver);
    imgui.setNextWindowBgAlpha(0.30);
    
    const windowFlags = imgui.WindowFlags.NoResize | imgui.WindowFlags.AlwaysAutoResize;
    const showOverlay = new imgui.MutableVariable(true);

    if (imgui.begin("Hekili Integration", showOverlay, windowFlags)) {
      
      // Status
      if (HekiliBehavior.lastRecommendation) {
        imgui.textColored({ r: 0.2, g: 1.0, b: 0.2, a: 1.0 }, "ACTIVE");
        imgui.text(`Current: ${HekiliBehavior.lastRecommendation.spellName}`);
        imgui.text(`Spell ID: ${HekiliBehavior.lastRecommendation.spellId}`);
      } else {
        imgui.textColored({ r: 1.0, g: 0.8, b: 0.2, a: 1.0 }, "Waiting for recommendations");
      }
      
      imgui.spacing();
      imgui.separator();
      
      // Setup instructions
      imgui.textWrapped("Setup Instructions:");
      imgui.text("1. Install Hekili addon");
      imgui.text("2. Install HekiliNuclearBridge addon");
      imgui.text("3. Restart WoW or reload UI (/reload)");
      imgui.text("4. Select this rotation profile");
      
      imgui.spacing();
      imgui.textWrapped("Bridge addon location:");
      imgui.text("Place the HekiliNuclearBridge folder in:");
      imgui.textWrapped("WoW/_retail_/Interface/AddOns/");
      
      imgui.end();
    }
  }

  processHekiliRecommendation() {
    const recommendation = HekiliBehavior.lastRecommendation;
    if (!recommendation) {
      if (Settings.HekiliDebugMode) {
        console.log("[Hekili] No recommendation available");
      }
      return;
    }
    
    if (Settings.HekiliDebugMode) {
      console.log(`[Hekili] Processing recommendation: ${recommendation.spellName} (ID: ${recommendation.spellId})`);
    }

    // Check cast delay
    const currentTime = Date.now();
    if (currentTime - HekiliBehavior.lastCastTime < Settings.HekiliCastDelay) {
      return;
    }

    try {
      // Get the spell object
      let spellObject = null;
      
      // Try by spell ID first
      if (recommendation.spellId) {
        spellObject = spell.getSpell(recommendation.spellId);
      }
      
      // Try by spell name if ID failed
      if (!spellObject && recommendation.spellName) {
        spellObject = spell.getSpell(recommendation.spellName);
      }

      if (spellObject) {
        const target = me.targetUnit || me;
        
        if (Settings.HekiliDebugMode) {
          console.log(`[Hekili] Attempting to cast: ${recommendation.spellName} (ID: ${recommendation.spellId})`);
        }
        
        const success = spell.castPrimitive(spellObject, target);
        
        if (success) {
          HekiliBehavior.lastCastTime = currentTime;
          if (Settings.HekiliDebugMode) {
            console.log(`[Hekili] Successfully cast: ${recommendation.spellName}`);
          }
        } else if (Settings.HekiliDebugMode) {
          console.log(`[Hekili] Failed to cast: ${recommendation.spellName}`);
        }
      } else if (Settings.HekiliDebugMode) {
        console.warn(`[Hekili] Spell not found: ${recommendation.spellName} (ID: ${recommendation.spellId})`);
      }
      
    } catch (error) {
      if (Settings.HekiliDebugMode) {
        console.error(`[Hekili] Error executing recommendation:`, error.message);
      }
    }
  }
}

class HekiliEventListener extends wow.EventListener {
  onEvent(event) {
    if (event.name === 'CHAT_MSG_ADDON') {
      const [prefix, message, channel, sender] = event.args;
      console.log(`[Hekili] Received addon message: prefix=${prefix}, message=${message}`);
      if (prefix === "HEKILI_BRIDGE") {
        console.log(`[Hekili] Processing HEKILI_BRIDGE message: ${message}`);
        this.handleHekiliRecommendation(message);
      }
    }
  }

  handleHekiliRecommendation(message) {
    try {
      // Parse the message from bridge addon
      // Expected format: "spellId:spellName" or just "spellId"
      const parts = message.split(':');
      const spellId = parseInt(parts[0]);
      const spellName = parts[1] || `Spell ${spellId}`;
      
      if (isNaN(spellId) || spellId <= 0) {
        if (Settings.HekiliDebugMode) {
          console.warn(`[Hekili] Invalid spell ID: ${message}`);
        }
        return;
      }
      
      const recommendation = { spellId, spellName };
      
      // Check if this is a new recommendation
      if (!HekiliBehavior.lastRecommendation || 
          HekiliBehavior.lastRecommendation.spellId !== recommendation.spellId) {
        
        HekiliBehavior.lastRecommendation = recommendation;
        
        if (Settings.HekiliDebugMode) {
          console.log(`[Hekili] New recommendation: ${spellName} (ID: ${spellId})`);
        }
      }
    } catch (error) {
      if (Settings.HekiliDebugMode) {
        console.error("[Hekili] Error parsing recommendation:", error.message);
      }
    }
  }
}

// Create the global event listener instance
const hekiliEventListener = new HekiliEventListener();
