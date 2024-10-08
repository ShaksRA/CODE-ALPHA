import { getHeroId } from "./network";

const localStorage = window.localStorage || {
  //
  // some browser configurations may block `localStorage` usage from an iframe
  // e.g.: "Failed to read the 'localStorage' property from 'Window': Access is denied for this document."
  //
  _data: {},
  setItem(k, v) { this._data[k] = v },
  getItem(k) { return this._data[k] },
  removeItem(k) { delete this._data[k] },
  clear() { this._data = {}; }
}

export class PlayerPrefs  {

  static set (key, value, isGlobal = true) {
    const k = (isGlobal) ? key : this.heroKey(key);
    localStorage.setItem(k, value);
  }

  static get (key, isGlobal = true) {
    const k = (isGlobal) ? key : this.heroKey(key);
    return localStorage.getItem(k);
  }

  static getNumber (key, fallback = "0", isGlobal = true) {
    const k = (isGlobal) ? key : this.heroKey(key);
    return parseFloat(localStorage.getItem(k) || fallback);
  }

  static remove (key, isGlobal = true) {
    const k = (isGlobal) ? key : this.heroKey(key)
    localStorage.removeItem(k);
  }

  static clear () {
    localStorage.clear();
  }

  static hasSeenBoss(entity, bool) {
    if (bool) {
      return localStorage.setItem(this.heroKey(`boss-${entity.kind}-seen`), bool);

    } else {
      return localStorage.getItem(this.heroKey(`boss-${entity.kind}-seen`));
    }
  }

  static hasKilledBoss(entity, bool) {
    if (bool) {
      return localStorage.setItem(this.heroKey(`boss-${entity.kind}-killed`), bool);

    } else {
      return localStorage.getItem(this.heroKey(`boss-${entity.kind}-killed`));
    }
  }

  static heroKey(id) {
    return `${getHeroId()}${id}`;
  }

}
