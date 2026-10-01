export class TimedInterval<D = void> {
    public data: D;

    constructor(start: number, end: number);
    constructor(start: number, end: number, data: D);
    constructor(
        public start: number,
        public end: number,
        data?: D,
    ) {
        this.data = data as D;
    }
}
