const {
  AVATAR_COLORS,
  BASE_STANDS,
  STALL_HEIGHT,
  STALL_WIDTH,
  STATIC_OBSTACLES,
  canOccupy,
  getMarketBirdPositions,
  getStandPosition,
  getWorldSize
} = require('../market-world');

const joinScreen = document.querySelector('#join-screen');
const gameScreen = document.querySelector('#game-screen');
const joinForm = document.querySelector('#join-form');
const joinButton = document.querySelector('#join-button');
const joinStatus = document.querySelector('#join-status');
const roleNote = document.querySelector('#role-note');
const sellerProductsField = document.querySelector('#seller-products-field');
const sellerProductsInput = document.querySelector('#seller-products');
const playerNameInput = document.querySelector('#player-name');
const avatarPreview = document.querySelector('#avatar-preview');
const avatarPreviewContext = avatarPreview.getContext('2d');
const colorButtons = Array.from(document.querySelectorAll('.color-swatch'));
const worldCanvas = document.querySelector('#world-canvas');
const worldContext = worldCanvas.getContext('2d');
const connectionStatus = document.querySelector('#connection-status');
const onlineCount = document.querySelector('#online-count');
const standCountLabel = document.querySelector('#stand-count');
const chatForm = document.querySelector('#chat-form');
const chatInput = document.querySelector('#chat-input');
const sendButton = chatForm.querySelector('button[type="submit"]');
const chatHistory = document.querySelector('#chat-history');
const gameStatus = document.querySelector('#game-status');
const leaveButton = document.querySelector('#leave-market');

let selectedColor = AVATAR_COLORS[0];
let socket = null;
let localPlayerId = null;
let playersById = new Map();
let standCount = BASE_STANDS.length;
let gameActive = false;
let chatPending = false;
let lastFrameTime = 0;
let lastMovementSentAt = 0;
let lastSentX = 0;
let lastSentY = 0;
let pixelRatio = 1;
let elapsedMarketTime = 0;
const movementKeys = new Set();
const chatMessages = new Map();

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle('error', isError);
}

function getSelectedValue(name) {
  return joinForm.querySelector(`input[name="${name}"]:checked`).value;
}

function getSelectedProfile() {
  return {
    name: playerNameInput.value.trim(),
    role: getSelectedValue('role'),
    avatar: getSelectedValue('avatar'),
    color: selectedColor,
    products: sellerProductsInput.value.trim()
  };
}

function drawRoundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function drawCrayonOutline(context, drawPath, color = '#5c5140', width = 2) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  drawPath();
  context.stroke();
  context.globalAlpha = 0.48;
  context.lineWidth = Math.max(1, width * 0.55);
  context.translate(1.2, -0.8);
  drawPath();
  context.stroke();
  context.restore();
}

