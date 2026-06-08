import * as Phaser from 'phaser';

// --- CONSTANTS ---
const WORLD_WIDTH = 1400;
const WORLD_DEPTH = 700;
const SHORELINE_Y = 520;
const OCEAN_START_Y = 560;
const ISO_ANGLE = Math.PI / 6;

// Speeds & timings
const PLAYER_SPEED = 210;
const TURTLE_SPEED_MIN = 12;
const TURTLE_SPEED_MAX = 20;
const SEAGULL_FLY_SPEED = 90;
const SEAGULL_RUN_SPEED_BASE = 45;
const SCARE_RADIUS = 95;
const EAT_DURATION = 1500;
const WAVE_DURATION = 35000;

// Iso projection helper
function project(x: number, y: number, z: number = 0) {
    const screenX = (x - y) * Math.cos(ISO_ANGLE);
    const screenY = (x + y) * Math.sin(ISO_ANGLE) - z;
    return { x: screenX, y: screenY };
}

// Coordinate rotation/translation helper
function rotTrans(px: number, py: number, angle: number, tx: number, ty: number) {
    const rx = px * Math.cos(angle) - py * Math.sin(angle) + tx;
    const ry = px * Math.sin(angle) + py * Math.cos(angle) + ty;
    return { x: rx, y: ry };
}

// Draws a rotated ellipse on WebGL graphics
function fillRotatedEllipse(g: Phaser.GameObjects.Graphics, tx: number, ty: number, w: number, h: number, angle: number) {
    g.beginPath();
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
        const theta = (i / steps) * Math.PI * 2;
        const px = (w / 2) * Math.cos(theta);
        const py = (h / 2) * Math.sin(theta);
        const pt = rotTrans(px, py, angle, tx, ty);
        if (i === 0) {
            g.moveTo(pt.x, pt.y);
        } else {
            g.lineTo(pt.x, pt.y);
        }
    }
    g.closePath();
    g.fillPath();
}

function strokeRotatedEllipse(g: Phaser.GameObjects.Graphics, tx: number, ty: number, w: number, h: number, angle: number) {
    g.beginPath();
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
        const theta = (i / steps) * Math.PI * 2;
        const px = (w / 2) * Math.cos(theta);
        const py = (h / 2) * Math.sin(theta);
        const pt = rotTrans(px, py, angle, tx, ty);
        if (i === 0) {
            g.moveTo(pt.x, pt.y);
        } else {
            g.lineTo(pt.x, pt.y);
        }
    }
    g.closePath();
    g.strokePath();
}

// --- SUB-ENTITIES ---

interface SoundSystem {
    ctx: AudioContext;
    enabled: boolean;
    ambientGain: GainNode | null;
    noiseBuffer: AudioBuffer | null;
    init(): void;
    toggle(): boolean;
    playSwing(): void;
    playSeagull(): void;
    playTakeoff(): void;
    playSaveTurtle(): void;
    playTurtleLost(): void;
    playLevelUp(): void;
}

class PhaserSoundSystem implements SoundSystem {
    ctx: AudioContext;
    enabled: boolean = true;
    ambientGain: GainNode | null = null;
    noiseBuffer: AudioBuffer | null = null;

    constructor(ctx: AudioContext) {
        this.ctx = ctx;
        this.createNoiseBuffer();
        this.startOceanAmbient();
    }

    init() {}

    toggle() {
        this.enabled = !this.enabled;
        if (this.ctx) {
            if (this.enabled) {
                if (this.ctx.state === 'suspended') {
                    this.ctx.resume();
                }
                if (this.ambientGain) this.ambientGain.gain.setTargetAtTime(0.12, this.ctx.currentTime, 0.5);
            } else {
                if (this.ambientGain) this.ambientGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
            }
        }
        return this.enabled;
    }

    createNoiseBuffer() {
        const size = 2 * this.ctx.sampleRate;
        this.noiseBuffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
        const output = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < size; i++) {
            output[i] = Math.random() * 2 - 1;
        }
    }

    startOceanAmbient() {
        if (!this.noiseBuffer) return;
        
        const whiteNoise = this.ctx.createBufferSource();
        whiteNoise.buffer = this.noiseBuffer;
        whiteNoise.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 1.2;
        filter.frequency.setValueAtTime(350, this.ctx.currentTime);

        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 0.14;
        
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 220;

        this.ambientGain = this.ctx.createGain();
        this.ambientGain.gain.setValueAtTime(0.12, this.ctx.currentTime);

        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        whiteNoise.connect(filter);
        filter.connect(this.ambientGain);
        this.ambientGain.connect(this.ctx.destination);

        lfo.start();
        whiteNoise.start();
    }

    playSwing() {
        if (!this.enabled || !this.noiseBuffer) return;
        const now = this.ctx.currentTime;
        const source = this.ctx.createBufferSource();
        source.buffer = this.noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 3;
        filter.frequency.setValueAtTime(200, now);
        filter.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
        filter.frequency.exponentialRampToValueAtTime(150, now + 0.22);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        source.start(now);
        source.stop(now + 0.25);
    }

    playSeagull() {
        if (!this.enabled) return;
        const now = this.ctx.currentTime;
        
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc1.type = 'sawtooth';
        osc2.type = 'triangle';

        const basePitch = 850 + Math.random() * 150;
        osc1.frequency.setValueAtTime(basePitch, now);
        osc1.frequency.exponentialRampToValueAtTime(basePitch * 1.8, now + 0.06);
        osc1.frequency.exponentialRampToValueAtTime(basePitch * 0.9, now + 0.22);

        osc2.frequency.setValueAtTime(basePitch + 15, now);
        osc2.frequency.exponentialRampToValueAtTime(basePitch * 1.8 + 15, now + 0.06);
        osc2.frequency.exponentialRampToValueAtTime(basePitch * 0.9 + 15, now + 0.22);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(basePitch * 1.2, now);
        filter.frequency.exponentialRampToValueAtTime(basePitch * 1.6, now + 0.06);
        filter.frequency.exponentialRampToValueAtTime(basePitch * 1.0, now + 0.22);
        filter.Q.value = 2.5;

        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.14, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.23);
        osc2.stop(now + 0.23);
    }

    playTakeoff() {
        if (!this.enabled) return;
        const now = this.ctx.currentTime;
        
        for (let i = 0; i < 4; i++) {
            const timeOffset = now + i * 0.07;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(160, timeOffset);
            osc.frequency.exponentialRampToValueAtTime(30, timeOffset + 0.06);

            gain.gain.setValueAtTime(0.25, timeOffset);
            gain.gain.exponentialRampToValueAtTime(0.01, timeOffset + 0.06);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(timeOffset);
            osc.stop(timeOffset + 0.06);
        }
    }

    playSaveTurtle() {
        if (!this.enabled) return;
        const now = this.ctx.currentTime;
        const notes = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50];
        
        notes.forEach((freq, index) => {
            const noteTime = now + index * 0.06;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, noteTime);

            gain.gain.setValueAtTime(0.08, noteTime);
            gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.35);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.start(noteTime);
            osc.stop(noteTime + 0.40);
        });
    }

    playTurtleLost() {
        if (!this.enabled) return;
        const now = this.ctx.currentTime;
        const notes = [329.63, 293.66, 261.63, 220.00];
        
        notes.forEach((freq, index) => {
            const noteTime = now + index * 0.12;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, noteTime);

            gain.gain.setValueAtTime(0.06, noteTime);
            gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.45);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.start(noteTime);
            osc.stop(noteTime + 0.50);
        });
    }
    
    playLevelUp() {
        if (!this.enabled) return;
        const now = this.ctx.currentTime;
        
        const osc = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'square';
        osc2.type = 'sine';
        
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(600, now + 0.15);
        osc.frequency.linearRampToValueAtTime(1200, now + 0.3);
        
        osc2.frequency.setValueAtTime(305, now);
        osc2.frequency.linearRampToValueAtTime(605, now + 0.15);
        osc2.frequency.linearRampToValueAtTime(1205, now + 0.3);
        
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        
        osc.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(now);
        osc2.start(now);
        osc.stop(now + 0.4);
        osc2.stop(now + 0.4);
    }
}

