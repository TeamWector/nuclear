import { Behavior, BehaviorContext } from "@/Core/Behavior";
import * as bt from '@/Core/BehaviorTree';
import Specialization from '@/Enums/Specialization';
import common from '@/Core/Common';
import spell from "@/Core/Spell";
import objMgr, { me } from "@/Core/ObjectManager";
import { PowerType } from "@/Enums/PowerType";
import { defaultCombatTargeting as combat } from "@/Targeting/CombatTargeting";
import Settings from "@/Core/Settings";
import drTracker from "@/Core/DRTracker";
import pvpData, { pvpHelpers, pvpReflect, pvpInterrupts } from "@/Data/PVPData";
import { drHelpers } from "@/Data/PVPDRList";
import { toastInfo, toastSuccess, toastWarning, toastError } from '@/Extra/ToastNotification';
import CommandListener from '@/Core/CommandListener';

export class JmrSimcBeastMasteryBehavior extends Behavior {
  context = BehaviorContext.Any;
  specialization = Specialization.Hunter.BeastMastery;
  version = wow.GameVersion.Retail;
  name = "Jmr SimC Beast Mastery Hunter";

  // Runtime toggles for overlay (independent of settings)
  overlayToggles = {
    showOverlay: new imgui.MutableVariable(true),
    interrupts: new imgui.MutableVariable(true),
    bestialWrath: new imgui.MutableVariable(true),
    callOfTheWild: new imgui.MutableVariable(true),
    bloodshed: new imgui.MutableVariable(true),
    counterShot: new imgui.MutableVariable(true),
    binding: new imgui.MutableVariable(true),
    intimidation: new imgui.MutableVariable(true),
    defensives: new imgui.MutableVariable(true),
    manualTrap: new imgui.MutableVariable(true),
    chimaeralSting: new imgui.MutableVariable(true)
  };

  // Burst mode toggle state
  burstModeActive = false;
  
  // Manual spell casting
  spellIdInput = new imgui.MutableVariable("193455");
  
  // Target variables for APL
  currentTarget = null;
  activeEnemies = 1;

  static settings = [
    {
      header: "PVP Settings",
      options: [
        { type: "checkbox", uid: "EnablePVPRotation", text: "Enable PVP Rotation", default: false },
        { type: "checkbox", uid: "UseBinding", text: "Use Binding Shot", default: true },
        { type: "checkbox", uid: "UseIntimidation", text: "Use Intimidation", default: true },
        { type: "checkbox", uid: "UseFearBeast", text: "Use Scare Beast", default: true },
        { type: "checkbox", uid: "UseTarTrap", text: "Use Tar Trap", default: true },
        { type: "checkbox", uid: "UseFreezingTrap", text: "Use Freezing Trap", default: true },
        { type: "checkbox", uid: "UseConcussiveShot", text: "Use Concussive Shot", default: true },
        { type: "slider", uid: "ConcussiveShotCooldown", text: "Concussive Shot Cooldown (seconds)", min: 8, max: 20, default: 12 }
      ]
    },
    {
      header: "Defensive Abilities",
      options: [
        { type: "checkbox", uid: "UseAspectOfTheCheetah", text: "Use Aspect of the Cheetah", default: true },
        { type: "slider", uid: "AspectOfTheCheetahHealthPct", text: "Aspect of the Cheetah Health %", min: 20, max: 60, default: 40 },
        { type: "checkbox", uid: "UseExhilaration", text: "Use Exhilaration", default: true },
        { type: "slider", uid: "ExhilarationHealthPct", text: "Exhilaration Health %", min: 30, max: 70, default: 50 },
        { type: "checkbox", uid: "UseFortitudeOfTheBear", text: "Use Fortitude of the Bear", default: true },
        { type: "slider", uid: "FortitudeOfTheBearHealthPct", text: "Fortitude of the Bear Health %", min: 20, max: 50, default: 30 },
        { type: "checkbox", uid: "UseSurvivalOfTheFittest", text: "Use Survival of the Fittest", default: true },
        { type: "slider", uid: "SurvivalOfTheFittestHealthPct", text: "Survival of the Fittest Health %", min: 30, max: 70, default: 50 },
        { type: "checkbox", uid: "UseMastersCall", text: "Use Master's Call (Root Break)", default: true }
      ]
    },
    {
      header: "Interrupts & Utility",
      options: [
        { type: "checkbox", uid: "UseCounterShot", text: "Use Counter Shot (Interrupt)", default: true },
        { type: "checkbox", uid: "UseIntimidationInterrupt", text: "Use Intimidation (Interrupt)", default: true },
      { type: "checkbox", uid: "UseFeignDeath", text: "Use Feign Death (PVP)", default: true },
      { type: "checkbox", uid: "UseTranquilizingShot", text: "Use Tranquilizing Shot", default: true },
      { type: "checkbox", uid: "UseExplosiveTrap", text: "Use High Explosive Trap", default: true },
      { type: "checkbox", uid: "UseBurstingShot", text: "Use Bursting Shot", default: true }
      ]
    },
    {
      header: "Major Cooldowns", 
      options: [
        { type: "checkbox", uid: "UseBestialWrath", text: "Use Bestial Wrath", default: true },
        { type: "checkbox", uid: "UseCallOfTheWild", text: "Use Call of the Wild", default: true },
        { type: "checkbox", uid: "UseBloodshed", text: "Use Bloodshed", default: true }
      ]
    },
    {
      header: "Pet Management",
      options: [
        { type: "checkbox", uid: "AutoRevivePet", text: "Auto Revive Pet", default: true },
        { type: "checkbox", uid: "AutoMendPet", text: "Auto Mend Pet", default: true },
        { type: "slider", uid: "MendPetHealthPct", text: "Mend Pet Health %", min: 30, max: 80, default: 60 }
      ]
    },
    {
      header: "Time to Death Settings",
      options: [
        { type: "checkbox", uid: "IgnoreTimeToDeath", text: "Ignore Time to Death (Use abilities regardless)", default: false },
        { type: "slider", uid: "MinTimeToDeath", text: "Minimum Time to Death (seconds)", min: 5, max: 60, default: 15 }
      ]
    }
  ];

  build() {    
    return new bt.Selector(
      // Overlay rendering - runs every frame FIRST
      new bt.Action(() => {
        this.renderOverlay();
        
                 // Manual spell casting with RightArrow
         if (imgui.isKeyPressed(imgui.Key.RightArrow)) {
           const target = me.targetUnit || me;
           const spellId = parseInt(this.spellIdInput.value || "0", 10);
           const spellObject = spell.getSpell(spellId);

           if (spellObject) {
             const spellName = spellObject.name || "Unknown Spell";
             const targetName = target.unsafeName || "Unknown Target";
             console.log(`Casting spell "${spellName}" (ID: ${spellId}) on ${targetName}`);
             spell.castPrimitive(spellObject, target);
           } else {
             console.log(`Spell ID ${spellId} not found. Please enter a valid spell ID.`);
           }
         }
        
        return bt.Status.Failure; // Always continue to the rest of the rotation
      }),
      
      common.waitForNotMounted(),
      new bt.Action(() => {
        if (this.getCurrentTarget() === null) {
          return bt.Status.Success;
        }
        return bt.Status.Failure;
      }),
      common.waitForCastOrChannel(),
      
      // Auto shot
      new bt.Action(() => {
        // Auto shot is handled automatically by the game
        return bt.Status.Failure;
      }),
      
      // Pet management
      this.buildPetManagement(),
      
      // PVP rotation takes priority if enabled
      new bt.Decorator(
        () => Settings.EnablePVPRotation,
        this.buildPVPRotation(),
        new bt.Action(() => bt.Status.Success)
      ),
      
      // Standard rotation if PVP is disabled
      new bt.Decorator(
        () => !Settings.EnablePVPRotation,
        new bt.Selector(
          // Defensive abilities
          this.buildDefensives(),
          
          // Calculate variables
          new bt.Action(() => {
            this.currentTarget = this.getCurrentTarget();
            this.activeEnemies = this.getEnemiesInRange(40);
            return bt.Status.Failure;
          }),
          
          // Cooldowns
          this.buildCooldowns(),
          
          // Trinkets when appropriate
          new bt.Decorator(
            () => this.shouldUseCooldowns() && (me.hasVisibleAura("Call of the Wild") || me.hasVisibleAura("Bestial Wrath")),
            this.useTrinkets(),
            new bt.Action(() => bt.Status.Success)
          ),
          
          // Use racials when appropriate  
          new bt.Decorator(
            () => this.shouldUseCooldowns() && (me.hasVisibleAura("Call of the Wild") || me.hasVisibleAura("Bestial Wrath")),
            this.useRacials(),
            new bt.Action(() => bt.Status.Success)
          ),
          
          // Single target vs cleave/aoe
          new bt.Decorator(
            () => (this.getEnemiesInRangeOfPet(10) < 3),
            this.buildSingleTarget(),
            new bt.Action(() => bt.Status.Success)
          ),
          new bt.Decorator(
            () => (this.getEnemiesInRangeOfPet(10) > 2),
            this.buildCleave(),
            new bt.Action(() => bt.Status.Success)
          )
        ),
        new bt.Action(() => bt.Status.Success)
      )
    );
  }

