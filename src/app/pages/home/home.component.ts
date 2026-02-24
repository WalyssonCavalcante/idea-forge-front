import { Component } from '@angular/core';
import { FloatingLinesComponent } from '../../components/floating-lines/floating-lines.component';
import { HeaderComponent } from '../../components/header/header.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [HeaderComponent, FloatingLinesComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  readonly enabledWaves: Array<'top' | 'middle' | 'bottom'> = ['top', 'middle', 'bottom'];
}
