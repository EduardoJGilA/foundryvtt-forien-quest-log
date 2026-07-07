import {
   QuestDB,
   Socket,
   Utils }              from '../../control/index.js';

import {
   FQLContextMenu,
   FQLDialog }          from '../internal/index.js';

import { HandlerLog }   from './HandlerLog.js';

import {
   constants,
   jquery,
   questStatus,
   questStatusI18n,
   questTabIndex,
   settings }           from '../../model/constants.js';
import * as contextOptions from "../internal/context-options.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Provides the main quest log app which shows the quests separated by status either with bookmark or classic tabs.
 */
export class QuestLog extends HandlebarsApplicationMixin(ApplicationV2)
{
   /**
    * @inheritDoc
    */
   constructor(options = {})
   {
      super(options);
   }

   /**
    * Default Application options
    */
   static DEFAULT_OPTIONS = {
      id: constants.moduleName,
      classes: [constants.moduleName, "fql-appv2"],
      tag: "div",
      window: {
         title: "ForienQuestLog.QuestLog.Title",
         icon: "fas fa-scroll",
         resizable: true,
         minimizable: true
      },
      position: {
         width: 700,
         height: 480
      },
      tabs: [
         {
            navSelector: '.log-tabs',
            contentSelector: '.log-body',
            initial: 'active',
            group: 'primary'
         }
      ]
   };

   static TABS = {
      primary: {
         tabs: [
            { id: 'available' },
            { id: 'active' },
            { id: 'completed' },
            { id: 'failed' },
            { id: 'inactive' }
         ],
         initial: 'active'
      }
   };

   static PARTS = {
      log: {
         template: 'modules/forien-quest-log/templates/quest-log.html'
      }
   };

   /**
    * Specify header controls.
    */
   _getHeaderControls()
   {
      const controls = super._getHeaderControls();

      // Share QuestLog w/ remote clients.
      if (game.user.isGM)
      {
         controls.unshift({
            icon: 'fas fa-eye',
            label: game.i18n.localize('ForienQuestLog.Labels.AppHeader.ShowPlayers'),
            class: 'share-quest',
            action: 'shareQuestLog'
         });
      }

      return controls;
   }

   /**
    * Handle header button clicks or general actions.
    */
   _onHeaderControl(event, control)
   {
      if (control.action === 'shareQuestLog')
      {
         const activeTab = this.tabGroups['primary'] || 'active';
         Socket.showQuestLog(activeTab);
         return;
      }
      super._onHeaderControl(event, control);
   }

   /**
    * Renders event listeners.
    */
   _onRender(context, options)
   {
      super._onRender(context, options);
      const html = $(this.element);

      const navStyle = game.settings.get(constants.moduleName, settings.navStyle);
      const dynamicBackground = game.settings.get(constants.moduleName, settings.dynamicBookmarkBackground);
      if ('bookmarks' === navStyle && dynamicBackground)
      {
         const windowContent = html.find('.window-content');
         const fqlBookmarkItem = html.find('.item');

         const backImage = windowContent.css('background-image');
         const backBlendMode = windowContent.css('background-blend-mode');
         const backColor = windowContent.css('background-color');

         fqlBookmarkItem.css('background-image', backImage);
         fqlBookmarkItem.css('background-color', backColor);
         fqlBookmarkItem.css('background-blend-mode', backBlendMode);
      }

      // Wire tab navigation manually (AppV2 does not auto-bind this custom nav).
      html.on(jquery.click, '.log-tabs .item[data-tab]', (event) =>
      {
         event.preventDefault();
         this.changeTab(event.currentTarget.dataset.tab, 'primary');
         this.setPosition();
      });

      html.on(jquery.click, '.new-quest-btn', HandlerLog.questAdd);
      html.on(jquery.click, '.actions.quest-status i.delete', HandlerLog.questDelete);
      html.on(jquery.dragenter, (event) => event.preventDefault());
      html.on(jquery.dragstart, '.drag-quest', void 0, HandlerLog.questDragStart);
      html.on(jquery.click, '.open-quest', void 0, HandlerLog.questOpen);
      html.on(jquery.click, '.actions.quest-status i.move', HandlerLog.questStatusSet);

      this.#contextMenu(html);
   }

   /**
    * Handle closing any confirm delete quest dialog attached to QuestLog.
    */
   async close(options)
   {
      FQLDialog.closeDialogs({ isQuestLog: true });
      return super.close(options);
   }

   /**
    * Create the context menu.
    */
   #contextMenu(html)
   {
      const menuItemsOther = [
         contextOptions.menuItemCopyLink,
         contextOptions.jumpToPin
      ];

      const menuItemsActive = [
         contextOptions.menuItemCopyLink,
         contextOptions.jumpToPin
      ];

      if (game.user.isGM)
      {
         menuItemsActive.push(
          contextOptions.copyQuestId,
          contextOptions.togglePrimaryQuest
         );

         menuItemsOther.push(contextOptions.copyQuestId);
      }

      const element = html instanceof HTMLElement ? html : html?.[0];

      new FQLContextMenu(element, '.tab:not([data-tab="active"]) .drag-quest', menuItemsOther, { fixed: true });
      new FQLContextMenu(element, '.tab[data-tab="active"] .drag-quest', menuItemsActive, { fixed: true });
   }

   /**
    * Retrieves context data.
    */
    async _prepareContext(options)
   {
      const context = await super._prepareContext(options);
      const activeTab = this.tabGroups['primary'] || 'active';
      this.tabGroups['primary'] = activeTab;
      return foundry.utils.mergeObject(context, {
         options,
         isGM: game.user.isGM,
         isPlayer: !game.user.isGM,
         isTrustedPlayerEdit: Utils.isTrustedPlayerEdit(),
         canAccept: game.settings.get(constants.moduleName, settings.allowPlayersAccept),
         canCreate: game.settings.get(constants.moduleName, settings.allowPlayersCreate),
         showTasks: game.settings.get(constants.moduleName, settings.showTasks),
         style: game.settings.get(constants.moduleName, settings.navStyle),
         questStatusI18n,
         quests: QuestDB.sortCollect(),
         activeTab
      });
   }

   /**
    * Change active tab if option is provided.
    */
   async _render(force = false, options = {})
   {
      const result = await super._render(force, options);

      if (typeof options.tabId === 'string' && options.tabId in questStatus)
      {
         if (options.tabId === questStatus.inactive)
         {
            if (game.user.isGM || Utils.isTrustedPlayerEdit())
            {
               this.changeTab(options.tabId, 'primary', { render: false });
            }
         }
         else
         {
            this.changeTab(options.tabId, 'primary', { render: false });
         }
      }

      return result;
   }

   /**
    * Sets position.
    */
   setPosition(position = {})
   {
      const currentPosition = super.setPosition(position);
      const html = $(this.element);

      const tableElements = html.find('.table');
      const activeTab = this.tabGroups['primary'] || 'active';
      const tabIndex = questTabIndex[activeTab];
      const table = tableElements[tabIndex];

      if (table)
      {
         const fqlPosition = html[0].getBoundingClientRect();
         const tablePosition = table.getBoundingClientRect();
         tableElements.css('max-height', `${currentPosition.height - (tablePosition.top - fqlPosition.top + 16)}px`);
      }

      return currentPosition;
   }
}
