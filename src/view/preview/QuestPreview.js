import {
   FVTTCompat,
   QuestDB,
   Socket,
   Utils }                    from '../../control/index.js';

import { FQLDialog }          from '../internal/index.js';

import { HandlerAny }         from './HandlerAny.js';
import { HandlerDetails }     from './HandlerDetails.js';
import { HandlerManage }      from './HandlerManage.js';

import {
   constants,
   jquery,
   settings }                 from '../../model/constants.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * QuestPreview is the main app / window of FQL for modifying individual Quest data.
 */
export class QuestPreview extends HandlebarsApplicationMixin(ApplicationV2)
{
   /**
    * Stores the quest being displayed / edited.
    *
    * @type {Quest}
    */
   #quest;

   /**
    * Constructs a QuestPreview instance with a Quest.
    */
   constructor(quest, options = {})
   {
      super(options);

      this.#quest = quest;

      this.canAccept = false;
      this.canEdit = false;
      this.playerEdit = false;
      this._activeFocusOutFunction = void 0;
      this._openedAppIds = [];
      this._ownershipControl = void 0;
      this._rewardImagePopup = void 0;
      this._splashImagePopup = void 0;
   }

   /**
    * Default Application options
    */
   static DEFAULT_OPTIONS = {
      classes: ['forien-quest-preview', 'fql-appv2'],
      tag: 'div',
      window: {
         title: 'ForienQuestLog.QuestPreview.Title',
         icon: 'fas fa-book-open',
         resizable: true,
         minimizable: true
      },
      position: {
         width: 1000,
         height: 640
      },
      tabs: [
         {
            navSelector: '.quest-tabs',
            contentSelector: '.quest-body',
            initial: 'details',
            group: 'primary'
         }
      ]
   };

   static TABS = {
      primary: {
         tabs: [
            { id: 'details' },
            { id: 'playernotes' },
            { id: 'gmnotes' },
            { id: 'management' }
         ],
         initial: 'details'
      }
   };

   static PARTS = {
      preview: {
         template: 'modules/forien-quest-log/templates/quest-preview.html'
      }
   };

   /**
    * Returns the CSS application ID which uniquely references this UI element.
    */
   get id()
   {
      return `quest-${this.#quest.id}`;
   }

