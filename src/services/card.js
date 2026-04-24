const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { getTierData } = require('./rarity');
const path = require('path');

const W = 300;
const H = 420;
const CATALOG_COLUMNS = 5;
const CATALOG_CARD_SCALE = 0.38;
const CATALOG_PADDING = 24;
const CATALOG_GAP = 18;
const DISPLAY_FONT = 'Cinzel';
const DISPLAY_FONT_PATH = path.join(__dirname, '../../assets/fonts/Cinzel-Bold.ttf');

if (!GlobalFonts.has(DISPLAY_FONT)) {
  GlobalFonts.registerFromPath(DISPLAY_FONT_PATH, DISPLAY_FONT);
}

function hexToRgba(hex, alpha) {
  const value = hex.replace('#', '');
  const bigint = parseInt(value, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function clipRoundRect(ctx, x, y, w, h, r) {
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
}

function fitText(ctx, text, maxWidth) {
  let value = text;
  while (ctx.measureText(value).width > maxWidth && value.length > 1) {
    value = value.slice(0, -1);
  }
  return value === text ? value : `${value}...`;
}

function sanitizeDisplayText(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function drawOrnament(ctx, x, y, size, color, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-size, 0);
  ctx.quadraticCurveTo(-size * 0.2, -size * 0.2, 0, -size);
  ctx.quadraticCurveTo(size * 0.2, -size * 0.2, size, 0);
  ctx.quadraticCurveTo(size * 0.2, size * 0.2, 0, size);
  ctx.quadraticCurveTo(-size * 0.2, size * 0.2, -size, 0);
  ctx.stroke();
  ctx.restore();
}

function drawHeart(ctx, x, y, size, color, alpha = 0.18) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = hexToRgba(color, alpha);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.9);
  ctx.bezierCurveTo(size, size * 0.2, size * 1.1, -size * 0.6, 0, -size * 0.15);
  ctx.bezierCurveTo(-size * 1.1, -size * 0.6, -size, size * 0.2, 0, size * 0.9);
  ctx.fill();
  ctx.restore();
}

function drawEgg(ctx, x, y, size, color, alpha = 0.18) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = hexToRgba(color, alpha);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.bezierCurveTo(size * 0.8, -size * 0.8, size, size * 0.1, 0, size);
  ctx.bezierCurveTo(-size, size * 0.1, -size * 0.8, -size * 0.8, 0, -size);
  ctx.fill();
  ctx.restore();
}

function drawPumpkin(ctx, x, y, size, color, alpha = 0.18) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = hexToRgba(color, alpha);
  for (const offset of [-size * 0.45, 0, size * 0.45]) {
    ctx.beginPath();
    ctx.ellipse(offset, 0, size * 0.5, size * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = hexToRgba('#2B1200', 0.35);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.9);
  ctx.lineTo(size * 0.15, -size * 1.25);
  ctx.stroke();
  ctx.restore();
}

function drawSnowflake(ctx, x, y, size, color, alpha = 0.2) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = hexToRgba(color, alpha);
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -size);
    ctx.moveTo(0, -size * 0.7);
    ctx.lineTo(size * 0.18, -size * 0.5);
    ctx.moveTo(0, -size * 0.7);
    ctx.lineTo(-size * 0.18, -size * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHorsehoe(ctx, x, y, size, color, alpha = 0.18) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = hexToRgba(color, alpha);
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(0, 0, size, Math.PI * 0.18, Math.PI * 0.82, true);
  ctx.stroke();
  ctx.restore();
}

function drawStar(ctx, x, y, size, color, alpha = 0.18) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = hexToRgba(color, alpha);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? size : size * 0.45;
    const angle = (-Math.PI / 2) + (i * Math.PI / 5);
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawThemeMotifs(ctx, tierData) {
  const theme = tierData.theme;
  if (!theme) return;

  if (theme === 'valentine') {
    drawHeart(ctx, 56, 86, 18, tierData.color);
    drawHeart(ctx, 244, 120, 14, tierData.color, 0.14);
    drawHeart(ctx, 236, 318, 20, tierData.color, 0.14);
  }

  if (theme === 'easter') {
    drawEgg(ctx, 58, 100, 18, tierData.color);
    drawEgg(ctx, 246, 114, 14, tierData.color, 0.14);
    drawEgg(ctx, 234, 318, 18, tierData.color, 0.14);
  }

  if (theme === 'halloween') {
    drawPumpkin(ctx, 58, 96, 16, tierData.color);
    drawPumpkin(ctx, 242, 116, 12, tierData.color, 0.14);
    drawPumpkin(ctx, 236, 318, 16, tierData.color, 0.14);
  }

  if (theme === 'christmas') {
    drawSnowflake(ctx, 58, 96, 18, tierData.color);
    drawSnowflake(ctx, 242, 116, 13, tierData.color, 0.14);
    drawSnowflake(ctx, 236, 318, 18, tierData.color, 0.14);
  }

  if (theme === 'horse') {
    drawHorsehoe(ctx, 58, 96, 16, tierData.color);
    drawHorsehoe(ctx, 242, 116, 12, tierData.color, 0.14);
    drawHorsehoe(ctx, 236, 318, 16, tierData.color, 0.14);
  }

  if (theme === 'celestial') {
    drawStar(ctx, 58, 96, 18, tierData.color);
    drawStar(ctx, 242, 116, 13, tierData.color, 0.14);
    drawStar(ctx, 236, 318, 18, tierData.color, 0.14);
  }
}

