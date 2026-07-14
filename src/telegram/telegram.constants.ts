import { Markup } from 'telegraf';

export const MAIN_KEYBOARD = Markup.keyboard([
  ['📋 Goals', '🔄 Routines'],
  ['✅ Today', '📊 Progress'],
  ['📝 Check In', '📖 Review'],
  ['⭐ Premium', '⚙️ Settings'],
]).resize();

export const CANCEL_ROW = [Markup.button.callback('Cancel', 'cancel')];
export const MENU_ROW = [Markup.button.callback('🏠 Main Menu', 'main_menu')];

export const CATEGORIES = [
  'Health', 'Career', 'Learning', 'Finance', 'Relationships', 'Personal', 'Other',
];
