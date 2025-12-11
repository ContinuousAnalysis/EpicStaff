import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastComponent } from './services/notifications/notification/toast.component';
import { QuickStartComponent } from './features/quick-start/components/quick-start/quick-start.component';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterOutlet, ToastComponent, QuickStartComponent],
    template: `
        <router-outlet></router-outlet>
        <app-toast position="bottom-right"></app-toast>
        <app-toast position="top-center"></app-toast>
        <app-toast position="top-right"></app-toast>
        <app-quick-start></app-quick-start>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
