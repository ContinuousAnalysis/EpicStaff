import { CommonModule } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    ElementRef,
    input,
    OnInit,
    output,
    signal,
    ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

export type ExpressionBuilderMode = 'expression' | 'manipulation';

export type TokenCategory = 'primary' | 'logical' | 'keyword' | 'comparison' | 'math';

export interface Token {
    label: string;
    category: TokenCategory;
}

const EXPRESSION_TOKENS: Token[] = [
    { label: '@', category: 'primary' },
    { label: 'AND', category: 'logical' },
    { label: 'NOT', category: 'logical' },
    { label: 'IN', category: 'logical' },
    { label: 'IS', category: 'logical' },
    { label: 'TRUE', category: 'keyword' },
    { label: 'FALSE', category: 'keyword' },
    { label: 'NONE', category: 'keyword' },
    { label: '>', category: 'comparison' },
    { label: '<', category: 'comparison' },
    { label: '==', category: 'comparison' },
    { label: '!=', category: 'comparison' },
    { label: '>=', category: 'comparison' },
    { label: '<=', category: 'comparison' },
];

const MANIPULATION_TOKENS: Token[] = [
    { label: '@', category: 'primary' },
    { label: '+', category: 'math' },
    { label: '-', category: 'math' },
    { label: '/', category: 'math' },
    { label: '*', category: 'math' },
    { label: '()', category: 'math' },
    { label: '%', category: 'math' },
    { label: '//', category: 'math' },
    { label: '**', category: 'math' },
    { label: '=', category: 'math' },
];

const EXPRESSION_TEMPLATES = ['Required field', 'Range of values', 'After a point'];
const MANIPULATION_TEMPLATES = ['Combined', 'Percentage', 'Average'];

/** Tokens that are symbolic — inserted without surrounding spaces. */
const SYMBOLIC_TOKENS = new Set([
    '@',
    '()',
    '>',
    '<',
    '==',
    '!=',
    '>=',
    '<=',
    '+',
    '-',
    '/',
    '*',
    '%',
    '//',
    '**',
    '=',
]);

@Component({
    selector: 'app-expression-builder',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule],
    templateUrl: './expression-builder.component.html',
    styleUrls: ['./expression-builder.component.scss'],
})
export class ExpressionBuilderComponent implements OnInit {
    // ── Inputs ────────────────────────────────────────────────────────────────
    value = input<string>('');
    variables = input<string[]>([]);
    mode = input<ExpressionBuilderMode>('expression');

    // ── Outputs ───────────────────────────────────────────────────────────────
    commit = output<string>();
    cancel = output<void>();
    valueChange = output<string>();

    // ── Editor ────────────────────────────────────────────────────────────────
    @ViewChild('editor') editorRef!: ElementRef<HTMLTextAreaElement>;

    displayValue = signal<string>('');

    /** Last known caret position — updated on every input/click/keyup. */
    private caretPos = 0;

    // ── Search / right panel ──────────────────────────────────────────────────
    searchTerm = signal<string>('');

    filteredVars = computed(() => {
        const q = this.searchTerm().toLowerCase();
        return this.variables().filter((v) => v.toLowerCase().includes(q));
    });

    // ── Inline @ typeahead ────────────────────────────────────────────────────
    mentionActive = signal<boolean>(false);
    mentionQuery = signal<string>('');
    mentionIndex = signal<number>(0);

    filteredMention = computed(() => {
        const q = this.mentionQuery().toLowerCase();
        return this.variables().filter((v) => v.toLowerCase().startsWith(q));
    });

    // ── Toolbar / templates ───────────────────────────────────────────────────
    tokens = computed<Token[]>(() => (this.mode() === 'expression' ? EXPRESSION_TOKENS : MANIPULATION_TOKENS));

    templates = computed<string[]>(() =>
        this.mode() === 'expression' ? EXPRESSION_TEMPLATES : MANIPULATION_TEMPLATES
    );

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    constructor() {
        // When the bound value input changes, sync displayValue.
        effect(() => {
            const v = this.value();
            this.displayValue.set(v);
        });
    }

    ngOnInit(): void {
        this.displayValue.set(this.value());
    }

