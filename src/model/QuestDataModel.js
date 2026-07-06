import { Task } from './Task.js';
import { Reward } from './Reward.js';

export class QuestDataModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      name: new fields.StringField({ required: true, initial: () => game.i18n.localize('ForienQuestLog.API.QuestDB.Labels.NewQuest') }),
      status: new fields.StringField({ required: true, initial: 'inactive' }),
      giver: new fields.StringField({ required: false, nullable: true, initial: null }),
      giverData: new fields.ObjectField({ required: false, nullable: true, initial: null }),
      description: new fields.StringField({ required: false, initial: '' }),
      gmnotes: new fields.StringField({ required: false, initial: '' }),
      image: new fields.StringField({ required: false, initial: 'actor' }),
      giverName: new fields.StringField({ required: false, initial: 'actor' }),
      splash: new fields.StringField({ required: false, initial: '' }),
      splashPos: new fields.StringField({ required: false, initial: 'center' }),
      splashAsIcon: new fields.BooleanField({ required: false, initial: false }),
      location: new fields.StringField({ required: false, nullable: true, initial: null }),
      playernotes: new fields.StringField({ required: false, initial: '' }),
      priority: new fields.NumberField({ required: false, initial: 0 }),
      type: new fields.StringField({ required: false, nullable: true, initial: null }),
      parent: new fields.StringField({ required: false, nullable: true, initial: null }),
      subquests: new fields.ArrayField(new fields.StringField(), { required: false, initial: [] }),
      tasks: new fields.ArrayField(new fields.EmbeddedDataField(Task), { required: false, initial: [] }),
      rewards: new fields.ArrayField(new fields.EmbeddedDataField(Reward), { required: false, initial: [] }),
      date: new fields.SchemaField({
        create: new fields.NumberField({ required: false, nullable: true, initial: () => Date.now() }),
        start: new fields.NumberField({ required: false, nullable: true, initial: null }),
        end: new fields.NumberField({ required: false, nullable: true, initial: null })
      }, { required: false, initial: {} })
    };
  }
}