function drawCardBackground(ctx, tierData) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, tierData.bgTop);
  bg.addColorStop(1, tierData.bgBottom);
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, W, H, 24);
  ctx.fill();

  ctx.save();
  clipRoundRect(ctx, 0, 0, W, H, 24);

  const glow = ctx.createRadialGradient(W * 0.5, H * 0.24, 18, W * 0.5, H * 0.24, 220);
  glow.addColorStop(0, hexToRgba(tierData.color, 0.42));
  glow.addColorStop(0.45, hexToRgba(tierData.color, 0.14));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const mist = ctx.createLinearGradient(0, 40, W, H - 20);
  mist.addColorStop(0, 'rgba(255,255,255,0.06)');
  mist.addColorStop(0.5, 'rgba(255,255,255,0.01)');
  mist.addColorStop(1, 'rgba(255,255,255,0.08)');
  ctx.strokeStyle = mist;
  ctx.lineWidth = 20;
  for (let i = -1; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-30, 80 + i * 70);
    ctx.bezierCurveTo(70, 40 + i * 80, 200, 110 + i * 60, W + 30, 70 + i * 75);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let y = 24; y < H; y += 20) {
    ctx.beginPath();
    ctx.moveTo(22, y);
    ctx.lineTo(W - 22, y);
    ctx.stroke();
  }

  const vignette = ctx.createRadialGradient(W / 2, H / 2, 90, W / 2, H / 2, 250);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.48)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  ctx.restore();
  drawThemeMotifs(ctx, tierData);
}

function drawCardFrame(ctx, tierData) {
  ctx.save();
  ctx.shadowColor = hexToRgba(tierData.color, 0.5);
  ctx.shadowBlur = 26;
  ctx.strokeStyle = hexToRgba(tierData.color, 0.95);
  ctx.lineWidth = 3;
  roundRect(ctx, 3, 3, W - 6, H - 6, 21);
  ctx.stroke();
  ctx.shadowBlur = 0;

  const metal = ctx.createLinearGradient(10, 0, W - 10, H);
  metal.addColorStop(0, 'rgba(255,255,255,0.75)');
  metal.addColorStop(0.35, hexToRgba(tierData.color, 0.9));
  metal.addColorStop(0.7, 'rgba(255,255,255,0.18)');
  metal.addColorStop(1, hexToRgba(tierData.color, 0.55));
  ctx.strokeStyle = metal;
  ctx.lineWidth = 6;
  roundRect(ctx, 12, 12, W - 24, H - 24, 18);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, 18, 18, W - 36, H - 36, 14);
  ctx.stroke();

  drawOrnament(ctx, 34, 34, 10, hexToRgba(tierData.color, 0.9), 0);
  drawOrnament(ctx, W - 34, 34, 10, hexToRgba(tierData.color, 0.9), Math.PI / 2);
  drawOrnament(ctx, 34, H - 34, 10, hexToRgba(tierData.color, 0.9), -Math.PI / 2);
  drawOrnament(ctx, W - 34, H - 34, 10, hexToRgba(tierData.color, 0.9), Math.PI);
  ctx.restore();
}

async function drawAvatarMedallion(ctx, tierData, avatarSource) {
  const avatarSize = 150;
  const avatarX = W / 2;
  const avatarY = 130;

  ctx.save();
  ctx.fillStyle = 'rgba(8,10,16,0.62)';
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarSize / 2 + 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarSize / 2 + 13, 0, Math.PI * 2);
  const ring = ctx.createLinearGradient(
    avatarX - avatarSize,
    avatarY - avatarSize,
    avatarX + avatarSize,
    avatarY + avatarSize
  );
  ring.addColorStop(0, 'rgba(255,255,255,0.95)');
  ring.addColorStop(0.5, hexToRgba(tierData.color, 0.9));
  ring.addColorStop(1, 'rgba(255,255,255,0.4)');
  ctx.strokeStyle = ring;
  ctx.lineWidth = 6;
  ctx.shadowColor = hexToRgba(tierData.color, 0.55);
  ctx.shadowBlur = 20;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarSize / 2 + 2, 0, Math.PI * 2);
  ctx.clip();
  try {
    const img = await loadImage(avatarSource);
    ctx.drawImage(img, avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize);
  } catch {
    const fallback = ctx.createLinearGradient(
      avatarX - avatarSize / 2,
      avatarY - avatarSize / 2,
      avatarX + avatarSize / 2,
      avatarY + avatarSize / 2
    );
    fallback.addColorStop(0, '#5A6478');
    fallback.addColorStop(1, '#202632');
    ctx.fillStyle = fallback;
    ctx.fillRect(avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize);
  }
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarSize / 2 + 5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

