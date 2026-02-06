import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../../services/auth/auth.service';
import { catchError, switchMap, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<any>,
  next: HttpHandlerFn
) => {
  const authService = inject(AuthService);

  const isAuthEndpoint =
    req.url.includes('/auth/token/') || req.url.includes('/auth/token/refresh/');

  const access = authService.getAccessToken();
  const authReq =
    access && !isAuthEndpoint
      ? req.clone({
          setHeaders: {
            Authorization: `Bearer ${access}`,
          },
        })
      : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || isAuthEndpoint) {
        return throwError(() => err);
      }

      return authService.refreshToken().pipe(
        switchMap((newAccess) => {
          if (!newAccess) {
            authService.logout();
            return throwError(() => err);
          }
          const retryReq = req.clone({
            setHeaders: {
              Authorization: `Bearer ${newAccess}`,
            },
          });
          return next(retryReq);
        })
      );
    })
  );
};
