import { Injectable, Renderer2 } from '@angular/core';
import { ShepherdService } from 'angular-shepherd';
import { SettingsDialogService } from '../../settings-dialog/settings-dialog.service';
import { QuickstartStatusService } from './quickstart-status.service';
import { OpenAiApiKeyValidatorService } from './openai-api-key-validator.service';
import {
  addProgressBarToStep,
  removeProgressBarFromStep,
} from '../components/quick-start/progress-bar-helper';
import {
  findDialogContainer,
  findApiKeyInput,
  findShepherdSecondaryButton,
  findShepherdPrimaryButton,
} from '../helpers/element-finder.helper';
import { TOUR_DELAYS } from '../constants/tour-constants';

export interface StepModifierContext {
  shepherdService: ShepherdService;
  settingsDialogService: SettingsDialogService;
  quickstartStatusService: QuickstartStatusService;
  renderer: Renderer2;
  totalSteps: number;
  currentStepNumber: number;
  openAiApiKeyValidatorService?: OpenAiApiKeyValidatorService;
}

@Injectable({
  providedIn: 'root',
})
export class TourStepModifierService {
  constructor(private openAiApiKeyValidatorService: OpenAiApiKeyValidatorService) {}
  /**
   * Modifies intro step to hide it properly when moving to next
   */
  modifyIntroStep(step: any, context: StepModifierContext): any {
    if (step.id !== 'intro' || context.currentStepNumber !== 1) {
      return step;
    }

    const originalShow = step.when?.show;
    const originalHide = step.when?.hide;
    const { renderer } = context;

    return {
      ...step,
      when: {
        ...step.when,
        show: function (this: any) {
          if (originalShow) {
            originalShow.call(this);
          }

        },
        hide: function (this: any) {

          if (originalHide) {
            originalHide.call(this);
          }

          if (this?.el) {
            renderer.setStyle(this.el, 'display', 'none');
          }
        },
      },
    };
  }

