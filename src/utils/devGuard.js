const { MessageFlags } = require('discord.js');

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
  await interaction.reply({ content: '🚫 Dev mode only.', flags: MessageFlags.Ephemeral });
  return false;
}

module.exports = { isDev, isDevUser, requireDev };
