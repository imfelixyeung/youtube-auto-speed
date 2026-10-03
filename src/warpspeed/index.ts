type Options = {
    width: number;
    height: number;
    cx: number;
    cy: number;
    speed: number;
};

class Star {
    private normalisedX: number = 0;
    public x: number = 0;
    private normalisedY: number = 0;
    public y: number = 0;
    public z: number = 0;
    public pz: number = 0;
    private initialZ: number = 0;

    // Cached render state calculated in tick()
    private headX: number = 0;
    private headY: number = 0;
    private tailX: number = 0;
    private tailY: number = 0;
    private isOffscreen: boolean = true;

    constructor(private options: Options) {
        this.random(true);
    }

    public calcFromOptions() {
        this.x = this.normalisedX * this.options.width;
        this.y = this.normalisedY * this.options.height;
    }

    public random(init: boolean = false) {
        this.normalisedX = Math.random() - 0.5;
        this.normalisedY = Math.random() - 0.5;
        this.calcFromOptions();
        if (init) {
            this.z = Math.random() * 500;
            this.initialZ = this.z;
        } else {
            this.z = this.initialZ;
        }
        this.pz = this.z;
        this.isOffscreen = true;
    }

    private static readonly PROJECTION_CONSTANT = 100;
    public tick(delta: number) {
        this.pz = this.z;
        this.z -= this.options.speed * delta;

        const headZ = Math.max(this.z, 0.0001);
        const tailZ = Math.max(this.pz, 0.0001);

        const { cx, cy } = this.options;

        // Compute perspective projection once per tick
        const headScale = Star.PROJECTION_CONSTANT / headZ;
        const tailScale = Star.PROJECTION_CONSTANT / tailZ;

        this.headX = cx + this.x * headScale;
        this.headY = cy + this.y * headScale;
        this.tailX = cx + this.x * tailScale;
        this.tailY = cy + this.y * tailScale;

        this.setIsOffScreen();

        // Respawn when z reaches limit or both ends leave the viewport
        if (this.z <= 0 || this.isOffscreen) {
            this.random();
        }
    }

    private setIsOffScreen() {
        const { width, height } = this.options;
        const { headX, headY, tailX, tailY } = this;
        const headOff =
            headX < 0 || headX > width || headY < 0 || headY > height;
        const tailOff =
            tailX < 0 || tailX > width || tailY < 0 || tailY > height;

        this.isOffscreen = headOff && tailOff;
    }

    private static readonly STAR_TRAIL_HEAD = "rgba(240, 240, 255, 1)";
    private static readonly STAR_TRAIL_TAIL = "rgba(255, 240, 240, 0)";
    public draw(ctx: CanvasRenderingContext2D) {
        if (this.isOffscreen) return;
        const { headX, headY, tailX, tailY } = this;

        // Draw gradient if length > 0, otherwise standard line
        if (tailX !== headX || tailY !== headY) {
            const gradient = ctx.createLinearGradient(
                tailX,
                tailY,
                headX,
                headY,
            );
            gradient.addColorStop(0, Star.STAR_TRAIL_TAIL);
            gradient.addColorStop(1, Star.STAR_TRAIL_HEAD);
            ctx.strokeStyle = gradient;
        } else {
            ctx.strokeStyle = Star.STAR_TRAIL_HEAD;
        }

        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(headX, headY);
        ctx.stroke();
    }
}

export class Warpspeed {
    private STAR_COUNT = 1000;
    private ctx: CanvasRenderingContext2D;
    private options: Options;
    private stars: Star[];
    private currentSpeed = 1;
    private targetSpeed = 1;

    private smoothingRate = 5;
    private static readonly TARGET_FPS = 60;

    private constructor(private canvas: HTMLCanvasElement) {
        const ctx = canvas.getContext("2d");
        if (ctx === null) {
            throw new Error("Unable to get canvas context");
        }
        this.ctx = ctx;
        this.options = {
            width: 1,
            height: 1,
            speed: 1,
            cx: 1,
            cy: 1,
        };
        this.updateSize();

        this.stars = Array.from({ length: this.STAR_COUNT })
            .fill(null)
            .map(() => new Star(this.options));

        const observer = new ResizeObserver(this.onResize);
        observer.observe(canvas);
    }

    private onResize = () => {
        this.updateSize();
        this.stars.forEach((star) => void star.calcFromOptions());
    };

    private updateSize() {
        const dpr = window.devicePixelRatio;
        const { clientWidth: width, clientHeight: height } = this.canvas;
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.options.height = height;
        this.options.width = width;
        this.options.cx = width / 2;
        this.options.cy = height / 2;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    public static instance(canvas: HTMLCanvasElement) {
        try {
            return new Warpspeed(canvas);
        } catch (error) {
            console.error("Error creating Warpspeed instance", error);
            return null;
        }
    }

    public tick(delta: number) {
        // Clamp delta time to avoid large jumps when switching tabs (max 100ms)
        const dt = Math.min(delta, 0.1);
        const deltaFactor = dt * Warpspeed.TARGET_FPS;

        // Exponential decay interpolation for frame-rate independent smooth acceleration
        const lerpFactor = 1 - Math.exp(-this.smoothingRate * dt);
        this.currentSpeed +=
            (this.targetSpeed - this.currentSpeed) * lerpFactor;

        if (Math.abs(this.targetSpeed - this.currentSpeed) < 0.001) {
            this.currentSpeed = this.targetSpeed;
        }

        this.options.speed = this.currentSpeed;
        this.stars.forEach((star) => void star.tick(deltaFactor));
    }

    public draw() {
        this.ctx.clearRect(0, 0, this.options.width, this.options.height);
        this.stars.forEach((star) => void star.draw(this.ctx));
    }

    public setSpeed(speed: number) {
        this.targetSpeed = Math.max(0, speed);
    }
}
