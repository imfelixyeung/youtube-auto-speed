import { ConfigType, type ConfigTypeProps } from "./_type";

export type BooleanConfigType = boolean;

export type BooleanConfigProps = ConfigTypeProps<BooleanConfigType>;

export class BooleanConfig extends ConfigType<BooleanConfigType> {
    public attachToElement(element: HTMLInputElement) {
        element.type = "checkbox";
        element.className = "toggle";
        element.addEventListener("change", () => {
            const value = element.checked;
            this.set(element.checked);
            if (this.value !== value) element.checked = this.value;
        });

        this.listen((v) => {
            const newValue = v;
            if (element.checked === newValue) {
                return;
            }
            element.checked = newValue;
        });
    }
}
