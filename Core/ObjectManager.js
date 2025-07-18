import perfMgr from "../Debug/PerfMgr";
import spell from "@/Core/Spell";

/**
 * @type {wow.CGActivePlayer}
 */
export let me = null;

class ObjectManager {
  constructor() {
    this.reset();
    this.aurasLogged = false; // Flag to log auras only once
  }

  /**
   * @type {Map<BigInt, wow.CGObject>}
   */
  objects = new Map();

  reset() {
    this.objects.clear();
  }

  tick() {
    perfMgr.begin("objmgr");

    const currentManager = new wow.ClntObjMgr();
    const newObjects = currentManager.active;

    // Remove invalidated objects
    this.objects.forEach((_, hash) => {
      if (!newObjects.has(hash)) {
        this.objects.delete(hash);
      }
    });

    // Invalidate 'me' if removed
    if (me && (!currentManager.localGuid || !newObjects.has(currentManager.localGuid.hash))) {
      me = null;
    }

    // Add new objects
    newObjects.forEach((obj, hash) => {
      if (!this.objects.has(hash)) {
        const newObject = this.createObj(obj);
        if (newObject) {
          this.objects.set(hash, newObject);
        }
      }
    });

    perfMgr.end("objmgr");
  }

  findObject(identifier) {
    // If it's an instance of wow.Guid, get the object by its hash
    if (identifier instanceof wow.Guid) {
      return this.objects.get(identifier.hash) || null;
    }

    // If it's an object that has a guid property, verify and return it
    if (identifier && typeof identifier === 'object' && 'guid' in identifier) {
      const object = this.objects.get(identifier.guid.hash);
      return object ? object : null;
    }

    // If it's a direct GUID hash
    return this.objects.get(identifier) || null;
  }

  createObj(base) {
    switch (base.type) {
      case wow.ObjectTypeID.Item:
        return new wow.CGItem(base.guid);
      case wow.ObjectTypeID.Container:
        return new wow.CGContainer(base.guid);
      case wow.ObjectTypeID.AzeriteEmpoweredItem:
        return new wow.CGAzeriteEmpoweredItem(base.guid);
      case wow.ObjectTypeID.AzeriteItem:
        return new wow.CGAzeriteItem(base.guid);
      case wow.ObjectTypeID.Unit:
        return new wow.CGUnit(base.guid);
      case wow.ObjectTypeID.Player:
        return new wow.CGPlayer(base.guid);
      case wow.ObjectTypeID.ActivePlayer:
        me = new wow.CGActivePlayer(base.guid);
        return me;
      case wow.ObjectTypeID.GameObject:
        return new wow.CGGameObject(base.guid);
      case wow.ObjectTypeID.Dynamic:
        return new wow.CGDynamicObject(base.guid);
      case wow.ObjectTypeID.AreaTrigger:
        return new wow.CGAreaTrigger(base.guid);
      default:
        // obj number 10 and 11 appearing, whut this? Help me Tovarish Ian.
        //console.warn(`Unknown object type: ${base.type}`);
        return null;
    }
  }
  /**
   * Debug method to log all current auras for the player
   * Call this method when you need to debug aura IDs
   */
  logPlayerAuras() {
    if (me && me.auras && me.auras.length > 0) {
      console.info('=== PLAYER AURAS DEBUG ===');
      me.auras.forEach(aura => {
        console.info(`Aura ID: ${aura.spellId}, Name: ${aura.name || 'Unknown'}, Stacks: ${aura.stacks || 1}`);
      });
      console.info('=== END AURAS DEBUG ===');
    } else {
      console.info('No player or no auras found');
    }
  }
}


export default new ObjectManager();