    // ── Textarea event handlers ───────────────────────────────────────────────

    onInput(event: Event): void {
        const ta = event.target as HTMLTextAreaElement;
        this.displayValue.set(ta.value);
        this.caretPos = ta.selectionStart ?? 0;
        this.updateMentionState(ta);
        this.valueChange.emit(ta.value);
    }

    onKeydown(event: KeyboardEvent): void {
        if (this.mentionActive()) {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                const max = this.filteredMention().length - 1;
                this.mentionIndex.update((i) => Math.min(i + 1, max));
                return;
            }
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                this.mentionIndex.update((i) => Math.max(i - 1, 0));
                return;
            }
            if (event.key === 'Enter') {
                event.preventDefault();
                const chosen = this.filteredMention()[this.mentionIndex()];
                if (chosen) this.selectMention(chosen);
                return;
            }
            if (event.key === 'Escape') {
                this.mentionActive.set(false);
                return;
            }
        }

        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.commit.emit(this.displayValue());
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            this.cancel.emit();
        }
    }

    onCaretUpdate(event: Event): void {
        const ta = event.target as HTMLTextAreaElement;
        this.caretPos = ta.selectionStart ?? 0;
    }

    // ── Token insertion ───────────────────────────────────────────────────────

    insertToken(token: string): void {
        const ta = this.editorRef?.nativeElement;
        const pos = ta ? (ta.selectionStart ?? this.caretPos) : this.caretPos;
        const current = this.displayValue();

        let insertion: string;
        if (SYMBOLIC_TOKENS.has(token)) {
            insertion = token === '()' ? '()' : token;
        } else {
            // Word tokens: surround with spaces (trimmed at boundaries).
            insertion = ` ${token} `;
        }

        const before = current.slice(0, pos);
        const after = current.slice(pos);
        const next = before + insertion + after;
        this.displayValue.set(next);
        this.valueChange.emit(next);

        // Restore focus and advance caret.
        if (ta) {
            ta.value = next;
            const newPos = pos + insertion.length;
            requestAnimationFrame(() => {
                ta.setSelectionRange(newPos, newPos);
                ta.focus();
            });
            this.caretPos = pos + insertion.length;
        }
    }

    insertVariable(varName: string): void {
        const insertion = `@${varName} `;
        const ta = this.editorRef?.nativeElement;
        const pos = ta ? (ta.selectionStart ?? this.caretPos) : this.caretPos;
        const current = this.displayValue();
        const next = current.slice(0, pos) + insertion + current.slice(pos);
        this.displayValue.set(next);
        this.valueChange.emit(next);

        if (ta) {
            ta.value = next;
            const newPos = pos + insertion.length;
            requestAnimationFrame(() => {
                ta.setSelectionRange(newPos, newPos);
                ta.focus();
            });
            this.caretPos = newPos;
        }
    }

    // ── @ typeahead helpers ───────────────────────────────────────────────────

    private updateMentionState(ta: HTMLTextAreaElement): void {
        const pos = ta.selectionStart ?? 0;
        const text = ta.value.slice(0, pos);
        // Walk back from cursor to find an @ not preceded by a word char.
        const match = text.match(/@([\w]*)$/);
        if (match) {
            this.mentionQuery.set(match[1]);
            this.mentionActive.set(true);
            this.mentionIndex.set(0);
        } else {
            this.mentionActive.set(false);
        }
    }

    selectMention(varName: string): void {
        const ta = this.editorRef?.nativeElement;
        if (!ta) return;
        const pos = ta.selectionStart ?? 0;
        const text = ta.value;
        // Find the @ that started the mention.
        const before = text.slice(0, pos);
        const replaced = before.replace(/@([\w]*)$/, `@${varName} `);
        const next = replaced + text.slice(pos);
        this.displayValue.set(next);
        this.valueChange.emit(next);
        ta.value = next;
        const newPos = replaced.length;
        requestAnimationFrame(() => {
            ta.setSelectionRange(newPos, newPos);
            ta.focus();
        });
        this.caretPos = newPos;
        this.mentionActive.set(false);
    }

    closeMention(): void {
        this.mentionActive.set(false);
    }
}
