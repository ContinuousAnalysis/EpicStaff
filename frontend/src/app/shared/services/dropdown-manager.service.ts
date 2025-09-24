import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
    providedIn: 'root',
})
export class DropdownManagerService {
    private activeDropdownSubject = new BehaviorSubject<string | null>(null);
    public activeDropdown$ = this.activeDropdownSubject.asObservable();

    openDropdown(dropdownId: string): void {
        this.activeDropdownSubject.next(dropdownId);
    }

    closeDropdown(dropdownId: string): void {
        const currentActive = this.activeDropdownSubject.value;
        if (currentActive === dropdownId) {
            this.activeDropdownSubject.next(null);
        }
    }

    closeAllDropdowns(): void {
        this.activeDropdownSubject.next(null);
    }

    isDropdownActive(dropdownId: string): boolean {
        return this.activeDropdownSubject.value === dropdownId;
    }

    getActiveDropdown(): string | null {
        return this.activeDropdownSubject.value;
    }
}
