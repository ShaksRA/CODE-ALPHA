import { DBHero } from "../db/Hero";
import { StatsModifiers } from "../entities/Unit";
import { RoomType } from "../rooms/states/DungeonState";
import { UnitSpawnerConfig } from "../entities/behaviours/UnitSpawner";
import { RandomSeed } from "random-seed";

export enum MapKind {
  ROCK = 'rock',
  CAVE = 'cave',
  ICE = 'ice',
  GRASS = 'grass',
  INFERNO = 'inferno',
  CASTLE = 'castle',
};

export type MapConfig = {
  daylight: boolean,
  mapkind: MapKind,

  getMapWidth: (progress: number) => number,
  getMapHeight: (progress: number) => number,
  minRoomSize: {x: number, y: number},
  maxRoomSize: {x: number, y: number},

  oneDirection?: (rand: RandomSeed, progress) => boolean,
  hasConnections?: (rand: RandomSeed, progress) => boolean,
  obstaclesChance?: (rand: RandomSeed, progress) => number,
  maxStunTilesPerRoom?: number,

  enemies?: string[],
  strongerEnemies?: string[],
  boss?: string[]
};

export const NUM_LEVELS_PER_MAP = 12;
export const NUM_LEVELS_PER_CHECKPOINT = 8;
export const NUM_LEVELS_PER_LOOT_ROOM = 11;

/**
 * Maximum attribute modifiers
 */
// export const MAX_ARMOR_ARMOR = 75;
// export const MAX_SHIELD_ARMOR = 20;
// export const MAX_HELMET_ARMOR = 15;
// export const MAX_BOOTS_ARMOR = 10;

export const MAX_ARMOR_ARMOR = 50;
export const MAX_SHIELD_ARMOR = 15;
export const MAX_HELMET_ARMOR = 10;
export const MAX_BOOTS_ARMOR = 8;

export const MAX_BOOTS_MOVEMENT_SPEED = 16;

export const MAX_WEAPON_DAMAGE = 30;

export const MAX_BOW_DAMAGE = 20;
export const MAX_BOW_ATTACK_DISTANCE = 6;

export const MAX_STAFF_DAMAGE = 14;
export const MAX_STAFF_ATTACK_DISTANCE = 7;

export function getMapKind(progress: number, multiplier: number = 0) {
  const config = getMapConfig(progress + (NUM_LEVELS_PER_MAP * multiplier));
  return (config && config.mapkind) || MapKind.INFERNO;
}

export function getMapConfig(progress: number, roomType?: RoomType): MapConfig {
  if (roomType === "loot") {
    return {
      daylight: Math.random() > 0.5,
      mapkind: getMapKind(progress, 2),
      getMapWidth: (progress: number) => 20,
      getMapHeight: (progress: number) => 20,
      minRoomSize: { x: 6, y: 6 },
      maxRoomSize: { x: 6, y: 6 },
      enemies: []
    }
  } else if (roomType === "truehell") {
    return {
      daylight: false,
      mapkind: getMapKind(progress, 2),
      getMapWidth: (progress: number) => 9,
      getMapHeight: (progress: number) => 9,
      minRoomSize: { x: 6, y: 6 },
      maxRoomSize: { x: 6, y: 6 },
      enemies: []
    }
  } else if (roomType === "pvp") {
    // castle / lobby!
    return {
      daylight: false,
      mapkind: (progress === MAX_LEVELS)
        ? MapKind.INFERNO
        : MapKind.CASTLE,
      getMapWidth: (progress: number) => 40,
      getMapHeight: (progress: number) => 40,
      oneDirection: (rand, progress) => true,
      hasConnections: (rand, progress) => false,
      obstaclesChance: (rand, progress) => 1,
      maxStunTilesPerRoom: 10,
      minRoomSize: { x: 8, y: 8 },
      maxRoomSize: { x: 9, y: 9 },
      enemies: []
    }
  } else if (progress === 1 || progress === MAX_LEVELS) {
    // castle / lobby!
    const size = 24;
    return {
      daylight: true,
      mapkind: (progress === MAX_LEVELS)
        ? MapKind.INFERNO
        : MapKind.CASTLE,
      getMapWidth: (progress: number) => size,
      getMapHeight: (progress: number) => size,
      oneDirection: (rand, progress) => true,
      minRoomSize: { x: 8, y: 8 },
      maxRoomSize: { x: 8, y: 8 },
      enemies: []
    }
  } else if (progress < MAX_LEVELS) {
    const index = Math.floor(progress / NUM_LEVELS_PER_MAP);
    return MAP_CONFIGS[index];

  } else {
    return MAP_CONFIGS[Math.floor(Math.random() * Object.keys(MAP_CONFIGS).length)];

  }
}