  renderOverlay() {
    // Safety check
    if (!me) return;
    
    if (!this.overlayToggles.showOverlay.value) {
      return;
    }

    // Handle burst mode toggle with 'X' key
    if (imgui.isKeyPressed(imgui.Key.X)) {
      this.burstModeActive = !this.burstModeActive;
      console.log("Beast Mastery Burst Mode:", this.burstModeActive ? "ACTIVATED" : "DEACTIVATED");
    }

    // Handle manual Freezing Trap with 'Q' key
    if (imgui.isKeyPressed(imgui.Key.H) && this.overlayToggles.manualTrap.value) {
      this.castManualFreezingTrap();
    }

    const viewport = imgui.getMainViewport();
    if (!viewport) {
      return;
    }
    
    const workPos = viewport.workPos;
    const workSize = viewport.workSize;
    
    // Position overlay in top-right corner
    const overlaySize = { x: 280, y: Settings.EnablePVPRotation ? 450 : 300 };
    const overlayPos = { 
      x: workPos.x + workSize.x - overlaySize.x - 20, 
      y: workPos.y + 20 
    };

    imgui.setNextWindowPos(overlayPos, imgui.Cond.FirstUseEver);
    imgui.setNextWindowSize(overlaySize, imgui.Cond.FirstUseEver);
    
    // Make background more opaque
    imgui.setNextWindowBgAlpha(0.50);
    
    // Window flags for overlay behavior
    const windowFlags = 
      imgui.WindowFlags.NoResize |
      imgui.WindowFlags.AlwaysAutoResize;

    const windowTitle = Settings.EnablePVPRotation ? "Beast Mastery PVP Controls" : "Beast Mastery Controls";
    if (imgui.begin(windowTitle, this.overlayToggles.showOverlay, windowFlags)) {

      // Pet Info
      // if (imgui.collapsingHeader("Pet Info", imgui.TreeNodeFlags.DefaultOpen)) {
      //   imgui.indent();
      //   const pet = me.pet;
      //   if (pet) {
      //     const petName = pet.unsafeName || "Unknown Pet";
      //     const petHealth = pet.pctHealth || 0;
      //     //imgui.textColored({ r: 0.2, g: 1.0, b: 0.2, a: 1.0 }, `Pet: ${petName} (${petHealth.toFixed(0)}%)`);
      //     const beastCleaveStacks = pet.getAuraStacks ? pet.getAuraStacks("Beast Cleave") || 0 : 0;
      //     if (beastCleaveStacks > 0) {
      //       imgui.textColored({ r: 1.0, g: 1.0, b: 0.2, a: 1.0 }, `Beast Cleave: ${beastCleaveStacks}`);
      //     }
      //   } else {
      //     imgui.textColored({ r: 1.0, g: 0.2, b: 0.2, a: 1.0 }, "No Pet Active");
      //   }

        // Pet testing code - commented out for now
        /*
        // Enhanced pet-to-player linking test using objMgr.objects directly
        const nearbyUnits = [];
        let totalObjectsChecked = 0;
        
        // Iterate through all objects in objMgr.objects
        objMgr.objects.forEach((obj) => {
          totalObjectsChecked++;
          if (obj instanceof wow.CGUnit) {
            const distance = me.distanceTo(obj);
            if (distance <= 10) {
              nearbyUnits.push(obj);
            }
          }
        });
        
        imgui.textColored({ r: 1.0, g: 1.0, b: 0.2, a: 1.0 }, `Debug: Checked ${totalObjectsChecked} objects, found ${nearbyUnits.length} units within 40yd`);
        
        for (const unit of nearbyUnits) {
          // Debug each unit's properties
          const debugInfo = {
            name: unit.unsafeName || "Unknown",
            isPlayer: unit.isPlayer(),
            summonedBy: unit.summonedBy ? (unit.summonedBy.isNull ? "null" : "has value") : "undefined",
            createdBy: unit.createdBy ? (unit.createdBy.isNull ? "null" : "has value") : "undefined",
            charmedBy: unit.charmedBy ? (unit.charmedBy.isNull ? "null" : "has value") : "undefined",
            demonCreator: unit.demonCreator ? (unit.demonCreator.isNull ? "null" : "has value") : "undefined",
            petNumber: unit.petNumber || 0,
            creatureType: unit.creatureType || "undefined",
            creatureFamily: unit.creatureFamily || "undefined"
          };
          
          // Only show non-player units for debugging
          if (!unit.isPlayer()) {
            imgui.textColored({ r: 0.8, g: 0.8, b: 0.8, a: 1.0 }, 
              `${debugInfo.name}: sumBy=${debugInfo.summonedBy}, creBy=${debugInfo.createdBy}, petNum=${debugInfo.petNumber}`);
          }
          
          let petInfo = this.analyzePetOwnership(unit);
          if (petInfo.isPlayerPet) {
            const colorCode = petInfo.isMine ? { r: 0.2, g: 1.0, b: 0.2, a: 1.0 } : { r: 0.2, g: 0.2, b: 1.0, a: 1.0 };
            const ownerName = petInfo.ownerName || "Unknown";
            const displayText = petInfo.isMine ? 
              `My Pet: ${unit.unsafeName} (${unit.pctHealth.toFixed(0)}%) [${petInfo.linkMethod}]` :
              `${ownerName}'s Pet: ${unit.unsafeName} (${unit.pctHealth.toFixed(0)}%) [${petInfo.linkMethod}]`;
            imgui.textColored(colorCode, displayText);
            
            // Additional pet details
            if (petInfo.petType) {
              imgui.sameLine();
              imgui.textColored({ r: 0.8, g: 0.8, b: 0.8, a: 1.0 }, ` [${petInfo.petType}]`);
            }
          }
        }
        */
        //   imgui.unindent();
        // }

      
      // PVP Mode indicator
      if (Settings.EnablePVPRotation) {
        imgui.spacing();
        imgui.pushStyleColor(imgui.Col.Text, { r: 1.0, g: 0.2, b: 0.2, a: 1.0 });
        imgui.text("PVP MODE ACTIVE");
        imgui.popStyleColor();
        
        // Burst Mode Toggle
        const burstColor = this.burstModeActive ? 
          { r: 1.0, g: 0.2, b: 0.2, a: 1.0 } : { r: 0.2, g: 1.0, b: 0.2, a: 1.0 };
        imgui.pushStyleColor(imgui.Col.Text, burstColor);
        const burstText = this.burstModeActive ? "BURST ACTIVE (Press X)" : "BURST READY (Press X)";
        imgui.text(burstText);
        imgui.popStyleColor();
        imgui.separator();

                 // Pet Info
         if (imgui.collapsingHeader("Pet Info", imgui.TreeNodeFlags.DefaultOpen)) {
           imgui.indent();
           const pet = me.pet;
           if (pet) {
             const petName = pet.unsafeName || "Unknown Pet";
             const petHealth = pet.pctHealth || 0;
             imgui.textColored({ r: 0.2, g: 1.0, b: 0.2, a: 1.0 }, `Pet: ${petName} (${petHealth.toFixed(0)}%)`);
             const beastCleaveStacks = pet.getAuraStacks ? pet.getAuraStacks("Beast Cleave") || 0 : 0;
             if (beastCleaveStacks > 0) {
               imgui.textColored({ r: 1.0, g: 1.0, b: 0.2, a: 1.0 }, `Beast Cleave: ${beastCleaveStacks}`);
             }
           } else {
             imgui.textColored({ r: 1.0, g: 0.2, b: 0.2, a: 1.0 }, "No Pet Active");
           }
           imgui.unindent();
         }

                 // Focus/Frenzy Info
         if (imgui.collapsingHeader("Resources", imgui.TreeNodeFlags.DefaultOpen)) {
           imgui.indent();
           const focus = me.powerByType(PowerType.Focus) || 0;
           const maxFocus = me.maxPowerByType(PowerType.Focus) || 100;
           imgui.textColored({ r: 0.2, g: 0.8, b: 1.0, a: 1.0 }, `Focus: ${focus}/${maxFocus}`);
           
           const frenzyStacks = me.getAuraStacks ? me.getAuraStacks("Frenzy") || 0 : 0;
           if (frenzyStacks > 0) {
             imgui.textColored({ r: 1.0, g: 0.2, b: 0.2, a: 1.0 }, `Frenzy: ${frenzyStacks}/3`);
           }
           imgui.unindent();
         }

        // CC Abilities
        if (imgui.collapsingHeader("CC Abilities", imgui.TreeNodeFlags.DefaultOpen)) {
          imgui.indent();
          
          const bindingColor = this.overlayToggles.binding.value ?
            { r: 0.2, g: 0.8, b: 1.0, a: 1.0 } : { r: 0.6, g: 0.6, b: 0.6, a: 1.0 };
          imgui.pushStyleColor(imgui.Col.Text, bindingColor);
          imgui.checkbox("Binding Shot", this.overlayToggles.binding);
          imgui.popStyleColor();
          
          const intimidationColor = this.overlayToggles.intimidation.value ?
            { r: 0.2, g: 0.8, b: 1.0, a: 1.0 } : { r: 0.6, g: 0.6, b: 0.6, a: 1.0 };
          imgui.pushStyleColor(imgui.Col.Text, intimidationColor);
          imgui.checkbox("Intimidation", this.overlayToggles.intimidation);
          imgui.popStyleColor();
          
          // Manual Freezing Trap keybind
          imgui.spacing();
          const manualTrapColor = this.overlayToggles.manualTrap.value ?
            { r: 1.0, g: 0.7, b: 0.2, a: 1.0 } : { r: 0.6, g: 0.6, b: 0.6, a: 1.0 };
          imgui.pushStyleColor(imgui.Col.Text, manualTrapColor);
          imgui.checkbox("Manual Trap (H)", this.overlayToggles.manualTrap);
          imgui.popStyleColor();
          
          if (this.overlayToggles.manualTrap.value) {
            imgui.indent();
            imgui.textColored({ r: 0.8, g: 0.8, b: 0.8, a: 1.0 }, "H = Trap mouseover or healer");
            imgui.unindent();
          }
          
          // Chimaeral Sting during Bestial Wrath
          imgui.spacing();
          const chimaeralStingColor = this.overlayToggles.chimaeralSting.value ?
            { r: 0.8, g: 0.2, b: 1.0, a: 1.0 } : { r: 0.6, g: 0.6, b: 0.6, a: 1.0 };
          imgui.pushStyleColor(imgui.Col.Text, chimaeralStingColor);
          imgui.checkbox("Chimaeral Sting BW", this.overlayToggles.chimaeralSting);
          imgui.popStyleColor();
          
          if (this.overlayToggles.chimaeralSting.value) {
            imgui.indent();
            imgui.textColored({ r: 0.8, g: 0.8, b: 0.8, a: 1.0 }, "Stings healer during Bestial Wrath");
            imgui.unindent();
          }
          
          imgui.unindent();
        }

        // Defensives
        if (imgui.collapsingHeader("Defensives")) {
          imgui.indent();
          
          const defensiveColor = this.overlayToggles.defensives.value ?
            { r: 0.2, g: 1.0, b: 0.2, a: 1.0 } : { r: 1.0, g: 0.2, b: 0.2, a: 1.0 };
          imgui.pushStyleColor(imgui.Col.Text, defensiveColor);
          imgui.checkbox("Defensives", this.overlayToggles.defensives);
          imgui.popStyleColor();
          
          imgui.unindent();
        }
      }
      
      // Major Cooldowns section
      if (imgui.collapsingHeader("Major Cooldowns", imgui.TreeNodeFlags.DefaultOpen)) {
        imgui.indent();
        
        // Bestial Wrath toggle
        const bwColor = this.overlayToggles.bestialWrath.value ? 
          { r: 0.2, g: 1.0, b: 0.2, a: 1.0 } : { r: 1.0, g: 0.2, b: 0.2, a: 1.0 };
        imgui.pushStyleColor(imgui.Col.Text, bwColor);
        imgui.checkbox("Bestial Wrath", this.overlayToggles.bestialWrath);
        imgui.popStyleColor();
        
        // Call of the Wild toggle  
        const cotwColor = this.overlayToggles.callOfTheWild.value ?
          { r: 0.2, g: 1.0, b: 0.2, a: 1.0 } : { r: 1.0, g: 0.2, b: 0.2, a: 1.0 };
        imgui.pushStyleColor(imgui.Col.Text, cotwColor);
        imgui.checkbox("Call of the Wild", this.overlayToggles.callOfTheWild);
        imgui.popStyleColor();

        // Bloodshed toggle  
        const bloodshedColor = this.overlayToggles.bloodshed.value ?
          { r: 0.2, g: 1.0, b: 0.2, a: 1.0 } : { r: 1.0, g: 0.2, b: 0.2, a: 1.0 };
        imgui.pushStyleColor(imgui.Col.Text, bloodshedColor);
        imgui.checkbox("Bloodshed", this.overlayToggles.bloodshed);
        imgui.popStyleColor();
        
        imgui.unindent();
      }
      
      // Manual spell casting section
      if (imgui.collapsingHeader("Manual Spell Casting")) {
        imgui.indent();
        
        imgui.text("Spell ID:");
        imgui.sameLine();
        imgui.setNextItemWidth(80);
        imgui.inputText("##spellId", this.spellIdInput);
        
                 // Show spell name for current ID
         const currentSpellId = parseInt(this.spellIdInput.value || "0", 10);
         if (currentSpellId > 0) {
           const currentSpellObject = spell.getSpell(currentSpellId);
           if (currentSpellObject) {
             const spellName = currentSpellObject.name || "Unknown Spell";
             imgui.textColored({ r: 0.2, g: 1.0, b: 0.2, a: 1.0 }, `"${spellName}"`);
           } else {
             imgui.textColored({ r: 1.0, g: 0.2, b: 0.2, a: 1.0 }, "Invalid Spell ID");
           }
         }
        
        imgui.text("Press RightArrow to cast");
        
        imgui.unindent();
      }
      
      // Interrupts section
      if (imgui.collapsingHeader("Interrupts", imgui.TreeNodeFlags.DefaultOpen)) {
        imgui.indent();
        
        // Interrupts master toggle
        const interruptColor = this.overlayToggles.interrupts.value ?
          { r: 0.2, g: 1.0, b: 0.2, a: 1.0 } : { r: 1.0, g: 0.2, b: 0.2, a: 1.0 };
        imgui.pushStyleColor(imgui.Col.Text, interruptColor);
        imgui.checkbox("Interrupts", this.overlayToggles.interrupts);
        imgui.popStyleColor();
        
        // Individual interrupt toggles
        if (this.overlayToggles.interrupts.value) {
          imgui.indent();
          
          const counterShotColor = this.overlayToggles.counterShot.value ?
            { r: 0.2, g: 0.8, b: 1.0, a: 1.0 } : { r: 0.6, g: 0.6, b: 0.6, a: 1.0 };
          imgui.pushStyleColor(imgui.Col.Text, counterShotColor);
          imgui.checkbox("Counter Shot", this.overlayToggles.counterShot);
          imgui.popStyleColor();
          
          const intimidationColor = this.overlayToggles.intimidation.value ?
            { r: 0.2, g: 0.8, b: 1.0, a: 1.0 } : { r: 0.6, g: 0.6, b: 0.6, a: 1.0 };
          imgui.pushStyleColor(imgui.Col.Text, intimidationColor);
          imgui.checkbox("Intimidation", this.overlayToggles.intimidation);
          imgui.popStyleColor();
          
          imgui.unindent();
        }
        
        imgui.unindent();
      }

      // Quick controls section
      imgui.spacing();
      imgui.separator();
      
      if (imgui.button("Enable All", { x: 120, y: 0 })) {
        Object.values(this.overlayToggles).forEach(toggle => {
          if (toggle !== this.overlayToggles.showOverlay) {
            toggle.value = true;
          }
        });
      }
      
      imgui.sameLine();
      
      if (imgui.button("Disable All", { x: 120, y: 0 })) {
        Object.values(this.overlayToggles).forEach(toggle => {
          if (toggle !== this.overlayToggles.showOverlay) {
            toggle.value = false;
          }
        });
      }
      
      imgui.end();
    }
  }

