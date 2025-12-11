/**
 * Helper functions for finding DOM elements in tour steps
 */

import { TOUR_SELECTORS, TOUR_BUTTON_TEXTS } from '../constants/tour-constants';

/**
 * Finds settings element in bottom navigation
 */
export function findSettingsElement(): HTMLElement | null {
  const bottomNav = document.querySelector('.bottom-nav');
  if (!bottomNav) {
    return null;
  }
  return bottomNav.querySelector('.sidenav-nav-link') as HTMLElement;
}

/**
 * Finds Quickstart tab button in settings dialog
 */
export function findQuickstartTabButton(): HTMLElement | null {
  const dialogContainer = document.querySelector(TOUR_SELECTORS.DIALOG_CONTAINER);
  if (!dialogContainer) {
    return null;
  }

  const tabButtons = dialogContainer.querySelectorAll(TOUR_SELECTORS.QUICKSTART_TAB_BUTTON);
  for (let i = 0; i < tabButtons.length; i++) {
    const button = tabButtons[i] as HTMLElement;
    if (button.textContent?.trim() === TOUR_BUTTON_TEXTS.QUICKSTART) {
      return button;
    }
  }

  // Fallback: return first button if Quickstart not found
  return dialogContainer.querySelector(TOUR_SELECTORS.QUICKSTART_TAB_BUTTON) as HTMLElement;
}

/**
 * Finds Start Building button in settings dialog
 */
export function findStartBuildingButton(): HTMLElement | null {
  const dialogContainer = document.querySelector(TOUR_SELECTORS.DIALOG_CONTAINER);
  if (!dialogContainer) {
    return null;
  }

  const buttons = dialogContainer.querySelectorAll(TOUR_SELECTORS.START_BUILDING_BUTTON);
  for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i] as HTMLElement;
    const buttonContent = button.querySelector(TOUR_SELECTORS.BUTTON_CONTENT);
    if (buttonContent && buttonContent.textContent?.trim() === TOUR_BUTTON_TEXTS.START_BUILDING) {
      return button;
    }
  }

  // Fallback: return first primary button in dialog
  return dialogContainer.querySelector(TOUR_SELECTORS.START_BUILDING_BUTTON) as HTMLElement;
}

/**
 * Finds API key input field
 */
export function findApiKeyInput(): HTMLInputElement | null {
  return document.querySelector(TOUR_SELECTORS.API_KEY_INPUT) as HTMLInputElement;
}

/**
 * Checks if element is visible in DOM
 */
export function isElementVisible(element: HTMLElement | null): boolean {
  if (!element) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    element.offsetParent !== null
  );
}

/**
 * Waits for element to appear in DOM with retry logic
 */
export function waitForElement(
  finder: () => HTMLElement | null,
  isVisible: (element: HTMLElement | null) => boolean = isElementVisible,
  maxAttempts: number = 50,
  interval: number = 100
): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const checkElement = () => {
      attempts++;
      const element = finder();

      if (element && isVisible(element)) {
        resolve(element);
        return;
      }

      if (attempts >= maxAttempts) {
        reject(new Error(`Element not found after ${maxAttempts} attempts`));
        return;
      }

      setTimeout(checkElement, interval);
    };

    checkElement();
  });
}

/**
 * Finds dialog container (CDK overlay)
 */
export function findDialogContainer(): HTMLElement | null {
  return (
    (document.querySelector(TOUR_SELECTORS.DIALOG_OVERLAY) as HTMLElement) ||
    (document.querySelector(TOUR_SELECTORS.DIALOG_CONTAINER) as HTMLElement)
  );
}

/**
 * Finds settings step element in DOM
 */
export function findSettingsStepElement(): HTMLElement | null {
  return document.querySelector(TOUR_SELECTORS.SETTINGS_STEP) as HTMLElement;
}

/**
 * Finds shepherd button (secondary) within a step element
 */
export function findShepherdSecondaryButton(stepElement: HTMLElement | null): HTMLElement | null {
  if (!stepElement) {
    return null;
  }
  return stepElement.querySelector(TOUR_SELECTORS.SHEPHERD_BUTTON_SECONDARY) as HTMLElement;
}

/**
 * Finds shepherd button (primary) within a step element
 */
export function findShepherdPrimaryButton(stepElement: HTMLElement | null): HTMLElement | null {
  if (!stepElement) {
    return null;
  }
  return stepElement.querySelector(TOUR_SELECTORS.SHEPHERD_BUTTON_PRIMARY) as HTMLElement;
}

