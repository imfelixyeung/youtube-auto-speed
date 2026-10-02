import { Emitter, type Listener } from "strict-event-emitter";
import { z } from "zod";

export type ConfigTypeProps<T> = {
    displayName: string;
    storageKey: string;
    defaultValue: T;
};

export abstract class ConfigType<
    T,
    FieldElement extends HTMLElement = HTMLInputElement,
> {
    public displayName: string;
    public storageKey: string;
    public value: T;
    public defaultValue: T;
    private emitter = new Emitter<{
        change: [value: T];
    }>();
    protected schema: z.ZodType<T> | null = null;

    /**
     * Child classes must set {@link schema} and call {@link linkStorage}
     */
    constructor(props: ConfigTypeProps<T>) {
        this.displayName = props.displayName;
        this.storageKey = props.storageKey;
        this.defaultValue = props.defaultValue;
        this.value = this.defaultValue;
    }

    protected linkStorage() {
        const handleStorageValue = (value: T) => {
            if (value === undefined) return;
            if (this.schema === null) return this.setWithoutSaving(value);
            const parsed = this.schema.safeParse(value);
            if (parsed.error) return;
            this.setWithoutSaving(parsed.data);
        };

        chrome.storage.sync.get([this.storageKey], (result) => {
            handleStorageValue(result[this.storageKey] as T);
        });
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "sync") return;
            handleStorageValue(changes[this.storageKey]?.newValue as T);
        });
    }

    protected makeSchema(): z.ZodType<T> {
        return z.any();
    }

    public set(value: T) {
        this.setWithoutSaving(value);
        chrome.storage.sync.set({ [this.storageKey]: value });
    }

    public setWithoutSaving(value: T) {
        this.value = value;
        this.emitter.emit("change", this.value);
    }

    public listen(listener: Listener<[value: T]>) {
        listener(this.value);
        this.emitter.addListener("change", listener);
    }

    protected createFormField(id: string): FieldElement {
        const input = document.createElement("input");
        input.id = id;
        return input as unknown as FieldElement;
    }

    public addFormElement(): [HTMLElement, FieldElement] {
        const id = `config-${this.storageKey}`;

        const label = document.createElement("label");
        label.htmlFor = id;
        label.className = "label row";

        const span = document.createElement("span");
        span.innerText = this.displayName;

        const field = this.createFormField(id);

        label.appendChild(span);
        label.appendChild(field);
        return [label, field];
    }

    public abstract attachToElement(element: FieldElement): void;

    public addAndAttachToElement(): [HTMLElement, FieldElement] {
        const [html, input] = this.addFormElement();
        this.attachToElement(input);
        return [html, input];
    }
}
