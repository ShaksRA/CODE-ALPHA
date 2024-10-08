import { Room, Client, generateId } from "colyseus";
import { DungeonState, RoomType, roomTypes } from "./states/DungeonState";
import { verifyToken } from "@colyseus/social";
import { Hero, DBHero } from "../db/Hero";
import { Player } from "../entities/Player";
import { DoorProgress } from "../entities/interactive/Door";
import { Season } from "../db/Season";
import { Movement } from "../core/Movement";
import { Portal } from "../entities/interactive/Portal";
import { debugLog } from "../utils/Debug";
import { NUM_LEVELS_PER_CHECKPOINT, MAX_LEVELS } from "../utils/ProgressionConfig";

const TICK_RATE = 20 // 20 ticks per second

export class DungeonRoom extends Room<DungeonState> {
  maxClients = 50;
  progress: number;
  roomName: RoomType;
  players = new WeakMap<Client, Player>();
  clientMap = new WeakMap<Player, Client>();

  disposeTimeout = 5; // 5 seconds default

  async onCreate (options) {
    this.progress = options.progress || 1;

    // maximum of 8 players allowed on each room.
    if (this.progress !== 1 && this.progress !== MAX_LEVELS) {
      this.maxClients = 8;
    }

    if (roomTypes.indexOf(this.roomName) === -1) {
      console.warn(`WARN: The roomType "" is not valid`, `Expected values are (${roomTypes.join(', ')}) `);
    }

    this.players = new WeakMap();
    this.clientMap = new WeakMap();

    // Get season/random seed for this room.
    let seed: string;
    if (this.progress === 1 || this.progress === MAX_LEVELS) {
      seed = "castleseed";

    } else {
      let season = await Season.find({}).sort({ until: -1 }).findOne();
      if (!season || Date.now() > season.until) {
        season = await Season.create({
          seed: `${generateId()}-${generateId()}`,
          until: Date.now() + (60 * 60 * 24 * 1 * 1000) // one from now! (in milliseconds)
          // until: Date.now() + (60 * 60 * 24 * 7 * 1000) // one week from now! (in milliseconds)
        })
      }
      seed = season.seed;
    }

    this.setState(new DungeonState(this.progress, seed, this.roomName));

    debugLog(`'${this.roomName}' created (with "${seed}" seed) => progress: ${this.progress}`);

    // Allow PVP?
    if (this.state.progress > 1 && options.isPVPAllowed) {
      this.state.isPVPAllowed = true;
    }

    this.state.events.on('goto', this.onGoTo.bind(this));
    this.state.events.on('disconnect', this.onDisconnect.bind(this));
    this.state.events.on('sound', this.broadcastSound.bind(this));
    this.state.events.on('send', this.sendToPlayer.bind(this));
    this.state.events.on('broadcast', this.broadcastToAll.bind(this));
    this.state.events.on('event', this.broadcastEvent.bind(this));

    this.registerMessages();
    this.setSimulationInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  registerMessages() {
    this.onMessage("*", (client, key, value) => {
      const player = this.players.get(client)

      if (!player) {
        console.log("ERROR: message comming from invalid player.")
        return
      }

      player.lastInteractionTime = this.clock.currentTime;

      if (!player.isAlive) {
        console.log("a dead player cannot perform actions!");
        return;
      }

      if (key == 'move') {
        (player.position as Movement).target = null;
        this.state.move(player, value, true)

      } else if (key == 'atk') {
        player.autoAttack(value);

      } else if (key == 'type') {
        player.isTyping = value;

      } else if (key == 'distribute-point') {
        const { attribute } = value;
        player.distributePoint(attribute);

      } else if (key == 'inventory-drag') {
        const { fromInventoryType, toInventoryType, itemId, switchItemId } = value;
        // debugLog(`trading from '${fromInventoryType}' to ${toInventoryType}`);;
        player.inventoryDrag(fromInventoryType, toInventoryType, itemId, switchItemId);

      } else if (key == 'inventory-sell') {
        const { fromInventoryType, itemId } = value;
        // debugLog(`selling from '${fromInventoryType}'`);
        player.inventorySell(fromInventoryType, itemId);

      } else if (key == 'use-item') {
        const { inventoryType, itemId } = value;
        player.useItem(inventoryType, itemId);

      } else if (key == 'skill') {
        player.useSkill(value);

      } else if (key == 'cast') {
        const { inventoryType, itemId, position } = value;
        player.castItem(inventoryType, itemId, position);

      } else if (key == 'drop-item') {
        const { inventoryType, itemId } = value;
        player.dropItem(inventoryType, itemId);

      } else if (key == 'checkpoint') {
        const progress = parseInt(value);

        // TODO: check if player is actually on top of a checkpoint tile
        if (player.hero.checkPoints.includes(progress)) {
          this.onGoTo(player, { progress }, { isCheckPoint: true });
        }

      } else if (key == 'msg') {
        player.isTyping = false;
        this.state.addMessage(player, value);
      }
    });
  }

  async onAuth (client, options) {
    console.log("onAuth, options =>", options);
    return verifyToken(options.token)._id;
  }

  async onJoin (client: Client, options: any, userId: string) {
    //
    // // TODO: AdBlock trolling!
    //
    // if (options.adBlock) {
    //   const player: any = this.state.roomUtils.createEnemy("rat");
    //   player.id = client.sessionId;

    //   this.state.addEntity(player);

    //   this.players.set(client, player)
    //   this.clientMap.set(player, client)
    //   return;
    // }

    const _id = options.heroId;
    const hero = await Hero.findOne({ userId, _id });

    if (!hero) {
      return false;
    }

    if (hero.online) {
      // prevent users from opening multiple tabs
      client.send("already-logged-in");
      client.leave();
      return false;

    } else {
      hero.online = true;
      await hero.save();
    }

    // clear $inc hero values (for `onLeave`)
    hero.kills = 0;
    hero.deaths = 0;

    const player = this.state.createPlayer(client, hero, options);
    this.players.set(client, player)
    this.clientMap.set(player, client)

    if (this.roomName !== hero.currentRoom) {
      hero.currentRoom = this.roomName;
    }

    // store hero's currentProgress
    if (this.state.progress !== hero.currentProgress) {
      hero.currentProgress = this.state.progress;

      const $set: any = { currentProgress: hero.currentProgress };
      if (this.state.progress > hero.latestProgress) {
        $set.latestProgress = this.state.progress;
      }

      Hero.updateOne({ _id: hero._id }, { $set }).then(() => {});
    }
  }

  onGoTo (player, destiny, params: any = {}) {
    const client = this.clientMap.get(player);
    const hero = player.hero;

    // validate checkpoint usage
    if (
      params.isCheckPoint &&
      this.state.roomUtils.checkPoint &&
      this.state.roomUtils.checkPoint.position.equals(player.position)
    ) {
      player.isSwitchingDungeons = true;
    }

    if (!hero || !player.isSwitchingDungeons) {
      return;
    }

    const destinyParams: any = { progress: destiny.progress };

    if (destiny.room) {
      destinyParams.room = destiny.room;
    }

    if (destiny.progress === DoorProgress.FORWARD) {
      destinyParams.progress = hero.currentProgress + 1;

    } else if (destiny.progress === DoorProgress.BACK) {
      destinyParams.progress = hero.currentProgress - 1;

    } else if (destiny.progress === DoorProgress.LATEST) {
      destinyParams.progress = hero.latestProgress;
    }

    client.send('goto', [destinyParams, params]);
  }

  onDisconnect (player) {
    this.clientMap.get(player)?.leave();
  }

  sendToPlayer (player, data) {
    const client = this.clientMap.get(player);

    if (player && client) {
      client.send(data[0], data[1]);
    }
  }

  broadcastToAll (data) {
    const type = data.shift();
    this.broadcast(type, data);
  }

  broadcastEvent (data) {
    this.presence.publish("events", data);
  }

  broadcastSound (soundName, player) {
    if (player) {
      const client = this.clientMap.get(player);

      if (client) {
        this.clientMap.get(player).send("sound", soundName);

      } else {
        console.log("trying to broadcast sound to NPC. skip.");
      }

    } else {
      this.broadcast("sound", soundName);
    }
  }

  removeEntity (entity) {
    this.state.removeEntity(entity)
  }

  async onLeave (client) {
    const player = this.players.get(client);
    const hero: DBHero = player && player.hero;

    if (!hero || !hero._id) {
      return;
    }

    let autoDisposeTimeout = this.disposeTimeout;

    // if a player dies on this dungeon, the timeout is 2 minutes.
    if (player.hp.current <= 0 || this.progress === 1) {
      autoDisposeTimeout = 60 * 2;
    }

    // const quickInventory = Array.from(player.quickInventory.slots.values()).map(slot => slot.toJSON());
    const inventory = Array.from(player.inventory.slots.values()).map(slot => slot.toJSON());
    const equipedItems = Array.from(player.equipedItems.slots.values()).map(slot => slot.toJSON());

    const additionalData: {[id: string]: any} = { inventory, equipedItems }; // quickInventory,

    additionalData.currentProgress = hero.currentProgress;
    additionalData.currentRoom = hero.currentRoom;

    const $update: any = {
      $inc: {
        kills: hero.kills,
        deaths: hero.deaths,
      },
      $set: {
        online: false,

        lvl: player.lvl,
        strength: player.attributes.strength,
        agility: player.attributes.agility,
        intelligence: player.attributes.intelligence,
        pointsToDistribute: player.pointsToDistribute,

        gold: player.gold,
        diamond: player.diamond,

        hp: player.hp.current,
        mp: player.mp.current,
        xp: player.xp.current,

        ...additionalData
      },
    };

    if (player.checkPoint) {
      $update.$addToSet = { checkPoints: player.checkPoint };
    }

    // sync
    await Hero.updateOne({ _id: hero._id }, $update);

    this.players.delete(client);
    this.clientMap.delete(player);
    this.state.removePlayer(player);

    // prevent loot dungeons from being looted multiple times using portals.
    const lastPortalOpened = this.state.getAllEntitiesOfType(Portal).sort((a, b) =>
      b.creationTime - a.creationTime)[0];
    if (lastPortalOpened) {
      const elapsedPortalTime = (Date.now() - lastPortalOpened.creationTime);
      const additionalTime = (lastPortalOpened.ttl - elapsedPortalTime) / 1000;
      autoDisposeTimeout += additionalTime;
    }

    this.resetAutoDisposeTimeout(autoDisposeTimeout);
  }

  tick () {
    // update game logic
    this.clock.tick()
    this.state.update(this.clock.currentTime)
  }

  dispose () {
    this.state.dispose();
    delete this.state;
  }

}
