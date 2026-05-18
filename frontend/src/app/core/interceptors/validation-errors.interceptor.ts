import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { ApiErrorItem, HttpStatus } from '@shared/models';
import { catchError, throwError } from 'rxjs';

declare module '@angular/common/http' {
    interface HttpErrorResponse {
        validationErrors?: ApiErrorItem[];
    }
}

const VALIDATION_ERROR_CODES: number[] = [HttpStatus.BadRequest, HttpStatus.UnprocessableEntity];

export const validationErrorsInterceptor: HttpInterceptorFn = (req, next) =>
    next(req).pipe(
        catchError((err: HttpErrorResponse) => {
            if (VALIDATION_ERROR_CODES.includes(err.status) && Array.isArray(err.error?.errors)) {
                err.validationErrors = err.error.errors as ApiErrorItem[];
            }
            return throwError(() => err);
        })
    );
