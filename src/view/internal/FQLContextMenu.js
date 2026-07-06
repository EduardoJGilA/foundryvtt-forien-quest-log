/**
 * Used to provides a fixed context menu used in QuestLog. With v13 it is handled by Foundry natively.
 */
export class FQLContextMenu extends foundry.applications.ux.ContextMenu
{
   /**
    * @inheritDoc
    * @override
    */
   constructor(element, selector, menuItems, options = {})
   {
      // v13+: opt out of deprecated jQuery transaction; callbacks receive HTMLElement references.
      super(element, selector, menuItems, { jQuery: false, ...options });
   }
}
