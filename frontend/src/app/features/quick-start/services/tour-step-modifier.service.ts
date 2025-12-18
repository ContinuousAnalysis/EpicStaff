import { Injectable, Renderer2 } from '@angular/core';
import { ShepherdService } from 'angular-shepherd';
import { SettingsDialogService } from '../../settings-dialog/settings-dialog.service';
import { QuickstartStatusService } from './quickstart-status.service';
import { OpenAiApiKeyValidatorService } from './openai-api-key-validator.service';
import { TabId } from '../../settings-dialog/settings-dialog.component';
import { TOUR_SELECTORS, TOUR_DELAYS, TOUR_BUTTON_TEXTS } from '../constants/tour-constants';
import { findApiKeyInput } from '../helpers/element-finder.helper';

export interface StepModifierContext {
  shepherdService: ShepherdService;
  settingsDialogService: SettingsDialogService;
  quickstartStatusService: QuickstartStatusService;
  renderer: Renderer2;
  totalSteps: number;
  currentStepNumber: number;
  openAiApiKeyValidatorService: OpenAiApiKeyValidatorService;
}

@Injectable({
  providedIn: 'root',
})
export class TourStepModifierService {
  modifyIntroStep(step: any, context: StepModifierContext): any {
    // Step 1 (intro): Add custom next button action to properly close first step before showing second
    if (step.id === 'intro') {
      if (step.buttons) {
        const nextButton = step.buttons.find((btn: any) => btn.type === 'next');
        if (nextButton) {
          nextButton.action = () => {
            // Explicitly go to next step - this ensures first step is properly hidden
            context.shepherdService.next();
          };
        }
      }
      
      // Ensure first step is properly hidden before showing second step
      if (!step.when) {
        step.when = {};
      }
      const originalHide = step.when.hide;
      step.when.hide = function() {
        // Call original hide handler if it exists
        if (originalHide) {
          originalHide.call(this);
        }
        // Force hide the step element
        const stepElement = (this as any).el;
        if (stepElement) {
          stepElement.style.display = 'none';
          stepElement.style.visibility = 'hidden';
          stepElement.style.opacity = '0';
        }
      };
    }
    return step;
  }

  modifySettingsStep(step: any, context: StepModifierContext): any {
    return step;
  }

  modifyQuickstartTabStep(step: any, context: StepModifierContext): any {
    // Step 3 (quickstart-tab): Add click handler to automatically transition to next step when quickstart tab is clicked
    if (step.id === 'quickstart-tab') {
      // Ensure when object exists
      if (!step.when) {
        step.when = {};
      }
      
      // Store unlisten function and timeout IDs in step object to access them in hide handler
      const stepData: { 
        unlisten?: () => void;
        setupTimeoutId?: number | null;
        retryTimeoutId?: number | null;
        nextStepTimeoutId?: number | null;
      } = {};
      
      const originalShow = step.when.show;
      step.when.show = function() {
        // Call original show handler if it exists
        if (originalShow) {
          originalShow.call(this);
        }
        
        // Set up click handler on quickstart tab button
        const setupClickHandler = () => {
          // Clear retry timeout if it was set
          if (stepData.retryTimeoutId !== null && stepData.retryTimeoutId !== undefined) {
            clearTimeout(stepData.retryTimeoutId);
            stepData.retryTimeoutId = null;
          }
          
          // Find the button with "Quickstart" text
          const dialogContainer = document.querySelector(TOUR_SELECTORS.DIALOG_CONTAINER);
          if (!dialogContainer) {
            // Retry if dialog container not found yet
            stepData.retryTimeoutId = window.setTimeout(setupClickHandler, 100);
            return;
          }
          
          const tabButtons = dialogContainer.querySelectorAll(TOUR_SELECTORS.QUICKSTART_TAB_BUTTON);
          let targetButton: HTMLElement | null = null;
          
          for (let i = 0; i < tabButtons.length; i++) {
            const button = tabButtons[i] as HTMLElement;
            if (button.textContent?.trim() === TOUR_BUTTON_TEXTS.QUICKSTART) {
              targetButton = button;
              break;
            }
          }
          
          if (targetButton) {
            // Clean up previous handler if exists
            if (stepData.unlisten) {
              stepData.unlisten();
              stepData.unlisten = undefined;
            }
            
            // Add click handler using native addEventListener with capture phase to catch event early
            const clickHandler = (event: Event) => {
              // Small delay to ensure tab is switched before showing next step
              stepData.nextStepTimeoutId = window.setTimeout(() => {
                stepData.nextStepTimeoutId = null;
                context.shepherdService.next();
              }, TOUR_DELAYS.DIALOG_TRANSITION);
            };
            
            targetButton.addEventListener('click', clickHandler, true); // Use capture phase
            
            // Store cleanup function
            const buttonRef = targetButton; // Store reference for cleanup
            stepData.unlisten = () => {
              if (buttonRef) {
                buttonRef.removeEventListener('click', clickHandler, true);
              }
            };
          } else {
            // Retry if button not found yet
            stepData.retryTimeoutId = window.setTimeout(setupClickHandler, 100);
          }
        };
        
        // Setup click handler with a small delay to ensure DOM is ready
        stepData.setupTimeoutId = window.setTimeout(setupClickHandler, TOUR_DELAYS.CLICK_HANDLER_SETUP);
      };
      
      const originalHide = step.when.hide;
      step.when.hide = function() {
        // Call original hide handler if it exists
        if (originalHide) {
          originalHide.call(this);
        }
        
        // Clean up all timeouts
        if (stepData.setupTimeoutId !== null && stepData.setupTimeoutId !== undefined) {
          clearTimeout(stepData.setupTimeoutId);
          stepData.setupTimeoutId = null;
        }
        if (stepData.retryTimeoutId !== null && stepData.retryTimeoutId !== undefined) {
          clearTimeout(stepData.retryTimeoutId);
          stepData.retryTimeoutId = null;
        }
        if (stepData.nextStepTimeoutId !== null && stepData.nextStepTimeoutId !== undefined) {
          clearTimeout(stepData.nextStepTimeoutId);
          stepData.nextStepTimeoutId = null;
        }
        
        // Clean up click handler when step is hidden
        if (stepData.unlisten) {
          stepData.unlisten();
          stepData.unlisten = undefined;
        }
      };
    }
    return step;
  }

