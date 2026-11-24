import { constants, settings } from '../model/constants.js';

/**
 * Pay quest rewards (dnd5e): coin rewards are split between the party and item rewards are given to a character.
 * Coin rewards are `type: 'Coin'` with `data: { name, img, amount, coin, each }`. Abstract rewards whose name reads
 * like a coin amount ("120 po para el grupo", "15 sp each") are paid too, so quests written by hand keep working.
 */

/** dnd5e coin key by the abbreviations accepted in text (es / en). */
const COIN = { pt: 'pp', pp: 'pp', po: 'gp', gp: 'gp', pe: 'ep', ep: 'ep', pl: 'sp', sp: 'sp', pc: 'cp', cp: 'cp' };

/** Copper value of each dnd5e coin. */
const CP = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 };

/** Matches "per player / each" phrasing in es / en. */
const EACH = /(cada\s*(uno|jugador|persona)|por\s*(jugador|persona|cabeza)|c\/u|each|per\s*(player|person))/i;

/** Matches a coin amount at the start of a text. */
const AMOUNT = /^(\d[\d.,]*)\s*(pt|pp|po|gp|pe|ep|pl|sp|pc|cp)\b/i;

export class RewardPayout
{
   /** Copper value for `amount` of dnd5e coin `coin`. */
   static toCopper(amount, coin) { return Math.round(Number(amount) * CP[coin]); }

   /**
    * Reads a coin amount from reward text.
    *
    * @param {string}   text - Text like "120 po para el grupo".
    *
    * @returns {{amount: number, coin: string, each: boolean, cp: number}|null} Coin data or null.
    */
   static parseCoin(text = '')
   {
      const m = String(text).trim().match(AMOUNT);
      if (!m) { return null; }
      const amount = Number(m[1].replace(/,/g, ''));
      if (!Number.isFinite(amount)) { return null; }
      const coin = COIN[m[2].toLowerCase()];
      return { amount, coin, each: EACH.test(text), cp: RewardPayout.toCopper(amount, coin) };
   }

   /** Reads the coin data of a reward (Coin type or parseable Abstract) or null. */
   static coinOf(reward)
   {
      if (reward.type === 'Coin' && reward.data)
      {
         const { amount, coin, each } = reward.data;
         if (CP[coin] && Number.isFinite(Number(amount)))
         {
            return { amount: Number(amount), coin, each: !!each, cp: RewardPayout.toCopper(amount, coin) };
         }
      }
      return reward.type === 'Abstract' ? RewardPayout.parseCoin(reward.data?.name) : null;
   }

   /** Splits `cp` between `n` recipients; the remainder goes to the first ones. */
   static split(cp, n)
   {
      const base = Math.floor(cp / n);
      const rest = cp - base * n;
      return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
   }

   /** Converts copper to dnd5e coins, in gold at most (no platinum unless asked). */
   static breakdown(cp, usePlatinum = false)
   {
      const pp = usePlatinum ? Math.floor(cp / 1000) : 0;
      cp -= pp * 1000;
      const gp = Math.floor(cp / 100);
      cp -= gp * 100;
      const sp = Math.floor(cp / 10);
      return { pp, gp, sp, cp: cp - sp * 10 };
   }

   /** Formats copper as text ("30 po 5 pl"). */
   static format(cp)
   {
      const b = RewardPayout.breakdown(cp);
      return [b.gp && `${b.gp} ${game.i18n.localize('ForienQuestLog.Payout.Gold')}`,
       b.sp && `${b.sp} ${game.i18n.localize('ForienQuestLog.Payout.Silver')}`,
        b.cp && `${b.cp} ${game.i18n.localize('ForienQuestLog.Payout.Copper')}`].filter(Boolean).join(' ') || '0';
   }

   /** Text shown for a coin reward ("120 po · grupo"). */
   static label(amount, coin, each)
   {
      const unit = game.i18n.localize(`ForienQuestLog.Payout.Coin.${coin}`);
      const who = game.i18n.localize(each ? 'ForienQuestLog.Payout.Each' : 'ForienQuestLog.Payout.Group');
      return `${amount} ${unit} · ${who}`;
   }