async function generateCard(userId, avatarSource, username, guildName, tier) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const tierData = getTierData(tier);

  drawCardBackground(ctx, tierData);
  drawCardFrame(ctx, tierData);
  await drawAvatarMedallion(ctx, tierData, avatarSource);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 24px "${DISPLAY_FONT}"`;
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 8;
  ctx.fillText(fitText(ctx, username, W - 56), W / 2, 232);
  ctx.shadowBlur = 0;

  ctx.fillStyle = hexToRgba(tierData.color, 0.25);
  ctx.fillRect(54, 274, W - 108, 1);

  ctx.fillStyle = 'rgba(240,232,215,0.76)';
  ctx.font = '16px "DejaVu Sans", sans-serif';
  const safeGuildName = sanitizeDisplayText(guildName).slice(0, 32) || 'Discord Server';
  ctx.fillText(fitText(ctx, safeGuildName, W - 64), W / 2, 286);

  ctx.fillStyle = hexToRgba(tierData.color, 0.9);
  ctx.font = 'bold 12px "DejaVu Sans", sans-serif';
  ctx.fillText(`SOULBOUND ID ${String(userId).slice(-6)}`, W / 2, 312);

  const coinX = W - 42;
  const coinY = 42;
  const coinRadius = 16;
  ctx.fillStyle = '#000000';
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(coinX, coinY, coinRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(coinX, coinY, coinRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 11px "DejaVu Sans", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${tierData.baseValue}`, coinX, coinY);

  const badgeY = H - 74;
  const badge = ctx.createLinearGradient(W / 2 - 95, badgeY, W / 2 + 95, badgeY + 40);
  badge.addColorStop(0, 'rgba(15,18,24,0.94)');
  badge.addColorStop(0.5, hexToRgba(tierData.color, 0.82));
  badge.addColorStop(1, 'rgba(15,18,24,0.94)');
  ctx.shadowColor = hexToRgba(tierData.color, 0.45);
  ctx.shadowBlur = 18;
  ctx.fillStyle = badge;
  roundRect(ctx, W / 2 - 96, badgeY, 192, 42, 21);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, W / 2 - 96, badgeY, 192, 42, 21);
  ctx.stroke();

  ctx.fillStyle = '#F8F1DE';
  ctx.font = `bold 14px "${DISPLAY_FONT}"`;
  ctx.textBaseline = 'middle';
  ctx.fillText(`${tierData.name} - T${tier}`, W / 2, badgeY + 21);

  return canvas.toBuffer('image/png');
}

async function generateCardCatalog(cards, guildName) {
  const scaledCardWidth = Math.round(W * CATALOG_CARD_SCALE);
  const scaledCardHeight = Math.round(H * CATALOG_CARD_SCALE);
  const rows = Math.ceil(cards.length / CATALOG_COLUMNS);
  const width = CATALOG_PADDING * 2 + (scaledCardWidth * CATALOG_COLUMNS) + (CATALOG_GAP * (CATALOG_COLUMNS - 1));
  const height = 120 + CATALOG_PADDING * 2 + (scaledCardHeight * rows) + (CATALOG_GAP * Math.max(0, rows - 1));

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#10141F');
  bg.addColorStop(1, '#1C2433');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `bold 36px "${DISPLAY_FONT}"`;
  ctx.fillText('Pack Opening', CATALOG_PADDING, 24);

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = '18px "DejaVu Sans", sans-serif';
  const safeGuildName = sanitizeDisplayText(guildName) || 'Discord Server';
  ctx.fillText(`${safeGuildName} - ${cards.length} cards`, CATALOG_PADDING, 68);

  for (let index = 0; index < cards.length; index++) {
    const row = Math.floor(index / CATALOG_COLUMNS);
    const col = index % CATALOG_COLUMNS;
    const x = CATALOG_PADDING + col * (scaledCardWidth + CATALOG_GAP);
    const y = 120 + CATALOG_PADDING + row * (scaledCardHeight + CATALOG_GAP);

    const image = await loadImage(cards[index].buffer);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 18;
    ctx.drawImage(image, x, y, scaledCardWidth, scaledCardHeight);
    ctx.restore();
  }

  return canvas.toBuffer('image/png');
}

module.exports = { generateCard, generateCardCatalog };
