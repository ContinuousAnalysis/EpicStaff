import { 
  findSettingsElement, 
  findQuickstartTabButton, 
  findApiKeyInput, 
  findStartBuildingButton,
  waitForElement,
  isElementVisible
} from '../../helpers/element-finder.helper';
import { TOUR_SELECTORS, TOUR_DELAYS } from '../../constants/tour-constants';

// Helper function to get HTML for first step with image
function getIntroStepContent(): string {
  return `
    <div class="shepherd-intro-image">
      <img src="/assets/imgs/dots-tree.svg" alt="EpicStaff Logo" class="intro-logo" />
    </div>
    <p>Hi! We noticed that you haven't set up your environment for the project yet.</p>
    <p>Follow a few simple steps to set up your workspace and start exploring.</p>
  `;
}

export const steps = [
  {
    id: 'intro',
    // First step without element attachment - displayed at bottom left
    beforeShowPromise: function () {
      return new Promise<void>(function (resolve) {
        setTimeout(function () {
          window.scrollTo(0, 0);
          resolve();
        }, TOUR_DELAYS.TOUR_START);
      });
    },
    buttons: [
      {
        classes: 'shepherd-button-secondary',
        text: 'Skip',
        type: 'cancel'
      },
      {
        classes: 'shepherd-button-primary',
        text: 'Get Started',
        type: 'next'
      }
    ],
    cancelIcon: {
      enabled: false
    },
    classes: 'tour-step-intro shepherd-centered',
    highlightClass: 'highlight',
    scrollTo: false,
    title: '&#x1F680; Welcome to Quick Start!',
    text: [getIntroStepContent()],
    when: {
      show: () => {
        // Step shown
      },
      hide: () => {
        // Step hidden
      }
    }
  },
  {
    id: 'settings',
    beforeShowPromise: function () {
      return waitForElement(
        findSettingsElement,
        isElementVisible,
        TOUR_DELAYS.MAX_ELEMENT_CHECK_ATTEMPTS,
        TOUR_DELAYS.ELEMENT_CHECK_INTERVAL
      )
        .then(() => {
          // Element found and visible
        })
        .catch((error) => {
          console.error('[Settings Step] Max attempts reached, element not found:', error);
          throw error;
        });
    },
    attachTo: {
      element: function() {
        return findSettingsElement() || document.querySelector(TOUR_SELECTORS.SETTINGS_ELEMENT) as HTMLElement;
      },
      on: 'left' as const
    },
    canClickTarget: false, // Disable automatic click on target element
    buttons: [
      {
        classes: 'shepherd-button-secondary',
        text: 'Back',
        type: 'back'
      },

    ],
    cancelIcon: {
      enabled: false
    },
    classes: 'epic-staff-tour tour-step-settings',
    highlightClass: 'highlight', // Use highlight to create mask
    scrollTo: false, // Disable automatic scrolling to avoid issues
    title: 'Open Settings',
    text: [
      'To quickly configure your environment with OpenAI, you need an API key. You can find it in the settings.'
    ],
    when: {
      show: () => {
        // Step shown
      },
      hide: () => {
        // Step hidden
      }
    }
  },
  {
    id: 'quickstart-tab',
    beforeShowPromise: function () {
      return waitForElement(
        findQuickstartTabButton,
        isElementVisible,
        TOUR_DELAYS.MAX_ELEMENT_CHECK_ATTEMPTS,
        TOUR_DELAYS.ELEMENT_CHECK_INTERVAL
      )
        .then(() => {
          // Element found and visible
        })
        .catch((error) => {
          console.error('[Quickstart Tab Step] Element not found:', error);
          throw error;
        });
    },
    attachTo: {
      element: function() {
        return findQuickstartTabButton() || document.querySelector(`${TOUR_SELECTORS.DIALOG_CONTAINER} ${TOUR_SELECTORS.QUICKSTART_TAB_BUTTON}`) as HTMLElement;
      },
      on: 'right' as const
    },
    buttons: [
      {
        classes: 'shepherd-button-secondary',
        text: 'Back',
        type: 'back'
      }
    ],
    cancelIcon: {
      enabled: false
    },
    classes: 'epic-staff-tour',
    highlightClass: 'highlight', // Use highlight to create mask
    scrollTo: true,
    title: 'Move on to Quick Start',
    text: [
      'Here is the API Key. Click Quick Start to see it.'
    ],
    when: {
      show: () => {
        // Step shown
      },
      hide: () => {
        // Step hidden
      }
    }
  },
  {
    id: 'api-key-input',
    beforeShowPromise: function () {
      return waitForElement(
        findApiKeyInput,
        isElementVisible,
        TOUR_DELAYS.MAX_ELEMENT_CHECK_ATTEMPTS,
        TOUR_DELAYS.ELEMENT_CHECK_INTERVAL
      )
        .then(() => {
          // Element found and visible
        })
        .catch((error) => {
          console.error('[API Key Input Step] Element not found:', error);
          throw error;
        });
    },
    attachTo: {
      element: function() {
        return findApiKeyInput() || document.querySelector(TOUR_SELECTORS.API_KEY_INPUT) as HTMLElement;
      },
      on: 'left' as const
    },
    popperOptions: {
      modifiers: [
        {
          name: 'offset',
          options: {
            offset: [-24, 0] // Additional left margin: -24px on X axis, 0 on Y axis
          }
        }
      ]
    },
    buttons: [
      {
        classes: 'shepherd-button-secondary',
        text: 'Back',
        type: 'back'
      },
      {
        classes: 'shepherd-button-primary',
        text: 'Next',
        type: 'next'
      }
    ],
    cancelIcon: {
      enabled: false
    },
    classes: 'epic-staff-tour tour-step-api-key',
    highlightClass: 'highlight', // Use highlight to create mask
    scrollTo: true,
    title: 'Provide API Key',
    text: [
      '1. Go to the official <span style="color: var(--accent-color); text-decoration: underline;">website</span> of your provider <span style="color: var(--accent-color);">→</span> open Settings <span style="color: var(--accent-color);">→</span> API Keys. <br> <br> 2. Create or find a key. <br> <br> 3. Copy the key and paste it here.'
    ],
    when: {
      show: () => {
        // Step shown
      },
      hide: () => {
        // Step hidden
      }
    }
  },
  {
    id: 'start-building-button',
    beforeShowPromise: function () {
      return waitForElement(
        findStartBuildingButton,
        isElementVisible,
        TOUR_DELAYS.MAX_ELEMENT_CHECK_ATTEMPTS,
        TOUR_DELAYS.ELEMENT_CHECK_INTERVAL
      )
        .then(() => {
          // Element found and visible
        })
        .catch((error) => {
          console.error('[Start Building Button Step] Element not found:', error);
          throw error;
        });
    },
    attachTo: {
      element: function() {
        return findStartBuildingButton() || document.querySelector(`${TOUR_SELECTORS.DIALOG_CONTAINER} ${TOUR_SELECTORS.START_BUILDING_BUTTON}`) as HTMLElement;
      },
      on: 'top' as const
    },

    buttons: [
      {
        classes: 'shepherd-button-secondary',
        text: 'Back',
        type: 'back'
      }
    ],
    cancelIcon: {
      enabled: false
    },
    classes: 'epic-staff-tour tour-step-start-building',
    highlightClass: 'highlight', // Use highlight to create mask
    scrollTo: true,
    title: 'Click Start Building',
    text: [
      'After clicking Start Building, you can quickly begin working with the program\'s basic features.'
    ],
    when: {
      show: () => {
        // Step shown
      },
      hide: () => {
        // Step hidden
      }
    }
  },

]