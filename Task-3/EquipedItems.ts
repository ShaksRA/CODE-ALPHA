import { Inventory } from "./Inventory";
import { EquipableItem } from "../entities/items/EquipableItem";
import { EquipmentSlot } from "./EquipmentSlot";
import { Item } from "../entities/Item";
import { EventEmitter } from "events";

export class EquipedItems extends Inventory {
  events = new EventEmitter();

  constructor () {
    super({ capacity: 5 })
  }

  isSlotAvailable(slot: EquipmentSlot) {
    return !this.slots[slot];
  }

  add (item: EquipableItem, force: boolean = false) {
    // FORCE is a workaround for a @colyseus/schema bug
    const hasAvailability = this.isSlotAvailable(item.slotName) || force;

    if (hasAvailability) {
      this.slots[item.slotName] = item;
      this.events.emit('change');
    }

    return hasAvailability;
  }

  getItem(itemIdOrSlotName: string) {
    if (this.slots[itemIdOrSlotName]) {
      // allow to get item by slot name
      return this.slots[itemIdOrSlotName];

    } else {
      // allow to get item by id
      return Array.from(this.slots.values()).find((item) =>  {
        return item.id === itemIdOrSlotName;
      });
    }
  }

  dropRandomItem() {
    const equippedSlots: EquipmentSlot[] = [
      EquipmentSlot.HEAD,
      EquipmentSlot.BODY,
      EquipmentSlot.LEFT,
      EquipmentSlot.RIGHT,
      EquipmentSlot.FEET
    ].filter(slotName => !this.isSlotAvailable(slotName));

    const dropItemFromSlot = equippedSlots[Math.floor(Math.random() * equippedSlots.length)];

    if (dropItemFromSlot) {
      const item = this.getItem(dropItemFromSlot);
      this.remove(dropItemFromSlot);
      return item;
    }
  }

  remove(itemIdOrSlotName: string) {
    if (this.slots[itemIdOrSlotName]) {
      delete this.slots[itemIdOrSlotName];
      this.events.emit('change');
      return true;

    } else {
      const entries = Array.from(this.slots.entries());
      for (const [slotName, itemInSlot] of entries) {
        if (itemInSlot.id === itemIdOrSlotName) {
          delete this.slots[slotName];
          this.events.emit('change');
          return true;
        }
      }
    }

    return false;
  }

  dispose() {
    this.events.removeAllListeners();
    delete this.events;
  }

}
