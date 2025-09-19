import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PanelSyncService {
    private persistSubject = new Subject<void>();
    public readonly persist$ = this.persistSubject.asObservable();

    public requestPersist(): void {
        this.persistSubject.next();
    }
}
