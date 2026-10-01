import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent {
  features = [
    {
      icon: 'mobile',
      title: 'Mobile Control',
      description: 'Manage all your devices from your smartphone, wherever you are.',
    },
    {
      icon: 'lock',
      title: 'Maximum Security',
      description:
        'Advanced protection with end-to-end encryption and two-factor authentication.',
    },
    {
      icon: 'lightning',
      title: 'Automation',
      description: 'Create intelligent scenarios and automate your everyday routines.',
    },
    {
      icon: 'energy',
      title: 'Energy Savings',
      description: 'Reduce your energy consumption by up to 40% with AI-powered insights.',
    },
    {
      icon: 'cloud',
      title: 'Secure Cloud',
      description: 'Your data is backed up and synchronized in real time across all devices.',
    },
    {
      icon: 'users',
      title: 'Multi-User',
      description: 'Safely share access with your family members with custom permissions.',
    },
  ];

  stats = [
    { value: '10K+', label: 'Active Users' },
    { value: '250+', label: 'Compatible Devices' },
    { value: '99.9%', label: 'Guaranteed Uptime' },
    { value: '40%', label: 'Average Savings' },
  ];

  footerProduct = ['Features', 'Pricing', 'Compatible Devices', 'Integrations', 'API'];
  footerEnterprise = ['About', 'Blog', 'Careers', 'Press', 'Partners'];

  constructor(private router: Router) {}

  navigateToLogin(): void {
    this.router.navigate(['/login']);
  }

  navigateToSignup(): void {
    this.router.navigate(['/signup']);
  }
}
