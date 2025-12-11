/**
 * Type definitions for Shepherd tour steps
 */

export interface ShepherdButton {
  classes?: string;
  text: string;
  type: 'next' | 'back' | 'cancel';
  action?: (this: ShepherdStep) => void | boolean;
  disabled?: (this: ShepherdStep) => boolean;
}

export interface ShepherdStepWhen {
  show?: (this: ShepherdStep) => void;
  hide?: (this: ShepherdStep) => void;
}

export interface ShepherdStepAttachTo {
  element: string | HTMLElement | (() => HTMLElement);
  on: 'top' | 'bottom' | 'left' | 'right';
}

export interface ShepherdStep {
  id: string;
  title?: string;
  text?: string[];
  buttons?: ShepherdButton[];
  attachTo?: ShepherdStepAttachTo;
  beforeShowPromise?: () => Promise<void>;
  when?: ShepherdStepWhen;
  classes?: string;
  highlightClass?: string;
  scrollTo?: boolean;
  cancelIcon?: {
    enabled: boolean;
  };
  popperOptions?: {
    modifiers?: Array<{
      name: string;
      options?: {
        offset?: [number, number];
      };
    }>;
  };
  canClickTarget?: boolean;
}

export interface ShepherdStepContext {
  el?: HTMLElement;
  target?: HTMLElement;
  options?: ShepherdStep;
  back?: () => void;
  next?: () => void;
}