  buildPetManagement() {
    return new bt.Selector(
      // Call pet if no pet
      spell.cast("Call Pet 1", () => !me.pet && Settings.AutoRevivePet),
      
      // Revive pet if dead
      spell.cast("Revive Pet", () => Settings.AutoRevivePet && me.pet && me.pet.deadOrGhost),
      
      // Mend pet if injured
      spell.cast("Mend Pet", () => 
        Settings.AutoMendPet && 
        me.pet && 
        !me.pet.deadOrGhost && 
        me.pet.pctHealth < Settings.MendPetHealthPct &&
        !me.pet.hasAura("Mend Pet")
      )
    );
  }

  buildDefensives() {
    return new bt.Selector(
      // Hunter's Mark
      spell.cast("Hunter's Mark", on => this.getCurrentTarget(), req => 
        this.getCurrentTarget() && 
        !this.getCurrentTarget().hasAuraByMe("Hunter's Mark") &&
        this.getCurrentTarget().isPlayer()
      ),
      
      // Defensive abilities
      spell.cast("Exhilaration", () => 
        Settings.UseExhilaration && 
        this.overlayToggles.defensives.value &&
        me.pctHealth < Settings.ExhilarationHealthPct
      ),
      spell.cast("Fortitude of the Bear", () => 
        Settings.UseFortitudeOfTheBear && 
        this.overlayToggles.defensives.value &&
        me.pctHealth < Settings.FortitudeOfTheBearHealthPct
      ),
      spell.cast("Survival of the Fittest", () => 
        Settings.UseSurvivalOfTheFittest && 
        this.overlayToggles.defensives.value &&
        me.pctHealth < Settings.SurvivalOfTheFittestHealthPct
      ),
      spell.cast("Aspect of the Cheetah", () => 
        Settings.UseAspectOfTheCheetah && 
        this.overlayToggles.defensives.value &&
        me.pctHealth < Settings.AspectOfTheCheetahHealthPct &&
        this.isBeingFocused()
      ),
      
      // Interrupts
      new bt.Decorator(
        () => Settings.UseCounterShot && this.overlayToggles.interrupts.value && this.overlayToggles.counterShot.value,
        spell.interrupt("Counter Shot", ret => {
          if (ret === bt.Status.Success) {
            toastWarning("Counter Shot Interrupt!", 1.1, 2000);
          }
        })
      ),
      // Intimidation interrupt (doesn't require facing)
      new bt.Decorator(
        () => Settings.UseIntimidationInterrupt && this.overlayToggles.interrupts.value && this.overlayToggles.intimidation.value,
        this.buildIntimidationInterrupt()
      )
    );
  }

