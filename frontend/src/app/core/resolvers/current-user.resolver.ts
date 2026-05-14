import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { GetMeResponse } from '@shared/models';
import { of } from 'rxjs';

import { ProfileService } from '../../services/auth/profile.service';

export const currentUserResolver: ResolveFn<GetMeResponse | null> = () => {
    const currentUserService = inject(ProfileService);

    const cached = currentUserService.currentUserSignal();
    if (cached) return of(cached);

    return currentUserService.getCurrentUser();
};
