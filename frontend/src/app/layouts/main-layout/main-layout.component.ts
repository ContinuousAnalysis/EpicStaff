import { Component } from '@angular/core';
import { LeftSidebarComponent } from './sidenav/sidenav.component';
import { RouterOutlet } from '@angular/router';

@Component({
    selector: 'app-main-layout',
    standalone: true,
    imports: [LeftSidebarComponent, RouterOutlet],
    styles: [
        `
            :host {
                display: flex;
                height: 100%;
                width: 100%;
            }

            .sidebar-wrapper {
                width: 3.7rem;
                flex-shrink: 0;
            }

            /* The main-content area flexes to fill all remaining horizontal space. */
            .main-content {
                flex: 1;

                overflow-y: auto;
            }
        `,
    ],
    template: `
        <div class="sidebar-wrapper">
            <app-left-sidebar></app-left-sidebar>
        </div>

        <div class="main-content">
            <router-outlet></router-outlet>
        </div>
    `,
})
export class MainLayoutComponent {}
