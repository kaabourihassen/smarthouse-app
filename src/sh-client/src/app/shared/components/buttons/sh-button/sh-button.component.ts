import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'sh-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sh-button.component.html',
  styleUrl: './sh-button.component.scss',
})
export class ShButtonComponent {
  @Input() label = '';
  @Input() variant: 'primary' | 'outline' = 'primary';
  @Input() type: 'button' | 'submit' = 'button';
  @Input() fullWidth = false;
  @Input() icon?: string;
}
