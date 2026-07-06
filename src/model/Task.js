import { Utils } from '../control/index.js';

export class Task extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      name: new fields.StringField({ required: true, nullable: true, initial: null }),
      completed: new fields.BooleanField({ required: true, initial: false }),
      failed: new fields.BooleanField({ required: true, initial: false }),
      hidden: new fields.BooleanField({ required: true, initial: false }),
      uuidv4: new fields.StringField({ required: true, initial: () => Utils.uuidv4() })
    };
  }

  get state() {
    if (this.completed) {
      return 'check-square';
    } else if (this.failed) {
      return 'minus-square';
    }
    return 'square';
  }

  toggle() {
    if (this.completed === false && this.failed === false) {
      this.updateSource({ completed: true });
    } else if (this.completed === true) {
      this.updateSource({ failed: true, completed: false });
    } else {
      this.updateSource({ failed: false });
    }
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
