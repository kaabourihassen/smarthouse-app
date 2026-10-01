import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NotificationsService } from './core/services/notifications.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  readonly notificationsService = inject(NotificationsService);
}