export function isBossMap(progress: number) {
  // is the last level for this map config?
  return ((progress + 1) % NUM_LEVELS_PER_MAP) === 0;
}

export function isCheckPointMap(progress: number) {
  return ((progress + 1) % NUM_LEVELS_PER_CHECKPOINT) === 0;
}

export const MAP_CONFIGS: MapConfig[] = [
  {
    daylight: true,
    mapkind: MapKind.ROCK,
    getMapWidth: (progress: number) => Math.floor(18 + ((progress % NUM_LEVELS_PER_MAP)) * 0.2),
    getMapHeight: (progress: number) => Math.floor(18 + ((progress % NUM_LEVELS_PER_MAP)) * 0.2),
    oneDirection: (rand, progress: number) => false,
    minRoomSize: { x: 6, y: 6 },
    maxRoomSize: { x: 7, y: 7 },
    enemies: ['rat', 'spider', 'bat'],
    strongerEnemies: ['spider-medium'],
    boss: ['spider-giant']
  },

  /*
  {
    daylight: true,
    mapkind: MapKind.ICE,
    getMapWidth: (progress: number) => Math.floor(18 + ((progress % NUM_LEVELS_PER_MAP)) * 0.2),
    getMapHeight: (progress: number) => Math.floor(18 + ((progress % NUM_LEVELS_PER_MAP)) * 0.2),
    oneDirection: (rand, progress: number) => false,
    minRoomSize: { x: 6, y: 6 },
    maxRoomSize: { x: 7, y: 7 },
    enemies: ['wolf'],
    strongerEnemies: ['wolf'],
    boss: ['wolf']
  },
  */

  {
    daylight: false,
    mapkind: MapKind.CAVE,
    getMapWidth: (progress: number) => Math.floor(19 + ((progress % NUM_LEVELS_PER_MAP)) * 0.2),
    getMapHeight: (progress: number) => Math.floor(19 + ((progress % NUM_LEVELS_PER_MAP)) * 0.2),
    oneDirection: (rand, progress: number) => (progress % 2 === 1), // prevent one-direction + JAIL TIME
    hasConnections: (rand, progress) => rand.intBetween(0, 4) !== 0,
    obstaclesChance: (rand, progress) => (progress % 2 === 0) // prevent obstacles + JAIL TIME
      ? 0
      : rand.intBetween(4, 6),
    maxStunTilesPerRoom: 2,
    minRoomSize: { x: 6, y: 6 },
    maxRoomSize: { x: 8, y: 8 },
    // maxRoomSize: { x: 12, y: 12 },
    enemies: ['slime', 'slime-2', 'skeleton-1'],
    strongerEnemies: ['slime-cube'],
    boss: ['slime-boss']
  },

  {
    daylight: true,
    mapkind: MapKind.GRASS,
    getMapWidth: (progress: number) => Math.floor(19 + ((progress % NUM_LEVELS_PER_MAP)) * 0.2),
    getMapHeight: (progress: number) => Math.floor(19 + ((progress % NUM_LEVELS_PER_MAP)) * 0.2),
    oneDirection: (rand, progress: number) => rand.intBetween(0, 2) === 0,
    maxStunTilesPerRoom: 2,
    minRoomSize: { x: 6, y: 6 },
    maxRoomSize: { x: 8, y: 8 },
    enemies: ['skeleton-1', 'skeleton-2', 'skeleton-3'],
    strongerEnemies: ['skeleton-4'],
    boss: ['necromancer']
  },

  {
    daylight: false,
    mapkind: MapKind.GRASS,
    getMapWidth: (progress: number) => Math.floor(19 + ((progress % NUM_LEVELS_PER_MAP)) * 0.2),
    getMapHeight: (progress: number) => Math.floor(19 + ((progress % NUM_LEVELS_PER_MAP)) * 0.2),
    oneDirection: (rand, progress: number) => rand.intBetween(0, 3) === 0,
    maxStunTilesPerRoom: 3,
    minRoomSize: { x: 6, y: 6 },
    maxRoomSize: { x: 8, y: 8 },
    enemies: ['goblin', 'goblin-2', 'goblin-3'],
    strongerEnemies: ['orc-1'],
    boss: ['goblin-boss']
  },

  {
    daylight: true,
    mapkind: MapKind.INFERNO,
    getMapWidth: (progress: number) => Math.floor(20 + ((progress % NUM_LEVELS_PER_MAP)) * 0.2),
    getMapHeight: (progress: number) => Math.floor(20 + ((progress % NUM_LEVELS_PER_MAP)) * 0.2),
    hasConnections: (rand, progress) => rand.intBetween(0, 4) !== 0,
    obstaclesChance: (rand, progress) => (progress % 2 === 0) // prevent obstacles + JAIL TIME
      ? 0
      : rand.intBetween(6, 7),
    maxStunTilesPerRoom: 3,
    minRoomSize: { x: 6, y: 6 },
    maxRoomSize: { x: 9, y: 9 },
    enemies: ['lava-ogre', 'lava-totem', 'beholder'],
    strongerEnemies: ['golem'],
    boss: ['scorpion-boss']
    // boss: ['evil-majesty']
  },

  {
    daylight: false,
    mapkind: MapKind.INFERNO,
    getMapWidth: (progress: number) => Math.floor(20 + ((progress % NUM_LEVELS_PER_MAP)) * 0.2),
    getMapHeight: (progress: number) => Math.floor(20 + ((progress % NUM_LEVELS_PER_MAP)) * 0.2),
    hasConnections: (rand, progress) => rand.intBetween(0, 4) !== 0,
    obstaclesChance: (rand, progress) => (progress % 2 === 0) // prevent obstacles + JAIL TIME
      ? 0
      : rand.intBetween(6, 7),
    maxStunTilesPerRoom: 4,
    minRoomSize: { x: 6, y: 6 },
    maxRoomSize: { x: 9, y: 9 },
    enemies: ['demon', 'lava-totem', 'beholder'],
    strongerEnemies: ['winged-demon'],
    boss: ['monkey-king', 'scorpion-boss', 'goblin-boss', 'necromancer', 'slime-boss', 'spider-giant']
  },

];