  /**
   * Modifies settings step to open dialog and handle navigation
   */
  modifySettingsStep(step: any, context: StepModifierContext): any {
    if (step.id !== 'settings' || context.currentStepNumber !== 2) {
      return step;
    }

    const originalShow = step.when?.show;
    const originalHide = step.when?.hide;
    const { shepherdService, settingsDialogService, renderer, totalSteps, currentStepNumber } = context;

    // Modify buttons so Next opens settings dialog before moving
    const modifiedButtons = step.buttons?.map((button: any) => {
      if (button.type === 'next') {
        const originalAction = button.action;
        return {
          ...button,
          action: function (this: any) {
            const dialogRef = settingsDialogService.openSettingsDialog();

            if (!dialogRef) {
              // Dialog already open, proceed to next step immediately
              const timeoutId = setTimeout(() => {
                if (originalAction) {
                  return originalAction.call(this);
                } else {
                  return this.next();
                }
              }, 100);
              
              // Store timeout ID for cleanup
              (this as any).__settingsStepTimeoutId = timeoutId;
              return;
            }

            // Move to next step after dialog opens
            const observer = new MutationObserver((mutations, obs) => {
              const dialog = findDialogContainer();
              if (dialog) {
                obs.disconnect();
                
                // Clear cleanup timeout since observer is already disconnected
                if ((this as any).__settingsStepCleanupTimeoutId) {
                  clearTimeout((this as any).__settingsStepCleanupTimeoutId);
                  delete (this as any).__settingsStepCleanupTimeoutId;
                }
                
                const timeoutId = setTimeout(() => {
                  if (originalAction) {
                    originalAction.call(this);
                  } else {
                    this.next();
                  }
                }, TOUR_DELAYS.STEP_NAVIGATION);
                
                // Store timeout ID for cleanup
                (this as any).__settingsStepNavigationTimeoutId = timeoutId;
              }
            });

            observer.observe(document.body, {
              childList: true,
              subtree: true,
            });

            // Store observer reference for cleanup
            (this as any).__settingsStepObserver = observer;

            // Clear observer after timeout if dialog didn't open
            const cleanupTimeoutId = setTimeout(() => {
              // Check if observer is still active before disconnecting
              if ((this as any).__settingsStepObserver === observer) {
                observer.disconnect();
                delete (this as any).__settingsStepObserver;
              }
            }, TOUR_DELAYS.MUTATION_OBSERVER_TIMEOUT);
            
            // Store cleanup timeout ID
            (this as any).__settingsStepCleanupTimeoutId = cleanupTimeoutId;

            return;
          },
        };
      }
      return button;
    }) || step.buttons || [];

    return {
      ...step,
      buttons: modifiedButtons,
      when: {
        show: function (this: any) {
          if (originalShow) {
            originalShow.call(this);
          }

          // Add progress bar
          const timeoutId = setTimeout(() => {
            if (this?.el) {
              addProgressBarToStep(this.el, currentStepNumber, totalSteps, renderer);
            }
          }, TOUR_DELAYS.PROGRESS_BAR_ADD);
          
          // Store timeout ID for cleanup
          (this as any).__settingsStepProgressBarTimeoutId = timeoutId;
        },
        hide: function (this: any) {
          // Clear all timeouts
          if ((this as any).__settingsStepTimeoutId) {
            clearTimeout((this as any).__settingsStepTimeoutId);
            delete (this as any).__settingsStepTimeoutId;
          }
          
          if ((this as any).__settingsStepNavigationTimeoutId) {
            clearTimeout((this as any).__settingsStepNavigationTimeoutId);
            delete (this as any).__settingsStepNavigationTimeoutId;
          }
          
          if ((this as any).__settingsStepCleanupTimeoutId) {
            clearTimeout((this as any).__settingsStepCleanupTimeoutId);
            delete (this as any).__settingsStepCleanupTimeoutId;
          }
          
          if ((this as any).__settingsStepProgressBarTimeoutId) {
            clearTimeout((this as any).__settingsStepProgressBarTimeoutId);
            delete (this as any).__settingsStepProgressBarTimeoutId;
          }
          
          // Disconnect MutationObserver if still active
          const observer = (this as any).__settingsStepObserver;
          if (observer) {
            observer.disconnect();
            delete (this as any).__settingsStepObserver;
          }

          if (this?.el) {
            removeProgressBarFromStep(this.el, renderer);
          }

          if (originalHide) {
            originalHide.call(this);
          }
        },
      },
    };
  }

