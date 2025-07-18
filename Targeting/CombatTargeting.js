import objMgr, { me } from "../Core/ObjectManager";
import Targeting from "./Targeting";
import PerfMgr from "../Debug/PerfMgr";
import colors from "@/Enums/Colors";
import Settings from "@/Core/Settings";
import { TraceLineHitFlags } from '@/Enums/Flags';
import CGUnit from "@/Extensions/CGUnit";
import Pet from "@/Core/Pet";

class CombatTargeting extends Targeting {
  constructor() {
    super();
    this.burstToggle = false;
  }

  update() {
    PerfMgr.begin("Combat Targeting");
    super.update();
    this.calculateBestTarget();
    //this.debugRenderTargets();
    this.drawBurstStatus();
    this.drawBestTargetCircle();
    PerfMgr.end("Combat Targeting");
  }

  reset() {
    super.reset();
  }

  wantToRun() {
    return true;
  }

  collectTargets() {
    objMgr.objects.forEach(obj => {
      if (obj.typeFlags & wow.ObjectType.Unit) {
        this.targets.push(obj);
      }
    });
    return this.targets;
  }

  exclusionFilter() {
    this.targets = this.targets.filter(obj => {
      /** @type {wow.CGUnit} */
      const unit = obj;
      if (!unit.isAttackable) { return false; }
      if (unit.deadOrGhost || unit.health <= 1) { return false; }
      if (unit.distanceTo(me) >= 40) { return false; }
      if (unit.isImmune()) { return false; }
      if (unit === me.target && Settings.AttackOOC) { return true; }
      if (!unit.inCombatWithMe && !wow.Party.currentParty?.isUnitInCombatWithParty(unit)) {
        // Check if the unit is in combat with the player's pet
        const pet = Pet.current;
        if (pet && unit.inCombatWith(pet)) {
          return true;
        }
        return false;
      }
      return true;
    });
  }

  toggleBurst() {
    this.burstToggle = !this.burstToggle;
    console.info(`Burst mode ${this.burstToggle ? 'Enabled' : 'Disabled'}`);
  }

  debugRenderTargets() {
    const drawList = imgui.getBackgroundDrawList();
    if (!drawList || !me) { return; }
    const fromSC = wow.WorldFrame.getScreenCoordinates(me.position);
    this.targets.forEach(unit => {
      const toSC = wow.WorldFrame.getScreenCoordinates(unit.position);
      if (toSC.x > 0 && toSC.y > 0) {
        drawList.addLine(fromSC, toSC, colors.red);
      }
    });
  }

  drawBurstStatus() {
    if (this.burstToggle) {
      const drawList = imgui.getBackgroundDrawList();
      if (!drawList) { return; }

      const viewport = imgui.getMainViewport();
      const pos = {
        x: viewport.workPos.x + 10,
        y: viewport.workPos.y + viewport.workSize.y - 30
      };

      const text = "BURST MODE ENABLED";

      drawList.addText(text, pos, colors.green);
    }
  }

  drawBestTargetCircle() {
    if (!Settings.RenderBestTargetCircle || !this.bestTarget) return;

    const drawList = imgui.getBackgroundDrawList();
    if (!drawList) return;

    const targetPos = this.bestTarget.position;
    const radius = this.bestTarget.boundingRadius;
    const segments = 32; // Increased for smoother circle
    const points = [];

    const twoPi = 2 * Math.PI;
    const angleIncrement = twoPi / segments;

    for (let i = 0; i <= segments; i++) {
      const angle = i * angleIncrement;
      const x = targetPos.x + radius * Math.cos(angle);
      const y = targetPos.y + radius * Math.sin(angle);
      const z = targetPos.z; // Use target's z-position for a flat circle

      const worldPos = new Vector3(x, y, z);
      const screenPos = wow.WorldFrame.getScreenCoordinates(worldPos);
      if (screenPos) {
        points.push(screenPos);
      }
    }

    if (points.length > 1) {
      drawList.addPolyline(points, colors.yellow, 0, 2);
    }
  }

  calculateBestTarget() {
    if (this.targets.length === 0) return null;

    const targetPriority = Settings.TargetPriority;
    const facingTargets = this.targets.filter(target => me.isFacing(target));

    if (facingTargets.length === 0) return null;

    switch (targetPriority) {
      case "Closest":
        return facingTargets.reduce((closest, current) =>
          current.distanceTo(me) < closest.distanceTo(me) ? current : closest
        );
      case "Lowest Health":
        return facingTargets.reduce((lowest, current) =>
          current.health < lowest.health ? current : lowest
        );
      case "Highest Health":
        return facingTargets.reduce((highest, current) =>
          current.health > highest.health ? current : highest
        );
      default:
        return facingTargets[0];
    }
  }

  /**
   * @returns {wow.CGUnit | null}
   */
  get bestTarget() {
    return this.calculateBestTarget();
  }

  getAverageTimeToDeath() {
    if (this.targets.length === 0) {
      return 0;
    }

    let totalTimeToDeath = 0;
    let validTargets = 0;

    for (const target of this.targets) {
      const ttd = target.timeToDeath();
      if (ttd !== undefined) {
        totalTimeToDeath += ttd;
        validTargets++;
      }
    }

    if (validTargets === 0) {
      return 0;
    }

    return totalTimeToDeath / validTargets;
  }

  /**
   * Gets the units around a specified unit within a given distance or melee range.
   * @param {wow.CGUnit} unit - The central unit to check around.
   * @param {number} distance - The maximum distance to consider.
   * @returns {wow.CGUnit[]} An array of units within the specified distance or melee range of the given unit.
   */
  getUnitsAroundUnit(unit, distance) {
    if (!unit) return [];
    return this.targets.filter(target =>
      target.distanceTo(unit) <= distance || unit.isWithinMeleeRange(target)
    );
  }
}

export const defaultCombatTargeting = new CombatTargeting();
export default CombatTargeting;
export const bestTarget = defaultCombatTargeting.bestTarget;
