import { Injectable } from '@angular/core';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { SettingsDialogComponent } from './settings-dialog.component';

@Injectable({
  providedIn: 'root',
})
export class SettingsDialogService {
  private readonly DIALOG_ID = 'settings-dialog';
  private dialogRef: DialogRef<void> | null = null;
  private onDialogOpenCallback: (() => void) | null = null;

  public constructor(private readonly dialog: Dialog) {}

  public setOnDialogOpenCallback(callback: () => void): void {
    this.onDialogOpenCallback = callback;
  }

  public clearOnDialogOpenCallback(): void {
    this.onDialogOpenCallback = null;
  }

  public closeSettingsDialog(): void {
    console.log('[SettingsDialogService] closeSettingsDialog called');
    console.log('[SettingsDialogService] dialogRef:', this.dialogRef);
    
    if (this.dialogRef) {
      console.log('[SettingsDialogService] Closing dialog via dialogRef');
      this.dialogRef.close();
      this.dialogRef = null;
      console.log('[SettingsDialogService] Dialog closed, dialogRef set to null');
    } else {
      console.log('[SettingsDialogService] dialogRef is null, trying fallback by ID');
      // Fallback: try to close by ID
      const existingDialog = this.dialog.getDialogById(this.DIALOG_ID);
      console.log('[SettingsDialogService] Existing dialog by ID:', existingDialog);
      if (existingDialog) {
        console.log('[SettingsDialogService] Closing dialog via ID fallback');
        existingDialog.close();
      } else {
        console.warn('[SettingsDialogService] No dialog found to close (neither dialogRef nor by ID)');
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

    console.log('[SettingsDialogService] Dialog opened, dialogRef:', this.dialogRef);
    console.log('[SettingsDialogService] Dialog ID:', this.DIALOG_ID);

    // Call callback when dialog opens (for handling tour step)
    if (this.onDialogOpenCallback) {
      // Use small delay to allow dialog to open
      setTimeout(() => {
        this.onDialogOpenCallback?.();
      }, 100);
    }

    // Clear reference when dialog closes
    this.dialogRef.closed.subscribe(() => {
      console.log('[SettingsDialogService] Dialog closed event received, clearing dialogRef');
      this.dialogRef = null;
    });

    return this.dialogRef;
  }
}