   /**
    * Returns the window title with the quest name substituted.
    */
   get title()
   {
      return game.i18n.format('ForienQuestLog.QuestPreview.Title', { name: this.#quest.name });
   }

   /**
    * Returns the associated Quest as the target object.
    */
   get object()
   {
      return this.#quest;
   }

   /**
    * Prevent setting of the target object.
    */
   set object(value) {}

   /**
    * Returns the associated {@link Quest}
    */
   get quest() { return this.#quest; }

   /**
    * Specify the set of config buttons which should appear in the Application header.
    */
   _getHeaderControls()
   {
      const controls = super._getHeaderControls();

      // Share QuestPreview w/ remote clients.
      if (game.user.isGM)
      {
         controls.unshift({
            icon: 'fas fa-eye',
            label: game.i18n.localize('ForienQuestLog.Labels.AppHeader.ShowPlayers'),
            class: 'share-quest',
            action: 'shareQuest'
         });
      }

      // Show splash image popup if splash image is defined.
      if (this.#quest.splash?.length)
      {
         controls.unshift({
            icon: 'far fa-image',
            label: '',
            class: 'splash-image',
            action: 'showSplash'
         });
      }

      // Copy quest content link.
      controls.unshift({
         icon: 'fas fa-link',
         label: '',
         class: 'copy-link',
         action: 'copyLink'
      });

      return controls;
   }

   /**
    * Handle header actions.
    */
   async _onHeaderControl(event, control)
   {
      if (control.action === 'shareQuest')
      {
         Socket.showQuestPreview(this.#quest.id);
         return;
      }
      if (control.action === 'showSplash')
      {
         if (this.#quest.splash?.length)
         {
            await HandlerDetails.splashImagePopupShow(this.#quest, this);
         }
         return;
      }
      if (control.action === 'copyLink')
      {
         if (await Utils.copyTextToClipboard(`@JournalEntry[${this.#quest.id}]{${this.#quest.name}}`))
         {
            ui.notifications.info(game.i18n.format('ForienQuestLog.Notifications.LinkCopied'));
         }
         return;
      }
      super._onHeaderControl(event, control);
   }

   /**
    * Close any tracked permission control app / dialog when tabs change.
    */
   changeTab(tabId, group, options = {})
   {
      if (this._ownershipControl)
      {
         this._ownershipControl.close();
         this._ownershipControl = void 0;
      }

      return super.changeTab(tabId, group, options);
   }

   /**
    * Defines all jQuery control callbacks.
    */
   _onRender(context, options)
   {
      super._onRender(context, options);
      const html = $(this.element);

      // Clean up previous event listeners to prevent duplicates on re-render
      html.off(jquery.click);
      html.off('dragstart');
      html.off('dragenter');
      html.off('drop');

      // Wire tab navigation manually (AppV2 does not auto-bind this custom nav).
      html.on(jquery.click, '.quest-tabs .item[data-tab]', (event) =>
      {
         event.preventDefault();
         this.changeTab(event.currentTarget.dataset.tab, 'primary');
      });

      // Callbacks for any user.
      html.on(jquery.click, '.quest-giver-name .open-actor-sheet', async (event) =>
       await HandlerDetails.questGiverShowActorSheet(event, this));

      html.on(jquery.click, '.quest-name-link', (event) => HandlerAny.questOpen(event));

      html.on(jquery.dragenter, (event) => event.preventDefault());

      html.on(jquery.dragstart, '.item-reward .editable-container', async (event) =>
       await HandlerDetails.rewardDragStartItem(event, this.#quest));

      html.on(jquery.dragstart, '.quest-rewards .fa-sort', (event) => HandlerDetails.rewardDragStartSort(event));

      html.on(jquery.click, '.abstract-reward .editable-container', async (event) =>
       await HandlerDetails.rewardShowImagePopout(event, this.#quest, this));

      html.on(jquery.click, '.actor-reward .editable-container', async (event) =>
       await HandlerDetails.rewardShowSheet(event, this.#quest, this));

      html.on(jquery.click, '.item-reward .editable-container', async (event) =>
       await HandlerDetails.rewardShowSheet(event, this.#quest, this));

      html.on(jquery.click, '.splash-image-link', () => HandlerDetails.splashImagePopupShow(this.#quest, this));

      html.on(jquery.dragstart, '.quest-tasks .fa-sort', (event) => HandlerDetails.taskDragStartSort(event));

      // Callbacks for GM, trusted player edit, and players with ownership
      if (this.canEdit || this.playerEdit)
      {
         html.on(jquery.click, '.actions-single.quest-name .editable', (event) =>
          HandlerDetails.questEditName(event, this.#quest, this));

         html.on(jquery.drop, '.quest-giver-gc', async (event) =>
          await HandlerDetails.questGiverDropDocument(event, this.#quest, this));

         html.on(jquery.click, '.quest-giver-gc .toggleImage', async () =>
          await HandlerDetails.questGiverToggleImage(this.#quest, this));

         html.on(jquery.click, '.quest-giver-gc .deleteQuestGiver', async () =>
          await HandlerDetails.questGiverDelete(this.#quest, this));

         html.on(jquery.click, '.quest-tasks .add-new-task',
          (event) => HandlerDetails.taskAdd(event, this.#quest, this));

         html.on(jquery.click, '.actions.tasks .delete', async (event) =>
          await HandlerDetails.taskDelete(event, this.#quest, this));

         html.on(jquery.drop, '.tasks-box', async (event) => await HandlerDetails.taskDropItem(event, this.#quest));

         html.on(jquery.click, '.actions.tasks .editable',
          (event) => HandlerDetails.taskEditName(event, this.#quest, this));

         html.on(jquery.click, 'li.task .toggleState', async (event) =>
          await HandlerDetails.taskToggleState(event, this.#quest, this));
      }

      // Callbacks for GM, trusted player edit, or players who can accept quests.
      if (this.canEdit || this.canAccept)
      {
         html.on(jquery.click, '.actions.quest-status i.delete', async (event) =>
          await HandlerAny.questDelete(event, this.#quest));

         html.on(jquery.click, '.actions.quest-status i.move', async (event) =>
          {
             await this.saveQuest({ refresh: false });
             await HandlerAny.questStatusSet(event);
          });
      }

      // Callbacks only for the GM and trusted player edit.
      if (this.canEdit)
      {
         html.on(jquery.click, '.quest-giver-name .actions-single .editable', (event) =>
          HandlerDetails.questGiverCustomEditName(event, this.#quest, this));

         html.on(jquery.click, '.quest-giver-gc .drop-info', () =>
          HandlerDetails.questGiverCustomSelectImage(this.#quest, this));

         html.on(jquery.click, '.quest-tabs .is-primary', () => Socket.setQuestPrimary({ quest: this.#quest }));

         html.on(jquery.click, '.quest-rewards .add-abstract', (event) =>
          HandlerDetails.rewardAddAbstract(event, this.#quest, this));

         html.on(jquery.click, '.actions.rewards .editable', (event) =>
          HandlerDetails.rewardAbstractEditName(event, this.#quest, this));

         html.on(jquery.click, '.actions.rewards .delete', async (event) =>
          await HandlerDetails.rewardDelete(event, this.#quest, this));

         html.on(jquery.drop, '.rewards-box',
          async (event) => await HandlerDetails.rewardDropItem(event, this.#quest, this));

         html.on(jquery.click, '.quest-rewards .hide-all-rewards', async () =>
          await HandlerDetails.rewardsHideAll(this.#quest, this));

         html.on(jquery.click, '.quest-rewards .lock-all-rewards', async () =>
          await HandlerDetails.rewardsLockAll(this.#quest, this));

         html.on(jquery.click, '.reward-image', async (event) =>
          await HandlerDetails.rewardSelectImage(event, this.#quest, this));

         html.on(jquery.click, '.quest-rewards .show-all-rewards', async () =>
          await HandlerDetails.rewardsShowAll(this.#quest, this));

         html.on(jquery.click, '.actions.rewards .toggleHidden', async (event) =>
          await HandlerDetails.rewardToggleHidden(event, this.#quest, this));

         html.on(jquery.click, '.actions.rewards .toggleLocked', async (event) =>
          await HandlerDetails.rewardToggleLocked(event, this.#quest, this));

         html.on(jquery.click, '.quest-rewards .unlock-all-rewards', async () =>
          await HandlerDetails.rewardsUnlockAll(this.#quest, this));

         html.on(jquery.click, '.actions.tasks .toggleHidden', async (event) =>
          await HandlerDetails.taskToggleHidden(event, this.#quest, this));

         // Management view callbacks
         html.on(jquery.click, '.add-subquest-btn', async () => await HandlerManage.addSubquest(this.#quest, this));

         html.on(jquery.click, '.configure-perm-btn', () => HandlerManage.configurePermissions(this.#quest, this));

         html.on(jquery.click, '.delete-splash', async () => await HandlerManage.deleteSplashImage(this.#quest, this));

         html.on(jquery.click, `.quest-splash #splash-as-icon-${this.#quest.id}`, async (event) =>
          await HandlerManage.setSplashAsIcon(event, this.#quest, this));

         html.on(jquery.click, '.quest-splash .drop-info',
          async () => await HandlerManage.setSplashImage(this.#quest, this));

         html.on(jquery.click, '.change-splash-pos', async () => await HandlerManage.setSplashPos(this.#quest, this));
      }
   }

   /**
    * When closing this Foundry app.
    */
   async close({ noSave = false, ...options } = {})
   {
      FQLDialog.closeDialogs({ questId: this.#quest.id });

      if (this._ownershipControl)
      {
         this._ownershipControl.close();
         this._ownershipControl = void 0;
      }

      for (const appId of this._openedAppIds)
      {
         const app = ui.windows[appId];
         if (app && app.rendered) { app.close(); }
      }

      if (this._rewardImagePopup)
      {
         this._rewardImagePopup.close();
         this._rewardImagePopup = void 0;
      }

      if (this._splashImagePopup)
      {
         this._splashImagePopup.close();
         this._splashImagePopup = void 0;
      }

      if (!noSave && this.#quest.isOwner)
      {
         if (typeof this._activeFocusOutFunction === 'function')
         {
            await this._activeFocusOutFunction(void 0, { refresh: false });

            Socket.refreshQuestPreview({
               questId: this.#quest.parent ? [this.#quest.parent, this.#quest.id, ...this.#quest.subquests] :
                [this.#quest.id, ...this.#quest.subquests],
               focus: false,
            });
         }
         else
         {
            await this.saveQuest({ refresh: false });
         }
      }

      return super.close(options);
   }

   /**
    * Retrieves context data.
    */
   async _prepareContext(options)
   {
      const context = await super._prepareContext(options);
      const content = QuestDB.getQuestEntry(this.#quest.id).enrich;

      this.canAccept = game.settings.get(constants.moduleName, settings.allowPlayersAccept);
      this.canEdit = game.user.isGM || (this.#quest.isOwner && Utils.isTrustedPlayerEdit());
      this.playerEdit = this.#quest.isOwner;

      const canEditPlayerNotes = this.#quest.canUserUpdate || game.users.activeGM !== null;

      const activeTab = this.tabGroups['primary'] || 'details';
      this.tabGroups['primary'] = activeTab;
      if (!this.canEdit && activeTab !== 'details' && activeTab !== 'playernotes')
      {
         this.tabGroups['primary'] = 'details';
      }

      const data = {
         isGM: game.user.isGM,
         isPlayer: !game.user.isGM,
         canAccept: this.canAccept,
         canEdit: this.canEdit,
         canEditPlayerNotes,
         playerEdit: this.playerEdit,
         activeTab: this.tabGroups['primary']
      };

      // Set window title dynamically
      this.options.window.title = game.i18n.format('ForienQuestLog.QuestPreview.Title', this.#quest);

      return foundry.utils.mergeObject(foundry.utils.mergeObject(context, data), content);
   }

   /**
    * Refreshes the QuestPreview window.
    */
   async refresh()
   {
      Socket.refreshQuestPreview({
         questId: this.#quest.parent ? [this.#quest.parent, this.#quest.id, ...this.#quest.subquests] :
          [this.#quest.id, ...this.#quest.subquests],
         focus: false,
      });

      this.render(true, { focus: true });
   }

   /**
    * When the editor is saved.
    */
   async saveEditor(name)
   {
      if (name === 'playernotes' && !this.#quest.canUserUpdate && game.users.activeGM)
      {
         const playernotes = FVTTCompat.getEditorContent(this.editors?.playernotes);

         if (typeof playernotes === 'string')
         {
            Socket.savePlayerNotes({ quest: this.#quest, playernotes });
         }

         return super.saveEditor(name);
      }

      return this.saveQuest();
   }

   /**
    * Save the associated quest.
    */
   async saveQuest({ refresh = true } = {})
   {
      if (this.editors)
      {
         for (const key of Object.keys(this.editors))
         {
            const editor = this.editors[key];
            const content = FVTTCompat.getEditorContent(editor);

            if (content)
            {
               this.#quest.updateSource({ [key]: content });
               await super.saveEditor(key);
            }
         }
      }

      await this.#quest.save();

      return refresh ? this.refresh() : void 0;
   }
}
