const { MessageFlags } = require('discord.js');
const { getT } = require('../services/i18n');

const DEV_IDS = new Set(
  (process.env.DEV_USER_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean)
);

function isDevUser(userId) {
  return process.env.NODE_ENV === 'development' && DEV_IDS.has(userId);
}

function isDev(interaction) {
  return isDevUser(interaction.user.id);
}

async function requireDev(interaction) {
  if (isDev(interaction)) return true;
  const t = getT(interaction.locale);
  await interaction.reply({ content: t('dev.mode_only'), flags: MessageFlags.Ephemeral });
  return false;
}

module.exports = { requireDev, isDev, isDevUser };
