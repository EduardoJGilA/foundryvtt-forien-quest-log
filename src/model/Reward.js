import { Utils } from '../control/index.js';

export class Reward extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      type: new fields.StringField({ required: true, nullable: true, initial: null }),
      data: new fields.ObjectField({ required: true, initial: {} }),
      hidden: new fields.BooleanField({ required: true, initial: false }),
      locked: new fields.BooleanField({ required: true, initial: true }),
      uuidv4: new fields.StringField({ required: true, initial: () => Utils.uuidv4() })
    };
  }

  get name() {
    return this.data.name;
  }

  get uuid() {
    return this.data.uuid;
  }

  toggleLocked() {
    const locked = !this.locked;
    this.updateSource({ locked });
    return locked;
  }

  toggleVisible() {
    const hidden = !this.hidden;
    this.updateSource({ hidden });
    return hidden;
  }

  toJSON() {
    return this.toObject();
  }
}