  buildCooldowns() {
    return new bt.Selector(
      // Power Infusion equivalent (invoke external buff)
      // Simulate: invoke_external_buff,name=power_infusion,if=buff.call_of_the_wild.up|talent.bloodshed&(prev_gcd.1.bloodshed)|!talent.call_of_the_wild&(buff.bestial_wrath.up|cooldown.bestial_wrath.remains<30)|fight_remains<16
      // This would be handled by external addons typically
      
      // Berserking racial
      spell.cast("Berserking", () => 
        me.hasAura("Call of the Wild") || 
        (this.hasTalent("Bloodshed") && this.wasLastSpellCast("Bloodshed")) ||
        (!this.hasTalent("Call of the Wild") && me.hasAura("Bestial Wrath")) ||
        this.getTargetTimeToDie() < 13
      ),
      
      // Blood Fury racial
      spell.cast("Blood Fury", () => 
        me.hasAura("Call of the Wild") || 
        (this.hasTalent("Bloodshed") && this.wasLastSpellCast("Bloodshed")) ||
        (!this.hasTalent("Call of the Wild") && me.hasAura("Bestial Wrath")) ||
        this.getTargetTimeToDie() < 16
      ),
      
      // Ancestral Call racial
      spell.cast("Ancestral Call", () => 
        me.hasAura("Call of the Wild") || 
        (this.hasTalent("Bloodshed") && this.wasLastSpellCast("Bloodshed")) ||
        (!this.hasTalent("Call of the Wild") && me.hasAura("Bestial Wrath")) ||
        this.getTargetTimeToDie() < 16
      ),
      
      // Fireblood racial
      spell.cast("Fireblood", () => 
        me.hasAura("Call of the Wild") || 
        (this.hasTalent("Bloodshed") && this.wasLastSpellCast("Bloodshed")) ||
        (!this.hasTalent("Call of the Wild") && me.hasAura("Bestial Wrath")) ||
        this.getTargetTimeToDie() < 9
      )
    );
  }

  buildCleave() {
    return new bt.Selector(
      // bestial_wrath,target_if=min:dot.barbed_shot.remains
      spell.cast("Bestial Wrath", () => 
        Settings.UseBestialWrath && 
        this.overlayToggles.bestialWrath.value &&
        this.shouldUseCooldowns(),
      ret => {
        if (ret === bt.Status.Success) {
          toastSuccess("BESTIAL WRATH ACTIVATED!", 1.3, 2000);
        }
      }),
      
      // barbed_shot,target_if=min:dot.barbed_shot.remains,if=full_recharge_time<gcd|charges_fractional>=cooldown.kill_command.charges_fractional|talent.call_of_the_wild&cooldown.call_of_the_wild.ready|howl_summon_ready&full_recharge_time<8
      spell.cast("Barbed Shot", on => this.getTargetWithMinBarbedShot(), req => 
        this.getBarbedShotFullRechargeTime() < 1.5 ||
        spell.getCharges("Barbed Shot") >= spell.getCharges("Kill Command") ||
        (this.hasTalent("Call of the Wild") && spell.getCooldown("Call of the Wild").ready) ||
        (this.isHowlSummonReady() && this.getBarbedShotFullRechargeTime() < 8)
      ),
      
      // multishot,if=pet.main.buff.beast_cleave.remains<0.25+gcd&(!talent.bloody_frenzy|cooldown.call_of_the_wild.remains)
      spell.cast("Multi-Shot", on => this.getCurrentTarget(), req => 
        this.getPetBeastCleaveRemaining() < (0.25 + 1.5) &&
        (!this.hasTalent("Bloody Frenzy") || spell.getCooldown("Call of the Wild").timeleft > 0)
      ),
      
      // black_arrow,if=buff.beast_cleave.remains
      spell.cast("Black Arrow", on => this.getCurrentTarget(), req => 
        me.pet && me.pet.hasAura("Beast Cleave")
      ),
      
      // call_of_the_wild
      spell.cast("Call of the Wild", () => 
        Settings.UseCallOfTheWild && 
        this.overlayToggles.callOfTheWild.value &&
        this.shouldUseCooldowns(),
      ret => {
        if (ret === bt.Status.Success) {
          toastSuccess("Call of the Wild!", 1.2, 2500);
        }
      }),
      
      // bloodshed
      spell.cast("Bloodshed", () => 
        Settings.UseBloodshed && 
        this.overlayToggles.bloodshed.value &&
        this.shouldUseCooldowns(),
      ret => {
        if (ret === bt.Status.Success) {
          toastSuccess("Bloodshed!", 1.1, 2000);
        }
      }),
      
      // dire_beast,if=talent.shadow_hounds|talent.dire_cleave
      spell.cast("Dire Beast", () => 
        this.hasTalent("Shadow Hounds") || this.hasTalent("Dire Cleave")
      ),
      
      // explosive_shot,if=talent.thundering_hooves
      spell.cast("Explosive Shot", on => this.getCurrentTarget(), req => 
        this.hasTalent("Thundering Hooves")
      ),
      
      // kill_command,target_if=max:(target.health.pct<35|!talent.killer_instinct)*2+dot.a_murder_of_crows.refreshable
      spell.cast("Kill Command", on => this.getBestKillCommandTarget()),
      
      // explosive_shot,if=talent.thundering_hooves
      spell.cast("Explosive Shot", on => this.getCurrentTarget(), req => 
        this.hasTalent("Thundering Hooves")
      ),
      
      // lights_judgment,if=buff.bestial_wrath.down|target.time_to_die<5
      spell.cast("Light's Judgment", on => this.getCurrentTarget(), req => 
        !me.hasAura("Bestial Wrath") || this.getTargetTimeToDie() < 5
      ),
      
             // cobra_shot,if=focus.time_to_max<gcd*2|buff.hogstrider.stack>3
       spell.cast("Cobra Shot", on => this.getCurrentTarget(), req => 
         this.getFocusTimeToMax() < 3.0 || (me.getAuraStacks ? (me.getAuraStacks("Hogstrider") || 0) : 0) > 3
       ),
      
      // dire_beast
      spell.cast("Dire Beast"),
      
      // explosive_shot
      spell.cast("Explosive Shot", on => this.getCurrentTarget()),
      
      // bag_of_tricks,if=buff.bestial_wrath.down|target.time_to_die<5
      spell.cast("Bag of Tricks", on => this.getCurrentTarget(), req => 
        !me.hasAura("Bestial Wrath") || this.getTargetTimeToDie() < 5
      ),
      
             // arcane_torrent,if=(focus+focus.regen+30)<focus.max
       spell.cast("Arcane Torrent", () => 
         ((me.powerByType(PowerType.Focus) || 0) + this.getFocusRegen() + 30) < (me.maxPowerByType(PowerType.Focus) || 100)
       )
    );
  }

  buildSingleTarget() {
    return new bt.Selector(
      // dire_beast,if=talent.huntmasters_call
      spell.cast("Dire Beast", () => this.hasTalent("Huntmaster's Call")),
      
      // bestial_wrath
      spell.cast("Bestial Wrath", () => 
        Settings.UseBestialWrath && 
        this.overlayToggles.bestialWrath.value &&
        this.shouldUseCooldowns()
      ),
      
      // barbed_shot,target_if=min:dot.barbed_shot.remains,if=full_recharge_time<gcd|charges_fractional>=cooldown.kill_command.charges_fractional|talent.call_of_the_wild&cooldown.call_of_the_wild.ready|howl_summon_ready&full_recharge_time<8
      spell.cast("Barbed Shot", on => this.getTargetWithMinBarbedShot(), req => 
        this.getBarbedShotFullRechargeTime() < 1.5 ||
        spell.getCharges("Barbed Shot") >= spell.getCharges("Kill Command") ||
        (this.hasTalent("Call of the Wild") && spell.getCooldown("Call of the Wild").ready) ||
        (this.isHowlSummonReady() && this.getBarbedShotFullRechargeTime() < 8)
      ),
      
      // kill_command,if=charges_fractional>=cooldown.barbed_shot.charges_fractional
      spell.cast("Kill Command", on => this.getCurrentTarget(), req => 
        spell.getCharges("Kill Command") >= spell.getCharges("Barbed Shot")
      ),
      
      // call_of_the_wild
      spell.cast("Call of the Wild", () => 
        Settings.UseCallOfTheWild && 
        this.overlayToggles.callOfTheWild.value &&
        this.shouldUseCooldowns()
      ),
      
      // bloodshed
      spell.cast("Bloodshed", () => 
        Settings.UseBloodshed && 
        this.overlayToggles.bloodshed.value &&
        this.shouldUseCooldowns()
      ),
      
      // black_arrow
      spell.cast("Black Arrow", on => this.getCurrentTarget()),
      
      // explosive_shot,if=talent.thundering_hooves
      spell.cast("Explosive Shot", on => this.getCurrentTarget(), req => 
        this.hasTalent("Thundering Hooves")
      ),
      
      // lights_judgment,if=buff.bestial_wrath.down|target.time_to_die<5
      spell.cast("Light's Judgment", on => this.getCurrentTarget(), req => 
        !me.hasAura("Bestial Wrath") || this.getTargetTimeToDie() < 5
      ),
      
      // cobra_shot
      spell.cast("Cobra Shot", on => this.getCurrentTarget()),
      
      // dire_beast
      spell.cast("Dire Beast"),
      
      // bag_of_tricks,if=buff.bestial_wrath.down|target.time_to_die<5
      spell.cast("Bag of Tricks", on => this.getCurrentTarget(), req => 
        !me.hasAura("Bestial Wrath") || this.getTargetTimeToDie() < 5
      ),
      
      // arcane_pulse,if=buff.bestial_wrath.down|target.time_to_die<5
      spell.cast("Arcane Pulse", () => 
        !me.hasAura("Bestial Wrath") || this.getTargetTimeToDie() < 5
      ),
      
             // arcane_torrent,if=(focus+focus.regen+15)<focus.max
       spell.cast("Arcane Torrent", () => 
         ((me.powerByType(PowerType.Focus) || 0) + this.getFocusRegen() + 15) < (me.maxPowerByType(PowerType.Focus) || 100)
       )
    );
  }

