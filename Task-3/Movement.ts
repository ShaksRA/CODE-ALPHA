import { EventEmitter } from "events";
import { Position } from "./Position";
import { Point } from "../rooms/states/DungeonState";
import { Unit } from "../entities/Unit";
import { Entity } from "../entities/Entity";

export class Movement extends Position {
  pending: Point[] = [];
  lastMove: number = 0;
  active: boolean = false;

  unit: Unit;
  target: Entity;

  events = new EventEmitter();
  initialPosition: Point;

  constructor (unit) {
    super()
    this.unit = unit
  }

  get destiny () {
    var lastIndex = this.pending.length - 1
    return (lastIndex !== -1) ? { x: this.pending[ lastIndex ][ 0 ], y: this.pending[ lastIndex ][ 1 ] } : null
  }

  equals (other) {
    return (
      this.x === other.x &&
      this.y === other.y
    );
  }

  set (x: any, y?: number, doNotEmitMove?: boolean) {
    if (!y && typeof(x) === "object") {
      y = x.y
      x = x.x
    }

    var event = new MoveEvent(this.unit, { x, y });
    if (doNotEmitMove === undefined) {
      this.events.emit('move', event, this.x, this.y, x, y);
    }

    if (!this.initialPosition) {
      this.initialPosition = { x, y };
    }

    const isValid = event.valid();
    if (isValid) {
      this.x = x;
      this.y = y;

    } else if (event.isCancelled) {
      // clear pending movements.
      this.pending = [];
    }

    return isValid;
  }

  moveTo (pending) {
    var now = Date.now()

    // // force to move instantly if last move
    // if (
    //   pending.length > 0 &&
    //   (now - this.lastMove > this.unit.getMovementSpeed())
    // ) {
    //   this.lastMove = now - this.unit.getMovementSpeed();
    // }

    this.pending = pending
  }


  update (currentTime) {
    var timeDiff = currentTime - this.lastMove
      , moves = 0

    if (timeDiff > this.unit.getMovementSpeed()) {
      moves = Math.floor(timeDiff / this.unit.getMovementSpeed())

      if (this.pending.length > 0) {
        this.touch(currentTime)

        const pos = this.pending[0];

        if (this.set(pos[0], pos[1])) {
          this.pending.shift();
        }

        // for (var i=0; i<moves; i++) {
        //   pos = this.pending.shift()
        //   this.set(pos[0], pos[1])
        // }

        // if (this.unit.action) this.unit.action.lastUpdateTime = currentTime + this.unit.movementSpeed
      }
    }
  }

  touch (currentTime) {
    // change direction
    if (
      (!this.unit.action || !this.unit.action.isEligible) && // fix unit's direction while attacking.
      this.pending.length > 0
    ) {
      this.lastMove = currentTime

      const x = this.pending[0][0];
      const y = this.pending[0][1];

      this.unit.updateDirection(x, y);
    }
  }

  dispose() {
    delete this.unit;
    delete this.target;

    this.events.removeAllListeners();
    delete this.events;
  }

}

export class MoveEvent {
  isCancelled: boolean;
  target: Entity;
  destiny: Point; // TODO: here should be the final destiny!

  constructor (target, destiny: Point) {
    this.isCancelled = false
    this.target = target
    this.destiny = destiny;
  }

  cancel() { this.isCancelled = true }
  valid() { return !this.isCancelled }
}
