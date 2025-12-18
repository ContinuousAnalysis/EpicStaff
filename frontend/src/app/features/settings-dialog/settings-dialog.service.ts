import { Injectable } from '@angular/core';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { SettingsDialogComponent, TabId } from './settings-dialog.component';
import { ShepherdService } from 'angular-shepherd';

@Injectable({
  providedIn: 'root',
})
export class SettingsDialogService {
  private readonly DIALOG_ID = 'settings-dialog';
  private dialogRef: DialogRef<void> | null = null;
  private onDialogOpenCallback: (() => void) | null = null;

  public constructor(
    private readonly dialog: Dialog,
    private readonly shepherdService: ShepherdService
  ) {}

  public setOnDialogOpenCallback(callback: () => void): void {
    this.onDialogOpenCallback = callback;
  }

  public clearOnDialogOpenCallback(): void {
    this.onDialogOpenCallback = null;
  }

  public closeSettingsDialog(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
      this.dialogRef = null;
    } else {
      // Fallback: try to close by ID
      const existingDialog = this.dialog.getDialogById(this.DIALOG_ID);
      if (existingDialog) {
        existingDialog.close();
      }
    }
  }

  public openSettingsDialog(): DialogRef<void> | null {
    // Check if dialog is already open by ID
    const existingDialog = this.dialog.getDialogById(this.DIALOG_ID);
    
    if (existingDialog) {
      // Dialog already open, don't open again
      return null;
    }

    // Check if Shepherd tour is active (to disable dialog backdrop)
    const isShepherdTourActive = !!document.querySelector('.shepherd-modal-overlay-container.shepherd-modal-is-visible');

    // Open new dialog
    this.dialogRef = this.dialog.open<void>(SettingsDialogComponent, {
      id: this.DIALOG_ID,
      width: '950px',
      maxWidth: '95vw',
      height: '700px',
      maxHeight: '95vh',
      // Disable backdrop if Shepherd tour is active (to avoid double darkening)
      // hasBackdrop: !isShepherdTourActive,
    });

    // Call callback when dialog opens (for handling tour step)
    if (this.onDialogOpenCallback) {
      // Use small delay to allow dialog to open
      setTimeout(() => {
        this.onDialogOpenCallback?.();
      }, 100);
    }

    // Clear reference when dialog closes
    this.dialogRef.closed.subscribe(() => {
      this.dialogRef = null;
    });

    return this.dialogRef;
  }

  public selectTab(tabId: TabId): void {
    // Try to use saved dialogRef first
    if (this.dialogRef) {
      const componentInstance = (this.dialogRef as any).componentRef?.instance as SettingsDialogComponent;
      if (componentInstance && typeof componentInstance.selectTab === 'function') {
        componentInstance.selectTab(tabId);
        return;
      }
    }

    // Try to get dialog by ID
    const existingDialog = this.dialog.getDialogById(this.DIALOG_ID);
    if (existingDialog) {
      const componentInstance = (existingDialog as any).componentRef?.instance as SettingsDialogComponent;
      if (componentInstance && typeof componentInstance.selectTab === 'function') {
        componentInstance.selectTab(tabId);
        return;
      }
    }

    // Fallback: try to find and click the tab button in DOM
    const dialogContainer = document.querySelector('.cdk-dialog-container');
    if (dialogContainer) {
      const tabButtons = dialogContainer.querySelectorAll('.tab-button');
      for (let i = 0; i < tabButtons.length; i++) {
        const button = tabButtons[i] as HTMLElement;
        const label = button.textContent?.trim();
        if (tabId === TabId.LLM && label === 'LLM Models') {
          button.click();
          return;
        }
      }
    }
  }

  public returnTourToSecondStep(): void {
    try {
      // Check if tour is active
      const isShepherdTourActive = !!document.querySelector('.shepherd-modal-overlay-container.shepherd-modal-is-visible');
      if (!isShepherdTourActive) {
        return;
      }

      const tour = (this.shepherdService as any)?.tourObject;
      if (tour && typeof tour.show === 'function') {
        // Second step has index 1 (0-based indexing: intro=0, settings=1)
        tour.show(1);
      }
    } catch (error) {
      // Silently handle tour navigation errors
    }
  }
}
