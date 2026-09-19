import { clamp } from "../../utils/clamp";
import { ConfigType, type ConfigTypeProps } from "./_type";

export type NumberConfigType = number;

export type NumberConfigProps = ConfigTypeProps<NumberConfigType> & {
    min: number;
    max: number;
    step: number;
};

export class NumberConfig extends ConfigType<NumberConfigType> {
    public min: number;
    public max: number;
    public step: number;

    constructor(props: NumberConfigProps) {
        super(props);
        this.min = props.min;
        this.max = props.max;
        this.step = props.step;
    }

    public set(value: NumberConfigType) {
        if (!Number.isFinite(value)) {
            return;
        }

        const clamped = clamp(value, this.min, this.max);
        super.set(clamped);
    }

    public attachToElement(element: HTMLInputElement) {
        element.min = String(this.min);
        element.max = String(this.max);
        element.step = String(this.step);
        element.value = String(this.value);
        element.addEventListener("change", () => {
            const value = Number(element.value);
            this.set(value);
            if (this.value !== value) element.value = String(this.value);
        });
    }
}