  useTrinkets() {
    return new bt.Selector(
      common.useEquippedItemByName("Skyterror's Corrosive Organ"),
      // Add more trinkets as needed
    );
  }

  useRacials() {
    // Most racials are handled in buildCooldowns()
    return new bt.Selector(
      // Any additional racial spells not covered in cooldowns
    );
  }

  // PVP Rotation Methods
  buildPVPRotation() {
    return new bt.Selector(
      // Always perform actions
      this.buildPVPAlwaysPerform(),
      
      // Burst mode
      this.buildBeastMasteryBurst(),

      // Regular PVP Priority
      this.buildPVPRegularPriority()
    );
  }

  buildPVPAlwaysPerform() {
    return new bt.Selector(
      // Hunter's Mark maintenance
      spell.cast("Hunter's Mark", on => this.getCurrentTargetPVP(), req => 
        this.getCurrentTargetPVP() && 
        !this.getCurrentTargetPVP().hasAuraByMe("Hunter's Mark") &&
        this.getCurrentTargetPVP().isPlayer()
      ),
      
      // Master's Call if we're rooted
      spell.cast("Master's Call", () => 
        Settings.UseMastersCall &&
        me.isRooted()
      ),
      
      // Feign Death for spells we would spell reflect (like Arms Warrior)
      spell.cast("Feign Death", () => 
        Settings.UseFeignDeath &&
        this.overlayToggles.defensives.value &&
        this.shouldFeignDeathPVP()
      ),
      
      // Tranquilizing Shot enemies we would Dispel Magic on
      spell.cast("Tranquilizing Shot", on => this.findTranquilizingShotTarget(), req => 
        Settings.UseTranquilizingShot &&
        this.findTranquilizingShotTarget() !== null
      ),
      
      // Binding Shot - enemies within 10y of us, or within 10y of our healer
      spell.cast("Binding Shot", on => this.findBindingShotTargetPVP(), req => 
        Settings.UseBinding &&
        this.overlayToggles.binding.value &&
        this.findBindingShotTargetPVP() !== null,
      ret => {
        if (ret === bt.Status.Success) {
          const target = this.findBindingShotTargetPVP();
          toastWarning(`Binding Shot → ${target?.unsafeName || 'Target'}!`, 1.1, 2500);
        }
      }),
      
      // Freezing Trap enemy healer when stunned with <1.5s stun remaining
      spell.cast("Freezing Trap", on => this.findFreezingTrapTargetPVP(), req => 
        Settings.UseFreezingTrap &&
        this.findFreezingTrapTargetPVP() !== null,
      ret => {
        if (ret === bt.Status.Success) {
          const target = this.findFreezingTrapTargetPVP();
          toastError(`Freezing Trap → ${target?.unsafeName || 'Target'}!`, 1.2, 3000);
        }
      }),
      
      // Tar Trap any enemy within 10y of us
      spell.cast("Tar Trap", on => this.findTarTrapLocationPVP(), req => 
        Settings.UseTarTrap &&
        this.findTarTrapLocationPVP() !== null
      ),
      
      // High Explosive Trap non-healers within 10y with major cooldowns up
      spell.cast("High Explosive Trap", on => this.findExplosiveTrapLocationPVP(), req => 
        Settings.UseExplosiveTrap &&
        this.findExplosiveTrapLocationPVP() !== null
      ),
      
      // Intimidation enemies with major cooldowns or healer if no stun DR
      spell.cast("Intimidation", on => this.findIntimidationTargetPVP(), req => 
        Settings.UseIntimidation &&
        this.overlayToggles.intimidation.value &&
        this.findIntimidationTargetPVP() !== null,
      ret => {
        if (ret === bt.Status.Success) {
          const target = this.findIntimidationTargetPVP();
          toastError(`Intimidation Stun → ${target?.unsafeName || 'Target'}!`, 1.2, 3000);
        }
      }),
      
      // Bursting Shot non-healers within 8y of us
      spell.cast("Bursting Shot", on => this.findBurstingShotTargetPVP(), req => 
        Settings.UseBurstingShot &&
        this.findBurstingShotTargetPVP() !== null
      ),
      
      // Concussive Shot nearest enemy player without the aura
      spell.cast("Concussive Shot", on => this.findConcussiveShotTargetPVP(), req => 
        Settings.UseConcussiveShot &&
        this.findConcussiveShotTargetPVP() !== null
      ),
      
      // Defensives
      spell.cast("Exhilaration", () => 
        Settings.UseExhilaration && 
        this.overlayToggles.defensives.value &&
        me.pctHealth < Settings.ExhilarationHealthPct
      ),
      spell.cast("Fortitude of the Bear", () => 
        Settings.UseFortitudeOfTheBear && 
        this.overlayToggles.defensives.value &&
        me.pctHealth < Settings.FortitudeOfTheBearHealthPct
      ),
      spell.cast("Survival of the Fittest", () => 
        Settings.UseSurvivalOfTheFittest && 
        this.overlayToggles.defensives.value &&
        me.pctHealth < Settings.SurvivalOfTheFittestHealthPct &&
        this.isUnderPressure()
      ),
      
      // Interrupts
      new bt.Decorator(
        () => Settings.UseCounterShot && this.overlayToggles.interrupts.value && this.overlayToggles.counterShot.value,
        spell.interrupt("Counter Shot")
      ),
      // Intimidation interrupt (doesn't require facing)
      new bt.Decorator(
        () => Settings.UseIntimidationInterrupt && this.overlayToggles.interrupts.value && this.overlayToggles.intimidation.value,
        this.buildIntimidationInterrupt()
      )
    );
  }

  buildBeastMasteryBurst() {
    return new bt.Selector(
      // Call of the Wild
      spell.cast("Call of the Wild", () => 
        Settings.UseCallOfTheWild && 
        this.overlayToggles.callOfTheWild.value &&
        this.burstModeActive
      ),
      
      // Bestial Wrath
      spell.cast("Bestial Wrath", () => 
        Settings.UseBestialWrath && 
        this.overlayToggles.bestialWrath.value &&
        this.burstModeActive,
      ret => {
        if (ret === bt.Status.Success) {
          toastSuccess("BESTIAL WRATH ACTIVATED!", 1.3, 2000);
        }
      }),
      
      // Chimaeral Sting enemy healer during Bestial Wrath (when not CC'd)
      spell.cast("Chimaeral Sting", on => this.findEnemyHealerNotCC(), req => 
        this.overlayToggles.chimaeralSting.value &&
        me.hasVisibleAura("Bestial Wrath") &&
        this.findEnemyHealerNotCC() !== null,
      ret => {
        if (ret === bt.Status.Success) {
          const target = this.findEnemyHealerNotCC();
          toastWarning(`Chimaeral Sting → ${target?.unsafeName || 'Healer'}!`, 1.2, 3000);
        }
      }),
      
      // Bloodshed
      spell.cast("Bloodshed", () => 
        Settings.UseBloodshed && 
        this.overlayToggles.bloodshed.value &&
        this.burstModeActive
      ),
      
      // Use racials during burst
      spell.cast("Blood Fury", () => this.burstModeActive),
      spell.cast("Berserking", () => this.burstModeActive),
      
             // Barbed Shot to maintain frenzy
       spell.cast("Barbed Shot", on => this.getCurrentTargetPVP(), req => 
         this.burstModeActive && 
         ((me.getAuraStacks ? (me.getAuraStacks("Frenzy") || 0) : 0) < 3 || this.getAuraRemainingTime("Frenzy") < 5)
       ),
      
      // Kill Command
      spell.cast("Kill Command", on => this.getCurrentTargetPVP(), req => this.burstModeActive),
      
      // Cobra Shot
      spell.cast("Cobra Shot", on => this.getCurrentTargetPVP(), req => this.burstModeActive),
      
      // Always fall back to regular rotation
      new bt.Action(() => bt.Status.Failure)
    );
  }

  buildPVPRegularPriority() {
    return new bt.Selector(
      // Priority 1: Barbed Shot
      spell.cast("Barbed Shot", on => this.getCurrentTargetPVP(), req => 
        this.getCurrentTargetPVP() !== null
      ),
      
      // Priority 2: Kill Command if charges == 2
      spell.cast("Kill Command", on => this.getCurrentTargetPVP(), req => 
        this.getCurrentTargetPVP() !== null &&
        this.getKillCommandCharges() >= 2
      ),
      
      // Priority 3: Dire Beast if we do not have Bestial Wrath buff active
      spell.cast("Dire Beast", on => this.getCurrentTargetPVP(), req => 
        this.getCurrentTargetPVP() !== null &&
        !me.hasVisibleAura("Bestial Wrath")
      ),

    // Priority 6: Kill Shot
    spell.cast("Kill Shot", on => this.getCurrentTargetPVP(), req => 
        this.getCurrentTargetPVP() !== null
        ),
      
      // Priority 4: Kill Command
      spell.cast("Kill Command", on => this.getCurrentTargetPVP(), req => 
        this.getCurrentTargetPVP() !== null
      ),
      
      // Priority 5: Dire Beast
      spell.cast("Dire Beast", on => this.getCurrentTargetPVP(), req => 
        this.getCurrentTargetPVP() !== null
      ),
      
      // Priority 7: Cobra Shot
      spell.cast("Cobra Shot", on => this.getCurrentTargetPVP(), req => 
        this.getCurrentTargetPVP() !== null
      )
    );
  }