function drawAvatar(context, player, x, y, scale = 1) {
  const moving = Boolean(player.isMoving);
  const walkPhase = player.walkPhase || 0;
  const step = moving ? Math.sin(walkPhase) * 3.2 : 0;
  const lift = moving ? Math.max(0, Math.cos(walkPhase)) * 1.5 : 0;
  const skin = '#f6c99f';
  const ink = '#49304b';

  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  context.translate(0, -lift);

  context.fillStyle = 'rgba(63, 63, 43, 0.18)';
  context.beginPath();
  context.ellipse(0, 22 + lift, 17, 5, 0, 0, Math.PI * 2);
  context.fill();

  for (const side of [-1, 1]) {
    const swing = side * step;
    const legX = side * 6 + swing;
    const legY = 18 - lift * (side === (step > 0 ? 1 : -1) ? 1 : 0);
    context.fillStyle = player.avatar === 'girl' ? '#f1eadb' : '#557c91';
    drawRoundedRect(context, legX - 3.5, 5, 7, legY - 5, 3);
    context.fill();
    drawCrayonOutline(context, () => {
      drawRoundedRect(context, legX - 3.5, 5, 7, legY - 5, 3);
    }, ink, 1.8);
    context.fillStyle = player.avatar === 'girl' ? '#5c9b82' : '#654355';
    drawRoundedRect(context, legX - 5, legY - 1, 11, 5, 2.5);
    context.fill();
    drawCrayonOutline(context, () => {
      drawRoundedRect(context, legX - 5, legY - 1, 11, 5, 2.5);
    }, ink, 1.8);
  }

  drawCrayonOutline(context, () => {
    context.beginPath();
    context.moveTo(-10, -11);
    context.lineTo(-15, 2 + step * 0.25);
    context.moveTo(10, -11);
    context.lineTo(15, 2 - step * 0.25);
  }, ink, 5);
  context.strokeStyle = skin;
  context.lineWidth = 3.2;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(-10, -11);
  context.lineTo(-15, 2 + step * 0.25);
  context.moveTo(10, -11);
  context.lineTo(15, 2 - step * 0.25);
  context.stroke();

  if (player.avatar === 'girl') {
    context.fillStyle = player.color;
    drawRoundedRect(context, -12, -16, 24, 27, 7);
    context.fill();
    drawCrayonOutline(context, () => drawRoundedRect(context, -12, -16, 24, 27, 7), ink, 2.5);
    context.fillStyle = '#fff1d2';
    drawRoundedRect(context, -5, -14, 10, 5, 2);
    context.fill();
    context.strokeStyle = '#fff1d2';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(0, -7);
    context.lineTo(0, 5);
    context.stroke();
    context.fillStyle = '#8d5b79';
    context.beginPath();
    context.moveTo(-9, 5);
    context.lineTo(9, 5);
    context.lineTo(8, 11);
    context.lineTo(-8, 11);
    context.closePath();
    context.fill();
    drawCrayonOutline(context, () => {
      context.beginPath();
      context.moveTo(-9, 5);
      context.lineTo(9, 5);
      context.lineTo(8, 11);
      context.lineTo(-8, 11);
      context.closePath();
    }, ink, 1.8);
    context.fillStyle = '#f7d888';
    context.beginPath();
    context.arc(5, -5, 1.5, 0, Math.PI * 2);
    context.fill();
  } else {
    context.fillStyle = player.color;
    drawRoundedRect(context, -12, -17, 24, 27, 7);
    context.fill();
    drawCrayonOutline(context, () => drawRoundedRect(context, -12, -17, 24, 27, 7), ink, 2.5);
    context.fillStyle = '#527e9e';
    context.beginPath();
    context.moveTo(-10, 4);
    context.lineTo(10, 4);
    context.lineTo(9, 10);
    context.lineTo(-9, 10);
    context.closePath();
    context.fill();
    drawCrayonOutline(context, () => {
      context.beginPath();
      context.moveTo(-10, 4);
      context.lineTo(10, 4);
      context.lineTo(9, 10);
      context.lineTo(-9, 10);
      context.closePath();
    }, ink, 2);
    context.strokeStyle = '#fff1d2';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-8, -9);
    context.lineTo(8, -9);
    context.moveTo(-8, -4);
    context.lineTo(8, -4);
    context.stroke();
    context.fillStyle = '#f7d888';
    context.beginPath();
    context.arc(0, 1, 2, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = skin;
  context.beginPath();
  context.arc(-13, -29, 3.2, 0, Math.PI * 2);
  context.arc(13, -29, 3.2, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#fff3de';
  context.beginPath();
  context.ellipse(0, -29, 13, 15, 0, 0, Math.PI * 2);
  context.fill();
  drawCrayonOutline(context, () => {
    context.beginPath();
    context.ellipse(0, -29, 13, 15, 0, 0, Math.PI * 2);
  }, ink, 2.5);
  context.fillStyle = skin;
  context.beginPath();
  context.ellipse(0, -26, 10.5, 12, 0, 0, Math.PI * 2);
  context.fill();

  if (player.avatar === 'girl') {
    context.fillStyle = '#603a55';
    context.beginPath();
    context.moveTo(-14, -29);
    context.quadraticCurveTo(-19, -43, -9, -48);
    context.quadraticCurveTo(2, -54, 11, -45);
    context.quadraticCurveTo(17, -39, 13, -27);
    context.lineTo(8, -34);
    context.quadraticCurveTo(1, -30, -5, -34);
    context.lineTo(-11, -27);
    context.closePath();
    context.fill();
    drawCrayonOutline(context, () => {
      context.beginPath();
      context.moveTo(-14, -29);
      context.quadraticCurveTo(-19, -43, -9, -48);
      context.quadraticCurveTo(2, -54, 11, -45);
      context.quadraticCurveTo(17, -39, 13, -27);
      context.lineTo(8, -34);
      context.quadraticCurveTo(1, -30, -5, -34);
      context.lineTo(-11, -27);
      context.closePath();
    }, ink, 2);
    context.fillStyle = '#e5b64e';
    context.beginPath();
    context.arc(10, -41, 3.2, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#fff1d2';
    context.beginPath();
    context.arc(10, -41, 1.2, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#a86f62';
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(-9, -38);
    context.quadraticCurveTo(-4, -43, 0, -43);
    context.stroke();
  } else {
    context.fillStyle = '#674451';
    context.beginPath();
    context.arc(-9, -40, 6, Math.PI, Math.PI * 2);
    context.arc(-2, -44, 7, Math.PI, Math.PI * 2);
    context.arc(6, -43, 7, Math.PI, Math.PI * 2);
    context.arc(12, -38, 6, Math.PI * 1.1, Math.PI * 2);
    context.lineTo(11, -34);
    context.quadraticCurveTo(4, -38, -2, -34);
    context.lineTo(-9, -33);
    context.closePath();
    context.fill();
    drawCrayonOutline(context, () => {
      context.beginPath();
      context.moveTo(-13, -37);
      context.quadraticCurveTo(-12, -47, -3, -48);
      context.quadraticCurveTo(4, -51, 10, -44);
      context.quadraticCurveTo(16, -41, 13, -34);
      context.quadraticCurveTo(4, -39, -2, -34);
      context.closePath();
    }, ink, 2.5);
    context.strokeStyle = '#a86f62';
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(-8, -41);
    context.lineTo(-5, -43);
    context.moveTo(0, -44);
    context.lineTo(3, -46);
    context.stroke();
  }

  const eyeShift = player.facing === 'left' ? -0.8 : player.facing === 'right' ? 0.8 : 0;
  context.fillStyle = '#fffdf8';
  context.beginPath();
  context.ellipse(-4.5 + eyeShift, -27, 2.5, 3.3, 0, 0, Math.PI * 2);
  context.ellipse(4.5 + eyeShift, -27, 2.5, 3.3, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = ink;
  context.beginPath();
  context.arc(-4.5 + eyeShift, -27, 1.6, 0, Math.PI * 2);
  context.arc(4.5 + eyeShift, -27, 1.6, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#fff';
  context.beginPath();
  context.arc(-5, -28, 0.65, 0, Math.PI * 2);
  context.arc(4, -28, 0.65, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#d98c79';
  context.beginPath();
  context.arc(-8, -22, 1.8, 0, Math.PI * 2);
  context.arc(8, -22, 1.8, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = ink;
  context.lineWidth = 1.5;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(-3.2, -20);
  context.quadraticCurveTo(0, -16.3, 3.2, -20);
  context.stroke();

  context.restore();
}

function drawAvatarPreview() {
  avatarPreviewContext.clearRect(0, 0, avatarPreview.width, avatarPreview.height);
  const profile = getSelectedProfile();
  drawAvatar(avatarPreviewContext, profile, avatarPreview.width / 2, 100, 1.8);
}

function updateRoleUI() {
  const role = getSelectedValue('role');
  sellerProductsField.hidden = role !== 'seller';
  roleNote.textContent = role === 'seller'
    ? 'Your own market stand will be reserved while you are online.'
    : 'Explore every path, meet sellers, and leave a message.';
}

function updateColorSelection(selectedButton) {
  for (const button of colorButtons) {
    const selected = button === selectedButton;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  selectedColor = selectedButton.dataset.color;
  drawAvatarPreview();
}

function drawGround(context, width, height) {
  context.fillStyle = '#e9d8ae';
  context.fillRect(0, 0, width, height);

  context.fillStyle = '#d7e0b7';
  context.beginPath();
  context.ellipse(230, 330, 200, 86, -0.2, 0, Math.PI * 2);
  context.ellipse(1450, 330, 160, 76, 0.18, 0, Math.PI * 2);
  context.ellipse(300, 815, 230, 76, 0.14, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = '#d6c295';
  context.lineWidth = 100;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(30, 520);
  context.bezierCurveTo(340, 480, 500, 575, 800, 520);
  context.bezierCurveTo(1070, 470, 1270, 560, width - 25, 505);
  context.stroke();
  context.beginPath();
  context.moveTo(815, 480);
  context.bezierCurveTo(790, 340, 820, 250, 845, 45);
  context.stroke();

  context.strokeStyle = 'rgba(109, 119, 78, 0.32)';
  context.lineWidth = 3;
  context.setLineDash([9, 12]);
  context.strokeRect(22, 22, width - 44, height - 44);
  context.setLineDash([]);

  context.fillStyle = 'rgba(131, 135, 89, 0.25)';
  for (let x = 70; x < width; x += 125) {
    for (let y = 70; y < height; y += 137) {
      context.beginPath();
      context.ellipse(x + ((y / 137) % 2) * 22, y, 2, 4, 0.6, 0, Math.PI * 2);
      context.fill();
    }
  }
}

function drawFruitBasket(context, x, y, color, size = 8) {
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, size, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#745a3e';
  context.lineWidth = 1.5;
  context.stroke();
  context.strokeStyle = '#567548';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x, y - size);
  context.lineTo(x + 2, y - size - 4);
  context.stroke();
}

function drawStall(context, index, seller) {
  const position = getStandPosition(index);
  const { x, y } = position;

  context.fillStyle = 'rgba(75, 64, 43, 0.16)';
  context.fillRect(x + 8, y + 108, STALL_WIDTH, 12);
  context.fillStyle = '#9b6244';
  context.fillRect(x + 12, y + 80, 10, 40);
  context.fillRect(x + STALL_WIDTH - 22, y + 80, 10, 40);
  context.fillStyle = '#c78a58';
  context.fillRect(x, y + 43, STALL_WIDTH, 18);

  const awningColor = seller ? seller.color : '#d8a85f';
  for (let stripe = 0; stripe < 6; stripe += 1) {
    context.fillStyle = stripe % 2 === 0 ? awningColor : '#fff3d4';
    context.beginPath();
    context.moveTo(x + stripe * 30, y + 8);
    context.lineTo(x + stripe * 30 + 30, y + 8);
    context.lineTo(x + stripe * 30 + 24, y + 46);
    context.lineTo(x + stripe * 30 + 6, y + 46);
    context.closePath();
    context.fill();
  }
  drawCrayonOutline(context, () => {
    context.beginPath();
    context.moveTo(x, y + 8);
    context.lineTo(x + STALL_WIDTH, y + 8);
    context.lineTo(x + STALL_WIDTH - 6, y + 47);
    context.lineTo(x + 6, y + 47);
    context.closePath();
  }, '#665640', 2);

  context.fillStyle = '#fff8e4';
  drawRoundedRect(context, x + 24, y + 16, STALL_WIDTH - 48, 25, 7);
  context.fill();
  context.fillStyle = '#4f5742';
  context.textAlign = 'center';
  context.font = 'bold 12px "Trebuchet MS", sans-serif';
  context.fillText(seller ? seller.name : 'OPEN STAND', x + STALL_WIDTH / 2, y + 33, STALL_WIDTH - 55);

  if (seller) {
    context.fillStyle = '#fff9e8';
    drawRoundedRect(context, x + 14, y + 65, STALL_WIDTH - 28, 29, 6);
    context.fill();
    context.fillStyle = '#625f4e';
    context.font = '10px "Trebuchet MS", sans-serif';
    context.fillText(seller.products || 'Fresh produce', x + STALL_WIDTH / 2, y + 83, STALL_WIDTH - 36);
  } else {
    drawFruitBasket(context, x + 49, y + 70, '#d75d4d');
    drawFruitBasket(context, x + 74, y + 70, '#e5be47');
    drawFruitBasket(context, x + 99, y + 70, '#71a75d');
    drawFruitBasket(context, x + 124, y + 70, '#ba6f9c');
  }
}

function drawCart(context) {
  const obstacle = STATIC_OBSTACLES[0];
  context.fillStyle = '#b87443';
  drawRoundedRect(context, obstacle.x + 8, obstacle.y + 24, 134, 54, 8);
  context.fill();
  context.strokeStyle = '#654c36';
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = '#5a5042';
  context.beginPath();
  context.arc(obstacle.x + 35, obstacle.y + 83, 10, 0, Math.PI * 2);
  context.arc(obstacle.x + 118, obstacle.y + 83, 10, 0, Math.PI * 2);
  context.fill();
  drawFruitBasket(context, obstacle.x + 35, obstacle.y + 20, '#d75d4d', 10);
  drawFruitBasket(context, obstacle.x + 66, obstacle.y + 18, '#e5be47', 10);
  drawFruitBasket(context, obstacle.x + 97, obstacle.y + 20, '#71a75d', 10);
  drawFruitBasket(context, obstacle.x + 124, obstacle.y + 18, '#ba6f9c', 10);
}

function drawHen(
  context,
  x,
  y,
  scale = 1,
  chick = false,
  rooster = false,
  walkPhase = 0,
  facing = 'right',
  moving = false
) {
  const step = moving ? Math.sin(walkPhase) * 2.2 : 0;

  context.save();
  context.translate(x, y);
  if (facing === 'left') {
    context.scale(-1, 1);
  }
  context.scale(scale, scale);
  context.fillStyle = 'rgba(63, 63, 43, 0.14)';
  context.beginPath();
  context.ellipse(0, 10, chick ? 9 : 18, 3, 0, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = '#bd7045';
  context.lineWidth = chick ? 1.7 : 2.2;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(-5 - step, 5);
  context.lineTo(-5 - step, 10);
  context.lineTo(-8 - step, 11);
  context.moveTo(6 + step, 5);
  context.lineTo(6 + step, 10);
  context.lineTo(9 + step, 11);
  context.stroke();

  context.fillStyle = chick ? '#f2d877' : '#f4eee0';
  context.beginPath();
  context.ellipse(0, 0, chick ? 9 : 18, chick ? 7 : 12, -0.1, 0, Math.PI * 2);
  context.fill();
  drawCrayonOutline(context, () => {
    context.beginPath();
    context.ellipse(0, 0, chick ? 9 : 18, chick ? 7 : 12, -0.1, 0, Math.PI * 2);
  }, '#493b48', 1.8);

  context.fillStyle = rooster ? '#b54e4a' : '#f0d7aa';
  context.beginPath();
  context.ellipse(-11, -1, 6, 3.5, -0.5, 0, Math.PI * 2);
  context.ellipse(-14, 3, 6, 3, -0.2, 0, Math.PI * 2);
  context.fill();
  if (rooster) {
    context.fillStyle = '#b54e4a';
    context.beginPath();
    context.moveTo(-14, -3);
    context.quadraticCurveTo(-24, -12, -20, -1);
    context.quadraticCurveTo(-29, -7, -24, 3);
    context.quadraticCurveTo(-19, 7, -14, 5);
    context.closePath();
    context.fill();
    drawCrayonOutline(context, () => {
      context.beginPath();
      context.moveTo(-14, -3);
      context.quadraticCurveTo(-24, -12, -20, -1);
      context.quadraticCurveTo(-29, -7, -24, 3);
      context.quadraticCurveTo(-19, 7, -14, 5);
      context.closePath();
    }, '#493b48', 1.5);
  }

  context.fillStyle = chick ? '#f2d877' : '#f4eee0';
  context.beginPath();
  context.arc(chick ? 5 : 10, -5, chick ? 5 : 7, 0, Math.PI * 2);
  context.fill();
  drawCrayonOutline(context, () => {
    context.beginPath();
    context.arc(chick ? 5 : 10, -5, chick ? 5 : 7, 0, Math.PI * 2);
  }, '#493b48', 1.5);

  if (rooster) {
    context.fillStyle = '#bd4f4a';
    context.beginPath();
    context.arc(7, -13, 3, Math.PI, Math.PI * 2);
    context.arc(11, -14, 3, Math.PI, Math.PI * 2);
    context.arc(15, -12, 2.5, Math.PI, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = '#db7150';
  context.beginPath();
  context.moveTo(chick ? 7 : 14, -1);
  context.lineTo(chick ? 13 : 24, 2);
  context.lineTo(chick ? 7 : 14, 5);
  context.closePath();
  context.fill();
  context.fillStyle = '#493b48';
  context.beginPath();
  context.arc(chick ? 6 : 12, -6, 1.4, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawMarketBird(context, bird) {
  drawHen(
    context,
    bird.x,
    bird.y,
    bird.type === 'chick' ? 0.78 : 1,
    bird.type === 'chick',
    bird.type === 'rooster',
    bird.walkPhase,
    bird.facing,
    true
  );
}

function drawHenPen(context) {
  const pen = STATIC_OBSTACLES[1];
  context.fillStyle = '#e0c58f';
  drawRoundedRect(context, pen.x, pen.y, pen.width, pen.height, 18);
  context.fill();
  context.fillStyle = '#c99860';
  drawRoundedRect(context, pen.x + 97, pen.y + 34, 114, 94, 10);
  context.fill();
  context.fillStyle = '#9f6147';
  context.beginPath();
  context.moveTo(pen.x + 82, pen.y + 42);
  context.lineTo(pen.x + 154, pen.y + 2);
  context.lineTo(pen.x + 225, pen.y + 42);
  context.closePath();
  context.fill();

  context.strokeStyle = '#755d3b';
  context.lineWidth = 4;
  context.strokeRect(pen.x + 9, pen.y + 10, pen.width - 18, pen.height - 20);
  for (let x = pen.x + 20; x < pen.x + pen.width; x += 23) {
    context.beginPath();
    context.moveTo(x, pen.y + 13);
    context.lineTo(x, pen.y + pen.height - 13);
    context.stroke();
  }
  for (let y = pen.y + 22; y < pen.y + pen.height; y += 24) {
    context.beginPath();
    context.moveTo(pen.x + 10, y);
    context.lineTo(pen.x + pen.width - 10, y);
    context.stroke();
  }

  drawHen(context, pen.x + 58, pen.y + 126, 0.88);
  drawHen(context, pen.x + 167, pen.y + 145, 0.55, true);
  drawHen(context, pen.x + 205, pen.y + 116, 0.48, true);
}

function drawCrates(context) {
  const obstacle = STATIC_OBSTACLES[2];
  for (let row = 0; row < 2; row += 1) {
    context.fillStyle = row === 0 ? '#b97947' : '#a66c42';
    drawRoundedRect(context, obstacle.x + 8 + row * 20, obstacle.y + 10 + row * 55, 82, 45, 5);
    context.fill();
    context.strokeStyle = '#704f35';
    context.lineWidth = 2;
    context.stroke();
    context.beginPath();
    context.moveTo(obstacle.x + 17 + row * 20, obstacle.y + 31 + row * 55);
    context.lineTo(obstacle.x + 81 + row * 20, obstacle.y + 31 + row * 55);
    context.stroke();
  }
  drawFruitBasket(context, obstacle.x + 32, obstacle.y + 5, '#d75d4d', 10);
  drawFruitBasket(context, obstacle.x + 70, obstacle.y + 4, '#e5be47', 10);
}

function getChatLines(context, text, maxWidth, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  let truncated = false;

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) {
        truncated = true;
        break;
      }
    } else {
      line = candidate;
    }
  }

  if (!truncated && line) {
    lines.push(line);
  }
  if (lines.length > maxLines) {
    lines.length = maxLines;
    truncated = true;
  }
  if (truncated && lines.length) {
    let lastLine = lines[lines.length - 1];
    while (lastLine && context.measureText(`${lastLine}…`).width > maxWidth) {
      lastLine = lastLine.slice(0, -1);
    }
    lines[lines.length - 1] = `${lastLine}…`;
  }
  return lines;
}

function drawMessageBubble(context, player, x, y) {
  if (!player.lastMessage) {
    return;
  }

  const maxWidth = 224;
  context.save();
  context.font = '12px "Trebuchet MS", sans-serif';
  context.textAlign = 'left';
  const lines = getChatLines(context, player.lastMessage, maxWidth, 4);
  const width = Math.min(
    maxWidth + 18,
    Math.max(76, ...lines.map((line) => context.measureText(line).width + 18))
  );
  const height = lines.length * 17 + 14;
  const bubbleX = x - width / 2;
  const bubbleY = y - 59 - height;

  context.fillStyle = '#fffdf5';
  context.strokeStyle = player.color;
  context.lineWidth = 2;
  drawRoundedRect(context, bubbleX, bubbleY, width, height, 10);
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(x - 5, bubbleY + height - 1);
  context.lineTo(x, bubbleY + height + 8);
  context.lineTo(x + 5, bubbleY + height - 1);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = '#3d4438';
  lines.forEach((line, index) => {
    context.fillText(line, bubbleX + 9, bubbleY + 17 + index * 17);
  });
  context.restore();
}

function drawPlayer(context, player) {
  drawMessageBubble(context, player, player.x, player.y);
  drawAvatar(context, player, player.x, player.y);

  context.save();
  context.font = 'bold 11px "Trebuchet MS", sans-serif';
  context.textAlign = 'center';
  const label = player.role === 'seller' ? `${player.name} · seller` : player.name;
  const width = Math.min(150, context.measureText(label).width + 16);
  context.fillStyle = 'rgba(255, 252, 243, 0.92)';
  drawRoundedRect(context, player.x - width / 2, player.y + 27, width, 19, 8);
  context.fill();
  context.strokeStyle = player.color;
  context.lineWidth = 1.5;
  context.stroke();
  context.fillStyle = '#4d5543';
  context.fillText(label, player.x, player.y + 40, width - 8);
  context.restore();
}

function drawWorld() {
  if (!gameActive || !worldCanvas.clientWidth || !worldCanvas.clientHeight) {
    return;
  }

  const width = worldCanvas.clientWidth;
  const height = worldCanvas.clientHeight;
  const localPlayer = playersById.get(localPlayerId);
  if (!localPlayer) {
    return;
  }

  const world = getWorldSize(standCount);
  const cameraX = Math.max(0, Math.min(world.width - width, localPlayer.x - width / 2));
  const cameraY = Math.max(0, Math.min(world.height - height, localPlayer.y - height / 2));

  worldContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  worldContext.clearRect(0, 0, width, height);
  worldContext.save();
  worldContext.translate(-cameraX, -cameraY);

  drawGround(worldContext, world.width, world.height);
  drawCart(worldContext);
  drawHenPen(worldContext);
  drawCrates(worldContext);

  const sellersByStand = new Map();
  for (const player of playersById.values()) {
    if (player.role === 'seller') {
      sellersByStand.set(player.standIndex, player);
    }
  }
  for (let index = 0; index < standCount; index += 1) {
    drawStall(worldContext, index, sellersByStand.get(index));
  }

  const actors = getMarketBirdPositions(elapsedMarketTime)
    .map((bird) => ({ ...bird, kind: 'bird' }))
    .concat(Array.from(playersById.values()).map((player) => ({ ...player, kind: 'player' })))
    .sort((a, b) => a.y - b.y);
  for (const actor of actors) {
    if (actor.kind === 'bird') {
      drawMarketBird(worldContext, actor);
    } else {
      drawPlayer(worldContext, actor);
    }
  }

  worldContext.restore();
}

function updateCounts() {
  onlineCount.textContent = `${playersById.size} ${playersById.size === 1 ? 'person' : 'people'} here`;
  standCountLabel.textContent = `${standCount} ${standCount === 1 ? 'stand' : 'stands'}`;
}

function makeRuntimePlayer(player) {
  return {
    ...player,
    targetX: player.x,
    targetY: player.y,
    isMoving: false,
    walkPhase: 0
  };
}

function addChatMessage(message, color) {
  if (!message || typeof message.text !== 'string') {
    return;
  }

  const messageKey = String(message.id || `${message.created_at}-${message.author}-${message.text}`);
  if (chatMessages.has(messageKey)) {
    return;
  }

  chatMessages.set(messageKey, { ...message, color: color || colorForName(message.author) });
  while (chatMessages.size > 40) {
    chatMessages.delete(chatMessages.keys().next().value);
  }

  const orderedMessages = Array.from(chatMessages.values())
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  chatHistory.replaceChildren(...orderedMessages.map((entry) => {
    const item = document.createElement('li');
    item.className = 'chat-entry';
    item.style.setProperty('--player-color', entry.color);

    const heading = document.createElement('div');
    heading.className = 'chat-entry-heading';

    const author = document.createElement('span');
    author.textContent = entry.author;

    const time = document.createElement('time');
    time.dateTime = entry.created_at;
    time.textContent = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(entry.created_at));

    const text = document.createElement('p');
    text.textContent = entry.text;
    heading.append(author, time);
    item.append(heading, text);
    return item;
  }));
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function colorForName(name) {
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

async function loadChatHistory() {
  try {
    const response = await fetch('/api/messages');
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || 'The server could not load market messages.');
    }

    const messages = await response.json();
    for (const message of messages.slice(0, 30).reverse()) {
      addChatMessage(message);
    }
  } catch (error) {
    setStatus(gameStatus, `Could not load chat history: ${error.message}`, true);
    console.error(error);
  }
}

function setConnectionStatus(message, state) {
  connectionStatus.textContent = message;
  connectionStatus.classList.toggle('connected', state === 'connected');
  connectionStatus.classList.toggle('disconnected', state === 'disconnected');
}

function showGame() {
  gameActive = true;
  elapsedMarketTime = 0;
  joinScreen.hidden = true;
  gameScreen.hidden = false;
  setConnectionStatus('Connected', 'connected');
  setStatus(gameStatus, 'You are in the market.');
  updateCounts();
  window.requestAnimationFrame(resizeCanvas);
  window.requestAnimationFrame((time) => {
    lastFrameTime = time;
    window.requestAnimationFrame(gameFrame);
  });
  loadChatHistory();
  window.setTimeout(() => worldCanvas.focus(), 0);
}

function handleSocketMessage(data) {
  switch (data.type) {
    case 'welcome':
      localPlayerId = data.player.id;
      standCount = data.standCount;
      playersById = new Map(data.players.map((player) => [player.id, makeRuntimePlayer(player)]));
      lastSentX = data.player.x;
      lastSentY = data.player.y;
      showGame();
      break;

    case 'player_join':
      standCount = Math.max(standCount, data.standCount);
      playersById.set(data.player.id, makeRuntimePlayer(data.player));
      updateCounts();
      setStatus(gameStatus, `${data.player.name} joined the market.`);
      break;

    case 'player_leave':
      playersById.delete(data.playerId);
      updateCounts();
      break;

    case 'market_state':
      standCount = Math.max(standCount, data.standCount);
      updateCounts();
      break;

    case 'move': {
      const player = playersById.get(data.playerId);
      if (player && data.playerId !== localPlayerId) {
        player.targetX = data.x;
        player.targetY = data.y;
        player.facing = data.facing;
      }
      break;
    }

    case 'position': {
      const player = playersById.get(localPlayerId);
      if (player) {
        player.x = data.x;
        player.y = data.y;
        player.targetX = data.x;
        player.targetY = data.y;
      }
      break;
    }

    case 'chat': {
      const player = playersById.get(data.playerId);
      if (player) {
        player.lastMessage = data.message.text;
      }
      addChatMessage(data.message, player && player.color);
      break;
    }

    case 'message_sent': {
      const player = playersById.get(data.playerId);
      if (player) {
        player.lastMessage = data.message.text;
      }
      addChatMessage(data.message, player && player.color);
      chatPending = false;
      chatInput.value = '';
      sendButton.disabled = false;
      setStatus(gameStatus, 'Message sent.');
      break;
    }

    case 'error':
      if (chatPending) {
        chatPending = false;
        sendButton.disabled = false;
      }
      if (!gameActive) {
        setStatus(joinStatus, data.message || 'The market could not process that action.', true);
        joinButton.disabled = false;
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
        break;
      }
      setStatus(gameStatus, data.message || 'The market could not process that action.', true);
      break;

    default:
      console.warn('Unknown market update:', data.type);
  }
}

function connectToMarket(profile) {
  setStatus(joinStatus, 'Connecting to the market…');
  joinButton.disabled = true;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type: 'join', ...profile }));
  });

  socket.addEventListener('message', (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (error) {
      console.error('The market sent invalid data:', error);
      setStatus(gameStatus, 'Received an invalid update from the market.', true);
      return;
    }
    handleSocketMessage(data);
  });

  socket.addEventListener('error', () => {
    if (!gameActive) {
      setStatus(joinStatus, 'Could not connect. Check that the market server is running.', true);
      joinButton.disabled = false;
    }
  });

  socket.addEventListener('close', () => {
    movementKeys.clear();
    if (gameActive) {
      setConnectionStatus('Disconnected', 'disconnected');
      setStatus(gameStatus, 'Connection lost. Rejoin to return to the market.', true);
      sendButton.disabled = true;
    } else {
      joinButton.disabled = false;
    }
  });
}

function sendMovement(now) {
  const player = playersById.get(localPlayerId);
  if (
    !player
    || !socket
    || socket.readyState !== WebSocket.OPEN
    || now - lastMovementSentAt < 80
    || (Math.abs(player.x - lastSentX) < 1 && Math.abs(player.y - lastSentY) < 1)
  ) {
    return;
  }

  socket.send(JSON.stringify({
    type: 'move',
    x: player.x,
    y: player.y,
    facing: player.facing
  }));
  lastMovementSentAt = now;
  lastSentX = player.x;
  lastSentY = player.y;
}

function gameFrame(time) {
  if (!gameActive) {
    return;
  }

  const delta = Math.min((time - lastFrameTime) / 1000, 0.05);
  lastFrameTime = time;
  elapsedMarketTime += delta;
  const player = playersById.get(localPlayerId);

  if (player) {
    player.isMoving = false;
    let horizontal = 0;
    let vertical = 0;
    if (movementKeys.has('left')) horizontal -= 1;
    if (movementKeys.has('right')) horizontal += 1;
    if (movementKeys.has('up')) vertical -= 1;
    if (movementKeys.has('down')) vertical += 1;

    if (horizontal || vertical) {
      const magnitude = Math.hypot(horizontal, vertical) || 1;
      const movement = 190 * delta / magnitude;
      const previousX = player.x;
      const previousY = player.y;
      const nextX = player.x + horizontal * movement;
      const nextY = player.y + vertical * movement;
      if (horizontal < 0) player.facing = 'left';
      if (horizontal > 0) player.facing = 'right';
      if (!horizontal && vertical < 0) player.facing = 'up';
      if (!horizontal && vertical > 0) player.facing = 'down';

      if (horizontal && canOccupy(nextX, player.y, standCount)) {
        player.x = nextX;
      }
      if (vertical && canOccupy(player.x, nextY, standCount)) {
        player.y = nextY;
      }
      player.isMoving = Math.hypot(player.x - previousX, player.y - previousY) > 0.1;
      if (player.isMoving) {
        player.walkPhase += delta * 14;
      }
      sendMovement(time);
    }
  }

  for (const player of playersById.values()) {
    if (player.id !== localPlayerId) {
      const blend = Math.min(1, delta * 12);
      const previousX = player.x;
      const previousY = player.y;
      player.x += (player.targetX - player.x) * blend;
      player.y += (player.targetY - player.y) * blend;
      player.isMoving = Math.hypot(player.x - previousX, player.y - previousY) > 0.1;
      if (player.isMoving) {
        player.walkPhase += delta * 14;
      }
    }
  }

  drawWorld();
  window.requestAnimationFrame(gameFrame);
}

function resizeCanvas() {
  const rect = worldCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }

  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  worldCanvas.width = Math.round(rect.width * pixelRatio);
  worldCanvas.height = Math.round(rect.height * pixelRatio);
  drawWorld();
}

function handleMovementKey(event, isDown) {
  if (!gameActive || document.activeElement === chatInput) {
    return;
  }

  const key = event.key.toLowerCase();
  const directions = {
    arrowup: 'up',
    w: 'up',
    arrowdown: 'down',
    s: 'down',
    arrowleft: 'left',
    a: 'left',
    arrowright: 'right',
    d: 'right'
  };
  const direction = directions[key];
  if (!direction) {
    return;
  }

  event.preventDefault();
  if (isDown) {
    movementKeys.add(direction);
  } else {
    movementKeys.delete(direction);
  }
}

function addTouchControls() {
  for (const button of document.querySelectorAll('[data-direction]')) {
    const direction = button.dataset.direction;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      movementKeys.add(direction);
      button.setPointerCapture(event.pointerId);
    });
    const stopMoving = () => movementKeys.delete(direction);
    button.addEventListener('pointerup', stopMoving);
    button.addEventListener('pointercancel', stopMoving);
    button.addEventListener('lostpointercapture', stopMoving);
  }
}

joinForm.addEventListener('change', (event) => {
  if (event.target.name === 'role') {
    updateRoleUI();
  }
  if (event.target.name === 'avatar') {
    drawAvatarPreview();
  }
});

for (const button of colorButtons) {
  button.addEventListener('click', () => updateColorSelection(button));
}

joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const profile = getSelectedProfile();
  if (!profile.name) {
    setStatus(joinStatus, 'Enter a name to join.', true);
    return;
  }
  if (profile.role === 'seller' && !profile.products) {
    profile.products = 'Fresh produce';
  }
  connectToMarket(profile);
});

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !socket || socket.readyState !== WebSocket.OPEN || chatPending) {
    return;
  }

  chatPending = true;
  sendButton.disabled = true;
  setStatus(gameStatus, 'Sending…');
  socket.send(JSON.stringify({ type: 'chat', text }));
});

leaveButton.addEventListener('click', () => {
  gameActive = false;
  movementKeys.clear();
  if (socket) {
    socket.close();
    socket = null;
  }
  playersById.clear();
  localPlayerId = null;
  chatPending = false;
  sendButton.disabled = false;
  joinButton.disabled = false;
  chatForm.reset();
  setStatus(joinStatus, '');
  gameScreen.hidden = true;
  joinScreen.hidden = false;
});

window.addEventListener('keydown', (event) => handleMovementKey(event, true));
window.addEventListener('keyup', (event) => handleMovementKey(event, false));
window.addEventListener('blur', () => movementKeys.clear());
window.addEventListener('resize', resizeCanvas);
window.addEventListener('beforeunload', () => {
  if (socket) {
    socket.close();
  }
});

drawAvatarPreview();
updateRoleUI();
addTouchControls();
