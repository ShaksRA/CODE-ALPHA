import { Schema, type, ArraySchema, MapSchema } from "@colyseus/schema";
import gen, { RandomSeed } from "random-seed";

import dungeon from "../../../shared/Dungeon";
import helpers from "../../../shared/helpers";

import { EventEmitter } from "events";
import PF from "pathfinding";

import { GridUtils } from "../../utils/GridUtils";
import { RoomUtils, ItemDropOptions, DungeonRoom } from "../../utils/RoomUtils";

// entities
import { Player } from "../../entities/Player";
import { Enemy } from "../../entities/Enemy";
import { Unit } from "../../entities/Unit";

// entity types
import { Item } from "../../entities/Item";
import { TextEvent } from "../../entities/ephemeral/TextEvent";
import { Interactive } from "../../entities/Interactive";
import { Entity } from "../../entities/Entity";
import { MoveEvent } from "../../core/Movement";
import { DBHero } from "../../db/Hero";
import { MapKind, MapConfig, getMapConfig, isBossMap, MAX_LEVELS } from "../../utils/ProgressionConfig";
import { NPC } from "../../entities/NPC";
import { DoorDestiny, DoorProgress, Door } from "../../entities/interactive/Door";
import { Portal } from "../../entities/interactive/Portal";
import { debugLog } from "../../utils/Debug";
import { Jail } from "../../entities/interactive/Jail";
import * as TrueHell from "../../maps/truehell";
import { parseMapTemplate } from "../../utils/MapTemplateParser";
import { distance } from "../../helpers/Math";

export interface Point {
  x: number;
  y: number;
}

type EntityConstructor<U extends Entity> = {new(...args: any[]): U; };

export type RoomType = 'dungeon' | 'pvp' | 'loot' | 'infinite' | 'truehell';
export const roomTypes: RoomType[] = ['dungeon', 'pvp', 'loot', 'infinite', 'truehell'];

export class DungeonState extends Schema {
  @type("number") progress: number;
  @type("boolean") daylight: boolean;
  @type("string") mapkind: MapKind;
  @type("uint8") mapvariation: number;

  @type(["number"]) grid = new ArraySchema<number>();
  @type("number") width: number;
  @type("number") height: number;
  @type({ map: Entity }) entities = new MapSchema<Entity>();
  entitiesToRemove: Entity[] = [];

  @type("boolean") isPVPAllowed: boolean;

  rooms: DungeonRoom[];
  players: {[id: string]: Player} = {};
  enemies: {[id: string]: Enemy} = {};

  rand: RandomSeed; // predicatble random generator

  config: MapConfig;
  oneDirection: boolean;
  hasConnections: boolean;
  hasObstacles: boolean;

  gridUtils: GridUtils;
  roomUtils: RoomUtils;

  pathgrid: PF.Grid;
  finder = new PF.AStarFinder({
    diagonalMovement: PF.DiagonalMovement.Always
  } as any);

  events = new EventEmitter();

