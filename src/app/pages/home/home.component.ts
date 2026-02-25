import { HttpErrorResponse } from '@angular/common/http';
import { Component, HostListener, inject } from '@angular/core';
import { finalize } from 'rxjs';
import { FloatingLinesComponent } from '../../components/floating-lines/floating-lines.component';
import { HeaderComponent } from '../../components/header/header.component';
import {
  ExperienceLevelApi,
  GenerateIdeaResponse,
  IdeaService,
} from '../../services/idea.service';

type ExperienceLevel = 'iniciante' | 'intermediario' | 'avancado';
type TagField = 'stacks' | 'focusAreas';
type ApiErrorPayload = { message?: unknown; error?: unknown };
type GeneratedIdeaCard = {
  title: string;
  preview: string;
  html: string;
};

const EXPERIENCE_LEVEL_TO_API: Record<ExperienceLevel, ExperienceLevelApi> = {
  iniciante: 'Beginner',
  intermediario: 'Intermediate',
  avancado: 'Advanced',
};

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [HeaderComponent, FloatingLinesComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  private readonly ideaService = inject(IdeaService);

  readonly enabledWaves: Array<'top' | 'middle' | 'bottom'> = ['top', 'middle', 'bottom'];
  experienceLevel: ExperienceLevel = 'intermediario';
  stacks: string[] = [];
  focusAreas: string[] = [];
  showStacksRequiredMessage = false;
  isGenerating = false;
  requestError: string | null = null;
  generatedIdeas: GeneratedIdeaCard[] = [];
  expandedIdeaIndex: number | null = null;
  generatedText: string | null = null;
  generatedJson: string | null = null;

  setExperience(level: ExperienceLevel): void {
    this.experienceLevel = level;
  }

  get expandedIdea(): GeneratedIdeaCard | null {
    if (this.expandedIdeaIndex === null) {
      return null;
    }

    return this.generatedIdeas[this.expandedIdeaIndex] ?? null;
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.expandedIdeaIndex !== null) {
      this.closeExpandedIdea();
    }
  }

  openExpandedIdea(index: number): void {
    if (index < 0 || index >= this.generatedIdeas.length) {
      return;
    }

    this.expandedIdeaIndex = index;
  }

  closeExpandedIdea(): void {
    this.expandedIdeaIndex = null;
  }

  onTagFocus(field: TagField): void {
    if (field === 'stacks') {
      this.showStacksRequiredMessage = false;
    }
  }

  generateProject(): void {
    if (this.isGenerating || this.stacks.length === 0) {
      return;
    }

    this.requestError = null;
    this.generatedIdeas = [];
    this.expandedIdeaIndex = null;
    this.generatedText = null;
    this.generatedJson = null;

    const payload = {
      stacks: this.stacks,
      experienceLevel: EXPERIENCE_LEVEL_TO_API[this.experienceLevel],
      focusAreas: this.focusAreas,
    };

    this.isGenerating = true;
    this.ideaService
      .generateIdea(payload)
      .pipe(finalize(() => (this.isGenerating = false)))
      .subscribe({
        next: (response) => {
          const markdownContent = this.extractMarkdownContent(response);
          if (markdownContent) {
            const parsedIdeas = this.extractIdeasFromMarkdown(markdownContent);
            if (parsedIdeas.length > 0) {
              this.generatedIdeas = parsedIdeas;
              return;
            }
          }

          this.generatedText = this.extractGeneratedText(response);
          this.generatedJson = this.stringifyResponse(response);
        },
        error: (error: HttpErrorResponse) => {
          this.requestError = this.resolveErrorMessage(error);
        },
      });
  }

  onTagKeydown(event: KeyboardEvent, field: TagField): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) {
      return;
    }

    if (event.key === 'Backspace' && target.value.length === 0) {
      event.preventDefault();
      this.removeLastTag(field);
      return;
    }

    if (event.key !== 'Enter' && event.key !== ',') {
      return;
    }

    event.preventDefault();
    this.addTagsFromRawValue(target.value, field);
    if (field === 'stacks' && this.stacks.length > 0) {
      this.showStacksRequiredMessage = false;
    }
    target.value = '';
  }

  onTagBlur(event: FocusEvent, field: TagField): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) {
      return;
    }

    if (target.value.trim()) {
      this.addTagsFromRawValue(target.value, field);
      target.value = '';
    }

    if (field === 'stacks') {
      this.showStacksRequiredMessage = this.stacks.length === 0;
    }
  }

  removeTag(field: TagField, tag: string): void {
    if (field === 'stacks') {
      this.stacks = this.stacks.filter((current) => current !== tag);
      return;
    }

    this.focusAreas = this.focusAreas.filter((current) => current !== tag);
  }

  private removeLastTag(field: TagField): void {
    if (field === 'stacks') {
      this.stacks = this.stacks.slice(0, -1);
      return;
    }

    this.focusAreas = this.focusAreas.slice(0, -1);
  }

  private addTagsFromRawValue(rawValue: string, field: TagField): void {
    const incoming = rawValue
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (incoming.length === 0) {
      return;
    }

    const targetTags = field === 'stacks' ? this.stacks : this.focusAreas;
    const normalizedExisting = new Set(targetTags.map((value) => value.toLowerCase()));
    const uniqueIncoming = incoming.filter((value) => !normalizedExisting.has(value.toLowerCase()));

    if (uniqueIncoming.length === 0) {
      return;
    }

    if (field === 'stacks') {
      this.stacks = [...this.stacks, ...uniqueIncoming];
      return;
    }

    this.focusAreas = [...this.focusAreas, ...uniqueIncoming];
  }

  private extractGeneratedText(response: GenerateIdeaResponse): string | null {
    if (typeof response === 'string') {
      const value = response.trim();
      return value.length > 0 ? value : null;
    }

    if (!response || typeof response !== 'object' || Array.isArray(response)) {
      return null;
    }

    const data = response as Record<string, unknown>;
    const keys = ['idea', 'projectIdea', 'content', 'description', 'message', 'result'];

    for (const key of keys) {
      const value = data[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  }

  private extractMarkdownContent(response: GenerateIdeaResponse): string | null {
    if (!response || typeof response !== 'object' || Array.isArray(response)) {
      return null;
    }

    const data = response as Record<string, unknown>;
    const markdownContent = data['markdownContent'];
    if (typeof markdownContent !== 'string') {
      return null;
    }

    const trimmed = markdownContent.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private extractIdeasFromMarkdown(markdown: string): GeneratedIdeaCard[] {
    const sections = markdown
      .split(/\n\s*---\s*\n/g)
      .map((section) => section.trim())
      .filter((section) => section.length > 0);

    if (sections.length === 0) {
      return [];
    }

    return sections.map((section, index) => ({
      title: this.extractTitleFromMarkdown(section, index),
      preview: this.extractPreviewFromMarkdown(section),
      html: this.markdownToHtml(section),
    }));
  }

  private extractTitleFromMarkdown(markdown: string, index: number): string {
    const headingLine = markdown
      .split('\n')
      .map((line) => line.trim())
      .find((line) => /^#\s+/.test(line));

    if (!headingLine) {
      return `Projeto ${index + 1}`;
    }

    const title = headingLine.replace(/^#\s+/, '').trim();
    return title.length > 0 ? title : `Projeto ${index + 1}`;
  }

  private extractPreviewFromMarkdown(markdown: string): string {
    const normalized = this.stripMarkdown(markdown).replace(/\s+/g, ' ').trim();

    if (normalized.length <= 180) {
      return normalized;
    }

    return `${normalized.slice(0, 177).trimEnd()}...`;
  }

  private markdownToHtml(markdown: string): string {
    const lines = this.escapeHtml(markdown).replace(/\r\n/g, '\n').split('\n');
    const htmlParts: string[] = [];
    const paragraphLines: string[] = [];
    let listItems: string[] = [];

    const flushParagraph = (): void => {
      if (paragraphLines.length === 0) {
        return;
      }

      htmlParts.push(`<p>${paragraphLines.map((line) => this.inlineMarkdown(line)).join('<br />')}</p>`);
      paragraphLines.length = 0;
    };

    const flushList = (): void => {
      if (listItems.length === 0) {
        return;
      }

      htmlParts.push(`<ul>${listItems.map((item) => `<li>${item}</li>`).join('')}</ul>`);
      listItems = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.length === 0) {
        flushParagraph();
        flushList();
        continue;
      }

      const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
      if (headingMatch) {
        flushParagraph();
        flushList();
        const level = Math.min(Math.max(headingMatch[1].length, 1), 6);
        htmlParts.push(`<h${level}>${this.inlineMarkdown(headingMatch[2])}</h${level}>`);
        continue;
      }

      const listMatch = /^-\s+(.+)$/.exec(trimmed);
      if (listMatch) {
        flushParagraph();
        listItems.push(this.inlineMarkdown(listMatch[1]));
        continue;
      }

      flushList();
      paragraphLines.push(trimmed);
    }

    flushParagraph();
    flushList();

    return htmlParts.join('');
  }

  private inlineMarkdown(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  private stripMarkdown(markdown: string): string {
    return markdown
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*-\s+/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\n/g, ' ');
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  private stringifyResponse(response: GenerateIdeaResponse): string | null {
    if (typeof response === 'string') {
      return null;
    }

    try {
      const serialized = JSON.stringify(response, null, 2);
      return serialized ?? String(response);
    } catch {
      return String(response);
    }
  }

  private resolveErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'Nao foi possivel conectar ao backend. Verifique se a API esta rodando e liberada para CORS.';
    }

    if (typeof error.error === 'string' && error.error.trim().length > 0) {
      return error.error.trim();
    }

    if (error.error && typeof error.error === 'object') {
      const payload = error.error as ApiErrorPayload;
      if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
        return payload.message.trim();
      }
      if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
        return payload.error.trim();
      }
    }

    return `Falha ao gerar projeto (HTTP ${error.status}).`;
  }
}