   /** Characters assigned to non-GM users. */
   static partyActors() { return game.users.filter((u) => !u.isGM && u.character).map((u) => u.character); }

   /** True if the quest has anything to pay. */
   static hasPayables(quest)
   {
      return quest.rewards.some((r) => RewardPayout.coinOf(r) || (r.type === 'Item' && r.data?.uuid));
   }

   /** Groups a quest's rewards into coins and items. */
   static async plan(quest)
   {
      const out = { name: quest.name, coins: [], items: [], other: [] };
      for (const r of quest.rewards)
      {
         const hidden = !!r.hidden;
         const coin = RewardPayout.coinOf(r);
         if (coin)
         {
            const name = r.type === 'Coin' ? RewardPayout.label(coin.amount, coin.coin, coin.each) : r.data.name;
            out.coins.push({ ...coin, name, hidden });
            continue;
         }
         if (r.type === 'Item' && r.data?.uuid)
         {
            const item = await fromUuid(r.data.uuid).catch(() => null);
            if (item) { out.items.push({ uuidv4: r.uuidv4, name: item.name, uuid: r.data.uuid, hidden }); continue; }
         }
         out.other.push({ name: r.data?.name ?? '', hidden });
      }
      return out;
   }

   /**
    * Pays a plan.
    *
    * @param {Quest}    quest - The quest.
    *
    * @param {object}   plan - Result of {@link RewardPayout.plan}.
    *
    * @param {{actors: Actor[], itemTo: object, hiddenToo: boolean}}   sel - Chosen recipients.
    *
    * @returns {Promise<string[]>} Lines for the chat message.
    */
   static async apply(quest, plan, sel)
   {
      const actors = sel.actors;
      if (!actors?.length) { throw new Error(game.i18n.localize('ForienQuestLog.Payout.NoRecipients')); }

      const lines = [];
      const gain = new Map(actors.map((a) => [a.id, 0]));
      for (const c of plan.coins)
      {
         if (c.hidden && !sel.hiddenToo) { continue; }
         const shares = c.each ? actors.map(() => c.cp) : RewardPayout.split(c.cp, actors.length);
         actors.forEach((a, i) => gain.set(a.id, gain.get(a.id) + shares[i]));
         lines.push(`${c.name}: ${actors.map((a, i) => `${a.name} ${RewardPayout.format(shares[i])}`).join(', ')}`);
      }

      for (const a of actors)
      {
         const g = RewardPayout.breakdown(gain.get(a.id));
         if (!(g.gp + g.sp + g.cp)) { continue; }
         const cur = a.system.currency ?? {};
         await a.update({ 'system.currency': { gp: (cur.gp ?? 0) + g.gp, sp: (cur.sp ?? 0) + g.sp, cp: (cur.cp ?? 0) + g.cp } });
      }

      for (const it of plan.items)
      {
         if (it.hidden && !sel.hiddenToo) { continue; }
         const actor = game.actors.get(sel.itemTo?.[it.uuidv4]) ?? actors[0];
         const src = await fromUuid(it.uuid);
         if (src) { await actor.createEmbeddedDocuments('Item', [src.toObject()]); lines.push(`${it.name} → ${actor.name}`); }
      }

      await quest.entry.setFlag(constants.moduleName, 'paid', true);
      await ChatMessage.create({
         content: `<h3>${game.i18n.format('ForienQuestLog.Payout.ChatTitle', { name: plan.name })}</h3>` +
          `<ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`
      });
      return lines;
   }