  // Helper Methods
  getCurrentTarget() {
    const targetPredicate = unit => common.validTarget(unit) && me.distanceTo(unit) <= 40 && me.isFacing(unit);
    const target = me.target;
    if (target !== null && targetPredicate(target)) {
      return target;
    }
    return combat.targets.find(targetPredicate) || null;
  }

  getCurrentTargetPVP() {
    const targetPredicate = unit => common.validTarget(unit) && me.distanceTo(unit) <= 40 && me.isFacing(unit) && !pvpHelpers.hasImmunity(unit);
    const target = me.target;
    if (target !== null && targetPredicate(target)) {
      return target;
    }
    return combat.targets.find(targetPredicate) || null;
  }

  getEnemiesInRange(range) {
    // Use proper enemy filtering - only get attackable enemies
    return me.getEnemies(range).length;
  }

  getEnemiesInRangeOfPet(range) {
    // Filter for only attackable enemies around the pet
    if (!me.pet) return 0;
    
    return me.pet.getUnitsAround(range).filter(unit => 
      unit instanceof wow.CGUnit && me.canAttack(unit) && unit.pctHealth > 0 && unit.inCombatWithMe
    ).length;
  }

  shouldUseCooldowns() {
    if (Settings.IgnoreTimeToDeath) {
      return true;
    }
    
    const target = this.getCurrentTarget();
    return target && target.timeToDeath() > Settings.MinTimeToDeath;
  }

     getAuraRemainingTime(auraName) {
     const aura = me.getAura ? me.getAura(auraName) : null;
     return aura ? (aura.remaining || 0) : 0;
   }

  hasTalent(talentName) {
    return me.hasAura(talentName);
  }

  getTargetTimeToDie() {
    const target = this.getCurrentTarget();
    return target ? target.timeToDeath() : 999;
  }

  getBarbedShotFullRechargeTime() {
    const charges = spell.getCharges("Barbed Shot");
    const maxCharges = 2; // Barbed Shot has 2 charges
    const cooldown = spell.getCooldown("Barbed Shot");
    
    if (charges >= maxCharges) return 0;
    
    // Calculate time for all charges to be available
    const chargesNeeded = maxCharges - charges;
    return cooldown.timeleft + ((chargesNeeded - 1) * cooldown.duration);
  }

  getTargetWithMinBarbedShot() {
    // Find target with shortest remaining Barbed Shot debuff
    let bestTarget = null;
    let minRemaining = 999;
    
    for (const target of combat.targets) {
      if (me.distanceTo(target) <= 40) {
        const barbedShot = target.getAura("Barbed Shot");
        const remaining = barbedShot ? barbedShot.remaining : 0;
        if (remaining < minRemaining) {
          minRemaining = remaining;
          bestTarget = target;
        }
      }
    }
    
    return bestTarget || this.getCurrentTarget();
  }

  getBestKillCommandTarget() {
    // target_if=max:(target.health.pct<35|!talent.killer_instinct)*2+dot.a_murder_of_crows.refreshable
    let bestTarget = null;
    let bestScore = -1;
    
    for (const target of combat.targets) {
      if (me.distanceTo(target) <= 40) {
        let score = 0;
        
        // (target.health.pct<35|!talent.killer_instinct)*2
        if (target.pctHealth < 35 || !this.hasTalent("Killer Instinct")) {
          score += 2;
        }
        
        // dot.a_murder_of_crows.refreshable
        const crows = target.getAura("A Murder of Crows");
        if (!crows || crows.remaining < 4.5) {
          score += 1;
        }
        
        if (score > bestScore) {
          bestScore = score;
          bestTarget = target;
        }
      }
    }
    
    return bestTarget || this.getCurrentTarget();
  }

  getPetBeastCleaveRemaining() {
    if (!me.pet) return 0;
    const beastCleave = me.getAura(268877);
    return beastCleave ? beastCleave.remaining : 0;
  }

  isHowlSummonReady() {
    // This would check for specific howl summon abilities
    // Implementation depends on specific talents
    return false;
  }

     getFocusTimeToMax() {
     const currentFocus = me.powerByType(PowerType.Focus) || 0;
     const maxFocus = me.maxPowerByType(PowerType.Focus) || 100;
     const regenRate = this.getFocusRegen();
     
     if (currentFocus >= maxFocus) return 0;
     
     return (maxFocus - currentFocus) / regenRate;
   }

  getFocusRegen() {
    // Base focus regen is about 10 per second
    // This can be modified by haste and other effects
    return 10; // Simplified
  }

  wasLastSpellCast(spellName) {
    // This would check if the last GCD was spent on this spell
    // Implementation would need to track recent casts
    return false; // Simplified
  }

  isBeingFocused() {
    // Check if multiple enemies are targeting us
    const enemiesTargetingMe = combat.targets.filter(unit => 
      unit.isPlayer() && 
      unit.target && 
      unit.target.equals(me.guid) &&
      me.distanceTo(unit) <= 40
    ).length;
    
    return enemiesTargetingMe >= 2;
  }

  isUnderPressure() {
    // Check if we're being focused or have dangerous debuffs
    return this.isBeingFocused() || me.pctHealth < 60;
  }

  shouldCastConcussiveShot() {
    const target = this.getCurrentTargetPVP();
    if (!target || !target.isPlayer()) return false;
    
    // Don't cast if target already slowed
    if (target.hasAura("Concussive Shot") || target.hasAura("Hamstring")) return false;
    
    // Don't cast if target has immunity
    if (pvpHelpers.hasImmunity(target) || target.hasVisibleAura(1044)) return false; // Blessing of Freedom
    
    // Check timing based on successful casts
    const lastSuccessfulTime = spell._lastSuccessfulCastTimes.get("concussive shot");
    const now = wow.frameTime;
    const timeSinceSuccess = lastSuccessfulTime ? now - lastSuccessfulTime : 999999;
    
    return !lastSuccessfulTime || timeSinceSuccess >= (Settings.ConcussiveShotCooldown * 1000);
  }

  findBindingShotTarget() {
    // Look for enemies trying to escape or approaching dangerous positions
    for (const enemy of combat.targets) {
      if (enemy.isPlayer() && 
          me.distanceTo(enemy) <= 30 &&
          !pvpHelpers.hasImmunity(enemy) &&
          !enemy.isCCd()) {
        return enemy;
      }
    }
    return null;
  }

  findIntimidationTarget() {
    // Look for enemies casting important spells
    for (const enemy of combat.targets) {
      if (enemy.isPlayer() && 
          me.distanceTo(enemy) <= 30 &&
          enemy.isCastingOrChanneling &&
          drTracker.getDRStacks(enemy.guid, "stun") < 2 &&
          !pvpHelpers.hasImmunity(enemy)) {
        return enemy;
      }
    }
    return null;
  }

  findScaredBeastTarget() {
    // Look for druids in animal forms
    for (const enemy of combat.targets) {
      if (enemy.isPlayer() && 
          me.distanceTo(enemy) <= 30 &&
          (enemy.hasAura("Cat Form") || enemy.hasAura("Bear Form") || enemy.hasAura("Travel Form")) &&
          drTracker.getDRStacks(enemy.guid, "disorient") < 2 &&
          !pvpHelpers.hasImmunity(enemy)) {
        return enemy;
      }
    }
    return null;
  }

  findTrapLocation() {
    // This would return a location for ground-targeted traps
    // Simplified implementation
    const target = this.getCurrentTargetPVP();
    return target ? target : null;
  }

     findFreezingTrapTarget() {
     // Look for high priority targets for CC
     for (const enemy of combat.targets) {
       if (enemy.isPlayer() && 
           me.distanceTo(enemy) <= 30 &&
           enemy.isHealer() &&
           drTracker.getDRStacks(enemy.guid, "incapacitate") < 2 &&
           !pvpHelpers.hasImmunity(enemy)) {
         return enemy;
       }
     }
     return null;
   }

  shouldUseTrap() {
    // Logic for when to use area traps
    return this.getEnemiesInRange(8) >= 2;
  }

