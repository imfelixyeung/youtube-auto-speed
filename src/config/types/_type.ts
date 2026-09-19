import { Emitter, type Listener } from "strict-event-emitter";

export type ConfigTypeProps<T> = {
    storageKey: string;
    defaultValue: T;
};

export abstract class ConfigType<T> {
    public storageKey: string;
    public value: T;
    public defaultValue: T;
    private emitter = new Emitter<{
        change: [value: T];
    }>();

    constructor(props: ConfigTypeProps<T>) {
        this.storageKey = props.storageKey;
        this.defaultValue = props.defaultValue;
        this.value = this.defaultValue;

        chrome.storage.sync.get([this.storageKey], (result) => {
            this.setWithoutSaving(result[this.storageKey] as T);
        });
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "sync") return;
            this.setWithoutSaving(changes[this.storageKey]?.newValue as T);
        });
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

    public abstract attachToElement(element: HTMLElement): void;
}
