require('dotenv').config();
const { Client, GatewayIntentBits, Collection, MessageFlags } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const { initI18n, getT } = require('./services/i18n');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();

const isDev = process.env.NODE_ENV === 'development';

for (const file of fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(__dirname, 'commands', file));
  if (cmd.devOnly && !isDev) continue;
  client.commands.set(cmd.data.name, cmd);
}

client.once('clientReady', () => {
  console.log(`Zalogowano jako ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error('Command execution failed', {
      command: interaction.commandName,
      userId: interaction.user?.id,
      guildId: interaction.guildId,
      options: interaction.options?.data?.map(option => ({
        name: option.name,
        type: option.type,
        value: option.value,
      })),
      error: err,
    });
    const t = getT(interaction.locale);
    const errorKey = err?.code === 'ECONNREFUSED'
      ? 'errors.database_unavailable'
      : 'errors.generic';
    const payload = { content: t(errorKey), flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

(async () => {
  await initI18n();
  await client.login(process.env.DISCORD_TOKEN);
})();
