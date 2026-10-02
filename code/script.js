const filterButtons = document.querySelectorAll('.filter-btn');
const cards = document.querySelectorAll('.game-card');

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const selectedFilter = button.dataset.filter;

    filterButtons.forEach((btn) => btn.classList.toggle('active', btn === button));

    cards.forEach((card) => {
      const category = card.dataset.category;
      const shouldShow = selectedFilter === 'all' || category === selectedFilter;
      card.classList.toggle('hidden', !shouldShow);
    });
  });
});

const yearEl = document.getElementById('year');
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

const scoreDisplay = document.getElementById('scoreDisplay');
const bestDisplay = document.getElementById('bestDisplay');
const startGameBtn = document.getElementById('startGameBtn');
const restartGameBtn = document.getElementById('restartGameBtn');
const canvas = document.getElementById('runnerCanvas');
const ctx = canvas.getContext('2d');

const lanePositions = [canvas.width * 0.28, canvas.width * 0.5, canvas.width * 0.72];
const groundY = canvas.height - 120;

const player = {
  lane: 1,
  x: lanePositions[1],
  targetX: lanePositions[1],
  width: 42,
  height: 52,
  jumpOffset: 0,
  jumpVelocity: 0,
  isJumping: false,
  isSliding: false,
  slideTimer: 0,
};

const state = {
  running: false,
  started: false,
  score: 0,
  best: 0,
  speed: 5.5,
  obstacles: [],
  coins: [],
  spawnTimer: 0,
  coinTimer: 0,
  lastTime: 0,
  animationId: null,
};

function readBestScore() {
  try {
    return Number(localStorage.getItem('templeRushBest')) || 0;
  } catch (error) {
    return 0;
  }
}

function writeBestScore(value) {
  try {
    localStorage.setItem('templeRushBest', String(value));
  } catch (error) {
    // Ignore localStorage access failures.
  }
}

function updateHud() {
  scoreDisplay.textContent = Math.floor(state.score);
  bestDisplay.textContent = Math.floor(state.best);
}

function resetPlayer() {
  player.lane = 1;
  player.x = lanePositions[1];
  player.targetX = lanePositions[1];
  player.jumpOffset = 0;
  player.jumpVelocity = 0;
  player.isJumping = false;
  player.isSliding = false;
  player.slideTimer = 0;
}

function movePlayer(direction) {
  if (!state.running) {
    return;
  }

  player.lane = Math.max(0, Math.min(2, player.lane + direction));
  player.targetX = lanePositions[player.lane];
}

function jump() {
  if (!state.running || player.isJumping) {
    return;
  }

  player.isJumping = true;
  player.jumpVelocity = 14.5;
}

function slide() {
  if (!state.running || player.isJumping || player.isSliding) {
    return;
  }

  player.isSliding = true;
  player.slideTimer = 28;
}

function spawnObstacle() {
  const lane = Math.floor(Math.random() * 3);
  const type = Math.random() < 0.5 ? 'barrier' : 'lowbar';

  state.obstacles.push({
    lane,
    y: -80,
    width: type === 'barrier' ? 58 : 72,
    height: type === 'barrier' ? 58 : 24,
    type,
  });
}

function spawnCoin() {
  const lane = Math.floor(Math.random() * 3);
  state.coins.push({
    lane,
    x: lanePositions[lane],
    y: -35,
    radius: 10,
    collected: false,
  });
}

function endGame() {
  state.running = false;
  state.animationId = null;

  if (state.score > state.best) {
    state.best = state.score;
    writeBestScore(state.best);
  }

  updateHud();
  drawGameState();
}

function beginGame() {
  state.running = true;
  state.started = true;
  state.score = 0;
  state.speed = 5.5;
  state.obstacles = [];
  state.coins = [];
  state.spawnTimer = 55;
  state.coinTimer = 75;
  state.lastTime = 0;
  resetPlayer();
  updateHud();

  if (state.animationId) {
    cancelAnimationFrame(state.animationId);
  }

  state.animationId = requestAnimationFrame(gameLoop);
}

function updatePlayer(dt) {
  player.x += (player.targetX - player.x) * 0.18 * dt;

  if (player.isJumping) {
    player.jumpVelocity -= 0.7 * dt;
    player.jumpOffset += player.jumpVelocity * dt;

    if (player.jumpOffset <= 0) {
      player.jumpOffset = 0;
      player.isJumping = false;
      player.jumpVelocity = 0;
    }
  }

  if (player.isSliding) {
    player.slideTimer -= dt;
    if (player.slideTimer <= 0) {
      player.isSliding = false;
      player.slideTimer = 0;
    }
  }
}

function updateEntities(dt) {
  state.score += 0.22 * dt * state.speed;
  state.speed += 0.0025 * dt;

  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnObstacle();
    state.spawnTimer = 52 - Math.min(22, state.score * 0.03) + Math.random() * 25;
  }

  state.coinTimer -= dt;
  if (state.coinTimer <= 0) {
    spawnCoin();
    state.coinTimer = 70 + Math.random() * 60;
  }

  state.obstacles.forEach((obstacle) => {
    obstacle.y += state.speed * 4.2 * dt;
  });

  state.coins.forEach((coin) => {
    coin.y += state.speed * 4.2 * dt;
  });

  state.obstacles = state.obstacles.filter((obstacle) => obstacle.y < canvas.height + 120);
  state.coins = state.coins.filter((coin) => !coin.collected && coin.y < canvas.height + 50);
}

