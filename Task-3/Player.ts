import helpers from "../../shared/helpers";
import { Schema, type } from "@colyseus/schema";
import { Unit, InventoryType } from "./Unit";
import { Item } from "./Item";
import { DBHero } from "../db/Hero";
import { EquipedItems } from "../core/EquipedItems";
import { EquipableItem } from "./items/EquipableItem";
import { Point } from "../rooms/states/DungeonState";
import { CastableItem } from "./items/CastableItem";
import { Inventory } from "../core/Inventory";
import { generateId } from "colyseus";
import { ConsumableItem } from "./items/ConsumableItem";
import { createItem } from "./items/createItem";
import { distance } from "../helpers/Math";

export class SkinProperties extends Schema {
  @type("number") klass: number;
  @type("number") hair: number;
  @type("number") hairColor: number;
  @type("number") eye: number;
  @type("number") body: number;
}

const INACTIVE_TIME_FOR_DISCONNECTION = 3 * 60 * 1000; // 3 minutes

export class Player extends Unit {
  @type("string") name: string;
  @type(SkinProperties) properties = new SkinProperties();

  @type("number") gold: number;
  @type("number") diamond: number;

  @type("number") latestProgress: number;
  @type("number") pointsToDistribute: number;

  @type("boolean") isTyping: boolean;

  purchase: Inventory = new Inventory({ capacity: 12 });

  movementSpeed = 520;
  attackSpeed = 900;

  shouldSaveCoords: boolean = false;
  checkPoint: number;

  hero: DBHero;
  isSwitchingDungeons: boolean = false;

  lastInteractionTime: number = Date.now();

  constructor (id, hero: DBHero, state?) {
    super(id, hero, state)
    this.type = helpers.ENTITIES.PLAYER

    this.latestProgress = hero.latestProgress;

    this.name = hero.name
    this.lvl = hero.lvl || 1

    // skin properties
    this.properties.klass = hero.klass;
    this.properties.hair = hero.hair;
    this.properties.hairColor = hero.hairColor;
    this.properties.eye = hero.eye;
    this.properties.body = hero.body;

    this.gold = hero.gold || 0;
    this.diamond = hero.diamond || 0;

    this.pointsToDistribute = hero.pointsToDistribute;

    this.hpRegeneration = 1;
    this.direction = "bottom";

    this.hero = hero;
  }

  update(currentTime) {
    super.update(currentTime);

    // switch back to Castle if user is inactive!
    if (
      this.state.progress !== 1 &&
      currentTime >= this.lastInteractionTime + INACTIVE_TIME_FOR_DISCONNECTION &&
      !this.isSwitchingDungeons
    ) {
      this.isSwitchingDungeons = true;
      this.state.events.emit('disconnect', this);
    }
  }

  getItemByType(type: string) {
    const inventoriesToSearchFor: InventoryType[] = ['inventory']; // , 'quickInventory'

    for (let i = 0; i < inventoriesToSearchFor.length; i++) {
      const inventoryType = inventoriesToSearchFor[i];
      const inventory: Inventory = this[inventoryType];
      const item = Array.from(inventory.slots.values()).find(item => item.type === type);
      if (item) {
        return item;
      }
    }
  }

  useItem(inventoryType: InventoryType, itemId: string, force: boolean = false) {
    const inventory = this[inventoryType];
    const item: Item = inventory.slots[itemId];

    // buying items!
    if (item && inventory === this.purchase) {
      return this.inventoryBuy(item);
    }

    if (item && item.use(this, this.state, force)) {
      return inventory.remove(itemId);
    }
  }

  castItem(inventoryType: InventoryType, itemId: string, position: Point) {
    const inventory = this[inventoryType];
    const item: CastableItem = inventory.slots[itemId];

    if (item && item.cast(this, this.state, position)) {
      inventory.remove(itemId);
    }
  }

  distributePoint (attribute: string) {
    if (
      this.pointsToDistribute > 0 &&
      typeof (this.attributes[attribute]) !== undefined
    ) {
      this.attributes[attribute]++;
      this.pointsToDistribute--;
      this.recalculateStatsModifiers();
    }
  }

  setTradingItems(items: Item[]) {
    this.purchase.clear();
    this.purchase.set(items);

    // populate item prices
    [
      this.purchase,
      this.inventory,
      // this.quickInventory,
      this.equipedItems
    ].forEach(inventory => {
      inventory.slots.forEach((item, itemId) => {
        if (inventory === this.purchase) {
          item.price = item.getPrice();

        } else {
          item.price = item.getSellPrice();
        }
      });
    });

    this.state.events.emit("send", this, ["trading-items", this.purchase.slots]);
  }

  inventoryDrag(fromInventoryType: InventoryType, toInventoryType: InventoryType, itemId: string, switchItemId: string) {
    const fromInventory = this[fromInventoryType];
    const toInventory = this[toInventoryType]

    const item = fromInventory.getItem(itemId);
    const switchItem = toInventory.getItem(switchItemId);

    // buying items!
    if (item && fromInventory === this.purchase) {
      if (switchItem) {
        this.inventorySell(toInventoryType, switchItemId);
      }

      return this.inventoryBuy(item, toInventory);
    }

    if (item && switchItem) {
      // @colyseus/schema workaround
      // without workaround: https://github.com/colyseus/schema/issues/26
      if ((toInventory instanceof EquipedItems)) {
        if (item instanceof EquipableItem) {
          // item must be equipable!
          fromInventory.remove(itemId);
          fromInventory.add(switchItem);
          toInventory.add(item, true);
        }

      } else {
        fromInventory.remove(itemId);
        toInventory.remove(switchItemId);

        fromInventory.add(switchItem);
        toInventory.add(item);
      }

    } else if (item && toInventory.hasAvailability()) {
      fromInventory.remove(itemId);
      toInventory.add(item);
    }
  }

