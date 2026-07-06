import { Utils } from '../src/control/index.js';
import { Quest } from '../src/model/index.js';
import { constants } from '../src/model/constants.js';

export class DBMigration
{
   /**
    * @private
    */
   constructor()
   {
      throw new Error('This is a static class that should not be instantiated.');
   }

   /**
    * Defines the current max schema version.
    *
    * @returns {number} max schema version.
    */
   static get version() { return 4; }

   /**
    * Defines the module setting key to store current level DB migration level.
    *
    * @returns {string} module setting for schemaVersion.
    */
   static get setting() { return 'schemaVersion'; }

   /**
    * Runs DB migration.
    *
    * @param {number} [schemaVersion] - A valid schema version.
    *
    * @returns {Promise<void>}
    */
   static async migrate(schemaVersion = void 0)
   {
      try
      {
         game.settings.register(constants.moduleName, this.setting, {
            scope: 'world',
            config: false,
            default: 0,
            type: Number
         });

         if (schemaVersion === void 0)
         {
            schemaVersion = game.settings.get(constants.moduleName, this.setting);
         }

         if (schemaVersion >= this.version) { return; }

         const folder = await Utils.initializeQuestFolder();
         if (!folder) { return; }

         const folderContentLength = folder.contents?.length ?? 0;
         if (folderContentLength === 0)
         {
            await game.settings.set(constants.moduleName, this.setting, this.version);
            return;
         }

         ui.notifications.info(game.i18n.localize('ForienQuestLog.Migration.Notifications.Start'));

         const entries = folder.contents ?? [];
         for (const entry of entries)
         {
            try
            {
               let content = entry.getFlag(constants.moduleName, constants.flagDB);
               if (!content) { continue; }

               if (typeof content === 'string')
               {
                  try
                  {
                     content = JSON.parse(content);
                  }
                  catch (e)
                  {
                     console.error(`FQL | Failed to parse legacy JSON for quest ${entry.name}`, e);
                     continue;
                  }
               }

               // Instantiate Quest model which runs QuestDataModel parsing and defaults
               const quest = new Quest(content, entry);
               const cleanedData = quest.toObject();

               // Save the cleaned, validated DataModel under the flag
               await entry.update({
                  flags: {
                     [constants.moduleName]: {
                        [constants.flagDB]: cleanedData
                     }
                  }
               }, { diff: false });
            }
            catch (err)
            {
               console.error(`FQL | Error migrating quest: ${entry.name}`, err);
            }
         }

         await game.settings.set(constants.moduleName, this.setting, this.version);
         ui.notifications.info(game.i18n.localize('ForienQuestLog.Migration.Notifications.Complete'));
      }
      catch (err)
      {
         console.error('FQL | DB migration failed', err);
      }
   }
}