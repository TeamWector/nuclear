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
      imgui.text("2. Copy and import the WeakAura below");
      imgui.text("3. Enable the WeakAura");
      imgui.text("4. Select this rotation profile");
      
      imgui.spacing();
      imgui.textWrapped("WeakAura Import String:");
      
      // WeakAura import string
      const waString = "!WA:2!1E1tVTTrw8O4IwScjajUTbBa6bcb0g7IefBdKCWO7brhjB1vwYlLuCkQlKgsoKCQPMHDMHYY5wn2TTN2d(JGU2f7b9rWFceewSFaYHEP3c6hG(MHK6F2oPffLhKiFZ7)ZV37ntUkR2Bv3vD)H1gsCy0MSyUd(JUXeuSmGXBejjmQi)iK7xhlKy39j0BYpTHNNalZncrDaMoGrOs7DkxVvzRjomwOl7eAZtir4UxK9zzxFCGPYcDptYj((yU4F)j80x))MYtJW2oGjy9ELi2g3htLnJ98idg1zNsnB1PzRswTg6ITbITaM57vU2bvAxZsZQ9EyuOmyQOhWXGOwnpOCTAMXuI0okeDkMBrr9WI8JV9G39x8IPoQOBT1ZBapOyoQdM2VyisiBh5IK4wKEyJ)21UcJBSXLf1c7W61dtb2aLVS4lTkOckjuRe9pHmhuOHtmNdbrQ53fRFl1njElS8JUwV7Zm2O4MgYamvlN6HJLXCQHhkuG1eb)4Te7ZzRzEj4duM0OnKxl55HHSi1FhwpBKCTcj55cR)B0YZf1IiCyy1NbgnlLmh96iT7SqY6rpY4aoPhIFQrpmGwD32OKJdwim2dFmjK8aHbamXCkOe(c5DHHqcXywWKWUbI6M(AXMQLVeHIlRL3gdF5MF1I5HKic4cIL3IGtLbCqLakBb)xePbTqEAbfREMLaNNVlZsAUCgtkyiGYAQLN6XwlvtRRwOqB6XuOcUWufLT3TWEiSzubfgAJCoEBJ2cSY9mCjcfEWWJRmjeit3p05FdIG(aPbQpIeISdXZdUYcMRi9fOtCv4jHrND)YcjPYNLyTumrHfYGZlJkto33Bxv8CIGa2FT1xETIMXsz2o9vq)sBWZ8sBnhBcE4vl3cIaEyk)xYBsPxSKnOe5PxfTIe3l7flIiUSexnZPyJLzx1283jkzEeY1IAEtB2)w6zanZfiFLhNPIIfnkSDb1FtJNfaPnbTOXMzIUMKziWHEg9jiJtcameM)qJEKEeNJH(AAErUUmAs)3D6StasQI)IkvvsTY(jQATc7v(VxTw1oMwvF2ULl8WmB8qJchUxvyyKfqt11u5vZAvU(mh8npjjvDZyF(uKo6Qdt)4gQQ6(q91JfbStscaqV5bnnkzeBh142r6AWyD3ElNaSZX2jFCwsU0vKp6omA64GaotkdX5Y0qaXfBjHXcUNhtthJNFeuW)16XQ9XBHONgTAc3TswVgZN4mi3pV0K3)iDGV6URlM2(91ODEzt75ohP3q73lpTAHQLRrpVHQNLH4xNNCDq(SN)0GSxvzDkKuYJXkax0D1GrCkcyFMl()CJxNng45WPaHy4hFveN5ZblNC8Zp9JUXnpxvtQpz543fo2NabQf2)cgchXZc7R272(EJV1e4t1mhFolM6(dFq0Qs8azhraco15lspNA091e1)4X49qadPVyszu85txUWhlIUZCAyhwiJ)55YLBLxLqnZPml1UvJO3xteoQmdufX5qIRmWSe85RtSfza2vt8BNKCu5Vi1JUqVU6i1eVtHaekUufzarZ6nQxE8T4qCP4zOMrhTBSc8CEAqqLr3PcN8sJ)rmYfsmiJwTwi2ZS0enTtyC3d5OOZom9LehOFYKMUxK4DDIuHw0DRwVEzRoMnA1QX(wv3DVwtMA1MKxIVFAW8IfmHAv9bZB0UvTQ1l)tt8dzNuHJ)Mym150dENnkU1tscm1cxelW7gMMHdotrsj9KKjpnG2yauBOICnm1xg8HJuVNfvN7NjQoRCH6ZNPaiaUyfnNtDoTMdGM5uaFTIwWMqDfEft1RbAc1iWI3vBntibH5b2byIFG8Bndzi3NBlbbOY7z1lousYB5aTNf3B8r5phIIoOqaG31ek(Cu0mfqos9s0DGvlLEXj4QtObbltIqdgY1OzvWp(VWhKD1kcnbGclLNNuQlEQf0YMl)elHcSh94QQYipKd(iOMUbvCKjX)qIV4O9XUe0rnvCjoQuiMllY89pZL1rlzxBpcLicU35aLKo0WDZGI8N(QPe6Oc8GX3o6PZ1(qv4bEoF(wijx1A5gjRpoSR5lzSE5E9XyCujvYrAPcNGTIjUJ(IA1R(ItA3oISz0hKDjrf(hoeN6OGUbVobKPp2Kk5y3ChRYLRpuYC6N024VM7)oOaX9IK(7MCcChZr6JA2uQkjwXcfgfa)DIUemAvi3VtQPGgrG3G7Ad3i1J4NNtOkTIdSMvRn7sVOb3CiWOlj52WNL5WDphrjjBspDSFLlWiHY2Aa77n(wJ3yIBkOupXf0VslIZu8P3W3WShIqRm(FQ5E8)A83n(7H)pEzkRkSFsXTGkOv7))EXV(";
      
      // Text area for the import string (read-only)
      imgui.inputTextMultiline("##waImport", new imgui.MutableVariable(waString), { x: 280, y: 60 }, imgui.InputTextFlags.ReadOnly);
      
      // Copy button
      if (imgui.button("Copy WA Import String", { x: 280, y: 25 })) {
        imgui.setClipboardText(waString);
        console.log("[Hekili] WeakAura import string copied to clipboard!");
      }
      
      imgui.spacing();
      imgui.textWrapped("Import Instructions:");
      imgui.text("1. Copy the string above");
      imgui.text("2. In WoW, type: /wa");
      imgui.text("3. Click 'Import'");
      imgui.text("4. Paste the string and import");
      
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
      try {
        if (prefix === "HEKILI_BRIDGE") {
          this.handleHekiliRecommendation(message);
        }
      } catch (error) {
        console.error(`[Hekili] Error processing HEKILI_BRIDGE message:`, error.message);
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