class PhaserParticle extends Phaser.GameObjects.Graphics {
    vx: number;
    vy: number;
    vz: number;
    worldX: number;
    worldY: number;
    worldZ: number;
    color: number;
    size: number;
    life: number;
    maxLife: number;
    pType: 'dust' | 'water' | 'feather' | 'star';

    constructor(scene: Phaser.Scene, x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, size: number, life: number, type: 'dust' | 'water' | 'feather' | 'star') {
        super(scene);
        this.worldX = x;
        this.worldY = y;
        this.worldZ = z;
        this.vx = vx;
        this.vy = vy;
        this.vz = vz;
        this.color = color;
        this.size = size;
        this.life = life;
        this.maxLife = life;
        this.pType = type;
        
        scene.add.existing(this);
    }

    updateParticle(dt: number) {
        this.worldX += this.vx * dt;
        this.worldY += this.vy * dt;
        this.worldZ += this.vz * dt;
        
        if (this.pType === 'feather') {
            this.vz -= 30 * dt;
            this.vx += Math.sin(this.life * 10) * 15 * dt;
        } else if (this.pType === 'water') {
            this.vz -= 320 * dt;
            if (this.worldZ < 0) {
                this.worldZ = 0;
                this.vz = 0;
                this.vx *= 0.5;
                this.vy *= 0.5;
            }
        } else if (this.pType === 'star') {
            this.vz += 20 * dt;
        }
        
        this.life -= dt;
        
        if (this.life <= 0) {
            this.destroy();
            return false;
        }
        
        this.clear();
        const screen = project(this.worldX, this.worldY, this.worldZ);
        this.x = screen.x;
        this.y = screen.y;
        this.setDepth(this.worldX + this.worldY + 50);
        
        const alpha = Math.max(0, this.life / this.maxLife);
        this.fillStyle(this.color, alpha);
        
        if (this.pType === 'feather') {
            this.save();
            this.rotateCanvas(this.life * 3);
            this.fillEllipse(0, 0, this.size * 3.6, this.size * 1.4);
            this.restore();
        } else if (this.pType === 'star') {
            const s = this.size;
            this.beginPath();
            this.moveTo(0, -s);
            this.lineTo(s*0.3, -s*0.3);
            this.lineTo(s, 0);
            this.lineTo(s*0.3, s*0.3);
            this.lineTo(0, s);
            this.lineTo(-s*0.3, s*0.3);
            this.lineTo(-s, 0);
            this.lineTo(-s*0.3, -s*0.3);
            this.closePath();
            this.fillPath();
        } else {
            this.fillCircle(0, 0, this.size);
        }
        
        return true;
    }
}

class Nest extends Phaser.GameObjects.Graphics {
    worldX: number;
    worldY: number;
    wiggle: number = 0;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        super(scene);
        this.worldX = x;
        this.worldY = y;
        
        scene.add.existing(this);
        this.setDepth(this.worldX + this.worldY - 20);
    }

    triggerWiggle() {
        this.wiggle = 1.0;
    }

    updateNest(dt: number) {
        if (this.wiggle > 0) {
            this.wiggle -= dt * 3;
            if (this.wiggle < 0) this.wiggle = 0;
        }
        
        this.clear();
        const screen = project(this.worldX, this.worldY, 0);
        this.x = screen.x;
        this.y = screen.y;
        
        this.fillStyle(0x28190a, 0.4);
        this.fillEllipse(0, 0, 36, 20);

        this.save();
        if (this.wiggle > 0) {
            this.rotateCanvas(Math.sin(Date.now() * 0.05) * 0.12 * this.wiggle);
        }

        this.fillStyle(0xd0b07a, 1.0);
        this.fillCircle(0, 0, 15);
        
        this.fillStyle(0xeecfa2, 1.0);
        this.fillCircle(0, 0, 12);

        this.fillStyle(0x9e8052, 1.0);
        this.fillEllipse(0, 1, 16, 10);

        this.fillStyle(0xf5f6fa, 1.0);
        this.fillCircle(-8, 5, 2);
        this.fillCircle(9, -4, 1.5);
        this.fillCircle(2, 8, 2);

        this.restore();
    }
}

class Turtle extends Phaser.GameObjects.Graphics {
    worldX: number;
    worldY: number;
    worldZ: number = 0;
    speed: number;
    angle: number;
    state: 'hatching' | 'crawling' | 'swimming' | 'captured';
    stateTimer: number = 1.0;
    swimTimer: number = 0;
    wiggleSpeed: number;
    size: number = 11;
    
    constructor(scene: Phaser.Scene, nest: Nest) {
        super(scene);
        this.worldX = nest.worldX;
        this.worldY = nest.worldY;
        this.speed = TURTLE_SPEED_MIN + Math.random() * (TURTLE_SPEED_MAX - TURTLE_SPEED_MIN);
        this.angle = Math.PI / 2 + (Math.random() - 0.5) * 0.4;
        this.state = 'hatching';
        this.wiggleSpeed = 8 + Math.random() * 4;
        
        scene.add.existing(this);
    }

    updateTurtle(dt: number, waterLine: number, soundController: SoundSystem, spawnSplash: (x:number, y:number, c:number)=>void, spawnStars: (x:number, y:number, c:number)=>void) {
        if (this.state === 'hatching') {
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) {
                this.state = 'crawling';
            }
            return;
        }

        if (this.state === 'crawling') {
            this.worldX += Math.cos(this.angle) * this.speed * dt;
            this.worldY += Math.sin(this.angle) * this.speed * dt;

            this.angle += (Math.random() - 0.5) * 0.5 * dt;
            this.angle = Math.max(Math.PI/4, Math.min(3*Math.PI/4, this.angle));

            if (this.worldY >= SHORELINE_Y) {
                if (this.worldY >= waterLine - 10) {
                    this.state = 'swimming';
                    this.swimTimer = 2.0;
                    soundController.playSaveTurtle();
                    spawnStars(this.worldX, this.worldY, 6);
                }
            }
        } else if (this.state === 'swimming') {
            const swimSpeed = this.speed * 2.8;
            this.worldX += Math.cos(this.angle) * swimSpeed * dt;
            this.worldY += Math.sin(this.angle) * swimSpeed * dt;
            
            this.swimTimer -= dt;
            if (Math.random() < 0.15) {
                spawnSplash(this.worldX, this.worldY, 1);
            }
        }

        this.clear();
        
        const screen = project(this.worldX, this.worldY, this.worldZ);
        this.x = screen.x;
        this.y = screen.y;
        this.setDepth(this.worldX + this.worldY);

        let alpha = 1.0;
        if (this.state === 'swimming') {
            alpha = Math.max(0, this.swimTimer / 2.0);
        }

        this.fillStyle(0x000000, 0.25 * alpha);
        this.fillEllipse(0, 1, this.size * 1.8, this.size * 1.2);

        this.save();
        this.rotateCanvas(this.angle - Math.PI / 2);

        const wiggle = (this.state === 'crawling' || this.state === 'swimming')
            ? Math.sin(Date.now() * 0.001 * this.wiggleSpeed)
            : 0;

