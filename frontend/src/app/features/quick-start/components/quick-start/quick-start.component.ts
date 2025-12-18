import {
  ChangeDetectionStrategy,
  Component,
  AfterViewInit,
  OnDestroy,
  Renderer2,
} from '@angular/core';
import { ShepherdService } from 'angular-shepherd';
import { steps as defaultSteps } from '../tour-step/tour-step';
import { CommonModule } from '@angular/common';
import { SettingsDialogService } from '../../../settings-dialog/settings-dialog.service';
import { QuickstartStatusService } from '../../services/quickstart-status.service';
import { TourStepModifierService, StepModifierContext } from '../../services/tour-step-modifier.service';
import { OpenAiApiKeyValidatorService } from '../../services/openai-api-key-validator.service';
import { firstValueFrom } from 'rxjs';
import { findSettingsStepElement, isElementVisible } from '../../helpers/element-finder.helper';
import { TOUR_DELAYS } from '../../constants/tour-constants';

@Component({
  selector: 'app-quick-start',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './quick-start.component.html',
  styleUrls: ['./quick-start.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickStartComponent implements AfterViewInit, OnDestroy {
  private dialogOpenCallback: (() => void) | null = null;
  private tourStartTimeoutId: number | null = null;
  private dialogCallbackTimeoutId: number | null = null;

  constructor(
    private shepherdService: ShepherdService,
    private settingsDialogService: SettingsDialogService,
    private renderer: Renderer2,
    private quickstartStatusService: QuickstartStatusService,
    private tourStepModifierService: TourStepModifierService,
    private openAiApiKeyValidatorService: OpenAiApiKeyValidatorService
  ) {}

  async ngAfterViewInit(): Promise<void> {
    const shouldStart = await this.checkQuickstartStatus();
    // if (shouldStart) {
      this.initializeTour();
    // }
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  private async checkQuickstartStatus(): Promise<boolean> {
    try {
      const status = await firstValueFrom(this.quickstartStatusService.getStatus());
      return !status.quickstart_completed;
    } catch (error) {
      // In case of error, start tour (fallback behavior)
      return true;
    }
  }

  private initializeTour(): void {
    this.setupDialogCallback();
    this.setupTourOptions();
    const modifiedSteps = this.modifySteps();
    this.shepherdService.addSteps(modifiedSteps);
    this.setupTourEvents();

    // Start tour with delay so DOM is fully loaded
    this.tourStartTimeoutId = window.setTimeout(() => {
      this.shepherdService.start();
      this.tourStartTimeoutId = null;
    }, TOUR_DELAYS.TOUR_START);
  }

  private setupDialogCallback(): void {
    this.dialogOpenCallback = () => {
      const settingsStepElement = findSettingsStepElement();
      if (settingsStepElement && isElementVisible(settingsStepElement)) {
        // Clear previous timeout if exists
        if (this.dialogCallbackTimeoutId !== null) {
          clearTimeout(this.dialogCallbackTimeoutId);
        }
        
        this.dialogCallbackTimeoutId = window.setTimeout(() => {
          this.shepherdService.next();
          this.dialogCallbackTimeoutId = null;
        }, TOUR_DELAYS.DIALOG_TRANSITION);
      }
    };

    this.settingsDialogService.setOnDialogOpenCallback(this.dialogOpenCallback);
  }

  private setupTourOptions(): void {
    this.shepherdService.defaultStepOptions = {
      classes: 'epic-staff-tour',
      scrollTo: false,
      // Don't set cancelIcon here - let individual steps control it
    };

    this.shepherdService.modal = true;
    this.shepherdService.confirmCancel = false;
  }
    
  private modifySteps(): any[] {
    const totalSteps = defaultSteps.length;
    const context: StepModifierContext = {
      shepherdService: this.shepherdService,
      settingsDialogService: this.settingsDialogService,
      quickstartStatusService: this.quickstartStatusService,
      renderer: this.renderer,
      totalSteps,
      currentStepNumber: 0, // Will be set per step
      openAiApiKeyValidatorService: this.openAiApiKeyValidatorService,
    };

    return defaultSteps.map((step, index) => {
      const currentStepNumber = index + 1;
      context.currentStepNumber = currentStepNumber;

      // Apply modifiers in order
      let modifiedStep = this.tourStepModifierService.modifyIntroStep(step, context);
      modifiedStep = this.tourStepModifierService.modifySettingsStep(modifiedStep, context);
      modifiedStep = this.tourStepModifierService.modifyQuickstartTabStep(modifiedStep, context);
      modifiedStep = this.tourStepModifierService.modifyApiKeyInputStep(modifiedStep, context);
      modifiedStep = this.tourStepModifierService.modifyStartBuildingButtonStep(modifiedStep, context);
      modifiedStep = this.tourStepModifierService.modifyGenericStep(modifiedStep, context);

        return modifiedStep;
    });
  }

  private setupTourEvents(): void {
    const tour = (this.shepherdService as any)?.tourObject;

    if (!tour) {
      return;
    }

    // Mark tour as completed when user clicks Skip
    tour.once('cancel', () => {
      this.quickstartStatusService.updateStatus(true).subscribe({
        error: () => {
          // Silently handle status update errors
        },
      });
    });
  }

  private cleanup(): void {
    // Clear all timeouts
    if (this.tourStartTimeoutId !== null) {
      clearTimeout(this.tourStartTimeoutId);
      this.tourStartTimeoutId = null;
    }
    
    if (this.dialogCallbackTimeoutId !== null) {
      clearTimeout(this.dialogCallbackTimeoutId);
      this.dialogCallbackTimeoutId = null;
    }
    
    // Clear dialog callback
    if (this.dialogOpenCallback) {
      this.settingsDialogService.clearOnDialogOpenCallback();
      this.dialogOpenCallback = null;
    }
  }
}
