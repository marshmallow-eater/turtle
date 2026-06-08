import * as Phaser from 'phaser';
import { MainScene } from './MainScene';

// Phaser configuration
const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'phaser-game',
    backgroundColor: '#0b0f19',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 0 },
            debug: false
        }
    },
    scene: [MainScene]
};

// Create the Phaser Game instance
const game = new Phaser.Game(config);

// Resize game canvas on window size change
window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth, window.innerHeight);
    const mainScene = game.scene.getScene('MainScene') as MainScene;
    if (mainScene && typeof mainScene.handleResize === 'function') {
        mainScene.handleResize(window.innerWidth, window.innerHeight);
    }
});

// UI elements mapping and bindings
const startScreen = document.getElementById('start-screen')!;
const hud = document.getElementById('hud')!;
const pauseScreen = document.getElementById('pause-screen')!;
const gameOverScreen = document.getElementById('game-over-screen')!;

const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const resumeBtn = document.getElementById('resume-btn') as HTMLButtonElement;
const restartBtn = document.getElementById('restart-btn') as HTMLButtonElement;
const restartPauseBtn = document.getElementById('restart-pause-btn') as HTMLButtonElement;
const pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement;
const audioToggleMenu = document.getElementById('audio-toggle-menu') as HTMLButtonElement;
const audioToggleHud = document.getElementById('audio-toggle-hud') as HTMLButtonElement;

// Helper to get active MainScene
function getScene(): MainScene | null {
    if (game.scene.isActive('MainScene')) {
        return game.scene.getScene('MainScene') as MainScene;
    }
    return null;
}

// Start Game
startBtn.onclick = () => {
    startScreen.classList.remove('active');
    hud.classList.add('active');
    
    const scene = game.scene.getScene('MainScene') as MainScene;
    if (scene) {
        scene.startGame();
    }
};

// Resume Game
resumeBtn.onclick = () => {
    pauseScreen.classList.remove('active');
    const scene = getScene();
    if (scene) scene.togglePause();
};

// Pause Game
pauseBtn.onclick = () => {
    const scene = getScene();
    if (scene) {
        scene.togglePause();
        pauseScreen.classList.add('active');
    }
};

// Restart from Game Over
restartBtn.onclick = () => {
    gameOverScreen.classList.remove('active');
    hud.classList.add('active');
    const scene = game.scene.getScene('MainScene') as MainScene;
    if (scene) scene.startGame();
};

// Restart from Pause Menu
restartPauseBtn.onclick = () => {
    pauseScreen.classList.remove('active');
    hud.classList.add('active');
    const scene = game.scene.getScene('MainScene') as MainScene;
    if (scene) scene.startGame();
};

// Audio Toggle
const toggleAudio = () => {
    const scene = game.scene.getScene('MainScene') as MainScene;
    if (scene) {
        const active = scene.toggleSound();
        const iconHTML = active ? '<i class="fa-solid fa-volume-high"></i>' : '<i class="fa-solid fa-volume-xmark"></i>';
        audioToggleMenu.innerHTML = `${iconHTML} Audio: ${active ? 'ON' : 'OFF'}`;
        audioToggleHud.innerHTML = iconHTML;
    }
};

audioToggleMenu.onclick = toggleAudio;
audioToggleHud.onclick = toggleAudio;

// On-screen Action buttons (Punch & Sprint/Jump)
const btnPunch = document.getElementById('btn-punch') as HTMLButtonElement;
const btnJump = document.getElementById('btn-jump') as HTMLButtonElement;

if (btnPunch) {
    btnPunch.addEventListener('pointerdown', (e) => {
        const scene = getScene();
        if (scene && scene.player) {
            scene.player.triggerSwing(scene.soundSystem);
        }
        e.preventDefault();
    });
}

if (btnJump) {
    btnJump.addEventListener('pointerdown', (e) => {
        const scene = getScene();
        if (scene && scene.player) {
            scene.player.triggerJump(scene.soundSystem);
        }
        e.preventDefault();
    });
}

// Expose game instance globally for debugging if needed
(window as any).phaserGame = game;

// Register Service Worker for PWA support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registered with scope:', reg.scope))
            .catch(err => console.error('Service Worker registration failed:', err));
    });
}