        this.fillStyle(0x2d5a27, alpha);
        fillRotatedEllipse(this, -5, -3, 12, 5, -Math.PI/4 + wiggle * 0.4);
        fillRotatedEllipse(this, 5, -3, 12, 5, Math.PI/4 - wiggle * 0.4);

        this.fillStyle(0x1e3f1a, alpha);
        fillRotatedEllipse(this, -4, 5, 9, 4, -Math.PI/6 - wiggle * 0.2);
        fillRotatedEllipse(this, 4, 5, 9, 4, Math.PI/6 + wiggle * 0.2);

        this.fillStyle(0x3a5311, alpha);
        this.fillEllipse(0, 0, this.size * 1.5, this.size * 1.8);
        
        this.lineStyle(1.0, 0x6a9c59, alpha);
        this.strokeEllipse(0, 0, this.size * 1.0, this.size * 1.2);

        this.fillStyle(0x2d5a27, alpha);
        this.fillCircle(0, -this.size * 0.9, 3.5);

        this.fillStyle(0x000000, alpha);
        this.fillCircle(-1.2, -this.size * 0.95, 0.6);
        this.fillCircle(1.2, -this.size * 0.95, 0.6);

        this.lineStyle(1.2, 0x2d5a27, alpha);
        this.beginPath();
        this.moveTo(0, this.size * 0.85);
        this.lineTo(0, this.size * 0.85 + 3);
        this.strokePath();

        this.restore();
    }
}

class Seagull extends Phaser.GameObjects.Graphics {
    worldX: number;
    worldY: number;
    worldZ: number;
    targetX: number;
    targetY: number;
    targetTurtle: Turtle | null = null;
    state: 'flying' | 'landing' | 'landed' | 'eating' | 'scared';
    
    flySpeed: number;
    runSpeed: number;
    
    spiralAngle: number;
    spiralRadius: number = 160;
    spiralSpeed: number = 4.2;
    stateTimer: number = 0;
    wingPhase: number;
    scareTriggered: boolean = false;

    constructor(scene: Phaser.Scene, startX: number, startY: number, targetTurtle: Turtle | null, level: number) {
        super(scene);
        this.worldX = startX;
        this.worldY = startY;
        this.worldZ = 240 + Math.random() * 80;
        this.targetX = startX;
        this.targetY = startY;
        this.targetTurtle = targetTurtle;
        
        this.state = 'flying';
        this.flySpeed = SEAGULL_FLY_SPEED + level * 5;
        this.runSpeed = SEAGULL_RUN_SPEED_BASE + level * 6;
        
        this.spiralAngle = Math.random() * Math.PI * 2;
        this.wingPhase = Math.random() * 10;
        
        this.selectLandingSpot();
        scene.add.existing(this);
    }

    selectLandingSpot() {
        if (this.targetTurtle && this.targetTurtle.state === 'crawling') {
            this.targetX = this.targetTurtle.worldX + Math.cos(this.targetTurtle.angle) * this.targetTurtle.speed * 1.5;
            this.targetY = this.targetTurtle.worldY + Math.sin(this.targetTurtle.angle) * this.targetTurtle.speed * 1.5;
        } else {
            this.targetX = 150 + Math.random() * (WORLD_WIDTH - 300);
            this.targetY = 150 + Math.random() * (SHORELINE_Y - 220);
        }
        
        this.targetX = Math.max(100, Math.min(WORLD_WIDTH - 100, this.targetX));
        this.targetY = Math.max(100, Math.min(SHORELINE_Y - 60, this.targetY));
    }