  /**
   * Modifies quickstart tab step to handle button click
   */
  modifyQuickstartTabStep(step: any, context: StepModifierContext): any {
    if (step.id !== 'quickstart-tab') {
      return step;
    }

    const originalShow = step.when?.show;
    const originalHide = step.when?.hide;
    const { shepherdService, settingsDialogService, renderer, totalSteps, currentStepNumber } = context;

    // Modify buttons so Back closes settings dialog before going back
    const modifiedButtons = step.buttons?.map((button: any) => {
      if (button.type === 'back') {
        const originalAction = button.action;
        return {
          ...button,
          action: function (this: any) {
            // Close settings dialog before going back
            settingsDialogService.closeSettingsDialog();
            
            // Wait a bit for dialog to close, then go back
            const timeoutId = setTimeout(() => {
              if (originalAction) {
                return originalAction.call(this);
              } else {
                return this.back();
              }
            }, TOUR_DELAYS.DIALOG_TRANSITION);
            
            // Store timeout ID for cleanup
            (this as any).__quickstartTabBackTimeoutId = timeoutId;
          },
        };
      }
      return button;
    }) || step.buttons || [];

    return {
      ...step,
      buttons: modifiedButtons,
      when: {
        show: function (this: any) {
          if (originalShow) {
            originalShow.call(this);
          }

          // Add progress bar
          const progressBarTimeoutId = setTimeout(() => {
            if (this?.el) {
              addProgressBarToStep(this.el, currentStepNumber, totalSteps, renderer);
            }
          }, 50);
          
          // Store timeout ID for cleanup
          (this as any).__quickstartTabProgressBarTimeoutId = progressBarTimeoutId;
          
          // Check buttons in DOM after step is shown and intercept Back button click
          const buttonCheckTimeoutId = setTimeout(() => {
            const stepElement = this?.el as HTMLElement;
            if (stepElement) {
              const backButton = findShepherdSecondaryButton(stepElement);
              if (backButton) {
                // Initialize array for storing timeout IDs from event handlers
                if (!(this as any).__quickstartTabEventTimeoutIds) {
                  (this as any).__quickstartTabEventTimeoutIds = [];
                }
                
                // Intercept click on Back button to close dialog
                // Use capture phase to intercept before Shepherd handles it
                const backButtonClickHandler = (e: MouseEvent) => {
                  e.preventDefault();
                  e.stopImmediatePropagation();
                  
                  // Close settings dialog
                  settingsDialogService.closeSettingsDialog();
                  
                  // Wait a bit for dialog to close, then trigger back
                  const backTimeoutId = setTimeout(() => {
                    if (this?.back) {
                      this.back();
                    } else if (shepherdService) {
                      shepherdService.back();
                    }
                  }, TOUR_DELAYS.DIALOG_TRANSITION);
                  
                  // Store timeout ID for cleanup
                  (this as any).__quickstartTabEventTimeoutIds.push(backTimeoutId);
                  
                  return false;
                };
                
                // Try multiple approaches to intercept the click
                // 1. Capture phase listener
                backButton.addEventListener('click', backButtonClickHandler, true);
                
                // 2. Direct onclick handler (highest priority)
                const originalOnClick = backButton.onclick;
                backButton.onclick = (e: MouseEvent) => {
                  e.preventDefault();
                  e.stopImmediatePropagation();
                  
                  settingsDialogService.closeSettingsDialog();
                  
                  const onclickTimeoutId = setTimeout(() => {
                    if (this?.back) {
                      this.back();
                    } else if (shepherdService) {
                      shepherdService.back();
                    }
                  }, TOUR_DELAYS.DIALOG_TRANSITION);
                  
                  // Store timeout ID for cleanup
                  (this as any).__quickstartTabEventTimeoutIds.push(onclickTimeoutId);
                  
                  return false;
                };
                
                // Save references for cleanup
                (backButton as any).__shepherdBackClickHandler = backButtonClickHandler;
                (backButton as any).__shepherdOriginalOnClick = originalOnClick;
              }
            }
          }, 100);
          
          // Store timeout ID for cleanup
          (this as any).__quickstartTabButtonCheckTimeoutId = buttonCheckTimeoutId;

          // Setup click handler for Quickstart button
          const quickstartButtonTimeoutId = setTimeout(() => {
            const quickstartButton = this?.target as HTMLElement;

            if (quickstartButton) {
              // Initialize array for storing timeout IDs from event handlers if not exists
              if (!(this as any).__quickstartTabEventTimeoutIds) {
                (this as any).__quickstartTabEventTimeoutIds = [];
              }
              
              const buttonClickHandler = (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();

                if (buttonClickHandlerUnlisten) {
                  buttonClickHandlerUnlisten();
                }

                const navigationTimeoutId = setTimeout(() => {
                  shepherdService.next();
                }, TOUR_DELAYS.STEP_NAVIGATION);
                
                // Store timeout ID for cleanup
                (this as any).__quickstartTabEventTimeoutIds.push(navigationTimeoutId);
              };

              const buttonClickHandlerUnlisten = renderer.listen(quickstartButton, 'click', buttonClickHandler);
              (quickstartButton as any).__shepherdButtonClickUnlisten = buttonClickHandlerUnlisten;
            }
          }, TOUR_DELAYS.CLICK_HANDLER_WITH_MASK);
          
          // Store timeout ID for cleanup
          (this as any).__quickstartTabButtonSetupTimeoutId = quickstartButtonTimeoutId;
        },
        hide: function (this: any) {
          // Clear all timeouts
          if ((this as any).__quickstartTabProgressBarTimeoutId) {
            clearTimeout((this as any).__quickstartTabProgressBarTimeoutId);
            delete (this as any).__quickstartTabProgressBarTimeoutId;
          }
          
          if ((this as any).__quickstartTabButtonCheckTimeoutId) {
            clearTimeout((this as any).__quickstartTabButtonCheckTimeoutId);
            delete (this as any).__quickstartTabButtonCheckTimeoutId;
          }
          
          if ((this as any).__quickstartTabButtonSetupTimeoutId) {
            clearTimeout((this as any).__quickstartTabButtonSetupTimeoutId);
            delete (this as any).__quickstartTabButtonSetupTimeoutId;
          }
          
          if ((this as any).__quickstartTabBackTimeoutId) {
            clearTimeout((this as any).__quickstartTabBackTimeoutId);
            delete (this as any).__quickstartTabBackTimeoutId;
          }
          
          // Clear all event handler timeouts
          const eventTimeoutIds = (this as any).__quickstartTabEventTimeoutIds;
          if (eventTimeoutIds && Array.isArray(eventTimeoutIds)) {
            eventTimeoutIds.forEach((timeoutId: number) => {
              clearTimeout(timeoutId);
            });
            delete (this as any).__quickstartTabEventTimeoutIds;
          }

          if (this?.el) {
            removeProgressBarFromStep(this.el, renderer);
          }

          // Remove Back button click handler
          const stepElement = this?.el as HTMLElement;
          if (stepElement) {
            const backButton = findShepherdSecondaryButton(stepElement);
            if (backButton) {
              // Remove capture phase listener
              if ((backButton as any).__shepherdBackClickHandler) {
                backButton.removeEventListener('click', (backButton as any).__shepherdBackClickHandler, true);
                delete (backButton as any).__shepherdBackClickHandler;
              }
              
              // Restore original onclick
              if ((backButton as any).__shepherdOriginalOnClick !== undefined) {
                backButton.onclick = (backButton as any).__shepherdOriginalOnClick;
                delete (backButton as any).__shepherdOriginalOnClick;
              }
            }
          }

          // Remove click handlers
          if (this?.target) {
            const quickstartButton = this.target as HTMLElement;
            if ((quickstartButton as any).__shepherdButtonClickUnlisten) {
              (quickstartButton as any).__shepherdButtonClickUnlisten();
              delete (quickstartButton as any).__shepherdButtonClickUnlisten;
            }
          }

          if (originalHide) {
            originalHide.call(this);
          }
        },
      },
    };
  }