  buildIntimidationInterrupt() {
    // Custom interrupt for Intimidation that doesn't require facing
    return new bt.Sequence("Intimidation Interrupt",
      new bt.Action(() => {
        // Early return if interrupt mode is set to "None"
        if (Settings.InterruptMode === "None") {
          return bt.Status.Failure;
        }

        const intimidationSpell = spell.getSpell("Intimidation");
        if (!intimidationSpell || !intimidationSpell.isUsable || !intimidationSpell.cooldown.ready) {
          return bt.Status.Failure;
        }

        // Find interruptible targets (same logic as spell.interrupt but without facing requirement)
        for (const target of combat.targets) {
          if (!(target instanceof wow.CGUnit)) {
            continue;
          }
          if (!target.isCastingOrChanneling) {
            continue;
          }
          if (!intimidationSpell.inRange(target) && !me.isWithinMeleeRange(target)) {
            continue;
          }
          if (!target.isInterruptible) {
            continue;
          }
          if (!me.withinLineOfSight(target)) {
            continue;
          }
          // Note: NO facing requirement for Intimidation

          const castInfo = target.spellInfo;
          if (!castInfo) {
            continue;
          }

          const currentTime = wow.frameTime;
          const castRemains = castInfo.castEnd - currentTime;
          const castTime = castInfo.castEnd - castInfo.castStart;
          const castPctRemain = (castRemains / castTime) * 100;
          const channelTime = currentTime - castInfo.channelStart;
          const randomInterruptTime = 700 + (Math.random() * 800 - 400);

          // Check if we should interrupt based on the settings
          let shouldInterrupt = false;
          if (Settings.InterruptMode === "Everything") {
            if (target.isChanneling) {
              shouldInterrupt = channelTime > randomInterruptTime;
            } else {
              shouldInterrupt = castPctRemain <= Settings.InterruptPercentage;
            }
          } else if (Settings.InterruptMode === "List") {
            // Using pvpInterrupts from the imported data
            if (target.isChanneling) {
              shouldInterrupt = pvpInterrupts[castInfo.spellCastId] && channelTime > randomInterruptTime;
            } else {
              shouldInterrupt = pvpInterrupts[castInfo.spellCastId] && castPctRemain <= Settings.InterruptPercentage;
            }
          }

          if (shouldInterrupt && intimidationSpell.cast(target)) {
            const spellId = target.isChanneling ? target.currentChannel : target.currentCast;
            const interruptTime = target.isChanneling ? `${channelTime.toFixed(2)}ms` : `${castPctRemain.toFixed(2)}%`;
            console.info(`Interrupted ${spellId} using Intimidation being ${target.isChanneling ? 'channeled' : 'cast'} by: ${target.unsafeName} after ${interruptTime}`);
            return bt.Status.Success;
          }
        }
        return bt.Status.Failure;
      })
    );
  }

  // PVP Helper Methods
  getKillCommandCharges() {
    const killCommandSpell = spell.getSpell("Kill Command");
    return killCommandSpell ? killCommandSpell.charges : 0;
  }

  shouldFeignDeathPVP() {
    // Use same logic as Arms Warrior's shouldSpellReflectPVP
    const enemies = me.getEnemies();
    for (const enemy of enemies) {
      if (enemy.isCastingOrChanneling && enemy.isPlayer()) {
        const spellInfo = enemy.spellInfo;
        const target = spellInfo ? spellInfo.spellTargetGuid : null;
        if (enemy.spellInfo && target && target.equals(me.guid)) {
          const spellId = enemy.spellInfo.spellCastId;
          // Check if spell should be reflected using pvpReflect data
          if (pvpReflect[spellId]) {
            const castRemains = enemy.spellInfo.castEnd - wow.frameTime;
            return castRemains < 1000; // Feign Death within 1 second of cast completion
          }
        }
      }
    }
    return false;
  }

  findTranquilizingShotTarget() {
    // Find enemies that we would Dispel Magic on (like PriestDisciplinePvP.js)
    for (const enemy of me.getEnemies()) {
      if (!enemy.isPlayer() || pvpHelpers.hasImmunity(enemy)) continue;
      
      // Check for magic buffs that should be dispelled
      const magicBuffs = enemy.auras.filter(aura => aura.isDispellable && aura.dispelType === 0); // Magic = 0
      if (magicBuffs.length > 0) {
        return enemy;
      }
    }
    return null;
  }

  findBindingShotTargetPVP() {
    // First priority: enemies within 10y of us
    const enemiesNearUs = me.getEnemies().filter(enemy => 
      enemy.isPlayer() && 
      me.distanceTo(enemy) <= 10 &&
      !pvpHelpers.hasImmunity(enemy) &&
      !enemy.hasVisibleAura("Binding Shot") // Don't cast if already bound
    );
    
    if (enemiesNearUs.length > 0) {
      return enemiesNearUs[0];
    }

    // Second priority: enemies within 10y of our healer
    const friends = me.getFriends();
    const healers = friends.filter(member => member.isHealer());
    if (healers.length > 0) {
      const healer = healers[0];
      const enemiesNearHealer = me.getEnemies().filter(enemy => 
        enemy.isPlayer() && 
        healer.distanceTo(enemy) <= 10 &&
        !pvpHelpers.hasImmunity(enemy) &&
        !enemy.hasVisibleAura("Binding Shot")
      );
      
      if (enemiesNearHealer.length > 0) {
        return enemiesNearHealer[0];
      }
    }

    return null;
  }

  findEnemyHealerNotCC() {
    // Find enemy healer that's not in crowd control
    for (const enemy of me.getEnemies()) {
      if (!enemy.isPlayer() || !enemy.isHealer()) continue;
      if (pvpHelpers.hasImmunity(enemy)) continue;
      
      // Check if they're NOT in CC (not stunned, feared, etc.)
      if (!enemy.isStunned() && !enemy.isFeared() && !enemy.isSilenced() && 
          !enemy.hasAura("Freezing Trap") && !enemy.hasAura("Binding Shot")) {
        return enemy;
      }
    }
    return null;
  }

  findFreezingTrapTargetPVP() {
    // Enemy healer when stunned with <1.5s stun remaining
    for (const enemy of me.getEnemies()) {
      if (!enemy.isPlayer() || !enemy.isHealer()) continue;
      if (pvpHelpers.hasImmunity(enemy)) continue;
      
      // Check if they're stunned
      if (enemy.isStunned()) {
        // Find stun auras using DRTracker categories
        const stunAuras = enemy.auras.filter(aura => 
          aura.isDebuff && drHelpers.getCategoryBySpellID(aura.spellId) === "stun"
        );
        
        for (const stunAura of stunAuras) {
          if (stunAura.remaining <= 1500 && stunAura.remaining > 0) { // 0.5-1.5s remaining
            return enemy.position; // Return position for trap
          }
        }
      }
    }
    return null;
  }

  castManualFreezingTrap() {
    try {
      // Check if Freezing Trap is ready first (using same pattern as line 1270)
      const freezingTrapSpell = spell.getSpell(187650);
      if (!freezingTrapSpell || !freezingTrapSpell.isUsable || !freezingTrapSpell.cooldown.ready) {
        toastWarning("Freezing Trap not ready!", 1.0, 2000);
        return;
      }

      // Get target function and type for casting
      let targetFunction = null;
      let targetType = "";

      // Check mouseover first - get unit at cast time
      const mouseoverGuid = wow.GameUI.mouseOverGuid;
      if (mouseoverGuid && !mouseoverGuid.isNull) {
        targetFunction = () => {
          const mouseoverUnit = mouseoverGuid.toUnit();
          if (mouseoverUnit && me.canAttack(mouseoverUnit) && !pvpHelpers.hasImmunity(mouseoverUnit)) {
            return mouseoverUnit;
          }
          return null;
        };
        
        // Test if we have a valid mouseover target right now
        const testTarget = targetFunction();
        if (testTarget) {
          targetType = `mouseover ${testTarget.unsafeName || 'enemy'}`;
        } else {
          targetFunction = null;
        }
      }

      // Fall back to enemy healer if no valid mouseover
      if (!targetFunction) {
        targetFunction = () => this.findEnemyHealerNotCC();
        const testTarget = targetFunction();
        if (testTarget) {
          targetType = "enemy healer";
        }
      }

      // Cast the trap if we have a target function
      if (targetFunction && targetType) {
        console.log(`Manual casting Freezing Trap on ${targetType}`);
        
        // Get the actual target for casting
        const actualTarget = targetFunction();
        if (actualTarget) {
          console.log(`Target found: ${actualTarget.unsafeName}, attempting direct cast...`);
          
          // Use the same direct casting pattern as RightArrow (line 127)
          const freezingTrapSpell = spell.getSpell(187650);
          if (freezingTrapSpell) {
            console.log(`Casting Freezing Trap (ID: 187650) on ${actualTarget.unsafeName}`);
            spell.castPrimitive(freezingTrapSpell, actualTarget);
            toastSuccess(`Freezing Trap - ${targetType}!`, 1.2, 3000);
            console.log(`Successfully cast Freezing Trap on ${targetType}`);
          } else {
            console.log("Freezing Trap spell object not found");
            toastError("Freezing Trap spell not found!", 1.0, 2000);
          }
        } else {
          toastWarning("Target became invalid", 1.0, 2000);
        }
      } else {
        toastInfo("No valid Freezing Trap target", 1.0, 2000);
      }
    } catch (error) {
      console.error("Error casting manual Freezing Trap:", error);
      toastError("Freezing Trap error!", 1.0, 2000);
    }
  }

  findTarTrapLocationPVP() {
    // Any enemy within 10y of us
    const enemiesNearUs = me.getEnemies().filter(enemy => 
      enemy.isPlayer() && 
      me.distanceTo(enemy) <= 10 &&
      !pvpHelpers.hasImmunity(enemy)
    );
    
    if (enemiesNearUs.length > 0) {
      return enemiesNearUs[0].position;
    }
    return null;
  }