    updateSeagull(dt: number, player: Player, turtles: Turtle[], soundController: SoundSystem, spawnFeathers: (x:number,y:number,z:number,c:number)=>void) {
        this.wingPhase += dt * (this.state === 'scared' ? 22 : 12);
        const distToPlayer = Math.hypot(this.worldX - player.worldX, this.worldY - player.worldY);
        
        if (distToPlayer < SCARE_RADIUS && this.state !== 'scared') {
            // Aborts landing / stops descending and escapes if still in the air
            if (this.state === 'flying' || this.state === 'landing') {
                this.triggerScare(soundController, player, spawnFeathers);
            }
        }

        switch (this.state) {
            case 'flying':
                const distToLanding = Math.hypot(this.targetX - this.worldX, this.targetY - this.worldY);
                if (distToLanding < 120) {
                    this.state = 'landing';
                    this.spiralRadius = distToLanding;
                    if (Math.random() < 0.6) soundController.playSeagull();
                } else {
                    const angle = Math.atan2(this.targetY - this.worldY, this.targetX - this.worldX);
                    this.worldX += Math.cos(angle) * this.flySpeed * dt;
                    this.worldY += Math.sin(angle) * this.flySpeed * dt;
                    this.worldZ -= 25 * dt;
                }
                break;

            case 'landing':
                this.spiralAngle += this.spiralSpeed * dt;
                this.spiralRadius -= 60 * dt;
                this.worldZ -= 75 * dt;

                this.worldX = this.targetX + Math.cos(this.spiralAngle) * Math.max(0, this.spiralRadius);
                this.worldY = this.targetY + Math.sin(this.spiralAngle) * Math.max(0, this.spiralRadius);

                if (this.worldZ <= 0.1 || this.spiralRadius <= 1) {
                    this.worldZ = 0;
                    this.state = 'landed';
                    this.targetTurtle = null;
                }
                break;

            case 'landed':
                if (!this.targetTurtle || this.targetTurtle.state !== 'crawling') {
                    let nearest: Turtle | null = null;
                    let minDist = 9999;
                    turtles.forEach(t => {
                        if (t.state === 'crawling') {
                            const d = Math.hypot(t.worldX - this.worldX, t.worldY - this.worldY);
                            if (d < minDist) {
                                minDist = d;
                                nearest = t;
                            }
                        }
                    });
                    this.targetTurtle = nearest;
                }

                if (this.targetTurtle) {
                    const angle = Math.atan2(this.targetTurtle.worldY - this.worldY, this.targetTurtle.worldX - this.worldX);
                    this.worldX += Math.cos(angle) * this.runSpeed * dt;
                    this.worldY += Math.sin(angle) * this.runSpeed * dt;

                    const distToTurtle = Math.hypot(this.targetTurtle.worldX - this.worldX, this.targetTurtle.worldY - this.worldY);
                    if (distToTurtle < 15) {
                        this.state = 'eating';
                        this.stateTimer = EAT_DURATION;
                        this.targetTurtle.state = 'captured';
                    }
                } else {
                    if (Math.random() < 0.005) {
                        this.triggerScare(soundController, player, spawnFeathers, false);
                    }
                    this.worldX += (Math.random() - 0.5) * 15 * dt;
                    this.worldY += (Math.random() - 0.5) * 15 * dt;
                    this.worldX = Math.max(50, Math.min(WORLD_WIDTH - 50, this.worldX));
                    this.worldY = Math.max(50, Math.min(WORLD_DEPTH - 50, this.worldY));
                }
                break;

            case 'eating':
                this.stateTimer -= dt * 1000;
                if (this.stateTimer <= 0) {
                    if (this.targetTurtle) {
                        this.targetTurtle.stateTimer = -1;
                        soundController.playTurtleLost();
                    }
                    this.state = 'scared';
                }
                break;

            case 'scared':
                this.worldZ += 180 * dt;
                this.worldX += Math.cos(this.spiralAngle) * this.flySpeed * 1.5 * dt;
                this.worldY += Math.sin(this.spiralAngle) * this.flySpeed * 1.2 * dt;
                break;
        }

        this.clear();
        const screenGround = project(this.worldX, this.worldY, 0);
        const screenBird = project(this.worldX, this.worldY, this.worldZ);
        
        this.x = screenBird.x;
        this.y = screenBird.y;
        this.setDepth(this.worldX + this.worldY + 5);

        const shadowAlpha = this.state === 'scared'
            ? Math.max(0, 0.35 * (1 - this.worldZ / 350))
            : Math.max(0.1, 0.35 * (1 - this.worldZ / 350));
        
        const shadowOffsetX = screenGround.x - screenBird.x;
        const shadowOffsetY = screenGround.y - screenBird.y;
        
        this.fillStyle(0x000000, shadowAlpha);
        
        const flap = Math.sin(this.wingPhase);

        if (this.state === 'flying' || this.state === 'scared') {
            this.fillEllipse(shadowOffsetX, shadowOffsetY, 30, 12);
            this.fillEllipse(shadowOffsetX, shadowOffsetY, 10, 48 * Math.abs(flap));
        } else if (this.state === 'landing') {
            const progress = Math.max(0.2, this.worldZ / 200);
            this.fillEllipse(shadowOffsetX, shadowOffsetY, 36 * (1.2 - progress), 20 * (1.2 - progress));
        } else {
            this.fillEllipse(shadowOffsetX, shadowOffsetY + 2, 24, 12);
        }

        this.save();
        if (this.state === 'flying' || this.state === 'scared' || this.state === 'landing') {
            this.fillStyle(0xffffff, 1.0);
            this.lineStyle(1.0, 0xd2dae2, 1.0);
            
            // Left wing bezier curve via lines
            this.beginPath();
            this.moveTo(0, 0);
            const p0x = 0, p0y = 0;
            const p1x = -15, p1y = -15 * flap - 5;
            const p2x = -28, p2y = -5 * flap - 2;
            for (let t = 0; t <= 1; t += 0.25) {
                const cx = (1-t)*(1-t)*p0x + 2*(1-t)*t*p1x + t*t*p2x;
                const cy = (1-t)*(1-t)*p0y + 2*(1-t)*t*p1y + t*t*p2y;
                this.lineTo(cx, cy);
            }
            const p3x = -28, p3y = -5 * flap - 2;
            const p4x = -15, p4y = -2 * flap - 2;
            const p5x = 0, p5y = 3;
            for (let t = 0; t <= 1; t += 0.25) {
                const cx = (1-t)*(1-t)*p3x + 2*(1-t)*t*p4x + t*t*p5x;
                const cy = (1-t)*(1-t)*p3y + 2*(1-t)*t*p4y + t*t*p5y;
                this.lineTo(cx, cy);
            }
            this.closePath();
            this.fillPath();
            this.strokePath();

            // Right wing bezier curve via lines
            this.beginPath();
            this.moveTo(0, 0);
            const rp0x = 0, rp0y = 0;
            const rp1x = 15, rp1y = -15 * flap - 5;
            const rp2x = 28, rp2y = -5 * flap - 2;
            for (let t = 0; t <= 1; t += 0.25) {
                const cx = (1-t)*(1-t)*rp0x + 2*(1-t)*t*rp1x + t*t*rp2x;
                const cy = (1-t)*(1-t)*rp0y + 2*(1-t)*t*rp1y + t*t*rp2y;
                this.lineTo(cx, cy);
            }
            const rp3x = 28, rp3y = -5 * flap - 2;
            const rp4x = 15, rp4y = -2 * flap - 2;
            const rp5x = 0, rp5y = 3;
            for (let t = 0; t <= 1; t += 0.25) {
                const cx = (1-t)*(1-t)*rp3x + 2*(1-t)*t*rp4x + t*t*rp5x;
                const cy = (1-t)*(1-t)*rp3y + 2*(1-t)*t*rp4y + t*t*rp5y;
                this.lineTo(cx, cy);
            }
            this.closePath();
            this.fillPath();
            this.strokePath();

            this.fillStyle(0xf5f6fa, 1.0);
            this.fillEllipse(0, 0, 32, 14);

            this.fillCircle(14, -2, 5);
            this.fillStyle(0xf1c40f, 1.0);
            this.beginPath();
            this.moveTo(18, -4);
            this.lineTo(26, -2);
            this.lineTo(18, 1);
            this.closePath();
            this.fillPath();

            this.fillStyle(0x4b5563, 1.0);
            this.beginPath();
            this.moveTo(-14, 0);
            this.lineTo(-21, -4);
            this.lineTo(-21, 4);
            this.closePath();
            this.fillPath();
        } else {
            const isEating = this.state === 'eating';
            const peckAngle = isEating ? Math.sin(Date.now() * 0.02) * 0.4 + 0.4 : 0;

            this.lineStyle(1.8, 0xf1c40f, 1.0);
            this.beginPath();
            this.moveTo(-3, 6);
            this.lineTo(-3, 15);
            this.moveTo(3, 6);
            this.lineTo(3, 15);
            this.strokePath();

            this.fillStyle(0xffffff, 1.0);
            fillRotatedEllipse(this, 0, 0, 36, 22, peckAngle * 0.3);
            this.lineStyle(1.0, 0xe2e8f0, 1.0);
            strokeRotatedEllipse(this, 0, 0, 36, 22, peckAngle * 0.3);

            this.fillStyle(0xced6e0, 1.0);
            fillRotatedEllipse(this, -3, -1, 26, 12, Math.PI/10);

            const headCenter = isEating 
                ? { x: 14, y: 3 + peckAngle * 10 } 
                : { x: 14, y: -8 };

            this.fillStyle(0xffffff, 1.0);
            this.fillCircle(headCenter.x, headCenter.y, 6.5);
            
            this.fillStyle(0xf1c40f, 1.0);
            this.beginPath();
            this.moveTo(headCenter.x + 5, headCenter.y - 2);
            this.lineTo(headCenter.x + 13, headCenter.y + 2);
            this.lineTo(headCenter.x + 4, headCenter.y + 3);
            this.closePath();
            this.fillPath();

            this.fillStyle(0x000000, 1.0);
            this.fillCircle(headCenter.x + 0.5, headCenter.y - 2, 1);

            if (isEating && this.targetTurtle) {
                this.fillStyle(0x3a5311, 1.0);
                this.fillCircle(22, 10 + peckAngle * 8, 4);
            }
        }
        this.restore();
    }

    triggerScare(soundController: SoundSystem, player: Player, spawnFeathers: (x:number,y:number,z:number,c:number)=>void, playSfx = true) {
        if (this.state === 'scared') return;
        
        if (this.state === 'eating' && this.targetTurtle) {
            this.targetTurtle.state = 'crawling';
            this.targetTurtle.stateTimer = 0.5;
        }
        
        this.state = 'scared';
        this.scareTriggered = true;
        this.spiralAngle = Math.random() * Math.PI * 2;
        
        player.triggerSwing(soundController);

        if (playSfx) {
            soundController.playSeagull();
            soundController.playTakeoff();
            spawnFeathers(this.worldX, this.worldY, this.worldZ, 7);
        }
    }
}

class Player extends Phaser.GameObjects.Graphics {
    worldX: number;
    worldY: number;
    worldZ: number = 0;
    vx: number = 0;
    vy: number = 0;
    angle: number = Math.PI / 2;
    isMoving: boolean = false;
    walkCycle: number = 0;
    size: number = 18;
    
    swingActive: boolean = false;
    swingProgress: number = 0;
    swingSide: number = 1;
    dustTimer: number = 0;

    // Dash / Jump States
    dashActive: boolean = false;
    dashTimer: number = 0;
    dashVx: number = 0;
    dashVy: number = 0;
    dashCooldown: number = 0;
    dashCooldownMax: number = 0.8; // 0.8s cooldown

