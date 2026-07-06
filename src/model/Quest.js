import {
   FVTTCompat,
   Utils }                    from '../control/index.js';

import { QuestPreviewShim }   from '../view/index.js';

import {
   constants,
   questStatus,
   settings }                 from './constants.js';

import { QuestDataModel }     from './QuestDataModel.js';
import { Task }               from './Task.js';
import { Reward }             from './Reward.js';

export class Quest extends QuestDataModel
{
   /**
    * Stores the sheet class for Quest.
    *
    * @type {typeof Application}
    */
   static #SheetClass;

   /**
    * The backing JournalEntry document.
    *
    * @type {JournalEntry}
    */
   #entry;

   /** @type {string | null} */
   #id;

   /**
    * Lookup the Quest giver by UUID and return the data stored in {@link Quest.giverData}.
    *
    * @param {Quest} quest - The quest to look up the quest giver.
    *
    * @returns {Promise<QuestImgNameData|null>} The image / name data associated with this Foundry UUID.
    */
   static async giverFromQuest(quest)
   {
      let data = null;

      if (quest.giver === 'abstract')
      {
         data = {
            name: quest.giverName,
            img: quest.image,
            hasTokenImg: false
         };
      }
      else if (typeof quest.giver === 'string')
      {
         data = Quest.giverFromUUID(quest.giver, quest.image);
      }

      return data;
   }

   /**
    * @param {string}   uuid - The Foundry UUID to lookup for image / name data.
    *
    * @param {string}   [imageType] - The image type: 'actor' or 'token'
    *
    * @returns {Promise<QuestImgNameData|null>} The image / name data associated with this Foundry UUID.
    */
   static async giverFromUUID(uuid, imageType = 'actor')
   {
      let data = null;

      if (typeof uuid === 'string')
      {
         const document = await fromUuid(uuid);

         if (document !== null)
         {
            switch (document.documentName)
            {
               case Actor.documentName:
               {
                  const actorImage = document.img;
                  const tokenImage = FVTTCompat.tokenImg(document);

                  const hasTokenImg = typeof tokenImage === 'string' && tokenImage !== actorImage;

                  data = {
                     uuid,
                     name: document.name,
                     img: imageType === 'token' && hasTokenImg ? tokenImage : actorImage,
                     hasTokenImg
                  };
                  break;
               }

               case Item.documentName:
                  data = {
                     uuid,
                     name: document.name,
                     img: document.img,
                     hasTokenImg: false
                  };
                  break;

               case JournalEntry.documentName:
                  data = {
                     uuid,
                     name: document.name,
                     img: FVTTCompat.journalImage(document),
                     hasTokenImg: false
                  };
                  break;
            }
         }
      }

      return data;
   }

