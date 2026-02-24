import { Component } from '@angular/core';
import { FloatingLinesComponent } from '../../components/floating-lines/floating-lines.component';
import { HeaderComponent } from '../../components/header/header.component';

type ExperienceLevel = 'iniciante' | 'intermediario' | 'avancado';
type TagField = 'stacks' | 'focusAreas';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [HeaderComponent, FloatingLinesComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  readonly enabledWaves: Array<'top' | 'middle' | 'bottom'> = ['top', 'middle', 'bottom'];
  experienceLevel: ExperienceLevel = 'intermediario';
  stacks: string[] = [];
  focusAreas: string[] = [];

  setExperience(level: ExperienceLevel): void {
    this.experienceLevel = level;
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
    target.value = '';
  }

  onTagBlur(event: FocusEvent, field: TagField): void {
    const target = event.target as HTMLInputElement | null;
    if (!target || !target.value.trim()) {
      return;
    }

    this.addTagsFromRawValue(target.value, field);
    target.value = '';
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
}
