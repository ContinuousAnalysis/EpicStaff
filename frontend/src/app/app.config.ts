import {
    APP_INITIALIZER,
    ApplicationConfig,
    importProvidersFrom,
    provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { MonacoEditorModule } from 'ngx-monaco-editor-v2';
import { provideHttpClient } from '@angular/common/http';
import { MarkdownModule } from 'ngx-markdown';
import { ConfigService } from './services/config/config.service';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';

export function initializeApp(configService: ConfigService) {
    return () => configService.loadConfig();
}

export const appConfig: ApplicationConfig = {
    providers: [
        provideZoneChangeDetection({ eventCoalescing: true }),
        provideRouter(routes, withComponentInputBinding()),
        provideAnimationsAsync(),

        provideHttpClient(),
        importProvidersFrom(
            MarkdownModule.forRoot({}),
            MonacoEditorModule.forRoot()
        ),
        providePrimeNG({
            theme: {
                preset: Aura,
                options: {
                    darkModeSelector: '.my-app-dark',
                },
            },
        }),
        {
            provide: APP_INITIALIZER,
            useFactory: initializeApp,
            deps: [ConfigService],
            multi: true,
        },
    ],
};