  modifyApiKeyInputStep(step: any, context: StepModifierContext): any {
    // Step 4 (api-key-input): Add custom back button action and disable Next button if API key is invalid
    if (step.id === 'api-key-input' && step.buttons) {
      const backButton = step.buttons.find((btn: any) => btn.type === 'back');
      if (backButton) {
        // Store timeout ID for cleanup
        let selectTabTimeoutId: number | null = null;
        
        backButton.action = () => {
          // Clear previous timeout if exists
          if (selectTabTimeoutId !== null) {
            clearTimeout(selectTabTimeoutId);
          }
          
          // Open settings dialog
          context.settingsDialogService.openSettingsDialog();
          // Select LLM tab after a short delay to ensure dialog is open
          selectTabTimeoutId = window.setTimeout(() => {
            selectTabTimeoutId = null;
            context.settingsDialogService.selectTab(TabId.LLM);
          }, 150);
          // Go back in the tour
          context.shepherdService.back();
        };
        
        // Store cleanup function on step for potential cancellation
        (step as any)._selectTabTimeoutId = selectTabTimeoutId;
        (step as any)._clearSelectTabTimeout = () => {
          if (selectTabTimeoutId !== null) {
            clearTimeout(selectTabTimeoutId);
            selectTabTimeoutId = null;
          }
        };
      }

      const nextButton = step.buttons.find((btn: any) => btn.type === 'next');
      if (nextButton) {
        // API key validation state
        let isApiKeyValid = false;
        let isApiKeyValidating = false;
        let validationTimeoutId: any = null;

        // Function to update button state
        const updateButtonState = (stepInstance: any) => {
          if (!stepInstance) return;
          
          const nextButtonElement = stepInstance.el?.querySelector('.shepherd-button-primary');
          if (nextButtonElement) {
            const shouldDisable = !isApiKeyValid || isApiKeyValidating;
            if (shouldDisable) {
              nextButtonElement.setAttribute('disabled', 'true');
              nextButtonElement.classList.add('shepherd-button-disabled');
            } else {
              nextButtonElement.removeAttribute('disabled');
              nextButtonElement.classList.remove('shepherd-button-disabled');
            }
          }
        };

        // Function to validate API key
        const validateApiKey = (apiKey: string, stepInstance: any) => {
          if (!apiKey || apiKey.trim().length === 0) {
            isApiKeyValid = false;
            isApiKeyValidating = false;
            updateButtonState(stepInstance);
            return;
          }

          isApiKeyValidating = true;
          updateButtonState(stepInstance);

          context.openAiApiKeyValidatorService.validateApiKey(apiKey).subscribe({
            next: (isValid) => {
              isApiKeyValid = isValid;
              isApiKeyValidating = false;
              updateButtonState(stepInstance);
            },
            error: () => {
              isApiKeyValid = false;
              isApiKeyValidating = false;
              updateButtonState(stepInstance);
            }
          });
        };

        // Set disabled function for button
        nextButton.disabled = function(this: any) {
          return !isApiKeyValid || isApiKeyValidating;
        };

        // Set up input field change tracking
        if (!step.when) {
          step.when = {};
        }

        const originalShow = step.when.show;
        step.when.show = function(this: any) {
          // Call original show handler if it exists
          if (originalShow) {
            originalShow.call(this);
          }

          const stepInstance = this;
          
          // Store timeout IDs for cleanup
          let setupInputListenerTimeoutId: number | null = null;
          let retryInputListenerTimeoutId: number | null = null;
          
          // Function to set up change listener
          const setupInputListener = () => {
            // Clear retry timeout if it was set
            if (retryInputListenerTimeoutId !== null) {
              clearTimeout(retryInputListenerTimeoutId);
              retryInputListenerTimeoutId = null;
            }
            
            const apiKeyInput = findApiKeyInput();
            if (!apiKeyInput) {
              // Retry if input not found yet
              retryInputListenerTimeoutId = window.setTimeout(setupInputListener, 100);
              return;
            }

            // Clear previous timeout if exists
            if (validationTimeoutId) {
              clearTimeout(validationTimeoutId);
            }

            // Check initial value
            const initialValue = apiKeyInput.value;
            if (initialValue) {
              validateApiKey(initialValue, stepInstance);
            } else {
              isApiKeyValid = false;
              isApiKeyValidating = false;
              updateButtonState(stepInstance);
            }

            // Change listener with debounce
            const inputHandler = () => {
              // Clear previous timeout
              if (validationTimeoutId) {
                clearTimeout(validationTimeoutId);
              }

              const apiKey = apiKeyInput.value;
              
              // If field is empty, disable button immediately
              if (!apiKey || apiKey.trim().length === 0) {
                isApiKeyValid = false;
                isApiKeyValidating = false;
                updateButtonState(stepInstance);
                return;
              }

              // Debounce validation
              validationTimeoutId = window.setTimeout(() => {
                validateApiKey(apiKey, stepInstance);
              }, 800); // 800ms delay, same as in component
            };

            // Add listeners for all change types
            apiKeyInput.addEventListener('input', inputHandler);
            apiKeyInput.addEventListener('paste', inputHandler);
            apiKeyInput.addEventListener('change', inputHandler);

            // Save cleanup function
            (stepInstance as any)._apiKeyInputCleanup = () => {
              if (validationTimeoutId) {
                clearTimeout(validationTimeoutId);
                validationTimeoutId = null;
              }
              if (setupInputListenerTimeoutId !== null) {
                clearTimeout(setupInputListenerTimeoutId);
                setupInputListenerTimeoutId = null;
              }
              if (retryInputListenerTimeoutId !== null) {
                clearTimeout(retryInputListenerTimeoutId);
                retryInputListenerTimeoutId = null;
              }
              apiKeyInput.removeEventListener('input', inputHandler);
              apiKeyInput.removeEventListener('paste', inputHandler);
              apiKeyInput.removeEventListener('change', inputHandler);
            };
          };

          // Set up listener with small delay
          setupInputListenerTimeoutId = window.setTimeout(setupInputListener, TOUR_DELAYS.CLICK_HANDLER_SETUP);
        };

        const originalHide = step.when.hide;
        step.when.hide = function(this: any) {
          // Call original hide handler if it exists
          if (originalHide) {
            originalHide.call(this);
          }

          // Clean up listeners
          const cleanup = (this as any)._apiKeyInputCleanup;
          if (cleanup) {
            cleanup();
            (this as any)._apiKeyInputCleanup = null;
          }

          if (validationTimeoutId) {
            clearTimeout(validationTimeoutId);
            validationTimeoutId = null;
          }

          // Reset state
          isApiKeyValid = false;
          isApiKeyValidating = false;
          
          // Note: setupInputListenerTimeoutId and retryInputListenerTimeoutId are cleaned up
          // in the _apiKeyInputCleanup function above
        };
      }
    }
    return step;
  }

  modifyStartBuildingButtonStep(step: any, context: StepModifierContext): any {
    return step;
  }

  modifyGenericStep(step: any, context: StepModifierContext): any {
    return step;
  }
}

