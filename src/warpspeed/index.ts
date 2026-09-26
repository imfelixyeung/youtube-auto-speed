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
        this.pz = 500;
        this.z = init ? Math.random() * this.pz : this.pz;
    }

    public tick() {
        this.pz = this.z;
        this.z -= this.options.speed;

        if (this.z <= 0) return this.random();
    }

    private static readonly PROJECTION_CONSTANT = 100;
    public draw(ctx: CanvasRenderingContext2D) {
        const { width, height, cx, cy } = this.options;
        // Perspective projection part 1.
        const x = cx + (this.x / this.z) * Star.PROJECTION_CONSTANT;
        const y = cy + (this.y / this.z) * Star.PROJECTION_CONSTANT;

        // Don't draw stars that haven't entered the visible area yet.
        if (x < 0 || x > width || y < 0 || y > height) {
            return;
        }

        // Perspective projection part 2.
        const px = cx + (this.x / this.pz) * Star.PROJECTION_CONSTANT;
        const py = cy + (this.y / this.pz) * Star.PROJECTION_CONSTANT;

        const brightness = Math.min(1, 1000 / this.z);

        ctx.strokeStyle = `rgba(255,255,255,${brightness})`;
        ctx.lineWidth = Math.max(1, brightness * 2);

        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
        ctx.stroke();
    }
}

export class Warpspeed {
    private STAR_COUNT = 500;
    private ctx: CanvasRenderingContext2D;
    private options: Options;
    private stars: Star[];
    private currentSpeed = 1;
    private targetSpeed = 1;
    private acceleration = 0.08;

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

    public tick() {
        this.currentSpeed +=
            (this.targetSpeed - this.currentSpeed) * this.acceleration;

        if (Math.abs(this.targetSpeed - this.currentSpeed) < 0.001) {
            this.currentSpeed = this.targetSpeed;
        }

        this.options.speed = this.currentSpeed;
        this.stars.forEach((star) => void star.tick());
    }

    public draw() {
        this.ctx.clearRect(0, 0, this.options.width, this.options.height);
        this.stars.forEach((star) => void star.draw(this.ctx));
    }

    public setSpeed(speed: number) {
        this.targetSpeed = Math.max(0, speed);
    }
}
