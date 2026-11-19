const WORLD_WIDTH = 1680;
const BASE_WORLD_HEIGHT = 1000;
const PLAYER_RADIUS = 16;
const STALL_WIDTH = 180;
const STALL_HEIGHT = 120;
const OVERFLOW_STANDS_PER_ROW = 4;
const OVERFLOW_STAND_START_Y = 860;
const OVERFLOW_STAND_ROW_GAP = 220;

const BASE_STANDS = [
  { x: 160, y: 150 },
  { x: 690, y: 150 },
  { x: 1220, y: 150 },
  { x: 160, y: 610 },
  { x: 690, y: 610 },
  { x: 1220, y: 610 }
];

const STATIC_OBSTACLES = [
  { x: 450, y: 420, width: 150, height: 100 },
  { x: 900, y: 420, width: 280, height: 190 },
  { x: 1350, y: 420, width: 110, height: 135 }
];

const AVATAR_COLORS = [
  '#e66b5b',
  '#f2a94a',
  '#e3c84b',
  '#64a879',
  '#54a9a0',
  '#5893c8',
  '#8e79bd',
  '#d36a92'
];

const MARKET_BIRD_PATHS = [
  {
    type: 'hen',
    speed: 28,
    phase: 0,
    path: [
      { x: 45, y: 320 },
      { x: 410, y: 320 },
      { x: 410, y: 370 },
      { x: 45, y: 370 }
    ]
  },
  {
    type: 'rooster',
    speed: 36,
    phase: 0.4,
    path: [
      { x: 620, y: 310 },
      { x: 880, y: 310 },
      { x: 880, y: 380 },
      { x: 620, y: 380 }
    ]
  },
  {
    type: 'hen',
    speed: 30,
    phase: 1.7,
    path: [
      { x: 1200, y: 315 },
      { x: 1640, y: 315 },
      { x: 1640, y: 380 },
      { x: 1200, y: 380 }
    ]
  },
  {
    type: 'chick',
    speed: 24,
    phase: 2.4,
    path: [
      { x: 70, y: 320 },
      { x: 390, y: 320 },
      { x: 390, y: 370 },
      { x: 70, y: 370 }
    ]
  }
];

function getStandPosition(index) {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError('Stand index must be a non-negative integer.');
  }

  if (index < BASE_STANDS.length) {
    return BASE_STANDS[index];
  }

  const overflowIndex = index - BASE_STANDS.length;
  const column = overflowIndex % OVERFLOW_STANDS_PER_ROW;
  const row = Math.floor(overflowIndex / OVERFLOW_STANDS_PER_ROW);

  return {
    x: 160 + column * 360,
    y: OVERFLOW_STAND_START_Y + row * OVERFLOW_STAND_ROW_GAP
  };
}

function getWorldSize(standCount) {
  const extraStands = Math.max(0, standCount - BASE_STANDS.length);
  const overflowRows = Math.ceil(extraStands / OVERFLOW_STANDS_PER_ROW);
  const overflowHeight = overflowRows === 0
    ? BASE_WORLD_HEIGHT
    : OVERFLOW_STAND_START_Y
      + overflowRows * OVERFLOW_STAND_ROW_GAP
      + STALL_HEIGHT;

  return {
    width: WORLD_WIDTH,
    height: Math.max(BASE_WORLD_HEIGHT, overflowHeight)
  };
}

function getCollisionRects(standCount) {
  const count = Math.max(BASE_STANDS.length, standCount);
  const stands = Array.from({ length: count }, (_, index) => {
    const position = getStandPosition(index);
    return {
      x: position.x,
      y: position.y,
      width: STALL_WIDTH,
      height: STALL_HEIGHT
    };
  });

  return STATIC_OBSTACLES.concat(stands);
}

function canOccupy(x, y, standCount) {
  const { width, height } = getWorldSize(standCount);
  if (
    !Number.isFinite(x)
    || !Number.isFinite(y)
    || x < PLAYER_RADIUS
    || y < PLAYER_RADIUS
    || x > width - PLAYER_RADIUS
    || y > height - PLAYER_RADIUS
  ) {
    return false;
  }

  return !getCollisionRects(standCount).some((rect) => {
    const nearestX = Math.max(rect.x, Math.min(x, rect.x + rect.width));
    const nearestY = Math.max(rect.y, Math.min(y, rect.y + rect.height));
    const distanceX = x - nearestX;
    const distanceY = y - nearestY;
    return distanceX * distanceX + distanceY * distanceY < PLAYER_RADIUS * PLAYER_RADIUS;
  });
}

function getMarketBirdPositions(elapsedSeconds) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new RangeError('Elapsed time must be a non-negative number.');
  }

  return MARKET_BIRD_PATHS.map((bird, index) => {
    const segments = bird.path.map((point, pointIndex) => {
      const next = bird.path[(pointIndex + 1) % bird.path.length];
      return {
        start: point,
        end: next,
        length: Math.hypot(next.x - point.x, next.y - point.y)
      };
    });
    const routeLength = segments.reduce((total, segment) => total + segment.length, 0);
    let distance = (elapsedSeconds * bird.speed + bird.phase * routeLength) % routeLength;
    let segment = segments[0];

    for (const candidate of segments) {
      if (distance <= candidate.length) {
        segment = candidate;
        break;
      }
      distance -= candidate.length;
    }

    const progress = segment.length === 0 ? 0 : distance / segment.length;
    return {
      id: index,
      type: bird.type,
      x: segment.start.x + (segment.end.x - segment.start.x) * progress,
      y: segment.start.y + (segment.end.y - segment.start.y) * progress,
      facing: segment.end.x < segment.start.x ? 'left' : 'right',
      walkPhase: elapsedSeconds * 12 + bird.phase
    };
  });
}

function getSpawnPosition(role, standIndex) {
  if (role === 'seller') {
    const stand = getStandPosition(standIndex);
    return {
      x: stand.x + STALL_WIDTH / 2,
      y: stand.y + STALL_HEIGHT + PLAYER_RADIUS + 10
    };
  }

  return { x: 790, y: 520 };
}

module.exports = {
  AVATAR_COLORS,
  BASE_STANDS,
  PLAYER_RADIUS,
  STALL_HEIGHT,
  STALL_WIDTH,
  STATIC_OBSTACLES,
  canOccupy,
  getCollisionRects,
  getMarketBirdPositions,
  getSpawnPosition,
  getStandPosition,
  getWorldSize
};
