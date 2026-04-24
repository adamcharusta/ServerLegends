const { createCanvas, loadImage } = require('canvas');
const { getTierData } = require('./rarity');

const W = 300;
const H = 420;

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

async function generateCard(userId, avatarURL, username, guildName, tier) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const t = getTierData(tier);

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, t.bgTop);
  bg.addColorStop(1, t.bgBottom);
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, W, H, 16);
  ctx.fill();

  ctx.shadowColor = t.color;
  ctx.shadowBlur = 20;
  ctx.strokeStyle = t.color;
  ctx.lineWidth = 3;
  roundRect(ctx, 2, 2, W - 4, H - 4, 14);
  ctx.stroke();
  ctx.shadowBlur = 0;

  const avatarSize = 150;
  const avatarX = W / 2;
  const avatarY = 125;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
  ctx.clip();
  try {
    const img = await loadImage(avatarURL);
    ctx.drawImage(img, avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize);
  } catch {
    ctx.fillStyle = '#555555';
    ctx.fill();
  }
  ctx.restore();

  ctx.shadowColor = t.color;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarSize / 2 + 4, 0, Math.PI * 2);
  ctx.strokeStyle = t.color;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 20px sans-serif';

  let displayName = username;
  const maxW = W - 40;
  while (ctx.measureText(displayName).width > maxW && displayName.length > 1) {
    displayName = displayName.slice(0, -1);
  }
  if (displayName !== username) displayName += '…';

  ctx.textBaseline = 'top';
  ctx.fillText(displayName, W / 2, avatarY + avatarSize / 2 + 16);

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '13px sans-serif';
  ctx.fillText(guildName.slice(0, 32), W / 2, avatarY + avatarSize / 2 + 44);

  const badgeY = H - 58;
  ctx.shadowColor = t.color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = t.color;
  roundRect(ctx, W / 2 - 82, badgeY, 164, 34, 17);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 13px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${t.name}  ·  T${tier}`, W / 2, badgeY + 17);

  return canvas.toBuffer('image/png');
}

module.exports = { generateCard };