function checkCollisions() {
  const playerTop = groundY - player.jumpOffset - player.height;
  const playerBottom = groundY - player.jumpOffset;

  for (const obstacle of state.obstacles) {
    if (obstacle.lane !== player.lane) {
      continue;
    }

    const obstacleTop = obstacle.y;
    const obstacleBottom = obstacle.y + obstacle.height;

    const verticalOverlap = obstacleBottom > playerTop && obstacleTop < playerBottom;
    if (!verticalOverlap) {
      continue;
    }

    const safeJump = obstacle.type === 'barrier' && player.jumpOffset > 52;
    const safeSlide = obstacle.type === 'lowbar' && player.isSliding;

    if (!safeJump && !safeSlide) {
      endGame();
      return;
    }
  }

  for (const coin of state.coins) {
    if (coin.collected || coin.lane !== player.lane) {
      continue;
    }

    const coinY = coin.y;
    const coinRange = Math.abs(coinY - (groundY - player.jumpOffset)) < 32;
    const coinXRange = Math.abs(coin.x - player.x) < 26;

    if (coinRange && coinXRange) {
      coin.collected = true;
      state.score += 25;
      if (state.score > state.best) {
        state.best = state.score;
        writeBestScore(state.best);
      }
    }
  }

  state.coins = state.coins.filter((coin) => !coin.collected);
}

function drawBackground() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, '#0d1220');
  sky.addColorStop(1, '#101827');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 36; i += 1) {
    const x = ((i * 53) % canvas.width) + 8;
    const y = ((i * 71) % (canvas.height - 120)) + 12;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.fillStyle = '#1f2937';
  ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);

  for (let i = 0; i < 4; i += 1) {
    const laneX = 80 + i * 92;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(laneX, groundY);
    ctx.lineTo(laneX + 60, canvas.height);
    ctx.stroke();
  }
}

function drawPlayer() {
  const left = player.x - player.width / 2;
  const top = groundY - player.jumpOffset - player.height;

  ctx.fillStyle = '#76e4ff';
  ctx.fillRect(left, top, player.width, player.height);

  ctx.fillStyle = '#ff9d2e';
  ctx.fillRect(left + 8, top + 12, player.width - 16, 12);

  if (player.isSliding) {
    ctx.fillStyle = '#8ef6c2';
    ctx.fillRect(left - 8, top + 38, player.width + 16, 12);
  }
}

function drawObstacles() {
  state.obstacles.forEach((obstacle) => {
    const laneX = lanePositions[obstacle.lane];
    const x = laneX - obstacle.width / 2;
    const y = obstacle.y;

    ctx.fillStyle = obstacle.type === 'barrier' ? '#ff5f6d' : '#f9c74f';
    ctx.fillRect(x, y, obstacle.width, obstacle.height);

    if (obstacle.type === 'lowbar') {
      ctx.fillStyle = '#1b2431';
      ctx.fillRect(x, y - 10, obstacle.width, 8);
    }
  });
}

function drawCoins() {
  state.coins.forEach((coin) => {
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(coin.x, coin.y, coin.radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawGameState() {
  drawBackground();
  drawCoins();
  drawObstacles();
  drawPlayer();

  if (!state.running) {
    ctx.fillStyle = 'rgba(9, 13, 24, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#edf3ff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 34px Inter, sans-serif';

    if (state.started) {
      ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 22);
      ctx.font = '20px Inter, sans-serif';
      ctx.fillStyle = '#dfe7ff';
      ctx.fillText('Press Start or Restart', canvas.width / 2, canvas.height / 2 + 18);
    } else {
      ctx.fillText('Temple Rush', canvas.width / 2, canvas.height / 2 - 24);
      ctx.font = '20px Inter, sans-serif';
      ctx.fillStyle = '#dfe7ff';
      ctx.fillText('Press Start to begin', canvas.width / 2, canvas.height / 2 + 18);
    }
  }
}

function gameLoop(timestamp) {
  if (!state.running) {
    return;
  }

  if (!state.lastTime) {
    state.lastTime = timestamp;
  }

  const dt = Math.min(2.2, (timestamp - state.lastTime) / 16.67);
  state.lastTime = timestamp;

  updatePlayer(dt);
  updateEntities(dt);
  checkCollisions();
  drawGameState();

  if (state.running) {
    state.animationId = requestAnimationFrame(gameLoop);
  }
}

function initializeGame() {
  state.best = readBestScore();
  updateHud();
  drawGameState();
}

document.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();

  if (key === 'a' || key === 'arrowleft') {
    movePlayer(-1);
  }

  if (key === 'd' || key === 'arrowright') {
    movePlayer(1);
  }

  if (key === 'w' || key === 'arrowup') {
    jump();
  }

  if (key === 's' || key === 'arrowdown') {
    slide();
  }

  if (key === ' ' && !state.running) {
    beginGame();
  }
});

startGameBtn.addEventListener('click', beginGame);
restartGameBtn.addEventListener('click', beginGame);

initializeGame();
