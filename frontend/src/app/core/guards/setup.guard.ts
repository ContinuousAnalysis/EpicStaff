import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { SetupService } from '../../services/auth/setup.service';
import { map, catchError, of } from 'rxjs';

export const setupGuard: CanActivateFn = (route, state) => {
  const setupService = inject(SetupService);
  const router = inject(Router);

  return setupService.getStatus().pipe(
    map((status) => {
      if (status.needs_setup && state.url !== '/setup') {
        router.navigate(['/setup']);
        return false;
      }
      if (!status.needs_setup && state.url === '/setup') {
        router.navigate(['/login']);
        return false;
      }
      return true;
    }),
    catchError(() => {
      return of(true);
    })
  );
};
