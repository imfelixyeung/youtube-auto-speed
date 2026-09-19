import { ConfigType, type ConfigTypeProps } from "./_type";

export type BooleanConfigType = boolean;

export type BooleanConfigProps = ConfigTypeProps<BooleanConfigType>;

export class BooleanConfig extends ConfigType<BooleanConfigType> {
    public attachToElement(element: HTMLInputElement) {
        element.addEventListener("change", () => {
            const value = element.checked;
            this.set(element.checked);
            if (this.value !== value) element.value = String(this.value);
        });
    }
}
