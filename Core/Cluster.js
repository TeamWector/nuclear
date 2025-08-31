import { me } from '@/Core/ObjectManager';
import { TraceLineHitFlags } from "@/Enums/Flags";

const Cluster = {
  findGroundRadiusPosition(center, targets, range, radius, space = 2.5) {
    let bestPos = center;
    let maxTargets = 0;
    let bestTargetsInRange = [];
    const radiusSq = radius * radius;
    const rangeSq = range * range;

    // Step 1: Filter targets within range (range + radius)
    const validTargets = targets.filter(target => {
      const dx = target.x - center.x;
      const dy = target.y - center.y;
      return dx * dx + dy * dy <= (range + radius) * (range + radius);
    });

    // Step 2: Generate grid points within range
    const gridPoints = [];
    for (let dx = -range; dx <= range; dx += space) {
      for (let dy = -range; dy <= range; dy += space) {
        if (dx * dx + dy * dy <= rangeSq) {
          gridPoints.push({ x: center.x + dx, y: center.y + dy });
        }
      }
    }

    // Step 3: Evaluate each grid point
    for (let gridPoint of gridPoints) {
      const targetsInRange = validTargets.filter(target => {
        const dx = target.x - gridPoint.x;
        const dy = target.y - gridPoint.y;
        return dx * dx + dy * dy <= radiusSq;
      });
      if (targetsInRange.length > maxTargets) {
        // get Z-axis for grid point
        const result = wow.World.traceLine(
          { ...gridPoint, z: center.z + 100.0 },
          { ...gridPoint, z: center.z - 100.0 },
          TraceLineHitFlags.COLLISION);
        if (!result.hit) {
          continue;
        }
        gridPoint = result.wp;

        // Perform Line of Sight check
        const from = { ...center, z: me.position.z + me.displayHeight * 0.9 };
        const traceResult = wow.World.traceLine(from, gridPoint, TraceLineHitFlags.SPELL_LINE_OF_SIGHT);
        if (traceResult.hit) {
          continue;
        }

        maxTargets = targetsInRange.length;
        bestPos = gridPoint;
        bestTargetsInRange = targetsInRange;
      }
    }

    return { position: bestPos, targetsHit: maxTargets };
  },
}

export default Cluster;
