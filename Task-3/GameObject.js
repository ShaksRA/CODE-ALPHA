import { Behaviour } from 'behaviour.js'

import BattleBehaviour, { DEAD_ENTITY_OPACITY } from './BattleBehaviour'
import lerp from 'lerp'
import { stepSounds, playRandom, setAudioPosition, playRandom3D, playSound3D, teleportSound } from '../core/sound';
import { distance } from '../core/utils';

export default class GameObject extends Behaviour {

  onAttach (factory) {
    this.nextPoint = null
    this.factory = factory

    if (typeof(this.object.userData.hp) !== "undefined") {
      this.actAsUnit()
    }

    this.on('nextPoint', (point) => {
      // teleport!
      if (this.nextPoint && distance(point, this.nextPoint) > 6) {
        playSound3D(teleportSound, this.object);
        App.tweens.
          add(this.object.scale).
          to({ x: 0, y: 0, z: 0 }, 100, Tweener.ease.quartOut).
          then(() => {
            this.object.position.x = point.x;
            this.object.position.z = point.z;
            this.nextPoint = point;
            App.tweens.
              add(this.object.scale).
              to({ x: 1, y: 1, z: 1 }, 100, Tweener.ease.quartOut);
          });
        return;
      }

      this.nextPoint = point;

      // play "step" sound for current player
      if (this.object === global.player) {
        setAudioPosition(this.object);
        playRandom3D(stepSounds, this.object);
      }

      // if (!this.object.userData.kind) { // not an enemy!
      //   playRandom3D(stepSounds, this.object);
      // }
    });
  }

  actAsUnit () {

    if (this.object.userData.hp.current > 0) {

      this.battleBehaviour = new BattleBehaviour();
      this.object.addBehaviour(this.battleBehaviour, this.factory);

    } else {
      // TODO: refactor me
      this.object.sprite.center.y = 0.85
      this.object.sprite.material.rotation = Math.PI
      this.object.sprite.material.opacity = DEAD_ENTITY_OPACITY;
    }

  }

  update () {
    if (this.nextPoint) {
      let destX = this.nextPoint.x
        , destZ = this.nextPoint.z
        , lerpTime = 0.07;

      if (this.battleBehaviour && this.battleBehaviour.togglePosition) {
        const isRanged = this.battleBehaviour.attackDistance > 1;

        const diffX = (this.battleBehaviour.attackingPoint.x - this.nextPoint.x);
        const diffY = (this.battleBehaviour.attackingPoint.z - this.nextPoint.z);

        destX += diffX / (this.battleBehaviour.attackDistance + 0.5);
        destZ += diffY / (this.battleBehaviour.attackDistance + 0.5);

        lerpTime = 0.2
      }

      this.object.position.x = lerp(this.object.position.x, destX, lerpTime);
      this.object.position.z = lerp(this.object.position.z, destZ, lerpTime);
    }
  }

  onDetach () {}

}