  inventorySell(fromInventoryType: InventoryType, itemId: string) {
    const fromInventory = this[fromInventoryType];

    // prevent hacking.
    if (
      !(fromInventory instanceof Inventory) ||
      this.purchase.numItems === 0 // not on purchase mode!
    ) {
      return;
    }

    const item: Item = fromInventory.getItem(itemId);

    if (item && fromInventory !== this.purchase) {
      // selling price is half of buying price
      const price = item.getSellPrice();
      this.state.createTextEvent("+" + price, this.position, 'yellow', 100);

      if (item.premium) {
        this.diamond += price;

      } else {
        this.gold += price;

      }
      fromInventory.remove(itemId);

      // this.state.events.emit('sound', 'buy', this);
    }
  }

  inventoryBuy (item: Item, toInventory?: Inventory) {
    if (!toInventory) { toInventory = this.inventory; }

    let hasAvailability = false;
    let success = false;
    let sameItemToIncrement: ConsumableItem;

    if (item instanceof ConsumableItem) {
      sameItemToIncrement = item.getSameItemToIncrement(this.inventory.slots);
      hasAvailability = (sameItemToIncrement !== undefined);
    }

    if (toInventory instanceof EquipedItems) {
      hasAvailability = toInventory.isSlotAvailable((item as EquipableItem).slotName);

    } else if (!hasAvailability) {
      hasAvailability = toInventory.hasAvailability();
    }

    if (toInventory && hasAvailability) {
      if (item.premium && this.diamond >= item.getPrice()) {
        this.diamond -= item.getPrice();
        success = true;

      } else if (!item.premium && this.gold >= item.getPrice()) {
        this.gold -= item.getPrice();
        success = true;
      }

      let hasIncrementedQty = false;
      if (success && item instanceof ConsumableItem) {
        hasIncrementedQty = item.incrementQtyFromSlots(this.inventory.slots);

        if (sameItemToIncrement) {
          sameItemToIncrement.price = sameItemToIncrement.getSellPrice();
        }
      }

      if (success && !hasIncrementedQty) {
        // update price to sell price once player bought it
        const addedItem = item.clone();
        addedItem.price = addedItem.getSellPrice();
        addedItem.id = generateId();

        toInventory.add(addedItem);
      }

      // this.state.events.emit('sound', 'buy', this);
    }
  }

  drop () {
    if (!this.state) { return; }

    if (this.state.isPVPAllowed) {
      return;
    }

    // if (this.state.isPVPAllowed) {
    // }

    const itemToDrop = this.equipedItems.dropRandomItem();

    if (itemToDrop) {
      this.state.addEntity(createItem(itemToDrop, this.position));
    }
  }

  getXPWorth () {
    if (this.state.isPVPAllowed) {
      return 0;

    } else {
      return super.getXPWorth();
    }
  }

  autoAttack(position?: Point) {
    let allowedDistance: number;

    if (!position) {
      position = this.position;
      // auto-attack
      allowedDistance = 12;

    } else {
      // clicked near an enemy
      allowedDistance = 2;
    }

    const distances = []
    for (let sessionId in this.state.enemies) {
      const unit: Unit = this.state.enemies[sessionId];
      if (unit.isAlive) {
        const dist = distance(position, unit.position);
        if (dist <= allowedDistance) {
          distances.push([unit, dist]);
        }
      }
    }

    if (this.state.isPVPAllowed) {
      // search for players!
      for (let sessionId in this.state.players) {
        const unit: Unit = this.state.players[sessionId];
        if (unit.isAlive) {
          const dist = distance(position, unit.position);
          if (dist <= allowedDistance) {
            distances.push([unit, dist]);
          }
        }
      }
    }

    const sortedDistances = distances.sort((a,b) => a[1] - b[1]);
    const closestUnit = sortedDistances[0];

    if (closestUnit) {
      this.state.move(this, { x: closestUnit[0].position.y, y: closestUnit[0].position.x }, true)
    }
  }

  dropItem(inventoryType: InventoryType, itemId: string) {
    const inventory = this[inventoryType];
    const item: Item = inventory.getItem(itemId)

    // skip when trying to drop from trade
    if (inventory === this.purchase) {
      return;
    }

    if (item && inventory.remove(itemId)) {
      this.state.dropItemFrom(this, item);
    }
  }

  onDie () {
    const unitsInvolved = super.onDie();

    if (unitsInvolved.length > 0) {
      const unit = unitsInvolved[unitsInvolved.length - 1];

      // broadcast died event for global chat.
      this.state.events.emit('event', {
        name: this.name,
        progress: this.state.progress,
        slain: ((unit as Player).name) || ((unit as any).kind)
      });

    }

    return unitsInvolved;
  }

  dispose() {
    super.dispose();

    delete this.properties;
    delete this.purchase;
  }

}
