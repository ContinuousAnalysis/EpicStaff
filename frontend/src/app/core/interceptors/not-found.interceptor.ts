import {
    HttpContextToken,
    HttpErrorResponse,
    HttpHandlerFn,
    HttpInterceptorFn,
    HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const SKIP_NOT_FOUND_REDIRECT = new HttpContextToken<boolean>(() => false);

export const notFoundInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
    const router = inject(Router);

    return next(req).pipe(
        catchError((err: HttpErrorResponse) => {
            if (err.status === 404 && !req.context.get(SKIP_NOT_FOUND_REDIRECT)) {
                void router.navigate(['/not-found']);
            }
            return throwError(() => err);
        })
    );
};
