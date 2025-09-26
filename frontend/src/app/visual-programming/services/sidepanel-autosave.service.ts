import { Injectable, signal } from '@angular/core';

@Injectable({
    providedIn: 'root',
})
export class SidepanelAutosaveService {
    private readonly _autosaveTrigger = signal<string | null>(null);

    public readonly autosaveTrigger = this._autosaveTrigger.asReadonly();

    public triggerAutosave(triggerId?: string): void {
        this._autosaveTrigger.set(triggerId || Date.now().toString());
    }

    public clearTrigger(): void {
        this._autosaveTrigger.set(null);
    }
}
