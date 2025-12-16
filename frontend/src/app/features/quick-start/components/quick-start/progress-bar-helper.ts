/**
 * Helper for adding progress bar to Shepherd tour steps using Renderer2
 */

import { Renderer2 } from '@angular/core';

export interface ProgressBarHelper {
  addProgressBar(
    stepElement: HTMLElement,
    currentStepNumber: number,
    totalSteps: number,
    renderer: Renderer2,
    isLastStep?: boolean
  ): void;
  removeProgressBar(stepElement: HTMLElement, renderer: Renderer2): void;
}

export function addProgressBarToStep(
  stepElement: HTMLElement,
  currentStepNumber: number,
  totalSteps: number,
  renderer: Renderer2,
  isLastStep: boolean = false
): void {
  // Remove previous progress bar if exists
  const existingProgress =
    stepElement.querySelector('.shepherd-progress-wrapper') ||
    stepElement.querySelector('.shepherd-progress-container');
  if (existingProgress) {
    renderer.removeChild(stepElement, existingProgress);
  }

  // If this is first step, don't show progress bar
  if (currentStepNumber === 1) {
    return;
  }

  // Calculate progress (exclude first step from count)
  const progressSteps = totalSteps - 1;
  const currentProgressStep = currentStepNumber - 1;
  const progressPercentage = isLastStep
    ? 100
    : progressSteps > 0
    ? Math.round((currentProgressStep / progressSteps) * 100)
    : 0;

  // Create wrapper for progress bar with overflow: hidden
  const progressWrapper = renderer.createElement('div');
  renderer.addClass(progressWrapper, 'shepherd-progress-wrapper');

  // Create progress bar container using Renderer2
  const progressContainer = renderer.createElement('div');
  renderer.addClass(progressContainer, 'shepherd-progress-container');
  renderer.setAttribute(progressContainer, 'data-shepherd-progress', 'true');

  // Create progress bar structure
  const progressBar = renderer.createElement('div');
  renderer.addClass(progressBar, 'shepherd-progress-bar');

  const progressFill = renderer.createElement('div');
  renderer.addClass(progressFill, 'shepherd-progress-fill');
  renderer.setStyle(progressFill, 'width', `${progressPercentage}%`);

  const progressText = renderer.createElement('span');
  renderer.addClass(progressText, 'shepherd-progress-text');

  renderer.appendChild(progressBar, progressFill);
  renderer.appendChild(progressContainer, progressBar);
  renderer.appendChild(progressContainer, progressText);

  // Insert progress bar container into wrapper
  renderer.appendChild(progressWrapper, progressContainer);

  // Insert progress bar wrapper inside shepherd-content
  const content = stepElement.querySelector('.shepherd-content');
  if (content) {
    renderer.insertBefore(content, progressWrapper, content.firstChild);
  } else {
    renderer.insertBefore(stepElement, progressWrapper, stepElement.firstChild);
  }
}

export function removeProgressBarFromStep(stepElement: HTMLElement, renderer: Renderer2): void {
  const progressWrapper =
    stepElement.querySelector('.shepherd-progress-wrapper') ||
    stepElement.querySelector('.shepherd-progress-container');
  if (progressWrapper) {
    renderer.removeChild(stepElement, progressWrapper);
  }
}

