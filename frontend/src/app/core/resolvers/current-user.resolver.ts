import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { GetMeResponse } from '@shared/models';
import { of } from 'rxjs';

import { AuthService } from '../../services/auth/auth.service';
import { CurrentUserService } from '../../services/auth/current-user.service';

export const currentUserResolver: ResolveFn<GetMeResponse | null> = () => {
    const currentUserService = inject(CurrentUserService);
    const authService = inject(AuthService);

    const cached = currentUserService.currentUserSignal();
    if (cached) return of(cached);

    return authService.getCurrentUser();
};
