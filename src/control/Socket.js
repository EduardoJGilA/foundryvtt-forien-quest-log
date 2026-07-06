import { QuestAPI }  from './public/index.js';

import {
   QuestDB,
   Utils,
   ViewManager }     from './index.js';

import {
   constants,
   questStatus,
   questStatusI18n,
   settings }        from '../model/constants.js';

/**
 * Provides a basic Socket.io implementation to send events between all connected clients.
 */
export class Socket
{
   /**
    * Defines the event name to send all messages to over `game.socket`.
    */
   static #eventName = 'module.forien-quest-log';

   /**
    * Defines the different message types that FQL sends over `game.socket`.
    */
   static #messageTypes = {
      deletedQuest: 'deletedQuest',
      questSetPrimary: 'questSetPrimary',
      questSetStatus: 'questSetStatus',
      questRewardDrop: 'questRewardDrop',
      refreshAll: 'refreshAll',
      refreshQuestPreview: 'refreshQuestPreview',
      savePlayerNotes: 'savePlayerNotes',
      showQuestLog: 'showQuestLog',
      showQuestPreview: 'showQuestPreview',
      showQuestTracker: 'showQuestTracker',
      userCantOpenQuest: 'userCantOpenQuest'
   };

   /**
    * @private
    */
   constructor()
   {
      throw new Error('This is a static class that should not be instantiated.');
   }

   /**
    * Refreshes the parent & subquest GUI apps.
    */
   static async deletedQuest(deleteData)
   {
      if (typeof deleteData === 'object')
      {
         const questId = deleteData.deleteId;
         const questPreview = ViewManager.questPreview.get(questId);

         if (questPreview !== void 0)
         {
            await questPreview.close({ noSave: true });
         }

         game.socket.emit(this.#eventName, {
            type: this.#messageTypes.deletedQuest,
            payload: {
               questId,
            }
         });

         Socket.refreshQuestPreview({ questId: deleteData.savedIds });
      }
   }

   /**
    * Provides the main incoming message registration.
    */
   static listen()
   {
      game.socket.on(this.#eventName, (data, userId) => this.#handleEvent(data, userId));
   }

   /**
    * Handles the reward drop in actor sheet action.
    */
   static async questRewardDrop(data = {})
   {
      let handled = false;

      if (game.user.isGM)
      {
         const fqlData = data.data._fqlData;
         const quest = QuestDB.getQuest(fqlData.questId);
         if (quest)
         {
            const reward = quest.getReward(fqlData.uuidv4);
            if (reward && !reward.locked)
            {
               quest.removeReward(fqlData.uuidv4);
               await quest.save();
               Socket.refreshQuestPreview({ questId: fqlData.questId });
            }
         }
         handled = true;
      }

      game.socket.emit(this.#eventName, {
         type: this.#messageTypes.questRewardDrop,
         payload: {
            ...data,
            handled
         }
      });
   }

   /**
    * Renders all GUI apps.
    */
   static refreshAll(options = {})
   {
      setTimeout(() => ViewManager.renderAll({ force: true, ...options }), 10);

      game.socket.emit(this.#eventName, {
         type: this.#messageTypes.refreshAll,
         payload: {
            options
         }
      });
   }

   /**
    * Refreshes local QuestPreview apps.
    */
   static refreshQuestPreview({ questId, updateLog = true, ...options })
   {
      setTimeout(() => ViewManager.refreshQuestPreview(questId, options), 10);

      game.socket.emit(this.#eventName, {
         type: this.#messageTypes.refreshQuestPreview,
         payload: {
            questId,
            options
         }
      });

      if (updateLog) { Socket.refreshAll(); }
   }

   /**
    * Saves player notes by delegating to an active GM.
    */
   static savePlayerNotes({ quest, playernotes })
   {
      game.socket.emit(this.#eventName, {
         type: this.#messageTypes.savePlayerNotes,
         payload: {
            questId: quest.id,
            playernotes,
            handled: false
         }
      });
   }

   /**
    * Sets a new primary quest.
    */
   static async setQuestPrimary({ quest })
   {
      if (game.user.isGM)
      {
         const currentQuestEntry = QuestDB.getQuestEntry(game.settings.get(
          constants.moduleName, settings.primaryQuest));

         if (currentQuestEntry !== void 0 && currentQuestEntry.id !== quest.id)
         {
            await game.settings.set(constants.moduleName, settings.primaryQuest, quest.id);
         }
         else
         {
            await game.settings.set(constants.moduleName, settings.primaryQuest, quest.isPrimary ? '' : quest.id);
         }
      }
      else
      {
         game.socket.emit(this.#eventName, {
            type: this.#messageTypes.questSetPrimary,
            payload: {
               questId: quest.id,
               handled: false
            }
         });
      }
   }

   /**
    * Handles setting a new quest status.
    */
   static async setQuestStatus({ quest, target })
   {
      let handled = false;

      if (game.user.isGM || (Utils.isTrustedPlayerEdit() && quest.isOwner))
      {
         await quest.setStatus(target);
         handled = true;

         Socket.refreshQuestPreview({ questId: quest.getQuestIds() });
         Socket.refreshAll();

         const dirname = game.i18n.localize(questStatusI18n[target]);
         ViewManager.notifications.info(game.i18n.format('ForienQuestLog.Notifications.QuestMoved',
          { name: quest.name, target: dirname }));
      }
      else
      {
         const canPlayerAccept = game.settings.get(constants.moduleName, settings.allowPlayersAccept);
         if (questStatus.active !== target && !canPlayerAccept) { return; }
      }

      game.socket.emit(this.#eventName, {
         type: this.#messageTypes.questSetStatus,
         payload: {
            questId: quest.id,
            handled,
            target
         }
      });
   }

   /**
    * Open the QuestLog for all remote clients.
    */
   static showQuestLog(tabId)
   {
      game.socket.emit(this.#eventName, {
         type: this.#messageTypes.showQuestLog,
         payload: {
            tabId
         }
      });
   }

   /**
    * Open the associated QuestPreview for all remote clients.
    */
   static showQuestPreview(questId)
   {
      game.socket.emit(this.#eventName, {
         type: this.#messageTypes.showQuestPreview,
         payload: {
            questId
         }
      });
   }

   /**
    * Open the QuestTracker for all remote clients.
    */
   static showQuestTracker()
   {
      game.socket.emit(this.#eventName, {
         type: this.#messageTypes.showQuestTracker
      });
   }

   /**
    * Message emitted for GM users when a player can't open a quest.
    */
   static userCantOpenQuest()
   {
      game.socket.emit(this.#eventName, {
         type: this.#messageTypes.userCantOpenQuest,
         payload: {
            user: game.user.name
         }
      });
   }

   // Internal implementation (receiving message handling) -----------------------------------------------------------

   /**
    * Provides the main incoming message registration.
    */
   static async #handleEvent(data, userId)
   {
      if (typeof data !== 'object') { return; }

      try
      {
         switch (data.type)
         {
            case this.#messageTypes.deletedQuest: await this.#handleDeletedQuest(data); break;
            case this.#messageTypes.questRewardDrop: await this.#handleQuestRewardDrop(data, userId); break;
            case this.#messageTypes.questSetPrimary: await this.#handleQuestSetPrimary(data, userId); break;
            case this.#messageTypes.questSetStatus: await this.#handleQuestSetStatus(data, userId); break;
            case this.#messageTypes.refreshAll: this.#handleRefreshAll(data); break;
            case this.#messageTypes.refreshQuestPreview: this.#handleRefreshQuestPreview(data); break;
            case this.#messageTypes.savePlayerNotes: await this.#handleSavePlayerNotes(data, userId); break;
            case this.#messageTypes.showQuestLog: this.#handleShowQuestLog(data); break;
            case this.#messageTypes.showQuestPreview: this.#handleShowQuestPreview(data); break;
            case this.#messageTypes.showQuestTracker: this.#handleShowQuestTracker(); break;
            case this.#messageTypes.userCantOpenQuest: this.#handleUserCantOpenQuest(data); break;
         }
      }
      catch (err)
      {
         console.error(err);
      }
   }

   /**
    * Closes the associated QuestPreview for the quest that was deleted.
    */
   static async #handleDeletedQuest(data)
   {
      const questPreview = ViewManager.questPreview.get(data.payload.questId);
      if (questPreview !== void 0)
      {
         await questPreview.close({ noSave: true });
      }
   }

   /**
    * Handles the reward item drop into actor sheet. Validates player access on GM side.
    */
   static async #handleQuestRewardDrop(data, userId)
   {
      if (game.user.isGM)
      {
         const fqlData = data.payload.data._fqlData;
         const quest = QuestDB.getQuest(fqlData.questId);
         if (!quest) { return; }

         const sender = game.users.get(userId);
         if (!sender) { return; }

         // Validate that the sender has observer permissions on the quest
         if (!sender.isGM && !quest.entry.testUserPermission(sender, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER))
         {
            console.warn(`FQL Security | User ${sender.name} attempted to access rewards from unobservable quest ${quest.name}`);
            return;
         }

         const reward = quest.getReward(fqlData.uuidv4);
         if (!reward) { return; }

         // Validate that the reward is not locked for player claiming
         if (!sender.isGM && reward.locked)
         {
            console.warn(`FQL Security | User ${sender.name} attempted to claim locked reward ${reward.name} on quest ${quest.name}`);
            return;
         }

         const notify = game.settings.get(constants.moduleName, settings.notifyRewardDrop);
         if (notify)
         {
            ViewManager.notifications.info(game.i18n.format('ForienQuestLog.API.Socket.Notifications.RewardDrop', {
               userName: fqlData.userName,
               itemName: fqlData.itemName,
               actorName: data.payload.actor.name
            }));
         }

         if (data.payload.handled) { return; }
         data.payload.handled = true;

         quest.removeReward(fqlData.uuidv4);
         await quest.save();
         Socket.refreshQuestPreview({ questId: fqlData.questId });
      }
   }

   /**
    * Handles setting a primary quest by a remote GM user.
    */
   static async #handleQuestSetPrimary(data, userId)
   {
      if (game.user.isGM && !data.payload.handled)
      {
         const quest = QuestDB.getQuest(data.payload.questId);
         if (quest === void 0) { return; }

         const sender = game.users.get(userId);
         if (!sender || !sender.isGM)
         {
            console.warn(`FQL Security | Non-GM user ${sender?.name} attempted to set primary quest.`);
            return;
         }

         const currentQuestEntry = QuestDB.getQuestEntry(game.settings.get(constants.moduleName, settings.primaryQuest));

         if (currentQuestEntry !== void 0 && currentQuestEntry.id !== quest.id)
         {
            await game.settings.set(constants.moduleName, settings.primaryQuest, quest.id);
         }
         else
         {
            await game.settings.set(constants.moduleName, settings.primaryQuest, quest.isPrimary ? '' : quest.id);
         }

         data.payload.handled = true;
      }
   }

   /**
    * Sets the quest status with strict sender verification.
    */
   static async #handleQuestSetStatus(data, userId)
   {
      const target = data.payload.target;

      if (game.user.isGM && !data.payload.handled)
      {
         const quest = QuestDB.getQuest(data.payload.questId);
         if (!quest) { return; }

         const sender = game.users.get(userId);
         if (!sender) { return; }

         // Validate sender permissions
         const isTrustedEdit = Utils.isTrustedPlayerEdit() && quest.isOwner;
         const canPlayerAccept = game.settings.get(constants.moduleName, settings.allowPlayersAccept);
         
         const isAllowed = sender.isGM || 
                           isTrustedEdit || 
                           (canPlayerAccept && target === questStatus.active && quest.status === questStatus.available);

         if (!isAllowed)
         {
            console.warn(`FQL Security | User ${sender.name} attempted unauthorized status update for quest ${quest.name} to ${target}`);
            return;
         }

         await quest.setStatus(target);
         data.payload.handled = true;

         Socket.refreshQuestPreview({
            questId: quest.parent ? [quest.parent, quest.id, ...quest.subquests] : [quest.id, ...quest.subquests]
         });

         Socket.refreshAll();

         const dirname = game.i18n.localize(questStatusI18n[target]);
         ViewManager.notifications.info(game.i18n.format('ForienQuestLog.Notifications.QuestMoved',
          { name: quest.name, target: dirname }));
      }

      if (!game.user.isGM && target === questStatus.inactive)
      {
         const questPreview = ViewManager.questPreview.get(data.payload.questId);
         if (questPreview !== void 0)
         {
            await questPreview.close({ noSave: true });
         }
      }
   }

   /**
    * Handles refreshing all GUI apps.
    */
   static #handleRefreshAll(data)
   {
      const options = typeof data.payload.options === 'object' ? data.payload.options : {};
      ViewManager.renderAll({ force: true, ...options });
   }

   /**
    * Handles refreshing / rendering all QuestPreview apps.
    */
   static #handleRefreshQuestPreview(data)
   {
      const questId = data.payload.questId;
      const options = typeof data.payload.options === 'object' ? data.payload.options : {};

      if (Array.isArray(questId))
      {
         for (const id of questId)
         {
            const questPreview = ViewManager.questPreview.get(id);
            if (questPreview !== void 0)
            {
               const quest = QuestDB.getQuest(id);
               if (!quest)
               {
                  questPreview.close();
                  continue;
               }

               if (quest.isObservable) { questPreview.render(true, options); }
               else { questPreview.close(); }
            }
         }
      }
      else
      {
         const questPreview = ViewManager.questPreview.get(questId);
         if (questPreview !== void 0)
         {
            const quest = QuestDB.getQuest(questId);
            if (!quest)
            {
               questPreview.close();
               return;
            }

            if (quest.isObservable) { questPreview.render(true, options); }
            else { questPreview.close(); }
         }
      }
   }

   /**
    * Handles saving player notes. Validates sender observability on GM side.
    */
   static async #handleSavePlayerNotes(data, userId)
   {
      if (game.user.isGM && !data.payload.handled)
      {
         const quest = QuestDB.getQuest(data.payload.questId);
         if (!quest || typeof data.payload.playernotes !== 'string') { return; }

         const sender = game.users.get(userId);
         if (!sender) { return; }

         // Validate sender has access to see/notes the quest
         if (!sender.isGM && !quest.entry.testUserPermission(sender, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER))
         {
            console.warn(`FQL Security | User ${sender.name} attempted unauthorized player notes update on quest ${quest.name}`);
            return;
         }

         quest.playernotes = data.payload.playernotes;
         await quest.save();

         data.payload.handled = true;
         Socket.refreshQuestPreview({ questId: quest.id });
      }
   }

   /**
    * Handles opening the QuestLog app.
    */
   static #handleShowQuestLog(data)
   {
      ViewManager.questLog.render(true, { focus: true, tabId: data.payload.tabId });
   }

   /**
    * Handles opening a QuestPreview app.
    */
   static #handleShowQuestPreview(data)
   {
      QuestAPI.open({ questId: data.payload.questId, notify: false });
   }

   /**
    * Handles opening the QuestTracker app.
    */
   static #handleShowQuestTracker()
   {
      game.settings.set(constants.moduleName, settings.questTrackerEnable, true);
   }

   /**
    * Handles displaying a UI notification for GM level users.
    */
   static #handleUserCantOpenQuest(data)
   {
      if (game.user.isGM)
      {
         ViewManager.notifications.warn(game.i18n.format('ForienQuestLog.Notifications.UserCantOpen',
          { user: data.payload.user }));
      }
   }
}