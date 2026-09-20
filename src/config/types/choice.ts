import { ConfigType, type ConfigTypeProps } from "./_type";

export type ChoiceConfigType = string;

export type ChoiceOption<T extends ChoiceConfigType, M = T> = {
    value: T;
    label?: string;
    mapped: M;
};

export type ChoiceConfigProps<
    T extends ChoiceConfigType,
    M,
> = ConfigTypeProps<T> & {
    options: ChoiceOption<T, M>[];
};

export class ChoiceConfig<T extends ChoiceConfigType, M> extends ConfigType<
    T,
    HTMLSelectElement
> {
    public options: ChoiceOption<T, M>[];
    public defaultMappedValue: M;
    public mappedValue: M;

    constructor(props: ChoiceConfigProps<T, M>) {
        super(props);
        this.options = props.options;
        const defaultOption = this.options.find(
            (o) => o.value === this.defaultValue,
        );
        if (!defaultOption) {
            throw new Error("Invalid default value");
        }
        this.defaultMappedValue = defaultOption.mapped;
        this.mappedValue = this.defaultMappedValue;
    }

    public setWithoutSaving(value: T) {
        if (!this.isValidOption(value)) {
            return;
        }

        const option = this.findOption(value);
        if (option) this.mappedValue = option.mapped;
        super.setWithoutSaving(value);
    }

    private findOption(value: string): ChoiceOption<T, M> | null {
        const option = this.options.find((o) => o.value === value);
        return option ?? null;
    }

    public isValidOption(value: string): value is T {
        return this.findOption(value) !== null;
    }

    protected createFormField(id: string): HTMLSelectElement {
        const $select = document.createElement("select");
        $select.id = id;
        $select.className = "select";
        this.options.forEach((option) => {
            const $option = document.createElement("option");
            $option.value = option.value;
            $option.innerText = option.label ?? option.value;
            $option.defaultSelected = option.value === this.defaultValue;
            $select.appendChild($option);
        });
        return $select;
    }

    public attachToElement(element: HTMLSelectElement) {
        element.value = String(this.value);
        element.addEventListener("change", () => {
            const value = element.value;
            if (!this.isValidOption(value)) return;
            this.set(value);
            if (this.value !== value) element.value = String(this.value);
        });

        this.listen((v) => {
            const newValue = String(v);
            if (element.value === newValue) {
                return;
            }
            element.value = newValue;
        });
    }
}
