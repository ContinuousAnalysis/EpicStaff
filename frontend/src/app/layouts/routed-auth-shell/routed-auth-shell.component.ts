import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
    selector: 'app-routed-auth-shell',
    standalone: true,
    imports: [RouterOutlet],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: '<router-outlet></router-outlet>',
    styles: [
        `
            :host {
                display: block;
                min-height: 100dvh;
                width: 100%;
            }
        `,
    ],
})
export class RoutedAuthShellComponent {}
