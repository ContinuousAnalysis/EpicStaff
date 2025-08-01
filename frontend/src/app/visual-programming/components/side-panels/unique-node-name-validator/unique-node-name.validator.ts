import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { NodeNameValidatorService } from '../../../services/node-name-validator.service';

/**
 * @deprecated Use NodeNameValidatorService.createUniqueNodeNameValidator() instead
 * This function is kept for backward compatibility
 */
export function uniqueNodeNameValidator(
  getExistingNames: () => string[],
  getCurrentName?: () => string | undefined
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (!value) {
      return null; // Let required validator handle empty values.
    }

    const nodeName = value.trim();
    const currentOriginalName = getCurrentName ? getCurrentName() : undefined;

    // If the node name hasn't changed, skip the uniqueness check.
    if (currentOriginalName && nodeName === currentOriginalName.trim()) {
      return null;
    }

    const existingNames = getExistingNames().map((name) => name.trim());

    if (existingNames.includes(nodeName)) {
      return { uniqueNodeName: { message: 'Node name must be unique.' } };
    }
    return null;
  };
}

/**
 * Creates a validator that uses the NodeNameValidatorService
 * This is the recommended approach for new implementations
 */
export function createNodeNameValidator(
  validatorService: NodeNameValidatorService,
  excludeNodeId?: string
): ValidatorFn {
  return validatorService.createUniqueNodeNameValidator(excludeNodeId);
}
