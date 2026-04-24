const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const path = require('path');

async function initI18n() {
  await i18next.use(Backend).init({
    fallbackLng: 'en-US',
    supportedLngs: ['en-US', 'en-GB', 'pl'],
    backend: {
      loadPath: path.join(__dirname, '../../locales/{{lng}}/translation.json'),
    },
    interpolation: { escapeValue: false },
  });
}

function getT(locale) {
  return i18next.getFixedT(locale);
}

module.exports = { initI18n, getT };