  constructor (progress, seed: string, roomType: RoomType) {
    super()

    this.rand = gen.create(seed + progress);
    this.progress = progress;
    this.isPVPAllowed = (roomType === "pvp" || progress > MAX_LEVELS);

    this.config = getMapConfig(this.progress, roomType);

    // prevent hack attempt to load non-existing level
    if (!this.config) {
      this.progress = 2;
      this.config = getMapConfig(this.progress, roomType);
    }

    this.daylight = this.config.daylight;
    this.mapkind = this.config.mapkind;
    this.mapvariation = (this.progress % 2 === 0) ? 2 : 1;

    this.width = this.config.getMapWidth(this.progress);
    this.height = this.config.getMapHeight(this.progress);
    const minRoomSize = this.config.minRoomSize;
    const maxRoomSize = this.config.maxRoomSize;

    let numRooms: number;
    switch (roomType) {
      case "loot":
        numRooms = 1;
        break;
      case "truehell":
        numRooms = 1;
        break;
      default:
        const minRooms = (this.progress == 1 || this.progress === MAX_LEVELS) ? 2 : 3;
        const maxRooms = (this.progress == 1 || this.progress === MAX_LEVELS) ? 2
          : Math.min(
            Math.floor((this.width * this.height) / (maxRoomSize.x * maxRoomSize.y)),
            Math.floor(progress / 2)
          );
        numRooms = Math.max(minRooms, maxRooms);
    }

    debugLog(`Dungeon config, size: { x: ${this.width}, y: ${this.height} }, { minRoomSize: ${minRoomSize}, maxRoomSize: ${maxRoomSize}, numRooms: ${numRooms} }`);

    let grid: any[][];
    let rooms: DungeonRoom[];

    let now = Date.now();

    if (roomType === "truehell") {
      const mapDungeon = parseMapTemplate(TrueHell.mapTemplate, TrueHell.symbols, TrueHell.keys);
      grid = mapDungeon.grid;
      rooms = mapDungeon.rooms;
      this.height = grid.length;
      this.width = grid[0].length;

    } else {

      this.oneDirection = this.config.oneDirection && this.config.oneDirection(this.rand, this.progress);
      this.hasConnections = (this.config.hasConnections === undefined)
        ? true
        : this.config.hasConnections(this.rand, this.progress);

      const obstaclesChance = this.config.obstaclesChance && this.config.obstaclesChance(this.rand, this.progress);
      this.hasObstacles = obstaclesChance && obstaclesChance > 0;

      const generatedDungeon = dungeon.generate(
        this.rand,
        { x: this.width, y: this.height },
        minRoomSize,
        maxRoomSize,
        numRooms,
        this.oneDirection,   // oneDirection?
        this.hasConnections, // hasConnections?
        obstaclesChance      // hasObstacles?
      );
      grid = generatedDungeon[0] as any;
      rooms = generatedDungeon[1] as any;
    }

    this.rooms = rooms;

    // assign flattened grid to array schema
    const flatgrid = this.flattenGrid(grid, this.width, this.height);
    for (let i = 0; i < flatgrid.length; i++) {
      this.grid[i] = flatgrid[i];
    }

    // 0 = walkable, 1 = blocked
    this.pathgrid = new PF.Grid(grid.map((line, x) => {
      return line.map((type, y) => {
        // const hasInteractive = this.gridUtils.getEntityAt(x, y, Interactive, 'actAsObstacle');
        // console.log("has interactive?", x, y, hasInteractive);
        return (type & helpers.TILE_TYPE.FLOOR) ? 0 : 1;
      });
    }))

    /**
    ////////////////
    let i = 0;
    while (flatgrid.length > 0) {
      const spliced = flatgrid.splice(0, this.width);
      console.log(spliced.length, spliced.join(","));
      i++;
    }
    ////////////////
    */

    this.gridUtils = new GridUtils(this.entities);
    this.roomUtils = new RoomUtils(this.rand, this, this.rooms);

    if (roomType === "loot") {
      // regular room
      this.roomUtils.populateRoomsWithLoot();

    } else if (progress === 1 || progress === MAX_LEVELS) {
      // lobby
      this.roomUtils.populateLobby(this.rooms);

    } else if (roomType === "pvp") {
      this.roomUtils.populatePVP();

    } else if (roomType === "truehell") {
      this.roomUtils.populateTrueHell();

    } else {
      // regular room
      this.roomUtils.populateRooms();
    }

    console.log("Time to populate:", (Date.now() - now) + "ms");
  }

  addEntity (entity: Entity) {
    this.entities[entity.id] = entity

    if (entity instanceof Enemy) {
      this.enemies[entity.id] = entity;

    } else if (entity instanceof Jail) {
      entity.lockTiles(this);
    }
  }

  removeEntity (entity: Entity) {
    // entity.removed = true;

    // cleanup memory!
    this.entitiesToRemove.push(entity);

    if (entity instanceof Enemy) {
      delete this.enemies[entity.id];
    }
  }

