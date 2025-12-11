/**
 * Constants for Quick Start Tour
 */

// Timeout delays in milliseconds
export const TOUR_DELAYS = {
  /** Delay before starting tour to ensure DOM is ready */
  TOUR_START: 500,
  /** Delay for adding progress bar after step is shown */
  PROGRESS_BAR_ADD: 50,
  /** Delay for setting up click handlers after step is shown */
  CLICK_HANDLER_SETUP: 100,
  /** Delay for setting up click handlers with mask creation */
  CLICK_HANDLER_WITH_MASK: 200,
  /** Delay for dialog to open/close */
  DIALOG_TRANSITION: 200,
  /** Delay for step navigation after dialog operations */
  STEP_NAVIGATION: 300,
  /** Delay for paste handler to update button state */
  PASTE_HANDLER: 0,
  /** Maximum attempts for element detection */
  MAX_ELEMENT_CHECK_ATTEMPTS: 50,
  /** Interval between element check attempts */
  ELEMENT_CHECK_INTERVAL: 100,
  /** Timeout for MutationObserver cleanup */
  MUTATION_OBSERVER_TIMEOUT: 5000,
} as const;

// CSS selectors used in tour
export const TOUR_SELECTORS = {
  SETTINGS_ELEMENT: '.bottom-nav .sidenav-nav-link',
  SETTINGS_STEP: '.tour-step-settings',
  DIALOG_CONTAINER: '.cdk-dialog-container',
  DIALOG_OVERLAY: '.cdk-overlay-pane',
  QUICKSTART_TAB_BUTTON: '.tab-button',
  API_KEY_INPUT: '#apiKey',
  START_BUILDING_BUTTON: 'app-button[type="primary"]',
  BUTTON_CONTENT: '.btn-content',
  SHEPHERD_BUTTON_SECONDARY: '.shepherd-button-secondary',
  SHEPHERD_BUTTON_PRIMARY: '.shepherd-button-primary',
  SHEPHERD_CONTENT: '.shepherd-content',
  SHEPHERD_MODAL_OVERLAY: '.shepherd-modal-overlay-container.shepherd-modal-is-visible',
} as const;

// Step IDs
export const TOUR_STEP_IDS = {
  INTRO: 'intro',
  SETTINGS: 'settings',
  QUICKSTART_TAB: 'quickstart-tab',
  API_KEY_INPUT: 'api-key-input',
  START_BUILDING_BUTTON: 'start-building-button',
} as const;

// Button text for element detection
export const TOUR_BUTTON_TEXTS = {
  QUICKSTART: 'Quickstart',
  START_BUILDING: 'Start Building',
} as const;

