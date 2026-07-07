const { DocumentSheetV2 } = foundry.applications.api;

export class QuestPageSheet extends DocumentSheetV2
{
   constructor(options = {})
   {
      super(options);
   }

   static DEFAULT_OPTIONS = {
      classes: ['forien-quest-preview', 'fql-journal-page-sheet', 'fql-appv2'],
      tag: 'div',
      window: {
         resizable: true,
         minimizable: true
      },
      position: {
         width: 1000,
         height: 640
      },
      tabs: [{ navSelector: '.quest-tabs', contentSelector: '.quest-body', initial: 'details', group: 'primary' }]
   };

   static PARTS = {
      preview: {
         template: 'modules/forien-quest-log/templates/quest-preview.html'
      }
   };

   /**
    * Prepara el contexto utilizando el objeto system de la página de diario.
    */
   async _prepareContext(options)
   {
      const context = await super._prepareContext(options);
      
      // Mapear los datos de la página de diario personalizada a los campos requeridos por el template.
      const systemData = this.document.system;
      
      return foundry.utils.mergeObject(context, {
         isGM: game.user.isGM,
         isPlayer: !game.user.isGM,
         canAccept: game.settings.get('forien-quest-log', 'allowPlayersAccept'),
         canEdit: game.user.isGM || (this.document.isOwner && game.settings.get('forien-quest-log', 'trustedPlayerEdit')),
         playerEdit: this.document.isOwner,
         name: this.document.name,
         status: systemData.status,
         description: systemData.description,
         gmnotes: systemData.gmnotes,
         playernotes: systemData.playernotes,
         tasks: systemData.tasks,
         rewards: systemData.rewards,
         giverData: systemData.giverData
      });
   }
}