   /** Opens the GM dialog that confirms a payment. */
   static async prompt(quest)
   {
      const plan = await RewardPayout.plan(quest);
      const members = RewardPayout.partyActors();
      if (!members.length) { return ui.notifications.warn(game.i18n.localize('ForienQuestLog.Payout.NoParty')); }

      const L = (k) => game.i18n.localize(`ForienQuestLog.Payout.${k}`);
      const hid = (h) => (h ? ` <em>(${L('Hidden')})</em>` : '');
      const who = members.map((a) => `<label style="display:block"><input type="checkbox" name="a-${a.id}" checked> ${a.name}</label>`).join('');
      const coins = plan.coins.map((c) => `<li>${c.name}${hid(c.hidden)}</li>`).join('') || '<li>—</li>';
      const items = plan.items.map((i) => `<li>${i.name}${hid(i.hidden)}: <select name="i-${i.uuidv4}">${members.map((a) => `<option value="${a.id}">${a.name}</option>`).join('')}</select></li>`).join('') || '<li>—</li>';
      const other = plan.other.length ? `<p>${L('Other')}</p><ul>${plan.other.map((o) => `<li>${o.name}</li>`).join('')}</ul>` : '';
      const content = `<form><p><strong>${plan.name}</strong></p><p>${L('Split')}</p>${who}<p>${L('Coins')}</p><ul>${coins}</ul>` +
       `<p>${L('Items')}</p><ul>${items}</ul>${other}<label><input type="checkbox" name="hidden"> ${L('IncludeHidden')}</label></form>`;

      await foundry.applications.api.DialogV2.prompt({
         window: { title: L('DialogTitle') }, content, rejectClose: false, modal: false,
         ok: {
            label: L('Pay'),
            callback: async (event, button, dialog) =>
            {
               const f = new foundry.applications.ux.FormDataExtended(dialog.element.querySelector('form')).object;
               const sel = {
                  actors: members.filter((a) => f[`a-${a.id}`]),
                  itemTo: Object.fromEntries(plan.items.map((i) => [i.uuidv4, f[`i-${i.uuidv4}`]])),
                  hiddenToo: !!f.hidden
               };
               try { await RewardPayout.apply(quest, plan, sel); ui.notifications.info(L('Paid')); }
               catch (err) { ui.notifications.error(err.message); }
            }
         }
      });
   }

   /** Asks the GM for a coin reward (amount, coin, split) and returns it, or null if cancelled. */
   static async askCoin(initial = {})
   {
      const L = (k) => game.i18n.localize(`ForienQuestLog.Payout.${k}`);
      const coins = ['pp', 'gp', 'ep', 'sp', 'cp'].map((c) => `<option value="${c}" ${(initial.coin ?? 'gp') === c ? 'selected' : ''}>${game.i18n.localize(`ForienQuestLog.Payout.Coin.${c}`)}</option>`).join('');
      const content = `<form><div class="form-group"><label>${L('Amount')}</label><input type="number" name="amount" min="0" step="1" value="${initial.amount ?? ''}" autofocus></div>` +
       `<div class="form-group"><label>${L('CoinType')}</label><select name="coin">${coins}</select></div>` +
       `<div class="form-group"><label>${L('SplitMode')}</label><select name="each"><option value="false" ${!initial.each ? 'selected' : ''}>${L('Group')}</option><option value="true" ${initial.each ? 'selected' : ''}>${L('Each')}</option></select></div></form>`;
      return foundry.applications.api.DialogV2.prompt({
         window: { title: L('CoinDialogTitle') }, content, rejectClose: false, modal: false,
         ok: {
            label: L('Save'),
            callback: (event, button, dialog) =>
            {
               const f = new foundry.applications.ux.FormDataExtended(dialog.element.querySelector('form')).object;
               const amount = Number(f.amount);
               return Number.isFinite(amount) && amount > 0 ? { amount, coin: f.coin, each: f.each === 'true' || f.each === true } : null;
            }
         }
      });
   }

   /** Prompts the payment when a quest is completed and still unpaid (only on the active GM). */
   static onQuestUpdate(questEntry)
   {
      const quest = questEntry?.quest;
      if (!quest || quest.status !== 'completed') { return; }
      if (game.users.activeGM?.id !== game.user.id) { return; }
      if (!game.settings.get(constants.moduleName, settings.autoPayPrompt)) { return; }
      if (quest.entry?.getFlag(constants.moduleName, 'paid') || !RewardPayout.hasPayables(quest)) { return; }
      RewardPayout.prompt(quest);
   }
}