  /**
   * Modifies API key input step to validate input and block Next button
   */
  modifyApiKeyInputStep(step: any, context: StepModifierContext): any {
    if (step.id !== 'api-key-input') {
      return step;
    }

    const originalShow = step.when?.show;
    const originalHide = step.when?.hide;
    const { renderer, totalSteps, currentStepNumber } = context;
    const validatorService = context.openAiApiKeyValidatorService || this.openAiApiKeyValidatorService;

    // Modify buttons so Next is blocked if field is empty or key is invalid
    const modifiedButtons = step.buttons?.map((button: any) => {
      if (button.type === 'next') {
        const originalAction = button.action;
        return {
          ...button,
          disabled: function (this: any) {
            const apiKeyInput = findApiKeyInput();
            if (apiKeyInput) {
              const hasValue = apiKeyInput.value.trim().length > 0;
              const isValid = (apiKeyInput as any).__isValidApiKey !== false;
              const isChecking = (apiKeyInput as any).__isCheckingApiKey === true;
              return !hasValue || !isValid || isChecking;
            }
            return true;
          },
          action: function (this: any) {
            const apiKeyInput = findApiKeyInput();
            if (apiKeyInput) {
              const hasValue = apiKeyInput.value.trim().length > 0;
              const isValid = (apiKeyInput as any).__isValidApiKey === true;
              if (!hasValue || !isValid) {
                return;
              }
            }

            if (originalAction) {
              return originalAction.call(this);
            } else {
              return this.next();
            }
          },
        };
      }
      return button;
    }) || step.buttons || [];

    return {
      ...step,
      buttons: modifiedButtons,
      when: {
        show: function (this: any) {
          if (originalShow) {
            originalShow.call(this);
          }

          // Add progress bar
          const progressBarTimeoutId = setTimeout(() => {
            if (this?.el) {
              addProgressBarToStep(this.el, currentStepNumber, totalSteps, renderer);
            }
          }, TOUR_DELAYS.PROGRESS_BAR_ADD);
          
          // Store timeout ID for cleanup
          (this as any).__apiKeyInputProgressBarTimeoutId = progressBarTimeoutId;

          // Setup validation for Next button and API key validation
          const validationSetupTimeoutId = setTimeout(() => {
            const apiKeyInput = findApiKeyInput();
            const stepElement = this?.el as HTMLElement;

            if (!apiKeyInput || !stepElement) {
              return;
            }

            // Initialize validation state
            (apiKeyInput as any).__isValidApiKey = undefined;
            (apiKeyInput as any).__isCheckingApiKey = false;
            (apiKeyInput as any).__validationDebounceTimeout = null;

            // Helper function to show/hide error message
            const showErrorMessage = (message: string) => {
              let errorElement = stepElement.querySelector('.api-key-validation-error') as HTMLElement;
              if (!errorElement) {
                errorElement = renderer.createElement('div');
                errorElement.className = 'api-key-validation-error';
                const shepherdContent = stepElement.querySelector('.shepherd-content');
                if (shepherdContent) {
                  renderer.appendChild(shepherdContent, errorElement);
                }
              }
              errorElement.textContent = message;
              errorElement.style.display = 'block';
            };

            const hideErrorMessage = () => {
              const errorElement = stepElement.querySelector('.api-key-validation-error') as HTMLElement;
              if (errorElement) {
                errorElement.style.display = 'none';
              }
            };

            // Helper function to show/hide loading indicator
            const showLoadingIndicator = () => {
              let loadingElement = stepElement.querySelector('.api-key-validation-loading') as HTMLElement;
              if (!loadingElement) {
                loadingElement = renderer.createElement('div');
                loadingElement.className = 'api-key-validation-loading';
                loadingElement.textContent = 'Checking API key...';
                const shepherdContent = stepElement.querySelector('.shepherd-content');
                if (shepherdContent) {
                  renderer.appendChild(shepherdContent, loadingElement);
                }
              }
              loadingElement.style.display = 'block';
            };

            const hideLoadingIndicator = () => {
              const loadingElement = stepElement.querySelector('.api-key-validation-loading') as HTMLElement;
              if (loadingElement) {
                loadingElement.style.display = 'none';
              }
            };

            // Function to update Next button state
            const updateNextButton = () => {
              const hasValue = apiKeyInput.value.trim().length > 0;
              const isValid = (apiKeyInput as any).__isValidApiKey === true;
              const isChecking = (apiKeyInput as any).__isCheckingApiKey === true;
              const nextButtonElement = findShepherdPrimaryButton(stepElement);
              
              if (nextButtonElement) {
                if (hasValue && isValid && !isChecking) {
                  nextButtonElement.classList.remove('shepherd-button-disabled');
                  nextButtonElement.removeAttribute('disabled');
                  nextButtonElement.style.pointerEvents = '';
                  nextButtonElement.style.opacity = '';
                  nextButtonElement.style.cursor = 'pointer';
                } else {
                  nextButtonElement.classList.add('shepherd-button-disabled');
                  nextButtonElement.setAttribute('disabled', 'true');
                  nextButtonElement.style.pointerEvents = 'none';
                  nextButtonElement.style.opacity = '0.5';
                  nextButtonElement.style.cursor = 'not-allowed';
                }
              }
            };

            // Function to validate API key
            const validateApiKey = (apiKey: string) => {
              if (!apiKey || apiKey.trim().length === 0) {
                (apiKeyInput as any).__isValidApiKey = undefined;
                hideErrorMessage();
                hideLoadingIndicator();
                updateNextButton();
                return;
              }

              // Clear previous debounce timeout
              if ((apiKeyInput as any).__validationDebounceTimeout) {
                clearTimeout((apiKeyInput as any).__validationDebounceTimeout);
              }

              // Set checking state
              (apiKeyInput as any).__isCheckingApiKey = true;
              (apiKeyInput as any).__isValidApiKey = undefined;
              hideErrorMessage();
              showLoadingIndicator();
              updateNextButton();

              // Debounce validation - wait 800ms after user stops typing
              (apiKeyInput as any).__validationDebounceTimeout = setTimeout(() => {
                validatorService.validateApiKey(apiKey).subscribe({
                  next: (isValid) => {
                    (apiKeyInput as any).__isValidApiKey = isValid;
                    (apiKeyInput as any).__isCheckingApiKey = false;
                    hideLoadingIndicator();

                    if (isValid) {
                      hideErrorMessage();
                    } else {
                      showErrorMessage('Invalid API key. Please check your key and try again.');
                    }

                    updateNextButton();
                  },
                  error: () => {
                    (apiKeyInput as any).__isValidApiKey = false;
                    (apiKeyInput as any).__isCheckingApiKey = false;
                    hideLoadingIndicator();
                    showErrorMessage('Invalid API key. Please check your key and try again.');
                    updateNextButton();
                  },
                });
              }, 1200);
            };

            updateNextButton();

            const inputHandler = () => {
              updateNextButton();
              validateApiKey(apiKeyInput.value);
            };

            const pasteHandler = () => {
              const pasteTimeoutId = setTimeout(() => {
                updateNextButton();
                validateApiKey(apiKeyInput.value);
              }, TOUR_DELAYS.PASTE_HANDLER);
              // Store paste timeout ID for cleanup
              if (!(stepElement as any).__apiKeyInputPasteTimeoutIds) {
                (stepElement as any).__apiKeyInputPasteTimeoutIds = [];
              }
              (stepElement as any).__apiKeyInputPasteTimeoutIds.push(pasteTimeoutId);
            };

            const changeHandler = () => {
              updateNextButton();
              validateApiKey(apiKeyInput.value);
            };

            const blurHandler = () => {
              // Validate on blur if there's a value
              if (apiKeyInput.value.trim().length > 0) {
                validateApiKey(apiKeyInput.value);
              }
            };

            apiKeyInput.addEventListener('input', inputHandler);
            apiKeyInput.addEventListener('paste', pasteHandler);
            apiKeyInput.addEventListener('keyup', inputHandler);
            apiKeyInput.addEventListener('change', changeHandler);
            apiKeyInput.addEventListener('blur', blurHandler);

            (stepElement as any).__apiKeyInputHandlers = {
              input: inputHandler,
              paste: pasteHandler,
              keyup: inputHandler,
              change: changeHandler,
              blur: blurHandler,
            };
          }, TOUR_DELAYS.CLICK_HANDLER_SETUP);
          
          // Store timeout ID for cleanup
          (this as any).__apiKeyInputValidationSetupTimeoutId = validationSetupTimeoutId;
        },
        hide: function (this: any) {
          // Clear all timeouts
          if ((this as any).__apiKeyInputProgressBarTimeoutId) {
            clearTimeout((this as any).__apiKeyInputProgressBarTimeoutId);
            delete (this as any).__apiKeyInputProgressBarTimeoutId;
          }
          
          if ((this as any).__apiKeyInputValidationSetupTimeoutId) {
            clearTimeout((this as any).__apiKeyInputValidationSetupTimeoutId);
            delete (this as any).__apiKeyInputValidationSetupTimeoutId;
          }

          if (this?.el) {
            const stepElement = this.el as HTMLElement;
            removeProgressBarFromStep(stepElement, renderer);

            // Clear paste handler timeouts
            const pasteTimeoutIds = (stepElement as any).__apiKeyInputPasteTimeoutIds;
            if (pasteTimeoutIds && Array.isArray(pasteTimeoutIds)) {
              pasteTimeoutIds.forEach((timeoutId: number) => {
                clearTimeout(timeoutId);
              });
              delete (stepElement as any).__apiKeyInputPasteTimeoutIds;
            }

            // Clear validation debounce timeout
            const apiKeyInput = findApiKeyInput();
            if (apiKeyInput && (apiKeyInput as any).__validationDebounceTimeout) {
              clearTimeout((apiKeyInput as any).__validationDebounceTimeout);
              delete (apiKeyInput as any).__validationDebounceTimeout;
            }

            // Remove error and loading messages
            const shepherdContent = stepElement.querySelector('.shepherd-content');
            if (shepherdContent) {
              const errorElement = stepElement.querySelector('.api-key-validation-error');
              if (errorElement) {
                renderer.removeChild(shepherdContent, errorElement);
              }
              const loadingElement = stepElement.querySelector('.api-key-validation-loading');
              if (loadingElement) {
                renderer.removeChild(shepherdContent, loadingElement);
              }
            }

            // Remove event handlers
            const handlers = (stepElement as any).__apiKeyInputHandlers;

            if (apiKeyInput && handlers) {
              apiKeyInput.removeEventListener('input', handlers.input);
              apiKeyInput.removeEventListener('paste', handlers.paste);
              apiKeyInput.removeEventListener('keyup', handlers.keyup);
              apiKeyInput.removeEventListener('change', handlers.change);
              apiKeyInput.removeEventListener('blur', handlers.blur);
              delete (stepElement as any).__apiKeyInputHandlers;
            }

            // Clean up validation state
            if (apiKeyInput) {
              delete (apiKeyInput as any).__isValidApiKey;
              delete (apiKeyInput as any).__isCheckingApiKey;
            }
          }

          if (originalHide) {
            originalHide.call(this);
          }
        },
      },
    };
  }

