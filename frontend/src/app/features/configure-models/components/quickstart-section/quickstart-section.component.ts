import {
    ChangeDetectionStrategy,
    Component,
    OnInit,
    inject,
    signal, computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import {
    AppIconComponent,
    ButtonComponent,
    CustomInputComponent,
    SelectComponent,
    SelectItem
} from '@shared/components';
import { MATERIAL_FORMS } from "@shared/material-forms";
import { LLM_Provider, ModelTypes } from "../../../settings-dialog/models/llm-provider.model";
import { LLM_Providers_Service } from "../../../settings-dialog/services/llm-providers.service";
import { getProviderIconPath } from '../../../settings-dialog/utils/get-provider-icon';
import { catchError, take, tap } from 'rxjs/operators';
import { of } from 'rxjs';

@Component({
    selector: 'app-quickstart-section',
    imports: [
        CommonModule,
        ReactiveFormsModule,
        AppIconComponent,
        MATERIAL_FORMS,
        CustomInputComponent,
        ButtonComponent,
        SelectComponent
    ],
    templateUrl: './quickstart-section.component.html',
    styleUrls: ['./quickstart-section.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickstartSectionComponent implements OnInit {
    private readonly fb = inject(FormBuilder);
    private readonly providersService = inject(LLM_Providers_Service);

    public readonly quickStartForm = this.fb.group({
        apiKey: [''],
    });

    public isSaving = signal(false);
    public providers = signal<LLM_Provider[]>([]);
    public selectedProvider = signal<LLM_Provider | null>(null);

    public providerItems = computed<SelectItem[]>(() => {
        return this.providers().map((provider) => ({
            name: provider.name
                .replace(/[_-]+/g, ' ')
                .replace(/\b\w/g, (char) => char.toUpperCase()),
            value: provider.id,
            icon: getProviderIconPath(provider.name)
        }))
    })

    public ngOnInit(): void {
        this.loadProviders();
    }

    public onQuickStart(): void {
        const apiKey = this.quickStartForm.get('apiKey')?.value;
        if (!apiKey || !this.selectedProvider()) {
            return;
        }
    }

    public onCancel(): void {
        this.quickStartForm.reset({ apiKey: '' });
    }

    public onReset(): void {
        this.quickStartForm.reset({ apiKey: '' });
    }

    public onReviewDefaults(): void {
        console.log('[Quickstart] review default models');
    }

    public getProviderIcon(provider: LLM_Provider | null): string {
        return getProviderIconPath(provider?.name || null);
    }

    private loadProviders(): void {
        this.providersService
            .getProvidersByQuery(ModelTypes.LLM)
            .pipe(
                take(1),
                tap((providers) => {
                    console.log('[Quickstart] Loaded providers:', providers);
                    this.providers.set(providers);
                    // if (!this.selectedProvider() && providers.length > 0) {
                    //     this.selectedProvider.set(providers[0]);
                    //     console.log('[Quickstart] Selected default provider:', providers[0]);
                    // }
                }),
                catchError((error) => {
                    console.error('[Quickstart] Error loading providers:', error);
                    this.providers.set([]);
                    return of([]);
                })
            )
            .subscribe();
    }
}


