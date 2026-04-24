import { Location } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
    selector: 'app-not-found-page',
    standalone: true,
    imports: [],
    templateUrl: './not-found-page.component.html',
    styleUrl: './not-found-page.component.scss',
})
export class NotFoundPageComponent {
    private readonly router = inject(Router);
    private readonly location = inject(Location);

    goBack(): void {
        this.location.back();
    }

    openWorkspace(): void {
        this.router.navigate(['/projects/my']);
    }
}