  /**
   * Modifies start building button step to complete tour on click
   */
  modifyStartBuildingButtonStep(step: any, context: StepModifierContext): any {
    if (step.id !== 'start-building-button') {
      return step;
    }

    const originalShow = step.when?.show;
    const originalHide = step.when?.hide;
    const { shepherdService, quickstartStatusService, renderer, totalSteps, currentStepNumber } = context;

    return {
      ...step,
      when: {
        show: function (this: any) {
          if (originalShow) {
            originalShow.call(this);
          }

          // Add progress bar for last step (100%)
          const progressBarTimeoutId = setTimeout(() => {
            if (this?.el) {
              addProgressBarToStep(this.el, currentStepNumber, totalSteps, renderer, true);
            }
          }, TOUR_DELAYS.PROGRESS_BAR_ADD);
          
          // Store timeout ID for cleanup
          (this as any).__startBuildingProgressBarTimeoutId = progressBarTimeoutId;

          // Setup click handler for Start Building button
          const buttonSetupTimeoutId = setTimeout(() => {
            const startBuildingButton = this?.target as HTMLElement;

            if (startBuildingButton) {
              const buttonClickHandler = (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();

                if (buttonClickHandlerUnlisten) {
                  buttonClickHandlerUnlisten();
                }

                const navigationTimeoutId = setTimeout(() => {
                  shepherdService.complete();
                  quickstartStatusService.updateStatus(true).subscribe({
                    next: () => {
                      // Tour completed
                    },
                    error: (error) => {
                      console.error('[Quick Start] Error marking tour as completed:', error);
                    },
                  });
                }, TOUR_DELAYS.STEP_NAVIGATION);
                
                // Store timeout ID for cleanup (use array to handle multiple clicks)
                if (!(this as any).__startBuildingEventTimeoutIds) {
                  (this as any).__startBuildingEventTimeoutIds = [];
                }
                (this as any).__startBuildingEventTimeoutIds.push(navigationTimeoutId);
              };

              const buttonClickHandlerUnlisten = renderer.listen(startBuildingButton, 'click', buttonClickHandler);
              (startBuildingButton as any).__shepherdButtonClickUnlisten = buttonClickHandlerUnlisten;
            }
          }, TOUR_DELAYS.CLICK_HANDLER_WITH_MASK);
          
          // Store timeout ID for cleanup
          (this as any).__startBuildingButtonSetupTimeoutId = buttonSetupTimeoutId;
        },
        hide: function (this: any) {
          // Clear all timeouts
          if ((this as any).__startBuildingProgressBarTimeoutId) {
            clearTimeout((this as any).__startBuildingProgressBarTimeoutId);
            delete (this as any).__startBuildingProgressBarTimeoutId;
          }
          
          if ((this as any).__startBuildingButtonSetupTimeoutId) {
            clearTimeout((this as any).__startBuildingButtonSetupTimeoutId);
            delete (this as any).__startBuildingButtonSetupTimeoutId;
          }
          
          // Clear all event handler timeouts
          const eventTimeoutIds = (this as any).__startBuildingEventTimeoutIds;
          if (eventTimeoutIds && Array.isArray(eventTimeoutIds)) {
            eventTimeoutIds.forEach((timeoutId: number) => {
              clearTimeout(timeoutId);
            });
            delete (this as any).__startBuildingEventTimeoutIds;
          }

          if (this?.el) {
            removeProgressBarFromStep(this.el, renderer);
          }

          // Remove click handlers
          if (this?.target) {
            const startBuildingButton = this.target as HTMLElement;
            if ((startBuildingButton as any).__shepherdButtonClickUnlisten) {
              (startBuildingButton as any).__shepherdButtonClickUnlisten();
              delete (startBuildingButton as any).__shepherdButtonClickUnlisten;
            }
          }

          if (originalHide) {
            originalHide.call(this);
          }
        },
      },
    };
  }

