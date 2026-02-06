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
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { MarkdownModule } from 'ngx-markdown';
import { ConfigService } from './services/config/config.service';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { authInterceptor } from './core/interceptors/auth.interceptor';

export function initializeApp(configService: ConfigService) {
    return () => configService.loadConfig();
}

export const appConfig: ApplicationConfig = {
    providers: [
        provideZoneChangeDetection({ eventCoalescing: true }),
        provideRouter(routes, withComponentInputBinding()),
        provideAnimationsAsync(),

        provideHttpClient(withInterceptors([authInterceptor])),
        importProvidersFrom(
            MarkdownModule.forRoot({}),
            MonacoEditorModule.forRoot()
        ),

        {
            provide: APP_INITIALIZER,
            useFactory: initializeApp,
            deps: [ConfigService],
            multi: true,
        },
        {
            provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
            useValue: {
                appearance: 'outline',
            },
        },
    ],
};
