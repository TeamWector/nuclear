import { ObjectFlags } from "@/Enums/Flags";

Object.defineProperties(wow.CGObject.prototype, {
  /**
   * @this {wow.CGObject}
   * @param {wow.CGObject | Vector3} to
   * @returns {number} distance
   */
  distanceTo: {
    value: function (to) {
      // Check if this object exists and has a position
      if (!this || !this.position) {
        return Infinity;
      }

      const from = this.position;
      if (to instanceof Vector3) {
        return from.distanceSq(to);
      } else if (to instanceof wow.CGUnit) {
        // Check if target unit has a position
        if (!to.position) {
          return Infinity;
        }

        // XXX: not sure about this, better have unit.spellDistance for bounding radius calculations
        let bbRadius = 0;
        if (this instanceof wow.CGUnit) {
          //bbRadius = this.boundingRadius + to.boundingRadius;
          bbRadius = this.getMeleeRange(to);
        } else {
          bbRadius = to.boundingRadius || 0;
        }
        const dist = from.distanceSq(to.position);
        return dist < bbRadius ? 0 : dist;
      } else if (to instanceof wow.CGObject) {
        const pos = to.position;
        if (!pos) {
          return Infinity;
        }
        return from.distanceSq(pos);
      }
      throw `expected wow.CGObject | Vector3 got ${typeof to}`;
    }
  },

  /**
   * @this {wow.CGObject}
   * @param {wow.CGObject | Vector3} to
   * @returns {number} distance
   */
  distanceTo2D: {
    value: function (to) {
      // Check if this object exists and has a position
      if (!this || !this.position) {
        return Infinity;
      }

      const from = this.position;
      if (to instanceof Vector3) {
        return from.distanceSq2D(to);
      } else if (to instanceof wow.CGUnit) {
        // Check if target unit has a position
        if (!to.position) {
          return Infinity;
        }

        let bbRadius = 0;
        if (this instanceof wow.CGUnit) {
          bbRadius = this.getMeleeRange(to);
          //bbRadius = this.boundingRadius + to.boundingRadius;
        } else {
          bbRadius = to.boundingRadius || 0;
        }
        const dist = from.distanceSq2D(to.position);
        return dist < bbRadius ? 0 : dist - bbRadius;
      } else if (to instanceof wow.CGObject) {
        const pos = to.position;
        if (!pos) {
          return Infinity;
        }
        return from.distanceSq2D(pos);
      }
      throw `expected wow.CGObject | Vector3 got ${typeof to}`;
    }
  },

  /**
   * @returns {boolean}
   */
  isInteractable: {
    get: function () {
      return (this.dynamicFlags & ObjectFlags.Interactable) === 0;
    }
  },

  /**
   * @returns {boolean}
   */
  isLootable: {
    get: function () {
      return (this.dynamicFlags & ObjectFlags.Lootable) > 0;
    }
  },

  withinInteractRange: {
    value: function (obj) {
      // Check if this object exists and has required properties
      if (!this || !obj) {
        return false;
      }

      const objRadius = obj.boundingRadius ?? obj.displayHeight ?? 0;  // Defaults to 0 if undefined or null
      const thisRadius = this.boundingRadius ?? 0;
      const distance = Math.max(thisRadius + objRadius + 1.333, 6);

      return this.distanceTo(obj) < distance;
    }
  }
});

export default true;