    constructor(scene: Phaser.Scene, x: number, y: number) {
        super(scene);
        this.worldX = x;
        this.worldY = y;
        
        scene.add.existing(this);
    }

    updatePlayer(dt: number, keys: { [key: string]: boolean }, waterLine: number, spawnDust: (x:number, y:number)=>void, spawnSplash: (x:number, y:number)=>void) {
        const scene = this.scene as MainScene;

        // 1. Process Dash/Jump Cooldown
        if (this.dashCooldown > 0) {
            this.dashCooldown -= dt;
            const overlay = document.getElementById('jump-cooldown');
            if (overlay) {
                const percent = Math.max(0, (this.dashCooldown / this.dashCooldownMax) * 100);
                overlay.style.height = `${percent}%`;
            }
        }

        // 2. Dash/Jump Movement Physics
        if (this.dashActive) {
            this.dashTimer -= dt;
            if (this.dashTimer <= 0) {
                this.dashActive = false;
                this.worldZ = 0;
                this.vx = 0;
                this.vy = 0;
            } else {
                this.worldX += this.dashVx * dt;
                this.worldY += this.dashVy * dt;
                
                // Height Z follows a sine wave arc
                const progress = (0.3 - this.dashTimer) / 0.3;
                this.worldZ = Math.sin(progress * Math.PI) * 32;

                // Spawn trails
                if (Math.random() < 0.4) {
                    if (this.worldY >= SHORELINE_Y) {
                        spawnSplash(this.worldX, this.worldY);
                    } else {
                        spawnDust(this.worldX, this.worldY);
                    }
                }
            }
        } else {
            // 3. Normal Walk Movement (read Joystick or Keys)
            let dx = 0;
            let dy = 0;

            if (scene.joystickActive) {
                const cos30 = Math.cos(ISO_ANGLE);
                const sin30 = Math.sin(ISO_ANGLE);
                // Convert screen joystick vector back to isometric coordinates
                dx = 0.5 * (scene.joystickVector.x / cos30 + scene.joystickVector.y / sin30);
                dy = 0.5 * (scene.joystickVector.y / sin30 - scene.joystickVector.x / cos30);
            } else {
                // Read keyboard cursors
                if (keys['ArrowUp'] || keys['KeyW'] || keys['up']) { dx -= 1; dy -= 1; }
                if (keys['ArrowDown'] || keys['KeyS'] || keys['down']) { dx += 1; dy += 1; }
                if (keys['ArrowLeft'] || keys['KeyA'] || keys['left']) { dx -= 1; dy += 1; }
                if (keys['ArrowRight'] || keys['KeyD'] || keys['right']) { dx += 1; dy -= 1; }
            }

            if (dx !== 0 || dy !== 0) {
                const len = Math.hypot(dx, dy);
                this.vx = (dx / len) * PLAYER_SPEED;
                this.vy = (dy / len) * PLAYER_SPEED;
                this.angle = Math.atan2(this.vy, this.vx);
                this.isMoving = true;
                this.walkCycle += dt * 14;
                
                // Water drag
                if (this.worldY >= SHORELINE_Y) {
                    const subFactor = Math.min(0.6, (this.worldY - SHORELINE_Y) / 100);
                    this.vx *= (1 - subFactor);
                    this.vy *= (1 - subFactor);
                }
            } else {
                this.vx = 0;
                this.vy = 0;
                this.isMoving = false;
                this.walkCycle = 0;
            }

            this.worldX += this.vx * dt;
            this.worldY += this.vy * dt;
        }

        // Clamp boundary limits
        this.worldX = Math.max(30, Math.min(WORLD_WIDTH - 30, this.worldX));
        this.worldY = Math.max(60, Math.min(OCEAN_START_Y - 20, this.worldY));

        // Spawn footprints
        if (this.isMoving && !this.dashActive) {
            this.dustTimer += dt;
            if (this.worldY < SHORELINE_Y) {
                if (this.dustTimer > 0.12) {
                    spawnDust(this.worldX, this.worldY);
                    this.dustTimer = 0;
                }
            } else {
                if (this.worldY >= waterLine && this.dustTimer > 0.08) {
                    spawnSplash(this.worldX, this.worldY);
                    this.dustTimer = 0;
                }
            }
        }

        if (this.swingActive) {
            this.swingProgress += dt * 7.5;
            if (this.swingProgress >= 1.0) {
                this.swingActive = false;
                this.swingProgress = 0;
            }
        }

        // 4. Drawing code
        this.clear();
        const screen = project(this.worldX, this.worldY, this.worldZ);
        this.x = screen.x;
        this.y = screen.y;
        this.setDepth(this.worldX + this.worldY);

        // Draw Player Shadow (projected back to ground level Z=0)
        const shadowScale = Math.max(0.3, 1 - (this.worldZ / 80));
        this.fillStyle(0x000000, 0.28 * shadowScale);
        this.fillEllipse(0, this.worldZ + 1, this.size * 1.9 * shadowScale, this.size * 0.9 * shadowScale);

        const walkScale = Math.sin(this.walkCycle);
        this.lineStyle(4.0, 0xe0a070, 1.0);
        
        this.beginPath();
        this.moveTo(-4, 0);
        this.lineTo(-4 - walkScale * 4, 12 + Math.max(0, walkScale) * 2);
        this.strokePath();

        this.beginPath();
        this.moveTo(4, 0);
        this.lineTo(4 + walkScale * 4, 12 + Math.max(0, -walkScale) * 2);
        this.strokePath();

        this.fillStyle(0x0984e3, 1.0);
        this.fillRect(-7, -4, 14, 6);

        const bob = Math.abs(walkScale) * 1.5;
        this.fillStyle(0xff7e5f, 1.0);
        this.fillEllipse(0, -9 - bob, 17, 18);

        this.fillStyle(0xe0a070, 1.0);
        this.fillRect(-2.5, -17 - bob, 5, 4);

        this.fillStyle(0xffd1a9, 1.0);
        this.fillCircle(0, -21 - bob, 6.5);

        this.fillStyle(0x4a2711, 1.0);
        this.beginPath();
        this.arc(0, -23 - bob, 7, Math.PI, 0);
        this.fillPath();
        this.fillCircle(-4, -22 - bob, 3);
        this.fillCircle(4, -22 - bob, 3);

        const lookX = Math.cos(this.angle) * 2;
        const lookY = Math.sin(this.angle) * 1;
        this.fillStyle(0x2c3e50, 1.0);
        this.fillCircle(-2 + lookX, -21 - bob + lookY, 1);
        this.fillCircle(2 + lookX, -21 - bob + lookY, 1);

        let stickAngle = -Math.PI / 4;
        if (this.swingActive) {
            const swingPhase = this.swingProgress;
            stickAngle = -Math.PI / 4 + Math.sin(swingPhase * Math.PI) * 2.2 * this.swingSide;
            
            this.lineStyle(5.0, 0xffffff, 0.45);
            this.beginPath();
            
            const startAngle = -Math.PI / 4;
            const endAngle = stickAngle;
            const steps = 6;
            for (let i = 0; i <= steps; i++) {
                const a = startAngle + (endAngle - startAngle) * (i / steps);
                const pt = rotTrans(24, 0, a, 0, -8 - bob);
                if (i === 0) {
                    this.moveTo(pt.x, pt.y);
                } else {
                    this.lineTo(pt.x, pt.y);
                }
            }
            this.strokePath();
        } else if (this.isMoving) {
            stickAngle += Math.sin(this.walkCycle * 0.5) * 0.2;
        }

        const armStart = rotTrans(0, 0, stickAngle, 0, -8 - bob);
        const armEnd = rotTrans(8, -1, stickAngle, 0, -8 - bob);
        this.lineStyle(3.2, 0xffd1a9, 1.0);
        this.beginPath();
        this.moveTo(armStart.x, armStart.y);
        this.lineTo(armEnd.x, armEnd.y);
        this.strokePath();

        const stickStart = rotTrans(6, -8, stickAngle, 0, -8 - bob);
        const stickEnd = rotTrans(10, 18, stickAngle, 0, -8 - bob);
        this.lineStyle(2.4, 0x8b5a2b, 1.0);
        this.beginPath();
        this.moveTo(stickStart.x, stickStart.y);
        this.lineTo(stickEnd.x, stickEnd.y);
        this.strokePath();
    }