export const MAX_LEVELS = MAP_CONFIGS.length * NUM_LEVELS_PER_MAP;;

export const ENEMY_CONFIGS: {
  [id: string]: {
    ratio: number, // LVL ratio, 0 = current progress
    base: Partial<DBHero>,
    modifiers: Partial<StatsModifiers>,
    spawner?: UnitSpawnerConfig
  }
} = {
  // MapType.ROCK
  'bat': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 1,
      agility: 0,
      intelligence: 0,
    },
    modifiers: {
      movementSpeed: 10,
      aiDistance: 7
    }
  },

  'rat': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 1,
      agility: 1,
      intelligence: 1,
    },
    modifiers: {
      aiDistance: 3,
      damage: 2
    }
  },

  'spider': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 0,
      agility: 0,
      intelligence: 0,
    },
    modifiers: {
      aiDistance: 5
    }
  },

  'scorpion': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 1,
      agility: 1,
      intelligence: 1,
    },
    modifiers: {
      damage: 10,
      movementSpeed: 5,
      // attackSpeed: -5
    }
  },

  'spider-medium': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 3,
      agility: 2,
      intelligence: 1,
    },
    modifiers: {
      movementSpeed: 5,
      damage: 5
    }
  },

  'spider-giant': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 10,
      agility: 4,
      intelligence: 1,
    },
    modifiers: {
      damage: 4,
      hp: 80
    },
    spawner: {
      type: ['spider'],
      giveXP: false,
      lvl: 2
    }
  },

  'slime': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 3,
      agility: 2,
      intelligence: 1,
    },
    modifiers: {
      damage: 2
    }
  },

  'slime-2': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 4,
      agility: 4,
      intelligence: 1,
    },
    modifiers: {
      damage: 4,
      movementSpeed: 6
    }
  },

  'slime-cube': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 4,
      agility: 1,
      intelligence: 1,
    },
    modifiers: {
      damage: 2
    }
  },

  'slime-boss': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 8,
      agility: 2,
      intelligence: 1,
    },
    modifiers: {
      damage: 8,
      hp: 1500
    }
  },
  //////////


  'skeleton-1': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 5,
      agility: 2,
      intelligence: 1
    },
    modifiers: {}
  },

  'skeleton-2': {
    ratio: 0,
    base: {
      primaryAttribute: "agility",
      strength: 5,
      agility: 2,
      intelligence: 1
    },
    modifiers: {
      attackDistance: 2
    }
  },

  'skeleton-3': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 6,
      agility: 3,
      intelligence: 2
    },
    modifiers: {
      damage: 3
    }
  },

  'skeleton-4': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 8,
      agility: 4,
      intelligence: 1
    },
    modifiers: {
      movementSpeed: 10,
      attackSpeed: 10,
      damage: 4
    }
  },

  'necromancer': {
    ratio: 0,
    base: {
      primaryAttribute: "intelligence",
      strength: 2,
      agility: 3,
      intelligence: 5
    },
    modifiers: {
      damage: 10,
      movementSpeed: 3,
      attackDistance: 2,
      hp: 1000
    },
    spawner: {
      type: ['skeleton-1', 'skeleton-2'],
      giveXP: false,
      lvl: 5
    }
  },
  //////////

  'wolf': {
    ratio: 0,
    base: {
      primaryAttribute: "agility",
      strength: 3,
      agility: 5,
      intelligence: 5
    },
    modifiers: {
      attackSpeed: 10,
      movementSpeed: 10
    }
  },
  //////////

  'goblin': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 6,
      agility: 2,
      intelligence: 1
    },
    modifiers: {
      damage: 4,
      movementSpeed: 3,
    }
  },

  'goblin-2': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 5,
      agility: 2,
      intelligence: 1
    },
    modifiers: {
      movementSpeed: 3,
      attackSpeed: 3,
    }
  },

  'goblin-3': {
    ratio: 0,
    base: {
      primaryAttribute: "agility",
      strength: 4,
      agility: 8,
      intelligence: 2
    },
    modifiers: {
      movementSpeed: 25,
      attackSpeed: 5
    }
  },

  'orc-1': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 8,
      agility: 5,
      intelligence: 1
    },
    modifiers: {
      movementSpeed: 5,
      attackSpeed: 6
    }
  },

  'goblin-boss': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 10,
      agility: 5,
      intelligence: 3
    },
    modifiers: {
      damage: 12,
      hp: 300,
      movementSpeed: 3,
      attackSpeed: 4
    }
  },
  //////////

  'lava-ogre': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 10,
      agility: 2,
      intelligence: 1
    },
    modifiers: {
      damage: 10,
      hp: 50,
      movementSpeed: 5,
      attackSpeed: 5
    }
  },

  'lava-totem': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 10,
      agility: 2,
      intelligence: 1
    },
    modifiers: {
      damage: 20,
      hp: 50,
      movementSpeed: 1,
      attackSpeed: 5
    }
  },

  'beholder': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 10,
      agility: 2,
      intelligence: 1
    },
    modifiers: {
      damage: 5,
      hp: 50,
      movementSpeed: 8,
      attackSpeed: 8
    }
  },

  'golem': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 10,
      agility: 2,
      intelligence: 1
    },
    modifiers: {
      damage: 50,
      attackSpeed: -10,
      hp: 100,
    }
  },

  'scorpion-boss': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 10,
      agility: 5,
      intelligence: 5
    },
    modifiers: {
      damage: 10,
      hp: 500,
      movementSpeed: 2,
      attackSpeed: 3
    },
    spawner: {
      type: ['scorpion'],
      giveXP: false,
      lvl: 3
    }
  },

  // 'evil-majesty': {
  //   base: {
  //     primaryAttribute: "intelligence",
  //     strength: 5,
  //     agility: 5,
  //     intelligence: 10
  //   },
  //   modifiers: {
  //     damage: 10,
  //     hp: 500,
  //     movementSpeed: 2,
  //     attackSpeed: 3
  //   }
  // },

  //////////////

  'demon': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 15,
      agility: 2,
      intelligence: 1
    },
    modifiers: {
      damage: 10,
      hp: 50,
      aiDistance: 10
    }
  },

  'winged-demon': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 20,
      agility: 2,
      intelligence: 1
    },
    modifiers: {
      damage: 5,
      hp: 50,
    }
  },

  'monkey-king': {
    ratio: 0,
    base: {
      primaryAttribute: "agility",
      strength: 10,
      agility: 20,
      intelligence: 10
    },
    modifiers: {
      damage: 20,
      hp: 5000,
      movementSpeed: 10,
      attackSpeed: 10
    },
    spawner: {
      type: ['monkey'],
      giveXP: false,
      lvl: 20,
    }
  },

  'monkey': {
    ratio: 0,
    base: {
      primaryAttribute: "agility",
      strength: 5,
      agility: 10,
      intelligence: 5
    },
    modifiers: {
      damage: 10,
      movementSpeed: 12,
      attackSpeed: 12
    }
  },

  // 'demon-majesty': {
  //   base: {
  //     primaryAttribute: "intelligence",
  //     strength: 5,
  //     agility: 5,
  //     intelligence: 20
  //   },
  //   modifiers: {
  //     damage: 20,
  //     hp: 1000,
  //     movementSpeed: 3,
  //     attackSpeed: 3
  //   }
  // },

  //////////////

  /////////// SPECIAL ENEMIES
  'mimic': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 8,
      agility: 5,
      intelligence: 0
    },
    modifiers: {
      attackSpeed: 10,
      movementSpeed: 10,
      aiDistance: 10
    }
  },

  /////////// TOWER
  'tower': {
    ratio: 0,
    base: {
      primaryAttribute: "strength",
      strength: 3,
      agility: 1,
      intelligence: 0
    },
    modifiers: {
      hp: 200,
      attackSpeed: -10,
      attackDistance: 3,
      aiDistance: 3
    }
  },

};
