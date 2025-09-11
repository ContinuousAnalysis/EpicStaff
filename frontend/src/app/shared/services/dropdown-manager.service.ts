import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
    providedIn: 'root',
})
export class DropdownManagerService {
    private activeDropdownSubject = new BehaviorSubject<string | null>(null);
    public activeDropdown$ = this.activeDropdownSubject.asObservable();

    /**
     * Opens a dropdown and closes any other open dropdown
     * @param dropdownId Unique identifier for the dropdown
     */
    openDropdown(dropdownId: string): void {
        this.activeDropdownSubject.next(dropdownId);
    }

    /**
     * Closes the specified dropdown
     * @param dropdownId Unique identifier for the dropdown
     */
    closeDropdown(dropdownId: string): void {
        const currentActive = this.activeDropdownSubject.value;
        if (currentActive === dropdownId) {
            this.activeDropdownSubject.next(null);
        }
    }

    /**
     * Closes all dropdowns
     */
    closeAllDropdowns(): void {
        this.activeDropdownSubject.next(null);
    }

    /**
     * Checks if a specific dropdown is currently active
     * @param dropdownId Unique identifier for the dropdown
     * @returns true if the dropdown is active
     */
    isDropdownActive(dropdownId: string): boolean {
        return this.activeDropdownSubject.value === dropdownId;
    }

    /**
     * Gets the currently active dropdown ID
     * @returns the active dropdown ID or null
     */
    getActiveDropdown(): string | null {
        return this.activeDropdownSubject.value;
    }
}