   /**
    * @param {QuestData}      data - The serialized quest data to set.
    *
    * @param {JournalEntry}   entry - The associated Foundry JournalEntry.
    */
   constructor(data = {}, entry = null)
   {
      super(data);
      this.#id = entry !== null ? entry.id : null;
      this.#entry = entry;

      if (this.#entry && this.#id !== null)
      {
         this.#entry._sheet = new QuestPreviewShim(this.#id);
      }
   }

   /**
    * @returns {boolean} Returns whether the current user can update the backing journal document.
    */
   get canUserUpdate()
   {
      const entry = this.entry ? this.entry : game.journal.get(this.#id);

      return entry?.canUserModify?.(game.user, 'update') ?? false;
   }

   /**
    * @returns {JournalEntry} The associated backing journal entry document.
    */
   get entry()
   {
      return this.#entry;
   }

   /**
    * Gets the Foundry ID associated with this Quest.
    *
    * @returns {string} The ID of the quest.
    */
   get id()
   {
      return this.#id;
   }

   /**
    * Sets the associated backing journal entry document.
    *
    * @param {JournalEntry}   entry - A journal entry document.
    */
   set entry(entry)
   {
      this.#entry = entry;
   }

   /**
    * Sets the Foundry ID of the quest.
    *
    * @param {string}   id - A Foundry ID.
    */
   set id(id)
   {
      this.#id = id;
   }

   /**
    * @returns {boolean} Is the quest active / in progress.
    */
   get isActive()
   {
      return questStatus.active === this.status;
   }

   /**
    * True when no players have OBSERVER or OWNER permissions for this quest.
    *
    * @returns {boolean} Quest is hidden.
    */
   get isHidden()
   {
      let isHidden = true;

      if (this.entry && typeof FVTTCompat.ownership(this.entry) === 'object')
      {
         if (FVTTCompat.ownership(this.entry).default >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) { return false; }

         for (const [userId, permission] of Object.entries(FVTTCompat.ownership(this.entry)))
         {
            if (userId === 'default') { continue; }

            const user = game.users.get(userId);

            if (!user || user.isGM) { continue; }

            if (permission >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)
            {
               isHidden = false;
               break;
            }
         }
      }

      return isHidden;
   }

   /**
    * @returns {boolean} Is the quest in the inactive state.
    */
   get isInactive()
   {
      return questStatus.inactive === this.status;
   }

   /**
    * Returns true if this quest is observable for the given player. For trusted player edit when the status is
    * `inactive` the test is ownership instead of simply OBSERVER or higher.
    *
    * @returns {boolean} Is the quest observable.
    */
   get isObservable()
   {
      if (game.user.isGM) { return true; }

      const isInactive = this.isInactive;

      // Special handling for trusted player edit who can only see owned quests in the hidden / inactive category.
      if (Utils.isTrustedPlayerEdit() && isInactive) { return this.isOwner; }

      // Otherwise no one can see hidden / inactive quests; perform user permission check for observer.
      return !isInactive && this.entry.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
   }

   /**
    * Gets whether the current user has owner permissions.
    *
    * @returns {boolean} Is owner.
    */
   get isOwner()
   {
      return game.user.isGM ||
       (this.entry && this.entry.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
   }

   /**
    * Gets whether this quest is a personal quest. A personal quest has one or more players with OBSERVER or OWNER
    * permissions.
    *
    * @returns {boolean} Is this quest personal.
    */
   get isPersonal()
   {
      let isPersonal = false;

      if (this.entry && typeof FVTTCompat.ownership(this.entry) === 'object' &&
       FVTTCompat.ownership(this.entry).default < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)
      {
         for (const [userId, permission] of Object.entries(FVTTCompat.ownership(this.entry)))
         {
            if (userId === 'default') { continue; }

            const user = game.users.get(userId);

            if (!user || user.isGM) { continue; }

            if (permission < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) { continue; }

            isPersonal = true;
            break;
         }
      }

      return isPersonal;
   }

   /**
    * Returns whether this quest is under primary settings.
    *
    * @returns {boolean} Primary quest state.
    */
   get isPrimary()
   {
      return this.#id === game.settings.get(constants.moduleName, settings.primaryQuest);
   }

   /**
    * Creates a new Reward and pushes to the reward array.
    *
    * @param {object}   data - The reward data.
    */
   addReward(data = {})
   {
      const reward = new Reward(data);
      if (reward.type !== null) { this.rewards.push(reward); }
   }

   /**
    * Pushes a subquest ID to the subquest array.
    *
    * @param {string}   questId - A Foundry ID
    */
   addSubquest(questId)
   {
      if (!this.subquests.includes(questId))
      {
         this.subquests.push(questId);
      }
   }

   /**
    * Creates a new Task and pushes to the task array.
    *
    * @param {object}   data - Task data.
    */
   addTask(data = {})
   {
      const task = new Task(data);
      if (task.name && task.name.length) { this.tasks.push(task); }
   }

   /**
    * Gets all adjacent quest IDs including self. This includes any parent and subquests.
    *
    * @returns {string[]} All adjacent quests including self.
    */
   getQuestIds()
   {
      return this.parent ? [this.parent, this.id, ...this.subquests] : [this.id, ...this.subquests];
   }

   /**
    * Gets a Reward by Foundry VTT UUID or UUIDv4 for abstract Rewards.
    *
    * @param {string}   uuidv4 - The FVTT UUID to find.
    *
    * @returns {Reward} The task or null.
    */
   getReward(uuidv4)
   {
      const index = this.rewards.findIndex((t) => t.uuidv4 === uuidv4);
      return index >= 0 ? this.rewards[index] : null;
   }

   /**
    * Returns a list of Actor data for whom this quest is personal.
    *
    * @returns {object[]} A list of actors who are assigned to this quest.
    */
   getPersonalActors()
   {
      if (!this.isPersonal) { return []; }

      const users = [];

      if (this.entry && typeof FVTTCompat.ownership(this.entry) === 'object')
      {
         for (const [userId, permission] of Object.entries(FVTTCompat.ownership(this.entry)))
         {
            if (userId === 'default') { continue; }

            const user = game.users.get(userId);

            if (!user || user.isGM) { continue; }

            if (permission < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) { continue; }

            users.push(user);
         }
      }

      return users;
   }

   /**
    * Returns any stored Foundry sheet class.
    *
    * @returns {typeof Application} The associated sheet class.
    */
   static getSheet() { return Quest.#SheetClass; }

   /**
    * Gets a task by UUID v4.
    *
    * @param {string}   uuidv4 - The UUID v4 to find.
    *
    * @returns {Task} The task or null.
    */
   getTask(uuidv4)
   {
      const index = this.tasks.findIndex((t) => t.uuidv4 === uuidv4);
      return index >= 0 ? this.tasks[index] : null;
   }

   /**
    * Deletes Reward from Quest.
    *
    * @param {string} uuidv4 - The UUIDv4 associated with a Reward.
    */
   removeReward(uuidv4)
   {
      const index = this.rewards.findIndex((t) => t.uuidv4 === uuidv4);
      if (index >= 0) { this.rewards.splice(index, 1); }
   }

   /**
    * Removes subquest from Quest.
    *
    * @param {string} questId - The subquest ID to remove.
    */
   removeSubquest(questId)
   {
      this.updateSource({ subquests: this.subquests.filter((id) => id !== questId) });
   }

   /**
    * Removes the task from this quest by UUIDv4.
    *
    * @param {string} uuidv4 - The UUIDv4 associated with a Task.
    *
    * @see Utils.uuidv4
    */
   removeTask(uuidv4)
   {
      const index = this.tasks.findIndex((t) => t.uuidv4 === uuidv4);
      if (index >= 0) { this.tasks.splice(index, 1); }
   }

   /**
    * Resets the quest giver.
    */
   resetGiver()
   {
      this.updateSource({
         giver: null,
         image: 'actor',
         giverData: null,
         giverName: 'actor'
      });
   }

   /**
    * Saves Quest to JournalEntry's content, and if needed, moves JournalEntry to different folder.
    * Can also update JournalEntry's permissions.
    *
    * @returns {Promise<string|void>} The ID of the quest saved or undefined if user couldn't save the quest.
    */
   async save()
   {
      const entry = this.entry ? this.entry : game.journal.get(this.#id);

      // If the entry doesn't exist or the user can't update the journal entry via ownership then early out.
      if (!entry || !this.canUserUpdate) { return; }

      // Save Quest JSON
      const update = {
         name: typeof this.name === 'string' && this.name.length > 0 ? this.name :
          game.i18n.localize('ForienQuestLog.API.QuestDB.Labels.NewQuest'),
         flags: {
            [constants.moduleName]: { json: this.toJSON() }
         }
      };

      this.entry = await entry.update(update, { diff: false });

      return this.#id;
   }

   /**
    * Sets any stored Foundry sheet class.
    *
    * @param {typeof Application}   NewSheetClass - The sheet class.
    */
   static setSheet(NewSheetClass) { Quest.#SheetClass = NewSheetClass; }

   /**
    * Sets new status for the quest. Also updates any timestamp / date data depending on status set.
    *
    * @param {string}   target - The target status to set.
    *
    * @returns {Promise<void>}
    */
   async setStatus(target)
   {
      if (!this.entry || !questStatus[target]) { return; }

      const dateUpdates = { start: this.date.start, end: this.date.end };

      // Update the tracked date data based on status.
      switch (target)
      {
         case questStatus.active:
            dateUpdates.start = Date.now();
            dateUpdates.end = null;
            break;

         case questStatus.completed:
         case questStatus.failed:
            dateUpdates.end = Date.now();
            break;

         case questStatus.inactive:
         case questStatus.available:
         default:
            dateUpdates.start = null;
            dateUpdates.end = null;
            break;
      }

      this.updateSource({
         status: target,
         date: dateUpdates
      });

      // Potentially reset any tracked primary quest when the status is no longer active.
      if (this.status !== questStatus.active)
      {
         const primaryQuestId = game.settings.get(constants.moduleName, settings.primaryQuest);
         if (this.#id === primaryQuestId)
         {
            await game.settings.set(constants.moduleName, settings.primaryQuest, '');
         }
      }

      await this.entry.update({
         flags: {
            [constants.moduleName]: { json: this.toJSON() }
         }
      });

      return this.#id;
   }

   /**
    * Locates and swaps the rewards indicated by the source and target UUIDv4s provided.
    *
    * @param {string}   sourceUuidv4 - The source UUIDv4
    *
    * @param {string}   targetUuidv4 - The target UUIDv4
    */
   sortRewards(sourceUuidv4, targetUuidv4)
   {
      const index = this.rewards.findIndex((t) => t.uuidv4 === sourceUuidv4);
      const targetIdx = this.rewards.findIndex((t) => t.uuidv4 === targetUuidv4);

      if (index >= 0 && targetIdx >= 0)
      {
         const entry = this.rewards.splice(index, 1)[0];
         this.rewards.splice(targetIdx, 0, entry);
      }
   }

   /**
    * Locates and swaps the tasks indicated by the source and target UUIDv4s provided.
    *
    * @param {string}   sourceUuidv4 - The source UUIDv4
    *
    * @param {string}   targetUuidv4 - The target UUIDv4
    */
   sortTasks(sourceUuidv4, targetUuidv4)
   {
      // If there are sub quests in the objectives above tasks then an undefined targetUuidv4 can occur.
      if (!targetUuidv4) { return; }

      const index = this.tasks.findIndex((t) => t.uuidv4 === sourceUuidv4);
      const targetIdx = this.tasks.findIndex((t) => t.uuidv4 === targetUuidv4);

      if (index >= 0 && targetIdx >= 0)
      {
         const entry = this.tasks.splice(index, 1)[0];
         this.tasks.splice(targetIdx, 0, entry);
      }
   }

   /**
    * @returns {object} The serialized JSON object for this Quest.
    */
   toJSON()
   {
      return this.toObject();
   }

   /**
    * Toggles Actor image between sheet's and token's images
    */
   toggleImage()
   {
      this.updateSource({
         image: this.image === 'actor' ? 'token' : 'actor'
      });
   }

   /**
    * The canonical name of this Document type.
    *
    * @returns {string} The document name.
    */
   static get documentName()
   {
      return 'Quest';
   }

   /**
    * The canonical name of this Document type.
    *
    * @returns {string} The document name.
    */
   get documentName()
   {
      return 'Quest';
   }

   /**
    * This mirrors document.sheet and constructs a new instance of the sheet class.
    *
    * @returns {Application} An associated sheet instance.
    */
   get sheet()
   {
      const SheetClass = Quest.#SheetClass;

      return SheetClass ? new SheetClass(this) : void 0;
   }
}
