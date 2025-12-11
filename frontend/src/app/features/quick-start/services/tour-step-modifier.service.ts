import { Injectable, Renderer2 } from '@angular/core';
import { ShepherdService } from 'angular-shepherd';
import { SettingsDialogService } from '../../settings-dialog/settings-dialog.service';
import { QuickstartStatusService } from './quickstart-status.service';
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
}

@Injectable({
  providedIn: 'root',
})
export class TourStepModifierService {
  /**
   * Modifies intro step to hide it properly when moving to next
   */
  modifyIntroStep(step: any, context: StepModifierContext): any {
    if (step.id !== 'intro' || context.currentStepNumber !== 1) {
      return step;
    }

    const originalHide = step.when?.hide;
    const { renderer } = context;

    return {
      ...step,
      when: {
        ...step.when,
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
              setTimeout(() => {
                if (originalAction) {
                  return originalAction.call(this);
                } else {
                  return this.next();
                }
              }, 100);
              return;
            }

            // Move to next step after dialog opens
            const observer = new MutationObserver((mutations, obs) => {
              const dialog = findDialogContainer();
              if (dialog) {
                obs.disconnect();
                setTimeout(() => {
                  if (originalAction) {
                    originalAction.call(this);
                  } else {
                    this.next();
                  }
                }, TOUR_DELAYS.STEP_NAVIGATION);
              }
            });

            observer.observe(document.body, {
              childList: true,
              subtree: true,
            });

            // Clear observer after timeout if dialog didn't open
            setTimeout(() => {
              observer.disconnect();
            }, TOUR_DELAYS.MUTATION_OBSERVER_TIMEOUT);

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
          setTimeout(() => {
            if (this?.el) {
              addProgressBarToStep(this.el, currentStepNumber, totalSteps, renderer);
            }
          }, TOUR_DELAYS.PROGRESS_BAR_ADD);
        },
        hide: function (this: any) {
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
    console.log('[TourStepModifier] modifyQuickstartTabStep called, step.id:', step.id);
    
    if (step.id !== 'quickstart-tab') {
      console.log('[TourStepModifier] Step ID does not match quickstart-tab, returning unchanged');
      return step;
    }

    console.log('[TourStepModifier] Processing quickstart-tab step');
    const originalShow = step.when?.show;
    const originalHide = step.when?.hide;
    const { shepherdService, settingsDialogService, renderer, totalSteps, currentStepNumber } = context;
    
    console.log('[TourStepModifier] Step buttons before modification:', step.buttons);

    // Modify buttons so Back closes settings dialog before going back
    const modifiedButtons = step.buttons?.map((button: any) => {
      if (button.type === 'back') {
        const originalAction = button.action;
        console.log('[Quickstart Tab Step] Modifying Back button, originalAction:', originalAction);
        return {
          ...button,
          action: function (this: any) {
            console.log('[Quickstart Tab Step] Back button clicked');
            console.log('[Quickstart Tab Step] Shepherd step context:', this);
            console.log('[Quickstart Tab Step] settingsDialogService:', settingsDialogService);
            
            // Close settings dialog before going back
            console.log('[Quickstart Tab Step] Calling closeSettingsDialog()');
            settingsDialogService.closeSettingsDialog();
            
              // Wait a bit for dialog to close, then go back
            setTimeout(() => {
              console.log('[Quickstart Tab Step] Executing back action after delay');
              if (originalAction) {
                console.log('[Quickstart Tab Step] Calling originalAction');
                return originalAction.call(this);
              } else {
                console.log('[Quickstart Tab Step] Calling this.back()');
                return this.back();
              }
            }, TOUR_DELAYS.DIALOG_TRANSITION);
          },
        };
      }
      return button;
    }) || step.buttons || [];
    
    console.log('[Quickstart Tab Step] Modified buttons:', modifiedButtons);

    return {
      ...step,
      buttons: modifiedButtons,
      when: {
        show: function (this: any) {
          console.log('[Quickstart Tab Step] Show handler called');
          console.log('[Quickstart Tab Step] Step options:', this?.options);
          console.log('[Quickstart Tab Step] Step buttons from options:', this?.options?.buttons);
          console.log('[Quickstart Tab Step] Modified buttons:', modifiedButtons);
          
          if (originalShow) {
            originalShow.call(this);
          }

          // Add progress bar
          setTimeout(() => {
            if (this?.el) {
              addProgressBarToStep(this.el, currentStepNumber, totalSteps, renderer);
            }
          }, 50);
          
          // Check buttons in DOM after step is shown and intercept Back button click
          setTimeout(() => {
            const stepElement = this?.el as HTMLElement;
            if (stepElement) {
              const backButton = findShepherdSecondaryButton(stepElement);
              console.log('[Quickstart Tab Step] Back button in DOM:', backButton);
              if (backButton) {
                console.log('[Quickstart Tab Step] Back button text:', backButton.textContent);
                
                // Intercept click on Back button to close dialog
                // Use capture phase to intercept before Shepherd handles it
                const backButtonClickHandler = (e: MouseEvent) => {
                  console.log('[Quickstart Tab Step] Back button clicked directly in DOM!', e);
                  e.preventDefault();
                  e.stopImmediatePropagation();
                  
                  // Close settings dialog
                  console.log('[Quickstart Tab Step] Closing dialog from DOM click handler');
                  settingsDialogService.closeSettingsDialog();
                  
                  // Wait a bit for dialog to close, then trigger back
                  setTimeout(() => {
                    console.log('[Quickstart Tab Step] Triggering back after dialog close');
                    if (this?.back) {
                      this.back();
                    } else if (shepherdService) {
                      shepherdService.back();
                    }
                  }, TOUR_DELAYS.DIALOG_TRANSITION);
                  
                  return false;
                };
                
                // Try multiple approaches to intercept the click
                // 1. Capture phase listener
                backButton.addEventListener('click', backButtonClickHandler, true);
                
                // 2. Direct onclick handler (highest priority)
                const originalOnClick = backButton.onclick;
                backButton.onclick = (e: MouseEvent) => {
                  console.log('[Quickstart Tab Step] onclick handler triggered!', e);
                  e.preventDefault();
                  e.stopImmediatePropagation();
                  
                  settingsDialogService.closeSettingsDialog();
                  
                  setTimeout(() => {
                    if (this?.back) {
                      this.back();
                    } else if (shepherdService) {
                      shepherdService.back();
                    }
                  }, TOUR_DELAYS.DIALOG_TRANSITION);
                  
                  return false;
                };
                
                console.log('[Quickstart Tab Step] Added DOM click listener to Back button (capture phase + onclick)');
                
                // Save references for cleanup
                (backButton as any).__shepherdBackClickHandler = backButtonClickHandler;
                (backButton as any).__shepherdOriginalOnClick = originalOnClick;
              }
            }
          }, 100);

          // Setup click handler for Quickstart button
          setTimeout(() => {
            const quickstartButton = this?.target as HTMLElement;

            if (quickstartButton) {
              const buttonClickHandler = (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();

                if (buttonClickHandlerUnlisten) {
                  buttonClickHandlerUnlisten();
                }

                setTimeout(() => {
                  shepherdService.next();
                }, TOUR_DELAYS.STEP_NAVIGATION);
              };

              const buttonClickHandlerUnlisten = renderer.listen(quickstartButton, 'click', buttonClickHandler);
              (quickstartButton as any).__shepherdButtonClickUnlisten = buttonClickHandlerUnlisten;
            }
          }, TOUR_DELAYS.CLICK_HANDLER_WITH_MASK);
        },
        hide: function (this: any) {
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
              
              console.log('[Quickstart Tab Step] Removed Back button click handlers');
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

    // Modify buttons so Next is blocked if field is empty
    const modifiedButtons = step.buttons?.map((button: any) => {
      if (button.type === 'next') {
        const originalAction = button.action;
        return {
          ...button,
          disabled: function (this: any) {
            const apiKeyInput = findApiKeyInput();
            if (apiKeyInput) {
              return !(apiKeyInput.value.trim().length > 0);
            }
            return true;
          },
          action: function (this: any) {
            const apiKeyInput = findApiKeyInput();
            if (apiKeyInput) {
              const hasValue = apiKeyInput.value.trim().length > 0;
              if (!hasValue) {
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
          setTimeout(() => {
            if (this?.el) {
              addProgressBarToStep(this.el, currentStepNumber, totalSteps, renderer);
            }
          }, TOUR_DELAYS.PROGRESS_BAR_ADD);

          // Setup validation for Next button
          setTimeout(() => {
            const apiKeyInput = findApiKeyInput();
            const stepElement = this?.el as HTMLElement;

            if (!apiKeyInput || !stepElement) {
              return;
            }

            const updateNextButton = () => {
              const hasValue = apiKeyInput.value.trim().length > 0;
              const nextButtonElement = findShepherdPrimaryButton(stepElement);
              if (nextButtonElement) {
                if (hasValue) {
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

            updateNextButton();

            const inputHandler = () => updateNextButton();
            const pasteHandler = () => setTimeout(() => updateNextButton(), TOUR_DELAYS.PASTE_HANDLER);
            const changeHandler = () => updateNextButton();

            apiKeyInput.addEventListener('input', inputHandler);
            apiKeyInput.addEventListener('paste', pasteHandler);
            apiKeyInput.addEventListener('keyup', inputHandler);
            apiKeyInput.addEventListener('change', changeHandler);

            (stepElement as any).__apiKeyInputHandlers = {
              input: inputHandler,
              paste: pasteHandler,
              keyup: inputHandler,
              change: changeHandler,
            };
          }, TOUR_DELAYS.CLICK_HANDLER_SETUP);
        },
        hide: function (this: any) {
          if (this?.el) {
            const stepElement = this.el as HTMLElement;
            removeProgressBarFromStep(stepElement, renderer);

            // Remove event handlers
            const apiKeyInput = findApiKeyInput();
            const handlers = (stepElement as any).__apiKeyInputHandlers;

            if (apiKeyInput && handlers) {
              apiKeyInput.removeEventListener('input', handlers.input);
              apiKeyInput.removeEventListener('paste', handlers.paste);
              apiKeyInput.removeEventListener('keyup', handlers.keyup);
              apiKeyInput.removeEventListener('change', handlers.change);
              delete (stepElement as any).__apiKeyInputHandlers;
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
          setTimeout(() => {
            if (this?.el) {
              addProgressBarToStep(this.el, currentStepNumber, totalSteps, renderer, true);
            }
          }, TOUR_DELAYS.PROGRESS_BAR_ADD);

          // Setup click handler for Start Building button
          setTimeout(() => {
            const startBuildingButton = this?.target as HTMLElement;

            if (startBuildingButton) {
              const buttonClickHandler = (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();

                if (buttonClickHandlerUnlisten) {
                  buttonClickHandlerUnlisten();
                }

                setTimeout(() => {
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
              };

              const buttonClickHandlerUnlisten = renderer.listen(startBuildingButton, 'click', buttonClickHandler);
              (startBuildingButton as any).__shepherdButtonClickUnlisten = buttonClickHandlerUnlisten;
            }
          }, TOUR_DELAYS.CLICK_HANDLER_WITH_MASK);
        },
        hide: function (this: any) {
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
            setTimeout(() => {
              addProgressBarToStep(this.el, currentStepNumber, totalSteps, renderer);
            }, TOUR_DELAYS.PROGRESS_BAR_ADD);
          }
        },
        hide: function (this: any) {
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