  createPlayer (client, hero: DBHero, options: any) {
    var player = new Player(client.sessionId, hero, this);

    // find and remove portals from this player!
    const portal = this.getAllEntitiesOfType(Portal).find(portal => portal.ownerId === hero._id.toString());
    if (portal) { this.removeEntity(portal); }
    if (options.isPortal) {
      if (this.progress === 1) {

        // created a portal in a dungeon!
        const portalBack = new Portal({
          x: this.roomUtils.checkPoint.position.x,
          y: this.roomUtils.checkPoint.position.y - 1
        }, new DoorDestiny({
          progress: hero.currentProgress,
          room: hero.currentRoom
        }));
        portalBack.ownerId = hero._id.toString();
        // City's portal has 2 second less of life,
        // to avoid created room from being created again
        portalBack.ttl -= 2000;
        portalBack.state = this;

        this.addEntity(portalBack);

        player.position.set({ x: portalBack.position.x + 1, y: portalBack.position.y + 1 });

      } else {
        // back from a portal!
        if (portal) {
          player.position.set(portal.position);
          this.removeEntity(portal);

        } else {
          // fallback in case of error
          debugLog(`portal hack? ${player.hero.name} - lvl ${player.hero.lvl} (${hero.userId})`);
          player.position.set(this.roomUtils.startPosition);
        }

      }

    } else if (
      options.isCheckPoint &&
      this.roomUtils.checkPoint &&
      hero.checkPoints.indexOf(this.progress) !== -1 // hero has the checkpoint?
    ) {
      player.position.set(this.roomUtils.checkPoint.position);

    } else if (
      hero.currentProgress <= this.progress ||
      (isBossMap(this.progress) && this.isBossAlive())
    ) {
      // Math.abs(this.progress - hero.currentProgress) === 1
      player.position.set(this.roomUtils.startPosition)

    } else {
      player.position.set(this.roomUtils.endPosition);
    }

    this.addEntity(player)
    this.players[ player.id ] = player

    return player
  }

  removePlayer (player: Player) {
    delete this.players[ player.id ];
    this.removeEntity(player);
  }

  dropItemFrom (unit: Unit, item?: Item, dropOptions?: ItemDropOptions) {
    if (!item && !dropOptions) {
      // create random drop item
      item = this.roomUtils.createRandomItem();

    } else if (dropOptions) {
      item = this.roomUtils.createItemByDropOptions(dropOptions);
    }

    // may not drop anything...
    if (item) {
      item.position.set(unit.position);
      this.addEntity(item);
    }
  }

  checkOverlapingEntities (targetEntity: Entity, moveEvent: MoveEvent, x, y) {
    const unit = moveEvent.target as Unit;

    let doorEntity: Door;
    let hasPickedItems: boolean;

    const entities = this.gridUtils.getAllEntitiesAt(y, x);
    for (var i=0; i<entities.length; i++) {
      let entity = entities[i] as Entity;

      if (
        unit instanceof Enemy &&
        entity instanceof Unit &&
        entity.isAlive
      ) {
        moveEvent.cancel();
        // if (
        //   targetEntity.position.x === entity.position.x &&
        //   targetEntity.position.y === entity.position.y
        // ) {
        //   moveEvent.cancel();
        //   return;
        // }

      } else if (unit instanceof Player) {

        // StunTile / TeleportTile
        if (
          entity instanceof Interactive &&
          entity.activateOnWalkThrough
        ) {
          entity.interact(moveEvent, unit, this);
          continue;
        }

        // if unit has reached target point,
        // try to pick/interact with other entity.
        if (
          targetEntity && targetEntity.position && entity && entity.position &&
          targetEntity.position.x === entity.position.x &&
          targetEntity.position.y === entity.position.y
        ) {
          if (entity instanceof Item && entity.pick(unit, this)) {
            this.removeEntity(entity);
            hasPickedItems = true;

          } else if (entity instanceof Door && !(entity instanceof Portal)) {
            doorEntity = entity;

          } else if (entity instanceof NPC) {
            // skip all other interactions if interacting with NPC
            entity.interact(moveEvent, unit, this);
            return;

          } else if (entity instanceof Interactive) {
            entity.interact(moveEvent, unit, this);

          }
        }

      }
    }

    // door interaction is the last!
    if (!hasPickedItems && doorEntity) {
      doorEntity.interact(moveEvent, unit, this);
    }
  }

