import { Injectable } from '@angular/core';

import { RestoreWarning } from '../models/graph.model';

@Injectable({ providedIn: 'root' })
export class CreateGraphWarningsService {
    private pendingWarnings: RestoreWarning[] = [];

    setPending(warnings: RestoreWarning[]): void {
        this.pendingWarnings = warnings;
    }

    readPending(): RestoreWarning[] {
        const warnings = this.pendingWarnings;
        this.pendingWarnings = [];
        return warnings;
    }
}