  findExplosiveTrapLocationPVP() {
    // Non-healers within 10y with major cooldowns up
    for (const enemy of me.getEnemies()) {
      if (!enemy.isPlayer() || enemy.isHealer()) continue;
      if (pvpHelpers.hasImmunity(enemy)) continue;
      if (me.distanceTo(enemy) > 10) continue;
      
      // Check if they have major cooldowns up
      if (this.hasMajorCooldowns(enemy)) {
        return enemy.position;
      }
    }
    return null;
  }

  findIntimidationTargetPVP() {
    // First priority: enemies with major cooldowns up
    for (const enemy of me.getEnemies()) {
      if (!enemy.isPlayer() || pvpHelpers.hasImmunity(enemy)) continue;
      if (me.distanceTo(enemy) > 30) continue; // Intimidation range
      
      if (this.hasMajorCooldowns(enemy) && drTracker.getDRStacks(enemy.guid, "stun") < 2) {
        return enemy;
      }
    }

    // Second priority: enemy healer if no stun DR
    for (const enemy of me.getEnemies()) {
      if (!enemy.isPlayer() || !enemy.isHealer()) continue;
      if (pvpHelpers.hasImmunity(enemy)) continue;
      if (me.distanceTo(enemy) > 30) continue;
      
      if (drTracker.getDRStacks(enemy.guid, "stun") < 2) {
        return enemy;
      }
    }

    return null;
  }

  findBurstingShotTargetPVP() {
    // Non-healers within 8y of us
    for (const enemy of me.getEnemies()) {
      if (!enemy.isPlayer() || enemy.isHealer()) continue;
      if (pvpHelpers.hasImmunity(enemy)) continue;
      if (me.distanceTo(enemy) <= 8) {
        return enemy;
      }
    }
    return null;
  }

  findConcussiveShotTargetPVP() {
    // Nearest enemy player without Concussive Shot aura
    let nearestEnemy = null;
    let nearestDistance = 40; // Max range for Concussive Shot
    
    for (const enemy of me.getEnemies()) {
      if (!enemy.isPlayer()) continue;
      if (pvpHelpers.hasImmunity(enemy)) continue;
      if (enemy.hasVisibleAura("Concussive Shot")) continue; // Skip if already slowed
      
      const distance = me.distanceTo(enemy);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestEnemy = enemy;
      }
    }
    
    return nearestEnemy;
  }

  hasMajorCooldowns(unit) {
    // Check for major damage cooldowns with sufficient duration (same as JmrSimcArms.js)
    const majorDamageCooldown = pvpHelpers.hasMajorDamageCooldown(unit, 3);
    return majorDamageCooldown !== null;
  }

  // Enhanced pet-to-player linking using all available SDK features
  analyzePetOwnership(unit) {
    const result = {
      isPlayerPet: false,
      isMine: false,
      ownerGuid: null,
      ownerName: null,
      petType: null,
      linkMethod: null
    };

    // Skip non-units
    if (!(unit instanceof wow.CGUnit)) {
      console.log(`[analyzePetOwnership] Skipping non-CGUnit: ${unit}`);
      return result;
    }

    // Debug log for each unit we analyze
    console.log(`[analyzePetOwnership] Analyzing: ${unit.unsafeName} - isPlayer: ${unit.isPlayer()}`);
    
    // Skip players
    if (unit.isPlayer()) {
      return result;
    }

    // Method 1: Check summonedBy (most reliable for summoned pets)
    if (unit.summonedBy && !unit.summonedBy.isNull) {
      result.isPlayerPet = true;
      result.ownerGuid = unit.summonedBy;
      result.linkMethod = "summonedBy";
      result.isMine = unit.summonedBy.equals(me.guid);
      
      // Try to get owner name
      const owner = unit.summonedBy.toUnit();
      if (owner && owner.isPlayer()) {
        result.ownerName = owner.unsafeName;
        result.petType = this.identifyPetType(unit, owner);
      }
      return result;
    }

    // Method 2: Check createdBy (for created objects/pets)
    if (unit.createdBy && !unit.createdBy.isNull) {
      result.isPlayerPet = true;
      result.ownerGuid = unit.createdBy;
      result.linkMethod = "createdBy";
      result.isMine = unit.createdBy.equals(me.guid);
      
      // Try to get owner name
      const owner = unit.createdBy.toUnit();
      if (owner && owner.isPlayer()) {
        result.ownerName = owner.unsafeName;
        result.petType = this.identifyPetType(unit, owner);
      }
      return result;
    }

    // Method 3: Check charmedBy (for charmed units)
    if (unit.charmedBy && !unit.charmedBy.isNull) {
      result.isPlayerPet = true;
      result.ownerGuid = unit.charmedBy;
      result.linkMethod = "charmedBy";
      result.isMine = unit.charmedBy.equals(me.guid);
      
      const owner = unit.charmedBy.toUnit();
      if (owner && owner.isPlayer()) {
        result.ownerName = owner.unsafeName;
        result.petType = "Charmed";
      }
      return result;
    }

    // Method 4: Check demonCreator (for warlock demons)
    if (unit.demonCreator && !unit.demonCreator.isNull) {
      result.isPlayerPet = true;
      result.ownerGuid = unit.demonCreator;
      result.linkMethod = "demonCreator";
      result.isMine = unit.demonCreator.equals(me.guid);
      
      const owner = unit.demonCreator.toUnit();
      if (owner && owner.isPlayer()) {
        result.ownerName = owner.unsafeName;
        result.petType = "Demon";
      }
      return result;
    }

    // Method 5: Check PetInfo.pets array (for active pets)
    if (wow.PetInfo && wow.PetInfo.pets) {
      for (const petGuid of wow.PetInfo.pets) {
        if (petGuid.equals(unit.guid)) {
          result.isPlayerPet = true;
          result.isMine = true;
          result.ownerGuid = me.guid;
          result.ownerName = me.unsafeName;
          result.linkMethod = "PetInfo.pets";
          result.petType = "Active Pet";
          return result;
        }
      }
    }

    // Method 6: Check if unit is in a player's group and has pet-like characteristics
    if (this.looksLikePet(unit)) {
      // Find nearby players who might own this pet
      const nearbyPlayers = me.getUnitsAround(40).filter(u => 
        u.isPlayer() && u !== me && me.distanceTo(u) <= 40
      );
      
      for (const player of nearbyPlayers) {
        // Check if pet is very close to this player (likely following)
        if (player.distanceTo(unit) <= 8) {
          result.isPlayerPet = true;
          result.ownerGuid = player.guid;
          result.ownerName = player.unsafeName;
          result.linkMethod = "proximity";
          result.petType = this.identifyPetType(unit, player);
          result.isMine = false;
          return result;
        }
      }
    }

    return result;
  }

  // Helper method to identify pet type based on unit properties and owner class
  identifyPetType(unit, owner) {
    if (!unit || !owner) return null;

    // Check creature type from wow.d.ts
    if (unit.creatureType !== undefined) {
      const creatureTypes = {
        1: "Beast",
        2: "Dragonkin", 
        3: "Demon",
        4: "Elemental",
        5: "Giant",
        6: "Undead",
        7: "Humanoid",
        8: "Critter",
        9: "Mechanical",
        10: "Not specified",
        11: "Totem",
        12: "Non-combat Pet",
        13: "Gas Cloud"
      };
      
      if (creatureTypes[unit.creatureType]) {
        return creatureTypes[unit.creatureType];
      }
    }

    // Check creature family (Hunter pets)
    if (unit.creatureFamily !== undefined && unit.creatureFamily > 0) {
      return "Hunter Pet";
    }

    // Check pet number (indicates it's a numbered pet)
    if (unit.petNumber > 0) {
      return `Pet #${unit.petNumber}`;
    }

    // Fallback to checking owner's specialization auras for class identification
    if (owner.hasAura && typeof owner.hasAura === 'function') {
      // Hunter specs
      if (owner.hasAura("Beast Mastery Hunter") || owner.hasAura("Marksmanship Hunter") || owner.hasAura("Survival Hunter")) {
        return "Hunter Pet";
      }
      // Warlock specs  
      if (owner.hasAura("Affliction Warlock") || owner.hasAura("Demonology Warlock") || owner.hasAura("Destruction Warlock")) {
        return "Demon";
      }
      // Death Knight specs
      if (owner.hasAura("Blood Death Knight") || owner.hasAura("Frost Death Knight") || owner.hasAura("Unholy Death Knight")) {
        return "Undead Minion";
      }
      // Mage specs (for elementals)
      if (owner.hasAura("Arcane Mage") || owner.hasAura("Fire Mage") || owner.hasAura("Frost Mage")) {
        return "Elemental";
      }
    }

    return "Pet";
  }

  // Helper method to determine if a unit looks like a pet based on characteristics
  looksLikePet(unit) {
    if (!unit || !(unit instanceof wow.CGUnit)) return false;

    // Not a player
    if (unit.isPlayer()) return false;

    // Has a pet number
    if (unit.petNumber > 0) return true;

    // Is a known creature type that could be a pet
    const petLikeCreatureTypes = [1, 3, 4, 6, 9, 11]; // Beast, Demon, Elemental, Undead, Mechanical, Totem
    if (unit.creatureType !== undefined && petLikeCreatureTypes.includes(unit.creatureType)) {
      return true;
    }

    // Has a creature family (Hunter pets)
    if (unit.creatureFamily !== undefined && unit.creatureFamily > 0) {
      return true;
    }

    // Is attackable and in combat (likely a combat pet)
    if (unit.isAttackable && unit.inCombat()) {
      return true;
    }

    return false;
  }
} 