  /**
   * Adds progress bar to generic step (for steps that don't have special handling)
   */
  modifyGenericStep(step: any, context: StepModifierContext): any {
    // Skip first step and steps that are already handled
    if (
      context.currentStepNumber === 1 ||
      step.id === 'settings' ||
      step.id === 'quickstart-tab' ||
      step.id === 'api-key-input' ||
      step.id === 'start-building-button'
    ) {
      return step;
    }

    const originalShow = step.when?.show;
    const originalHide = step.when?.hide;
    const { renderer, totalSteps, currentStepNumber } = context;

    return {
      ...step,
      when: {
        show: function (this: any) {
          if (originalShow) {
            originalShow.call(this);
          }

          if (this?.el) {
            const timeoutId = setTimeout(() => {
              addProgressBarToStep(this.el, currentStepNumber, totalSteps, renderer);
            }, TOUR_DELAYS.PROGRESS_BAR_ADD);
            
            // Store timeout ID for cleanup
            (this as any).__genericStepProgressBarTimeoutId = timeoutId;
          }
        },
        hide: function (this: any) {
          // Clear timeout
          if ((this as any).__genericStepProgressBarTimeoutId) {
            clearTimeout((this as any).__genericStepProgressBarTimeoutId);
            delete (this as any).__genericStepProgressBarTimeoutId;
          }

          if (this?.el) {
            removeProgressBarFromStep(this.el, renderer);
          }

          if (originalHide) {
            originalHide.call(this);
          }
        },
      },
    };
  }
}