    triggerSwing(soundController: SoundSystem) {
        if (this.swingActive) return;
        this.swingActive = true;
        this.swingProgress = 0;
        this.swingSide = Math.random() > 0.5 ? 1 : -1;
        soundController.playSwing();

        // Hit detection check: scare landed/eating seagulls within range 85
        const scene = this.scene as MainScene;
        scene.seagulls.forEach(s => {
            if (s.state === 'landed' || s.state === 'eating') {
                const distToSeagull = Math.hypot(s.worldX - this.worldX, s.worldY - this.worldY);
                if (distToSeagull < 85) {
                    s.triggerScare(
                        soundController, 
                        this, 
                        (x, y, z, c) => scene.spawnFeathers(x, y, z, c)
                    );
                }
            }
        });
    }

    triggerJump(soundController: SoundSystem) {
        if (this.dashActive || this.dashCooldown > 0) return;
        
        this.dashActive = true;
        this.dashTimer = 0.3; // 0.3 seconds jump duration
        this.dashCooldown = this.dashCooldownMax;
        
        // Face dash vector
        this.dashVx = Math.cos(this.angle) * PLAYER_SPEED * 2.8;
        this.dashVy = Math.sin(this.angle) * PLAYER_SPEED * 2.8;
        
        soundController.playSwing(); // Jump wind whoosh
        
        const scene = this.scene as MainScene;
        if (this.worldY >= SHORELINE_Y) {
            scene.spawnSplash(this.worldX, this.worldY, 6);
        } else {
            scene.spawnDust(this.worldX, this.worldY, 4);
        }
    }
}

// --- MAIN PHASER SCENE ---
export class MainScene extends Phaser.Scene {
    gameState: 'menu' | 'playing' | 'paused' | 'gameover' = 'menu';
    score: number = 0;
    lost: number = 0;
    level: number = 1;
    activeSeagullsScared: number = 0;
    waveTimer: number = WAVE_DURATION;
    
    turtleSpawnTimer: number = 0;
    seagullSpawnTimer: number = 0;
    
    waterCycle: number = 0;
    waterLine: number = SHORELINE_Y;

    soundSystem!: SoundSystem;
    keys: { [key: string]: boolean } = {};
    
    // Virtual Joystick States
    joystickActive: boolean = false;
    joystickVector: { x: number; y: number } = { x: 0, y: 0 };
    
    player!: Player;
    nests: Nest[] = [];
    turtles: Turtle[] = [];
    seagulls: Seagull[] = [];
    particles: PhaserParticle[] = [];

    sandGraphics!: Phaser.GameObjects.Graphics;
    waterGraphics!: Phaser.GameObjects.Graphics;

    constructor() {
        super({ key: 'MainScene' });
    }

    preload() {}

