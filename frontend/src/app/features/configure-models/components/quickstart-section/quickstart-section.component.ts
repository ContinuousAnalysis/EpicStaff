import {
    ChangeDetectionStrategy,
    Component,
    OnInit,
    inject,
    signal, computed, DestroyRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
    ButtonComponent,
    CustomInputComponent,
    SelectComponent,
    SelectItem
} from '@shared/components';
import { MATERIAL_FORMS } from "@shared/material-forms";
import { LLMProvider, ModelTypes } from "@shared/models";
import { catchError, take, tap } from 'rxjs/operators';
import { of } from 'rxjs';

import { Quickstart } from "../../models/quickstart.model";
import { LlmProvidersStorageService } from "../../services/llms/llm-providers-storage.service";
import { QuickstartService } from "../../services/quickstart.service";
import { getProviderIconPath } from "@shared/utils";

@Component({
    selector: 'app-quickstart-section',
    imports: [
        CommonModule,
        ReactiveFormsModule,
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
    private readonly providersStorageService = inject(LlmProvidersStorageService);
    private readonly quickstartService =  inject(QuickstartService);
    private readonly destroyRef = inject(DestroyRef);

    public readonly quickStartForm = this.fb.group({
        apiKey: ['', [Validators.required]],
        provider: [null, [Validators.required]],
    });

    public isSaving = signal(false);
    public providers = signal<LLMProvider[]>([]);

    public providerItems = computed<SelectItem[]>(() => {
        return this.providers().map((provider) => ({
            name: provider.name
                .replace(/[_-]+/g, ' ')
                .replace(/\b\w/g, (char) => char.toUpperCase()),
            value: provider.name,
            icon: getProviderIconPath(provider.name)
        }))
    })

    public ngOnInit(): void {
        this.loadProviders();
    }

    public onCancel(): void {
        this.quickStartForm.reset({ apiKey: '' });
    }

    public onReset(): void {
        this.quickStartForm.reset({ apiKey: '' });
    }

    public getProviderIcon(provider: LLMProvider | null): string {
        return getProviderIconPath(provider?.name || null);
    }

    private loadProviders(): void {
        this.providersStorageService
            .getProvidersByType(ModelTypes.LLM)
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

    public onQuickStart(): void {
        const formValue = this.quickStartForm.value;

        if (!formValue.apiKey || !formValue.provider) return;
        this.isSaving.set(true);

        const data: Quickstart = {
            api_key: formValue.apiKey,
            provider: formValue.provider,
        };

        this.quickstartService.createQuickstart(data)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: data => console.log(data),
                error: error => console.log(error),
                complete: () => this.isSaving.set(false),
            })
    }
}