  move (unit: Unit, destiny: Point, allowChangeTarget: boolean = true) {
    // dead units cannot move!
    if (!unit.isAlive) {
      return;
    }

    // skip if invalid destiny
    if (!destiny || !('x' in destiny) || !('y' in destiny)) {
      return
    }

    // prioritize getting Unit entities before
    let targetEntity = (unit instanceof Enemy)
      ? this.gridUtils.getEntityAt(destiny.x, destiny.y, Player, 'isAlive') // enemies prioritize players
      : this.gridUtils.getEntityAt(destiny.x, destiny.y, Unit, 'isAlive'); // players have no priority

    if (!targetEntity) {
      targetEntity = this.gridUtils.getEntityAt(destiny.x, destiny.y)
    }

    const allowedPath = this.pathgrid.clone();

    // Check which entities are walkable.
    this.entities.forEach((entity, _) => {
      if (
        unit instanceof NPC ||// npc should avoid Checkpoint
        (
          !entity.walkable &&
          (!targetEntity || !entity.position.equals(targetEntity.position))
        ) ||
        // attacking enemies block pathfinding for other enemies
        (
          unit instanceof Enemy &&
          entity instanceof Enemy &&
          entity !== unit &&
          (
            entity.action &&
            entity.action.isEligible
            && (
              targetEntity && // allow movement when enemies are battling in the same tile
              !entity.position.equals(targetEntity.position)
            )
          )
        )
      ) {
        allowedPath.setWalkableAt(entity.position.x, entity.position.y, false);
      }
    });

    const moves = this.finder.findPath(
      unit.position.x, unit.position.y,
      destiny.y, destiny.x, // TODO: why need to invert x/y here?
      allowedPath, // FIXME: we shouldn't create leaks that way!
    );

    if (allowChangeTarget && moves.length > 0) {
      unit.position.target = targetEntity || this.gridUtils.getEntityAt(destiny.x, destiny.y, Unit, 'isAlive');

      let isValidBattleAction = (
        unit.position.target instanceof Unit &&
        unit.position.target.isAlive &&
        unit.position.target !== unit // prevent user from attacking himself
      );

      if (unit instanceof Player) {
        // prevent player-vs-player attacks
        if (
          !this.isPVPAllowed &&
          unit instanceof Player &&
          unit.position.target instanceof Player
        ) {
          isValidBattleAction = false;
        }

      } else if (unit instanceof Enemy) {
        // prevent enemy-vs-enemy attacks
        if (
          unit instanceof Enemy &&
          unit.position.target instanceof Enemy
        ) {
          isValidBattleAction = false;
        }
      }

      if (isValidBattleAction) {
        // create attack action
        unit.attack(unit.position.target);

      } else {
        unit.attack(null);
      }
    }

    // first block is always the starting point.
    // remove starting point if user have not clicked on it.
    if (moves.length > 1) {
      moves.shift();
    }

    unit.position.moveTo(moves);
  }

  isBossAlive () {
    return this.roomUtils.bosses && this.roomUtils.bosses.filter(boss => boss.isAlive).length > 0;
  }

  addMessage (player, message) {
    return this.createTextEvent(message, player.position, undefined, 1500, false);
  }

  createTextEvent (text, position, kind, ttl, small?) {
    // skip if no position was provided
    if (!position) { return; }

    var textEvent = new TextEvent(text, position, kind, ttl, small);
    textEvent.state = this;
    this.addEntity(textEvent);

    return textEvent;
  }

  getAllEntitiesOfType<T extends Entity>(klass: EntityConstructor<T>) {
    return Array.from(this.entities.values()).filter((entity) => {
      return entity instanceof klass;
    }) as T[];
  }

  findClosestPlayer(unit: Entity, dist: number) {
    for (let sessionId in this.players) {
      const player: Player = this.players[sessionId];

      if (
        !player.isSwitchingDungeons &&
        !player.removed &&
        player.isAlive &&
        distance(unit.position, player.position) <= dist
      ) {
        return player;
      }
    }
  }

  update (currentTime) {
    // // skip update if no actual players are connected
    // if (Object.keys(this.players).length === 0) {
    //   return;
    // }

    this.entities.forEach((entity, _) => {
      if (!entity.removed) {
        entity.update(currentTime);
      }
    });

    this.disposeEntities();
  }

  flattenGrid (grid: any[][], width, height) {
    const flattened = Array(width * height);

    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        flattened[x + width * y] = grid[y][x];
      }
    }

    // for (let x = 0; x < width; x++) {
    //   for (let y = 0; y < height; y++) {
    //     flattened[x + width * y] = grid[x][y];
    //   }
    // }

    return flattened;
  };

  disposeEntities() {
    if (this.entitiesToRemove.length > 0) {
      for (let i = 0; i < this.entitiesToRemove.length; i++) {
        const entity = this.entitiesToRemove[i];
        delete this.entities[entity.id];
        entity.dispose();
      }
      this.entitiesToRemove = [];
    }
  }

  dispose() {
    // free up memory!
    this.disposeEntities();

    this.rand.done();
    this.roomUtils.realRand.done();

    delete this['entities'];
    delete this['players'];
    delete this['enemies'];
  }

}