    create() {
        const audioCtx = (this.sound as any).context as AudioContext;
        this.soundSystem = new PhaserSoundSystem(audioCtx);

        this.setupKeyboardInput();
        this.setupVirtualJoystick();

        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (this.gameState === 'playing' && pointer.leftButtonDown()) {
                this.player.triggerSwing(this.soundSystem);
            }
        });

        this.sandGraphics = this.add.graphics();
        this.waterGraphics = this.add.graphics();
        
        this.sandGraphics.setDepth(1);
        this.waterGraphics.setDepth(10000);
        
        this.createNests();
    }

    createNests() {
        this.nests = [];
        const nestCount = 4;
        const spacing = WORLD_WIDTH / (nestCount + 1);
        for (let i = 1; i <= nestCount; i++) {
            const x = spacing * i + (Math.random() - 0.5) * 40;
            const y = 50 + Math.random() * 40;
            this.nests.push(new Nest(this, x, y));
        }
    }

    setupKeyboardInput() {
        // Global keydown event listener
        this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
            this.keys[e.code] = true;
            
            if (e.code === 'KeyM') this.toggleSound();
            if (e.code === 'Escape') this.togglePause();
            if (e.code === 'Space' && this.gameState === 'playing') {
                this.player.triggerSwing(this.soundSystem);
            }
        });

        // Global keyup event listener
        this.input.keyboard!.on('keyup', (e: KeyboardEvent) => {
            this.keys[e.code] = false;
        });
    }

    setupVirtualJoystick() {
        const ring = document.querySelector('.joystick-ring') as HTMLElement;
        const knob = document.getElementById('joystick-knob') as HTMLElement;
        
        if (!ring || !knob) return;
        
        const limit = 40; // max drag radius in pixels
        let startX = 0;
        let startY = 0;
        
        const handleStart = (clientX: number, clientY: number) => {
            this.joystickActive = true;
            const rect = ring.getBoundingClientRect();
            startX = rect.left + rect.width / 2;
            startY = rect.top + rect.height / 2;
            handleMove(clientX, clientY);
        };
        
        const handleMove = (clientX: number, clientY: number) => {
            if (!this.joystickActive) return;
            
            let dx = clientX - startX;
            let dy = clientY - startY;
            
            const dist = Math.hypot(dx, dy);
            if (dist > limit) {
                dx = (dx / dist) * limit;
                dy = (dy / dist) * limit;
            }
            
            knob.style.transform = `translate(${dx}px, ${dy}px)`;
            
            this.joystickVector.x = dx / limit;
            this.joystickVector.y = dy / limit;
        };
        
        const handleEnd = () => {
            this.joystickActive = false;
            this.joystickVector = { x: 0, y: 0 };
            knob.style.transform = 'translate(0px, 0px)';
        };
        
        // Touch events
        ring.addEventListener('touchstart', (e) => {
            if (e.touches.length > 0) {
                handleStart(e.touches[0].clientX, e.touches[0].clientY);
            }
            e.preventDefault();
        }, { passive: false });
        
        window.addEventListener('touchmove', (e) => {
            if (this.joystickActive && e.touches.length > 0) {
                handleMove(e.touches[0].clientX, e.touches[0].clientY);
                e.preventDefault();
            }
        }, { passive: false });
        
        window.addEventListener('touchend', () => {
            if (this.joystickActive) handleEnd();
        });
        
        // Mouse events
        ring.addEventListener('mousedown', (e) => {
            handleStart(e.clientX, e.clientY);
            e.preventDefault();
        });
        
        window.addEventListener('mousemove', (e) => {
            if (this.joystickActive) {
                handleMove(e.clientX, e.clientY);
            }
        });
        
        window.addEventListener('mouseup', () => {
            if (this.joystickActive) handleEnd();
        });
    }

    startGame() {
        this.score = 0;
        this.lost = 0;
        this.level = 1;
        this.activeSeagullsScared = 0;
        this.waveTimer = WAVE_DURATION;
        
        this.turtles.forEach(t => t.destroy());
        this.seagulls.forEach(s => s.destroy());
        this.particles.forEach(p => p.destroy());
        
        this.turtles = [];
        this.seagulls = [];
        this.particles = [];
        
        if (this.player) this.player.destroy();
        this.player = new Player(this, WORLD_WIDTH / 2, WORLD_DEPTH / 2 - 50);

        this.gameState = 'playing';
        this.updateHUD();

        this.turtleSpawnTimer = 1.0;
        this.seagullSpawnTimer = 3.5;
    }

    togglePause() {
        if (this.gameState === 'playing') {
            this.gameState = 'paused';
            this.scene.pause();
        } else if (this.gameState === 'paused') {
            this.gameState = 'playing';
            this.scene.resume();
        }
    }

    toggleSound() {
        return this.soundSystem.toggle();
    }

    updateHUD() {
        const activeGulls = this.seagulls.filter(s => s.state !== 'scared').length;
        const activeTurtles = this.turtles.filter(t => t.state === 'hatching' || t.state === 'crawling').length;
        
        document.getElementById('score-val')!.innerText = String(this.score);
        document.getElementById('lost-val')!.innerText = String(this.lost);
        document.getElementById('level-val')!.innerText = String(this.level);
        document.getElementById('seagull-count')!.innerText = String(activeGulls);
        document.getElementById('turtle-count')!.innerText = String(activeTurtles);
        
        const percent = Math.max(0, Math.min(100, (this.waveTimer / WAVE_DURATION) * 100));
        document.getElementById('wave-progress')!.style.width = `${percent}%`;
        
        const wavesTitles = [
            "Morning Breeze",
            "Midday Sun",
            "Sunset Rush",
            "High Tide Danger",
            "Midnight Crawl",
            "Final Shoreline Defense"
        ];
        const titleIndex = Math.min(wavesTitles.length - 1, this.level - 1);
        document.getElementById('wave-title')!.innerText = `WAVE ${this.level}: ${wavesTitles[titleIndex].toUpperCase()}`;
    }

    triggerLevelUp() {
        this.level++;
        this.waveTimer = WAVE_DURATION;
        this.soundSystem.playLevelUp();
        
        const alertBox = document.getElementById('hud-alert')!;
        alertBox.innerHTML = `<span>LEVEL UP: WAVE ${this.level}</span>`;
        alertBox.classList.remove('hidden');
        setTimeout(() => alertBox.classList.add('hidden'), 3000);
        
        this.nests.forEach(n => n.triggerWiggle());
        this.updateHUD();
    }

    gameOver() {
        this.gameState = 'gameover';
        
        document.getElementById('hud')!.classList.remove('active');
        document.getElementById('game-over-screen')!.classList.add('active');
        
        document.getElementById('final-saved')!.innerText = String(this.score);
        document.getElementById('final-scared')!.innerText = String(this.activeSeagullsScared);
        document.getElementById('final-level')!.innerText = String(this.level);
        
        const total = this.score + this.lost;
        const rate = total > 0 ? Math.round((this.score / total) * 100) : 0;
        document.getElementById('final-rate')!.innerText = `${rate}%`;
    }

    update(_time: number, delta: number) {
        if (this.gameState !== 'playing') return;
        const dt = delta / 1000;

        this.waterCycle += dt * 1.6;
        this.waterLine = SHORELINE_Y + Math.sin(this.waterCycle) * 35;

        this.drawBackground();
        this.handleSpawns(dt);

        this.nests.forEach(n => n.updateNest(dt));

        this.player.updatePlayer(
            dt, 
            this.keys, 
            this.waterLine, 
            (x, y) => this.spawnDust(x, y), 
            (x, y) => this.spawnSplash(x, y)
        );

        const playerProj = project(this.player.worldX, this.player.worldY, this.player.worldZ);
        this.cameras.main.centerOn(playerProj.x, playerProj.y);

        for (let i = this.turtles.length - 1; i >= 0; i--) {
            const t = this.turtles[i];
            t.updateTurtle(
                dt, 
                this.waterLine, 
                this.soundSystem, 
                (x, y, c) => this.spawnSplash(x, y, c), 
                (x, y, c) => this.spawnStars(x, y, c)
            );
            
            if (t.stateTimer === -1) {
                this.turtles.splice(i, 1);
                t.destroy();
                this.lost++;
                this.updateHUD();
                
                if (this.lost >= 10) {
                    this.gameOver();
                }
            } else if (t.state === 'swimming' && t.swimTimer <= 0) {
                this.turtles.splice(i, 1);
                t.destroy();
                this.score++;
                this.updateHUD();
            }
        }

        for (let i = this.seagulls.length - 1; i >= 0; i--) {
            const s = this.seagulls[i];
            const wasScared = s.state === 'scared';
            
            s.updateSeagull(dt, this.player, this.turtles, this.soundSystem, (x, y, z, c) => this.spawnFeathers(x, y, z, c));
            
            if (!wasScared && s.state === 'scared' && s.scareTriggered) {
                this.activeSeagullsScared++;
                this.updateHUD();
            }

            if (s.state === 'scared' && s.worldZ > 320) {
                this.seagulls.splice(i, 1);
                s.destroy();
                this.updateHUD();
            }
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const active = this.particles[i].updateParticle(dt);
            if (!active) {
                this.particles.splice(i, 1);
            }
        }

        this.waveTimer -= dt;
        if (this.waveTimer <= 0) {
            this.triggerLevelUp();
        } else {
            if (Math.random() < 0.05) this.updateHUD();
        }
    }

    handleSpawns(dt: number) {
        this.turtleSpawnTimer -= dt;
        if (this.turtleSpawnTimer <= 0) {
            const randomNest = this.nests[Math.floor(Math.random() * this.nests.length)];
            randomNest.triggerWiggle();
            this.turtles.push(new Turtle(this, randomNest));
            
            const ctx = this.soundSystem.ctx;
            if (this.soundSystem.enabled && ctx) {
                const now = ctx.currentTime;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(90, now);
                osc.frequency.exponentialRampToValueAtTime(30, now + 0.1);
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.1);
            }
            
            this.updateHUD();
            const minTime = Math.max(1.8, 5.0 - this.level * 0.45);
            const maxTime = Math.max(3.0, 9.0 - this.level * 0.7);
            this.turtleSpawnTimer = minTime + Math.random() * (maxTime - minTime);
        }

        this.seagullSpawnTimer -= dt;
        if (this.seagullSpawnTimer <= 0) {
            const sides = ['left', 'right', 'top'];
            const chosenSide = sides[Math.floor(Math.random() * sides.length)];
            
            let sx = 0, sy = 0;
            if (chosenSide === 'left') {
                sx = -50;
                sy = Math.random() * WORLD_DEPTH;
            } else if (chosenSide === 'right') {
                sx = WORLD_WIDTH + 50;
                sy = Math.random() * WORLD_DEPTH;
            } else {
                sx = Math.random() * WORLD_WIDTH;
                sy = -50;
            }

            let targetT: Turtle | null = null;
            const crawlingT = this.turtles.filter(t => t.state === 'crawling');
            if (crawlingT.length > 0) {
                targetT = crawlingT[Math.floor(Math.random() * crawlingT.length)];
            }

            this.seagulls.push(new Seagull(this, sx, sy, targetT, this.level));
            
            if (Math.random() < 0.8) {
                this.soundSystem.playSeagull();
                const alertBox = document.getElementById('hud-alert')!;
                alertBox.innerHTML = `<span><i class="fa-solid fa-triangle-exclamation"></i> SEAGULL SPOTTED!</span>`;
                alertBox.classList.remove('hidden');
                setTimeout(() => alertBox.classList.add('hidden'), 1800);
            }

            this.updateHUD();
            const minTime = Math.max(2.0, 6.5 - this.level * 0.65);
            const maxTime = Math.max(3.5, 11.0 - this.level * 1.0);
            this.seagullSpawnTimer = minTime + Math.random() * (maxTime - minTime);
        }
    }

    spawnDust(x: number, y: number, count = 2) {
        for (let i = 0; i < count; i++) {
            const vx = (Math.random() - 0.5) * 40;
            const vy = (Math.random() - 0.5) * 40;
            const vz = Math.random() * 20;
            const size = 2 + Math.random() * 3;
            const life = 0.3 + Math.random() * 0.4;
            this.particles.push(new PhaserParticle(this, x, y, 0, vx, vy, vz, 0xe5c080, size, life, 'dust'));
        }
    }

    spawnSplash(x: number, y: number, count = 5) {
        for (let i = 0; i < count; i++) {
            const vx = (Math.random() - 0.5) * 80;
            const vy = (Math.random() - 0.5) * 80;
            const vz = 60 + Math.random() * 100;
            const size = 1.5 + Math.random() * 2;
            const life = 0.4 + Math.random() * 0.4;
            this.particles.push(new PhaserParticle(this, x, y, 0, vx, vy, vz, 0xc7ecee, size, life, 'water'));
        }
    }

    spawnFeathers(x: number, y: number, z: number, count = 8) {
        for (let i = 0; i < count; i++) {
            const vx = (Math.random() - 0.5) * 120;
            const vy = (Math.random() - 0.5) * 120;
            const vz = 50 + Math.random() * 100;
            const size = 3 + Math.random() * 4;
            const life = 1.0 + Math.random() * 1.2;
            const color = Math.random() > 0.3 ? 0xffffff : 0xd2dae2;
            this.particles.push(new PhaserParticle(this, x, y, z, vx, vy, vz, color, size, life, 'feather'));
        }
    }

    spawnStars(x: number, y: number, count = 6) {
        for (let i = 0; i < count; i++) {
            const vx = (Math.random() - 0.5) * 50;
            const vy = (Math.random() - 0.5) * 50;
            const vz = 30 + Math.random() * 40;
            const size = 4 + Math.random() * 4;
            const life = 0.6 + Math.random() * 0.5;
            this.particles.push(new PhaserParticle(this, x, y, 0, vx, vy, vz, 0xffdd59, size, life, 'star'));
        }
    }

    drawBackground() {
        this.sandGraphics.clear();
        this.sandGraphics.fillStyle(0xe5be85, 1.0);
        this.sandGraphics.beginPath();
        
        const p1 = project(0, 0);
        const p2 = project(WORLD_WIDTH, 0);
        const p3 = project(WORLD_WIDTH, OCEAN_START_Y + 100);
        const p4 = project(0, OCEAN_START_Y + 100);
        
        this.sandGraphics.moveTo(p1.x, p1.y);
        this.sandGraphics.lineTo(p2.x, p2.y);
        this.sandGraphics.lineTo(p3.x, p3.y);
        this.sandGraphics.lineTo(p4.x, p4.y);
        this.sandGraphics.closePath();
        this.sandGraphics.fillPath();

        this.sandGraphics.fillStyle(0xdec08a, 1.0);
        this.sandGraphics.beginPath();
        const d1 = project(0, 0);
        const d2 = project(WORLD_WIDTH, 0);
        const d3 = project(WORLD_WIDTH, 45);
        const d4 = project(0, 45);
        this.sandGraphics.moveTo(d1.x, d1.y);
        this.sandGraphics.lineTo(d2.x, d2.y);
        this.sandGraphics.lineTo(d3.x, d3.y);
        this.sandGraphics.lineTo(d4.x, d4.y);
        this.sandGraphics.closePath();
        this.sandGraphics.fillPath();
        
        this.sandGraphics.fillStyle(0xe4c492, 1.0);
        for (let ix = 60; ix < WORLD_WIDTH; ix += 250) {
            this.sandGraphics.beginPath();
            const dp1 = project(ix - 80, 20);
            const dp2 = project(ix + 120, 20);
            const peak = project(ix + 20, 0, 18);
            this.sandGraphics.moveTo(dp1.x, dp1.y);
            
            const steps = 8;
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const cx = (1-t)*(1-t)*dp1.x + 2*(1-t)*t*peak.x + t*t*dp2.x;
                const cy = (1-t)*(1-t)*dp1.y + 2*(1-t)*t*peak.y + t*t*dp2.y;
                this.sandGraphics.lineTo(cx, cy);
            }
            this.sandGraphics.closePath();
            this.sandGraphics.fillPath();
        }

        this.sandGraphics.fillStyle(0xaa784b, 0.28);
        this.sandGraphics.beginPath();
        const ws1 = project(0, SHORELINE_Y - 40);
        const ws2 = project(WORLD_WIDTH, SHORELINE_Y - 40);
        const ws3 = project(WORLD_WIDTH, OCEAN_START_Y + 100);
        const ws4 = project(0, OCEAN_START_Y + 100);
        this.sandGraphics.moveTo(ws1.x, ws1.y);
        this.sandGraphics.lineTo(ws2.x, ws2.y);
        this.sandGraphics.lineTo(ws3.x, ws3.y);
        this.sandGraphics.lineTo(ws4.x, ws4.y);
        this.sandGraphics.closePath();
        this.sandGraphics.fillPath();

        this.waterGraphics.clear();
        this.waterGraphics.fillStyle(0x0984e3, 0.55);
        this.waterGraphics.beginPath();
        
        const crestP1 = project(0, this.waterLine);
        const crestP2 = project(WORLD_WIDTH, this.waterLine);
        const deepP1 = project(WORLD_WIDTH, WORLD_DEPTH + 100);
        const deepP2 = project(0, WORLD_DEPTH + 100);
        
        this.waterGraphics.moveTo(crestP1.x, crestP1.y);
        for (let wx = 0; wx <= WORLD_WIDTH; wx += 80) {
            const waveWobble = Math.sin(wx * 0.015 + this.waterCycle * 1.5) * 8;
            const wCoord = project(wx, this.waterLine + waveWobble);
            this.waterGraphics.lineTo(wCoord.x, wCoord.y);
        }
        this.waterGraphics.lineTo(crestP2.x, crestP2.y);
        this.waterGraphics.lineTo(deepP1.x, deepP1.y);
        this.waterGraphics.lineTo(deepP2.x, deepP2.y);
        this.waterGraphics.closePath();
        this.waterGraphics.fillPath();

        this.waterGraphics.lineStyle(4.0, 0xffffff, 0.75);
        this.waterGraphics.beginPath();
        const startFoam = project(0, this.waterLine);
        this.waterGraphics.moveTo(startFoam.x, startFoam.y);
        for (let wx = 0; wx <= WORLD_WIDTH; wx += 40) {
            const waveWobble = Math.sin(wx * 0.015 + this.waterCycle * 1.5) * 8;
            const microFoam = Math.cos(wx * 0.08 + this.waterCycle * 3.5) * 3;
            const wCoord = project(wx, this.waterLine + waveWobble + microFoam);
            this.waterGraphics.lineTo(wCoord.x, wCoord.y);
        }
        this.waterGraphics.strokePath();

        this.waterGraphics.fillStyle(0xffffff, 0.35);
        for (let wx = 30; wx < WORLD_WIDTH; wx += 120) {
            const waveWobble = Math.sin(wx * 0.015 + this.waterCycle * 1.5) * 8;
            const bubbleCoord = project(wx + Math.sin(this.waterCycle)*10, this.waterLine + waveWobble + 6);
            this.waterGraphics.fillCircle(bubbleCoord.x, bubbleCoord.y, 2);
        }
    }

    handleResize(_w: number, _h: number) {}
}
